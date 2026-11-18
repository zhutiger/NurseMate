import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmNoticeDto,
  CreateNoticeDto,
  MyNoticeListQueryDto,
  NoticeListQueryDto,
  OptionalReasonDto,
  RecipientPageQueryDto,
  RecipientSelectionDto,
  RequiredReasonDto,
  UpdateNoticeDto,
} from './notices.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService) {}

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private page(page: number, pageSize: number, total: number) {
    return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  private validateDeadline(deadlineAt?: string | null): Date | null {
    if (!deadlineAt) return null;
    const deadline = new Date(deadlineAt);
    if (deadline.getTime() <= Date.now()) throw new ConflictException('DEADLINE_MUST_BE_FUTURE');
    return deadline;
  }

  private async resolveRecipients(tx: Tx, departmentId: string, selection: RecipientSelectionDto) {
    let where: Prisma.UserWhereInput = { departmentId, status: 'ACTIVE' };
    if (selection.mode === 'GROUPS') {
      if (!selection.groupIds?.length) throw new ConflictException('NOTICE_RECIPIENTS_EMPTY');
      const validGroups = await tx.nursingGroup.count({
        where: { id: { in: selection.groupIds }, departmentId, enabled: true },
      });
      if (validGroups !== new Set(selection.groupIds).size) throw new NotFoundException('RESOURCE_NOT_FOUND');
      where = { ...where, primaryGroupId: { in: selection.groupIds } };
    } else if (selection.mode === 'USERS') {
      if (!selection.userIds?.length) throw new ConflictException('NOTICE_RECIPIENTS_EMPTY');
      where = { ...where, id: { in: selection.userIds } };
    }
    return tx.user.findMany({ where, select: { id: true, employeeNo: true, name: true, primaryGroupId: true } });
  }

  private async attachFiles(tx: Tx, departmentId: string, versionId: string, fileIds: string[] = []) {
    if (!fileIds.length) return;
    const files = await tx.fileObject.findMany({
      where: { id: { in: fileIds }, status: 'READY', uploadedBy: { departmentId } },
      select: { id: true },
    });
    if (files.length !== new Set(fileIds).size) throw new ConflictException('ATTACHMENT_NOT_READY');
    await tx.noticeVersionAttachment.createMany({
      data: fileIds.map((fileId, sortOrder) => ({ noticeVersionId: versionId, fileId, sortOrder })),
    });
  }

  private statusFor(
    deadline: Date | null,
    viewedAt: Date | null,
    confirmedAt: Date | null,
    reconfirmRequired: boolean,
    hasPriorConfirmation: boolean,
  ) {
    if (confirmedAt) return 'CONFIRMED';
    if (reconfirmRequired && hasPriorConfirmation) return 'RECONFIRM_REQUIRED';
    if (deadline && deadline.getTime() < Date.now()) return viewedAt ? 'OVERDUE_UNCONFIRMED' : 'OVERDUE_UNSEEN';
    return viewedAt ? 'VIEWED' : 'UNSEEN';
  }

  async previewRecipients(user: AuthUser, selection: RecipientSelectionDto) {
    const recipients = await this.prisma.$transaction((tx) => this.resolveRecipients(tx, user.departmentId, selection));
    return { recipientCount: recipients.length, recipients };
  }

  async create(user: AuthUser, dto: CreateNoticeDto) {
    const deadline = this.validateDeadline(dto.deadlineAt);
    return this.prisma.$transaction(async (tx) => {
      const recipients = await this.resolveRecipients(tx, user.departmentId, dto.recipientSelection);
      if (!recipients.length) throw new ConflictException('NOTICE_RECIPIENTS_EMPTY');
      const notice = await tx.notice.create({
        data: {
          departmentId: user.departmentId,
          title: dto.title.trim(),
          level: dto.level,
          requiresConfirmation: dto.requiresConfirmation,
          deadline,
          recipientSelection: this.json(dto.recipientSelection),
          currentVersion: 1,
          createdById: user.id,
        },
      });
      const version = await tx.noticeVersion.create({
        data: {
          noticeId: notice.id,
          versionNo: 1,
          title: dto.title.trim(),
          content: dto.content.trim(),
          level: dto.level,
          deadline,
          createdById: user.id,
        },
      });
      await this.attachFiles(tx, user.departmentId, version.id, dto.attachmentFileIds);
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'notice.create',
          targetType: 'notice',
          targetId: notice.id,
          result: 'SUCCESS',
          afterData: { recipientPreviewCount: recipients.length },
        },
      });
      return { ...notice, recipientPreviewCount: recipients.length };
    });
  }

  async listManaged(user: AuthUser, query: NoticeListQueryDto, canReadAll: boolean) {
    const where: Prisma.NoticeWhereInput = {
      departmentId: user.departmentId,
      ...(query.status ? { status: query.status } : {}),
      ...(!canReadAll ? { createdById: user.id } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notice.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { recipients: { where: { excludedAt: null } } } } },
      }),
      this.prisma.notice.count({ where }),
    ]);
    return { items: items.map(({ _count, ...item }) => ({ ...item, recipientCount: _count.recipients })), page: this.page(query.page, query.pageSize, total) };
  }

  async getManaged(user: AuthUser, noticeId: string, canReadAll: boolean) {
    const notice = await this.prisma.notice.findFirst({
      where: { id: noticeId, departmentId: user.departmentId, ...(!canReadAll ? { createdById: user.id } : {}) },
      include: {
        versions: {
          orderBy: { versionNo: 'desc' },
          include: {
            attachments: {
              orderBy: { sortOrder: 'asc' },
              include: { file: { select: { id: true, originalName: true, mimeType: true, status: true } } },
            },
          },
        },
        _count: { select: { recipients: { where: { excludedAt: null } } } },
      },
    });
    if (!notice) throw new NotFoundException('RESOURCE_NOT_FOUND');
    const { _count, ...data } = notice;
    return { ...data, recipientCount: _count.recipients };
  }

  async update(user: AuthUser, noticeId: string, dto: UpdateNoticeDto, canManagePublished: boolean) {
    const deadline = this.validateDeadline(dto.deadlineAt);
    return this.prisma.$transaction(async (tx) => {
      const notice = await tx.notice.findFirst({ where: { id: noticeId, departmentId: user.departmentId } });
      if (!notice) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (notice.status === 'DRAFT' && notice.createdById !== user.id && user.role !== 'HEAD_NURSE') {
        throw new ForbiddenException('PERMISSION_DENIED');
      }
      if (notice.status === 'PUBLISHED' && !canManagePublished) throw new ForbiddenException('PERMISSION_DENIED');
      if (!['DRAFT', 'PUBLISHED'].includes(notice.status)) throw new ConflictException('NOTICE_STATE_CONFLICT');

      if (notice.status === 'DRAFT') {
        const recipients = await this.resolveRecipients(tx, user.departmentId, dto.recipientSelection);
        if (!recipients.length) throw new ConflictException('NOTICE_RECIPIENTS_EMPTY');
        const version = await tx.noticeVersion.update({
          where: { noticeId_versionNo: { noticeId, versionNo: notice.currentVersion } },
          data: { title: dto.title.trim(), content: dto.content.trim(), level: dto.level, deadline },
        });
        await tx.noticeVersionAttachment.deleteMany({ where: { noticeVersionId: version.id } });
        await this.attachFiles(tx, user.departmentId, version.id, dto.attachmentFileIds);
        const updated = await tx.notice.update({
          where: { id: noticeId },
          data: {
            title: dto.title.trim(),
            level: dto.level,
            deadline,
            requiresConfirmation: dto.requiresConfirmation,
            recipientSelection: this.json(dto.recipientSelection),
          },
        });
        await tx.auditLog.create({
          data: { departmentId: user.departmentId, actorId: user.id, action: 'notice.draft_update', targetType: 'notice', targetId: noticeId, result: 'SUCCESS' },
        });
        return { ...updated, recipientPreviewCount: recipients.length };
      }

      if (!dto.changeReason?.trim()) throw new ConflictException('REASON_REQUIRED');
      const nextVersion = notice.currentVersion + 1;
      const version = await tx.noticeVersion.create({
        data: {
          noticeId,
          versionNo: nextVersion,
          title: dto.title.trim(),
          content: dto.content.trim(),
          level: dto.level,
          deadline,
          reconfirmRequired: dto.requireReconfirm ?? true,
          changeReason: dto.changeReason.trim(),
          createdById: user.id,
        },
      });
      await this.attachFiles(tx, user.departmentId, version.id, dto.attachmentFileIds);
      const updated = await tx.notice.update({
        where: { id: noticeId },
        data: { title: dto.title.trim(), level: dto.level, deadline, requiresConfirmation: dto.requiresConfirmation, currentVersion: nextVersion },
      });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'notice.version_create',
          targetType: 'notice',
          targetId: noticeId,
          result: 'SUCCESS',
          reason: dto.changeReason.trim(),
          afterData: { versionNo: nextVersion, reconfirmRequired: dto.requireReconfirm ?? true },
        },
      });
      return updated;
    });
  }

  async cancel(user: AuthUser, noticeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const notice = await tx.notice.findFirst({ where: { id: noticeId, departmentId: user.departmentId } });
      if (!notice) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (notice.status !== 'DRAFT') throw new ConflictException('NOTICE_STATE_CONFLICT');
      if (notice.createdById !== user.id && user.role !== 'HEAD_NURSE') throw new ForbiddenException('PERMISSION_DENIED');
      const updated = await tx.notice.update({ where: { id: noticeId }, data: { status: 'CANCELLED' } });
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'notice.cancel', targetType: 'notice', targetId: noticeId, result: 'SUCCESS' },
      });
      return updated;
    });
  }

  async publish(user: AuthUser, noticeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const notice = await tx.notice.findFirst({ where: { id: noticeId, departmentId: user.departmentId } });
      if (!notice) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (notice.status !== 'DRAFT') throw new ConflictException('NOTICE_STATE_CONFLICT');
      if (notice.createdById !== user.id && user.role !== 'HEAD_NURSE') throw new ForbiddenException('PERMISSION_DENIED');
      const selection = notice.recipientSelection as unknown as RecipientSelectionDto;
      const recipients = await this.resolveRecipients(tx, user.departmentId, selection);
      if (!recipients.length) throw new ConflictException('NOTICE_RECIPIENTS_EMPTY');
      const changed = await tx.notice.updateMany({
        where: { id: noticeId, status: 'DRAFT' },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: user.id },
      });
      if (changed.count !== 1) throw new ConflictException('NOTICE_STATE_CONFLICT');
      await tx.noticeRecipient.createMany({
        data: recipients.map(({ id }) => ({ noticeId, userId: id, addedVersionNo: notice.currentVersion })),
      });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'notice.publish',
          targetType: 'notice',
          targetId: noticeId,
          result: 'SUCCESS',
          afterData: { recipientCount: recipients.length },
        },
      });
      return { ...notice, status: 'PUBLISHED' as const, recipientCount: recipients.length };
    });
  }

  async changeLifecycle(user: AuthUser, noticeId: string, action: 'close' | 'withdraw', dto: OptionalReasonDto | RequiredReasonDto) {
    if (action === 'withdraw' && !dto.reason?.trim()) throw new ConflictException('REASON_REQUIRED');
    return this.prisma.$transaction(async (tx) => {
      const notice = await tx.notice.findFirst({ where: { id: noticeId, departmentId: user.departmentId } });
      if (!notice) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (notice.status !== 'PUBLISHED') throw new ConflictException('NOTICE_STATE_CONFLICT');
      const now = new Date();
      const updated = await tx.notice.update({
        where: { id: noticeId },
        data: action === 'close'
          ? { status: 'CLOSED', closedAt: now, closeReason: dto.reason?.trim() || null }
          : { status: 'WITHDRAWN', withdrawnAt: now, withdrawReason: dto.reason!.trim() },
      });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: `notice.${action}`,
          targetType: 'notice',
          targetId: noticeId,
          result: 'SUCCESS',
          reason: dto.reason?.trim(),
        },
      });
      return updated;
    });
  }

  async listMine(user: AuthUser, query: MyNoticeListQueryDto) {
    const recipients = await this.prisma.noticeRecipient.findMany({
      where: { userId: user.id, excludedAt: null, notice: { status: { in: ['PUBLISHED', 'CLOSED'] } } },
      orderBy: { addedAt: 'desc' },
      include: {
        notice: { include: { versions: { orderBy: { versionNo: 'desc' }, include: { views: { where: { recipient: { userId: user.id } } }, confirmations: { where: { recipient: { userId: user.id } } } } } } },
      },
    });
    const items = recipients.map((recipient) => {
      const current = recipient.notice.versions.find((version) => version.versionNo === recipient.notice.currentVersion)!;
      const currentView = current.views[0]?.viewedAt ?? null;
      const currentConfirmation = current.confirmations[0]?.confirmedAt ?? null;
      const priorConfirmation = recipient.notice.versions.some((version) => version.versionNo < current.versionNo && version.confirmations.length > 0);
      const effectiveConfirmation = currentConfirmation ?? (!current.reconfirmRequired && priorConfirmation
        ? recipient.notice.versions.find((version) => version.versionNo < current.versionNo && version.confirmations[0])?.confirmations[0]?.confirmedAt ?? null
        : null);
      return {
        id: recipient.notice.id,
        title: current.title,
        level: current.level,
        status: recipient.notice.status,
        currentVersionNo: current.versionNo,
        deadlineAt: current.deadline,
        recipientStatus: this.statusFor(current.deadline, currentView, effectiveConfirmation, current.reconfirmRequired, priorConfirmation),
        viewedAt: currentView,
        confirmedAt: effectiveConfirmation,
      };
    });
    const filtered = query.status ? items.filter((item) => item.recipientStatus === query.status) : items;
    const start = (query.page - 1) * query.pageSize;
    return { items: filtered.slice(start, start + query.pageSize), page: this.page(query.page, query.pageSize, filtered.length) };
  }

  async getMine(user: AuthUser, noticeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const recipient = await tx.noticeRecipient.findFirst({
        where: { noticeId, userId: user.id, excludedAt: null, notice: { status: { in: ['PUBLISHED', 'CLOSED'] } } },
        include: { notice: true },
      });
      if (!recipient) throw new NotFoundException('RESOURCE_NOT_FOUND');
      const version = await tx.noticeVersion.findUniqueOrThrow({
        where: { noticeId_versionNo: { noticeId, versionNo: recipient.notice.currentVersion } },
        include: { attachments: { orderBy: { sortOrder: 'asc' }, include: { file: { select: { id: true, originalName: true, mimeType: true, status: true } } } } },
      });
      const view = await tx.noticeView.upsert({
        where: { recipientId_noticeVersionId: { recipientId: recipient.id, noticeVersionId: version.id } },
        create: { recipientId: recipient.id, noticeVersionId: version.id },
        update: {},
      });
      const currentConfirmation = await tx.noticeConfirmation.findUnique({
        where: { recipientId_noticeVersionId: { recipientId: recipient.id, noticeVersionId: version.id } },
      });
      const priorConfirmation = !currentConfirmation && !version.reconfirmRequired
        ? await tx.noticeConfirmation.findFirst({ where: { recipientId: recipient.id }, orderBy: { confirmedAt: 'desc' } })
        : null;
      return {
        id: recipient.notice.id,
        title: version.title,
        content: version.content,
        level: version.level,
        status: recipient.notice.status,
        currentVersionNo: version.versionNo,
        deadlineAt: version.deadline,
        recipientStatus: this.statusFor(version.deadline, view.viewedAt, currentConfirmation?.confirmedAt ?? priorConfirmation?.confirmedAt ?? null, version.reconfirmRequired, Boolean(priorConfirmation)),
        viewedAt: view.viewedAt,
        confirmedAt: currentConfirmation?.confirmedAt ?? priorConfirmation?.confirmedAt ?? null,
        confirmedVersionNo: currentConfirmation ? version.versionNo : null,
        attachments: version.attachments.map((item) => item.file),
      };
    });
  }

  async confirm(user: AuthUser, noticeId: string, dto: ConfirmNoticeDto) {
    return this.prisma.$transaction(async (tx) => {
      const recipient = await tx.noticeRecipient.findFirst({
        where: { noticeId, userId: user.id, excludedAt: null, notice: { status: { in: ['PUBLISHED', 'CLOSED'] } } },
        include: { notice: true },
      });
      if (!recipient) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (!recipient.notice.requiresConfirmation) throw new ConflictException('CONFIRMATION_NOT_REQUIRED');
      if (recipient.notice.currentVersion !== dto.versionNo) throw new ConflictException('NOTICE_VERSION_CHANGED');
      const version = await tx.noticeVersion.findUniqueOrThrow({ where: { noticeId_versionNo: { noticeId, versionNo: dto.versionNo } } });
      const view = await tx.noticeView.findUnique({
        where: { recipientId_noticeVersionId: { recipientId: recipient.id, noticeVersionId: version.id } },
      });
      if (!view) throw new ConflictException('NOTICE_NOT_VIEWED');
      const existing = await tx.noticeConfirmation.findUnique({
        where: { recipientId_noticeVersionId: { recipientId: recipient.id, noticeVersionId: version.id } },
      });
      if (existing) return { noticeId, versionNo: dto.versionNo, confirmedAt: existing.confirmedAt };
      const confirmation = await tx.noticeConfirmation.create({ data: { recipientId: recipient.id, noticeVersionId: version.id } });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'notice.confirm',
          targetType: 'notice',
          targetId: noticeId,
          result: 'SUCCESS',
          afterData: { versionNo: dto.versionNo },
        },
      });
      return { noticeId, versionNo: dto.versionNo, confirmedAt: confirmation.confirmedAt };
    });
  }

  async listRecipients(user: AuthUser, noticeId: string, query: RecipientPageQueryDto) {
    const notice = await this.prisma.notice.findFirst({ where: { id: noticeId, departmentId: user.departmentId } });
    if (!notice) throw new NotFoundException('RESOURCE_NOT_FOUND');
    const version = await this.prisma.noticeVersion.findUniqueOrThrow({ where: { noticeId_versionNo: { noticeId, versionNo: notice.currentVersion } } });
    const where: Prisma.NoticeRecipientWhereInput = { noticeId, excludedAt: null };
    const [recipients, total] = await this.prisma.$transaction([
      this.prisma.noticeRecipient.findMany({
        where,
        orderBy: { user: { name: 'asc' } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          user: { select: { id: true, employeeNo: true, name: true, primaryGroupId: true } },
          views: { where: { noticeVersionId: version.id } },
          confirmations: { orderBy: { confirmedAt: 'desc' } },
        },
      }),
      this.prisma.noticeRecipient.count({ where }),
    ]);
    const items = recipients.map((recipient) => {
      const currentConfirmation = recipient.confirmations.find((item) => item.noticeVersionId === version.id);
      const priorConfirmation = recipient.confirmations.find((item) => item.noticeVersionId !== version.id);
      const effective = currentConfirmation ?? (!version.reconfirmRequired ? priorConfirmation : undefined);
      return {
        recipientId: recipient.id,
        user: recipient.user,
        addedAt: recipient.addedAt,
        addedVersionNo: recipient.addedVersionNo,
        viewedAt: recipient.views[0]?.viewedAt ?? null,
        confirmedAt: effective?.confirmedAt ?? null,
        confirmedVersionNo: currentConfirmation ? version.versionNo : null,
        recipientStatus: this.statusFor(version.deadline, recipient.views[0]?.viewedAt ?? null, effective?.confirmedAt ?? null, version.reconfirmRequired, Boolean(priorConfirmation)),
      };
    });
    const counts = items.reduce<Record<string, number>>((result, item) => {
      result[item.recipientStatus] = (result[item.recipientStatus] ?? 0) + 1;
      return result;
    }, {});
    return { items, page: this.page(query.page, query.pageSize, total), summary: { total, pageCounts: counts } };
  }

  async addRecipients(user: AuthUser, noticeId: string, selection: RecipientSelectionDto) {
    return this.prisma.$transaction(async (tx) => {
      const notice = await tx.notice.findFirst({ where: { id: noticeId, departmentId: user.departmentId } });
      if (!notice) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (notice.status !== 'PUBLISHED') throw new ConflictException('NOTICE_STATE_CONFLICT');
      const recipients = await this.resolveRecipients(tx, user.departmentId, selection);
      const result = await tx.noticeRecipient.createMany({
        data: recipients.map(({ id }) => ({ noticeId, userId: id, addedVersionNo: notice.currentVersion })),
        skipDuplicates: true,
      });
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'notice.recipients_add', targetType: 'notice', targetId: noticeId, result: 'SUCCESS', afterData: { addedCount: result.count } },
      });
      return { requestedCount: recipients.length, addedCount: result.count };
    });
  }

  async excludeRecipient(user: AuthUser, noticeId: string, targetUserId: string, dto: RequiredReasonDto) {
    return this.prisma.$transaction(async (tx) => {
      const notice = await tx.notice.findFirst({ where: { id: noticeId, departmentId: user.departmentId } });
      if (!notice) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (notice.status !== 'PUBLISHED') throw new ConflictException('NOTICE_STATE_CONFLICT');
      const result = await tx.noticeRecipient.updateMany({
        where: { noticeId, userId: targetUserId, excludedAt: null },
        data: { excludedAt: new Date(), excludedById: user.id, exclusionReason: dto.reason.trim() },
      });
      if (result.count !== 1) throw new NotFoundException('RESOURCE_NOT_FOUND');
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'notice.recipient_exclude', targetType: 'notice', targetId: noticeId, result: 'SUCCESS', reason: dto.reason.trim(), afterData: { userId: targetUserId } },
      });
      return { userId: targetUserId, excluded: true };
    });
  }
}
