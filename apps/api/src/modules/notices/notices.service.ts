import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmNoticeDto, CreateNoticeDto } from './notices.dto';

@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateNoticeDto) {
    return this.prisma.$transaction(async (tx) => {
      const notice = await tx.notice.create({
        data: {
          departmentId: user.departmentId,
          title: dto.title,
          level: dto.level,
          requiresConfirmation: dto.requiresConfirmation,
          deadline: dto.deadlineAt ? new Date(dto.deadlineAt) : null,
          recipientSelection: dto.recipientSelection as Prisma.InputJsonValue,
          currentVersion: 1,
          createdById: user.id,
        },
      });
      await tx.noticeVersion.create({
        data: {
          noticeId: notice.id,
          versionNo: 1,
          title: dto.title,
          content: dto.content,
          level: dto.level,
          deadline: dto.deadlineAt ? new Date(dto.deadlineAt) : null,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'notice.create',
          targetType: 'notice',
          targetId: notice.id,
          result: 'SUCCESS',
        },
      });
      return notice;
    });
  }

  async publish(user: AuthUser, noticeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const notice = await tx.notice.findFirst({
        where: { id: noticeId, departmentId: user.departmentId },
      });
      if (!notice) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (notice.status !== 'DRAFT') throw new ConflictException('NOTICE_STATE_CONFLICT');
      const selection = notice.recipientSelection as { userIds?: string[] } | null;
      const userIds = [...new Set(selection?.userIds ?? [])];
      const validUsers = await tx.user.findMany({
        where: { id: { in: userIds }, departmentId: user.departmentId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!validUsers.length) throw new ConflictException('NOTICE_RECIPIENTS_EMPTY');
      await tx.noticeRecipient.createMany({
        data: validUsers.map(({ id }) => ({ noticeId, userId: id, addedVersionNo: notice.currentVersion })),
      });
      const published = await tx.notice.update({
        where: { id: noticeId },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: user.id },
      });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'notice.publish',
          targetType: 'notice',
          targetId: noticeId,
          result: 'SUCCESS',
          afterData: { recipientCount: validUsers.length },
        },
      });
      return { ...published, recipientCount: validUsers.length };
    });
  }

  async getMine(user: AuthUser, noticeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const recipient = await tx.noticeRecipient.findFirst({
        where: { noticeId, userId: user.id, excludedAt: null, notice: { status: 'PUBLISHED' } },
        include: { notice: true },
      });
      if (!recipient) throw new NotFoundException('RESOURCE_NOT_FOUND');
      const version = await tx.noticeVersion.findUniqueOrThrow({
        where: { noticeId_versionNo: { noticeId, versionNo: recipient.notice.currentVersion } },
      });
      const view = await tx.noticeView.upsert({
        where: { recipientId_noticeVersionId: { recipientId: recipient.id, noticeVersionId: version.id } },
        create: { recipientId: recipient.id, noticeVersionId: version.id },
        update: {},
      });
      const confirmation = await tx.noticeConfirmation.findUnique({
        where: { recipientId_noticeVersionId: { recipientId: recipient.id, noticeVersionId: version.id } },
      });
      return {
        id: recipient.notice.id,
        title: version.title,
        content: version.content,
        level: version.level,
        status: recipient.notice.status,
        currentVersionNo: version.versionNo,
        viewedAt: view.viewedAt,
        confirmedAt: confirmation?.confirmedAt ?? null,
      };
    });
  }

  async confirm(user: AuthUser, noticeId: string, dto: ConfirmNoticeDto) {
    return this.prisma.$transaction(async (tx) => {
      const recipient = await tx.noticeRecipient.findFirst({
        where: { noticeId, userId: user.id, excludedAt: null, notice: { status: 'PUBLISHED' } },
        include: { notice: true },
      });
      if (!recipient) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (recipient.notice.currentVersion !== dto.versionNo) {
        throw new ConflictException('NOTICE_VERSION_CHANGED');
      }
      const version = await tx.noticeVersion.findUniqueOrThrow({
        where: { noticeId_versionNo: { noticeId, versionNo: dto.versionNo } },
      });
      const confirmation = await tx.noticeConfirmation.upsert({
        where: { recipientId_noticeVersionId: { recipientId: recipient.id, noticeVersionId: version.id } },
        create: { recipientId: recipient.id, noticeVersionId: version.id },
        update: {},
      });
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
}
