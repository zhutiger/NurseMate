import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderSchedulerService } from '../reminders/reminder-scheduler.service';
import {
  AssigneeSelectionDto,
  CreateTaskDto,
  MyTaskListQueryDto,
  OptionalReasonDto,
  RelaunchTaskDto,
  RequiredReasonDto,
  ReviewTaskDto,
  SubmitTaskDto,
  TaskListQueryDto,
  TaskRecordPageQueryDto,
} from './tasks.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: ReminderSchedulerService,
  ) {}

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private page(page: number, pageSize: number, total: number) {
    return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  private deadline(value: string): Date {
    const deadline = new Date(value);
    if (deadline.getTime() <= Date.now()) throw new ConflictException('DEADLINE_MUST_BE_FUTURE');
    return deadline;
  }

  private derivedStatus(status: string, deadline: Date) {
    return status;
  }

  private isEnded(task: { status: string; deadline: Date }) {
    if (task.status === 'PUBLISHED') return task.deadline.getTime() <= Date.now();
    return ['CLOSED', 'WITHDRAWN', 'CANCELLED'].includes(task.status);
  }

  private lifecycle(task: { status: string; deadline: Date }) {
    return this.isEnded(task) ? 'ENDED' as const : 'ONGOING' as const;
  }

  private versionSnapshot(task: {
    title: string; content: string; level: string; deadline: Date; completionMode: string;
    feedbackRequired: boolean; attachmentRequired: boolean;
  }, attachmentFileIds: string[]) {
    return this.json({
      title: task.title,
      content: task.content,
      level: task.level,
      deadlineAt: task.deadline.toISOString(),
      completionMode: task.completionMode,
      feedbackRequired: task.feedbackRequired,
      attachmentRequired: task.attachmentRequired,
      attachmentFileIds,
    });
  }

  private async resolveAssignees(tx: Tx, departmentId: string, selection: AssigneeSelectionDto) {
    let where: Prisma.UserWhereInput = { departmentId, status: 'ACTIVE' };
    if (selection.mode === 'GROUPS') {
      if (!selection.groupIds?.length) throw new ConflictException('TASK_ASSIGNEES_EMPTY');
      const groupCount = await tx.nursingGroup.count({
        where: { id: { in: selection.groupIds }, departmentId, enabled: true },
      });
      if (groupCount !== new Set(selection.groupIds).size) throw new NotFoundException('RESOURCE_NOT_FOUND');
      where = { ...where, primaryGroupId: { in: selection.groupIds } };
    } else if (selection.mode === 'USERS') {
      if (!selection.userIds?.length) throw new ConflictException('TASK_ASSIGNEES_EMPTY');
      where = { ...where, id: { in: selection.userIds } };
    }
    return tx.user.findMany({ where, select: { id: true, employeeNo: true, name: true, primaryGroupId: true } });
  }

  private async readyFiles(tx: Tx, departmentId: string, uploaderId: string, fileIds: string[] = [], purpose: 'TASK_ATTACHMENT' | 'TASK_SUBMISSION' = 'TASK_ATTACHMENT') {
    if (!fileIds.length) return [];
    const files = await tx.fileObject.findMany({
      where: { id: { in: fileIds }, status: 'READY', purpose, uploadedById: uploaderId, uploadedBy: { departmentId } },
      select: { id: true },
    });
    if (files.length !== new Set(fileIds).size) throw new ConflictException('ATTACHMENT_NOT_READY');
    return files;
  }

  private validateMode(dto: CreateTaskDto) {
    if (dto.completionMode === 'SIMPLE' && (dto.feedbackRequired || dto.attachmentRequired)) {
      throw new ConflictException('TASK_MODE_CONFIG_INVALID');
    }
  }

  async previewAssignees(user: AuthUser, selection: AssigneeSelectionDto) {
    const assignees = await this.prisma.$transaction((tx) => this.resolveAssignees(tx, user.departmentId, selection));
    return { assigneeCount: assignees.length, assignees };
  }

  async create(user: AuthUser, dto: CreateTaskDto) {
    this.validateMode(dto);
    const deadline = this.deadline(dto.deadlineAt);
    return this.prisma.$transaction(async (tx) => {
      const assignees = await this.resolveAssignees(tx, user.departmentId, dto.assigneeSelection);
      if (!assignees.length) throw new ConflictException('TASK_ASSIGNEES_EMPTY');
      await this.readyFiles(tx, user.departmentId, user.id, dto.attachmentFileIds);
      const task = await tx.task.create({
        data: {
          departmentId: user.departmentId,
          title: dto.title.trim(),
          content: dto.content.trim(),
          level: dto.level,
          completionMode: dto.completionMode,
          feedbackRequired: dto.feedbackRequired,
          attachmentRequired: dto.attachmentRequired,
          deadline,
          assigneeSelection: this.json(dto.assigneeSelection),
          createdById: user.id,
        },
      });
      if (dto.attachmentFileIds?.length) {
        await tx.taskAttachment.createMany({
          data: dto.attachmentFileIds.map((fileId, sortOrder) => ({ taskId: task.id, fileId, sortOrder })),
        });
      }
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.create', targetType: 'task', targetId: task.id, result: 'SUCCESS', afterData: { assigneePreviewCount: assignees.length } },
      });
      return { ...task, assigneePreviewCount: assignees.length };
    });
  }

  async listManaged(user: AuthUser, query: TaskListQueryDto, canReadAll: boolean) {
    const now = new Date();
    const where: Prisma.TaskWhereInput = {
      departmentId: user.departmentId,
      deletedAt: null,
      ...(query.status
        ? { status: query.status }
        : query.lifecycle === 'ONGOING'
          ? { status: 'PUBLISHED', deadline: { gt: now } }
          : query.lifecycle === 'ENDED'
            ? { OR: [{ status: 'CLOSED' }, { status: 'PUBLISHED', deadline: { lte: now } }] }
            : { OR: [{ status: 'PUBLISHED' }, { status: 'CLOSED' }] }),
      ...(!canReadAll ? { createdById: user.id } : {}),
    };
    const { items, total, progress, views } = await this.prisma.$transaction(async (tx) => {
      const [items, total] = await Promise.all([
        tx.task.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: { _count: { select: { records: { where: { excludedAt: null } } } } },
        }),
        tx.task.count({ where }),
      ]);
      const progress = items.length ? await tx.taskRecord.groupBy({
        by: ['taskId', 'status'],
        where: { taskId: { in: items.map((item) => item.id) }, excludedAt: null },
        _count: { _all: true },
      }) : [];
      const views = items.length ? await tx.taskView.findMany({
        where: { taskRecord: { taskId: { in: items.map((item) => item.id) }, excludedAt: null } },
        select: { versionNo: true, viewedAt: true, taskRecord: { select: { taskId: true } } },
      }) : [];
      return { items, total, progress, views };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const progressByTask = new Map<string, { completed: number; pendingReview: number }>();
    for (const row of progress) {
      const count = progressByTask.get(row.taskId) ?? { completed: 0, pendingReview: 0 };
      if (row.status === 'COMPLETED' || row.status === 'APPROVED') count.completed += row._count._all;
      if (row.status === 'SUBMITTED') count.pendingReview += row._count._all;
      progressByTask.set(row.taskId, count);
    }
    const viewCountByTask = new Map<string, number>();
    for (const view of views) {
      const task = items.find((item) => item.id === view.taskRecord.taskId);
      if (!task || view.versionNo !== task.currentVersion) continue;
      const cutoff = task.status === 'CLOSED' ? task.closedAt : task.deadline;
      if (cutoff && view.viewedAt.getTime() > cutoff.getTime()) continue;
      viewCountByTask.set(task.id, (viewCountByTask.get(task.id) ?? 0) + 1);
    }
    return {
      items: items.map(({ _count, ...item }) => {
        const counts = progressByTask.get(item.id) ?? { completed: 0, pendingReview: 0 };
        const viewedCount = viewCountByTask.get(item.id) ?? 0;
        return { ...item, assigneeCount: _count.records, completedCount: counts.completed,
          unfinishedCount: _count.records - counts.completed, pendingReviewCount: counts.pendingReview,
          viewedCount, unviewedCount: _count.records - viewedCount, lifecycle: this.lifecycle(item) };
      }),
      page: this.page(query.page, query.pageSize, total),
    };
  }

  async getManaged(user: AuthUser, taskId: string, canReadAll: boolean) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, departmentId: user.departmentId, deletedAt: null, ...(!canReadAll ? { createdById: user.id } : {}) },
      include: {
        attachments: { orderBy: { sortOrder: 'asc' }, include: { file: { select: { id: true, originalName: true, mimeType: true, status: true } } } },
        _count: { select: { records: { where: { excludedAt: null } } } },
      },
    });
    if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
    const { _count, ...data } = task;
    return { ...data, assigneeCount: _count.records, lifecycle: this.lifecycle(data) };
  }

  async update(user: AuthUser, taskId: string, dto: CreateTaskDto) {
    this.validateMode(dto);
    const deadline = this.deadline(dto.deadlineAt);
    const result = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      const active = task.status === 'PUBLISHED' && task.deadline.getTime() > Date.now() && !task.deletedAt;
      if (task.status !== 'DRAFT' && !active) throw new ConflictException('TASK_STATE_CONFLICT');
      if (task.createdById !== user.id && user.role !== 'HEAD_NURSE') throw new ForbiddenException('PERMISSION_DENIED');
      if (active && (task.completionMode !== dto.completionMode
        || task.feedbackRequired !== dto.feedbackRequired
        || task.attachmentRequired !== dto.attachmentRequired)) {
        throw new ConflictException('TASK_MODE_IMMUTABLE_AFTER_PUBLISH');
      }
      if (active && JSON.stringify(task.assigneeSelection) !== JSON.stringify(dto.assigneeSelection)) {
        throw new ConflictException('TASK_ASSIGNEES_IMMUTABLE_AFTER_PUBLISH');
      }
      const assignees = await this.resolveAssignees(tx, user.departmentId, dto.assigneeSelection);
      if (!assignees.length) throw new ConflictException('TASK_ASSIGNEES_EMPTY');
      await this.readyFiles(tx, user.departmentId, user.id, dto.attachmentFileIds);
      const currentAttachments = await tx.taskAttachment.findMany({ where: { taskId }, orderBy: { sortOrder: 'asc' }, select: { fileId: true } });
      const nextAttachmentIds = dto.attachmentFileIds ?? [];
      const attachmentChanged = currentAttachments.map((item) => item.fileId).join(',') !== nextAttachmentIds.join(',');
      const contentChanged = task.title !== dto.title.trim() || task.content !== dto.content.trim()
        || task.level !== dto.level || attachmentChanged;
      await tx.taskAttachment.deleteMany({ where: { taskId } });
      if (dto.attachmentFileIds?.length) {
        await tx.taskAttachment.createMany({ data: dto.attachmentFileIds.map((fileId, sortOrder) => ({ taskId, fileId, sortOrder })) });
      }
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          title: dto.title.trim(), content: dto.content.trim(), level: dto.level,
          completionMode: dto.completionMode, feedbackRequired: dto.feedbackRequired,
          attachmentRequired: dto.attachmentRequired, deadline,
          assigneeSelection: this.json(dto.assigneeSelection),
          ...(active && contentChanged ? { currentVersion: { increment: 1 } } : {}),
        },
      });
      if (active && contentChanged) {
        const version = await tx.taskVersion.create({
          data: {
            taskId,
            versionNo: updated.currentVersion,
            snapshot: this.versionSnapshot(updated, nextAttachmentIds),
            changeReason: '进行中任务内容更新，负责人需查看新版本',
            createdById: user.id,
          },
        });
        if (nextAttachmentIds.length) {
          await tx.taskVersionAttachment.createMany({
            data: nextAttachmentIds.map((fileId, sortOrder) => ({ taskVersionId: version.id, fileId, sortOrder })),
          });
        }
      }
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: active ? 'task.active_update' : 'task.draft_update', targetType: 'task', targetId: taskId, result: 'SUCCESS', beforeData: { deadlineAt: task.deadline.toISOString(), version: task.currentVersion }, afterData: { deadlineAt: updated.deadline.toISOString(), version: updated.currentVersion, contentChanged } },
      });
      return { ...updated, assigneePreviewCount: assignees.length, deadlineChanged: task.deadline.getTime() !== updated.deadline.getTime() };
    });
    if (result.status === 'PUBLISHED' && result.deadlineChanged) await this.scheduler.scheduleTask(taskId, result.deadline);
    return result;
  }

  async cancel(user: AuthUser, taskId: string) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (task.status !== 'DRAFT') throw new ConflictException('TASK_STATE_CONFLICT');
      if (task.createdById !== user.id && user.role !== 'HEAD_NURSE') throw new ForbiddenException('PERMISSION_DENIED');
      const updated = await tx.task.update({ where: { id: taskId }, data: { status: 'CANCELLED' } });
      await tx.auditLog.create({ data: { departmentId: user.departmentId, actorId: user.id, action: 'task.cancel', targetType: 'task', targetId: taskId, result: 'SUCCESS' } });
      return updated;
    });
  }

  async publish(user: AuthUser, taskId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId }, include: { attachments: { orderBy: { sortOrder: 'asc' } } } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (task.status !== 'DRAFT') throw new ConflictException('TASK_STATE_CONFLICT');
      if (task.createdById !== user.id && user.role !== 'HEAD_NURSE') throw new ForbiddenException('PERMISSION_DENIED');
      const assignees = await this.resolveAssignees(tx, user.departmentId, task.assigneeSelection as unknown as AssigneeSelectionDto);
      if (!assignees.length) throw new ConflictException('TASK_ASSIGNEES_EMPTY');
      const changed = await tx.task.updateMany({
        where: { id: taskId, status: 'DRAFT' },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: user.id, currentVersion: 1 },
      });
      if (changed.count !== 1) throw new ConflictException('TASK_STATE_CONFLICT');
      await tx.taskRecord.createMany({ data: assignees.map(({ id }) => ({ taskId, assigneeId: id })) });
      const version = await tx.taskVersion.create({
        data: { taskId, versionNo: 1, snapshot: this.versionSnapshot(task, task.attachments.map((item) => item.fileId)), changeReason: '任务首次发布', createdById: user.id },
      });
      if (task.attachments.length) {
        await tx.taskVersionAttachment.createMany({
          data: task.attachments.map((item) => ({ taskVersionId: version.id, fileId: item.fileId, sortOrder: item.sortOrder })),
        });
      }
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.publish', targetType: 'task', targetId: taskId, result: 'SUCCESS', afterData: { assigneeCount: assignees.length } },
      });
      return { ...task, status: 'PUBLISHED' as const, currentVersion: 1, assigneeCount: assignees.length };
    });
    await this.scheduler.scheduleTask(taskId, result.deadline).catch((error) => {
      console.error(JSON.stringify({ event: 'task_reminder_schedule_failed', taskId, message: (error as Error).message }));
    });
    return result;
  }

  async changeLifecycle(user: AuthUser, taskId: string, action: 'close' | 'withdraw', dto: OptionalReasonDto | RequiredReasonDto) {
    if (action === 'withdraw' && !dto.reason?.trim()) throw new ConflictException('REASON_REQUIRED');
    const result = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId, deletedAt: null } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (task.status !== 'PUBLISHED' || task.deadline.getTime() <= Date.now()) throw new ConflictException('TASK_STATE_CONFLICT');
      const now = new Date();
      const updated = await tx.task.update({
        where: { id: taskId },
        data: action === 'close'
          ? { status: 'CLOSED', closedAt: now, closeReason: dto.reason?.trim() || null }
          : { status: 'WITHDRAWN', withdrawnAt: now, withdrawReason: dto.reason!.trim() },
      });
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: `task.${action}`, targetType: 'task', targetId: taskId, result: 'SUCCESS', reason: dto.reason?.trim() },
      });
      return updated;
    });
    await this.scheduler.cancel('TASK', taskId).catch((error) => {
      console.error(JSON.stringify({ event: 'task_reminder_cancel_failed', taskId, message: (error as Error).message }));
    });
    return result;
  }

  async relaunch(user: AuthUser, taskId: string, dto: RelaunchTaskDto) {
    const deadline = this.deadline(dto.deadlineAt);
    const result = await this.prisma.$transaction(async (tx) => {
      const source = await tx.task.findFirst({
        where: { id: taskId, departmentId: user.departmentId, deletedAt: null },
        include: {
          attachments: { orderBy: { sortOrder: 'asc' } },
          records: { where: { excludedAt: null }, include: { assignee: { select: { status: true } } } },
        },
      });
      if (!source) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (!this.isEnded(source)) throw new ConflictException('TASK_NOT_ENDED');
      const assigneeIds = source.records.filter((record) => record.assignee.status === 'ACTIVE').map((record) => record.assigneeId);
      if (!assigneeIds.length) throw new ConflictException('TASK_ASSIGNEES_EMPTY');
      const task = await tx.task.create({
        data: {
          departmentId: user.departmentId,
          title: source.title,
          content: source.content,
          level: source.level,
          status: 'PUBLISHED',
          currentVersion: 1,
          completionMode: source.completionMode,
          feedbackRequired: source.feedbackRequired,
          attachmentRequired: source.attachmentRequired,
          deadline,
          assigneeSelection: this.json({ mode: 'USERS', userIds: assigneeIds }),
          createdById: user.id,
          publishedById: user.id,
          publishedAt: new Date(),
          sourceTaskId: source.id,
        },
      });
      if (source.attachments.length) {
        await tx.taskAttachment.createMany({ data: source.attachments.map((item) => ({ taskId: task.id, fileId: item.fileId, sortOrder: item.sortOrder })) });
      }
      await tx.taskRecord.createMany({ data: assigneeIds.map((assigneeId) => ({ taskId: task.id, assigneeId })) });
      const version = await tx.taskVersion.create({
        data: { taskId: task.id, versionNo: 1, snapshot: this.versionSnapshot(task, source.attachments.map((item) => item.fileId)), changeReason: `由任务 ${source.id} 再次发起`, createdById: user.id },
      });
      if (source.attachments.length) {
        await tx.taskVersionAttachment.createMany({
          data: source.attachments.map((item) => ({ taskVersionId: version.id, fileId: item.fileId, sortOrder: item.sortOrder })),
        });
      }
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.relaunch', targetType: 'task', targetId: task.id, result: 'SUCCESS', afterData: { sourceTaskId: source.id, assigneeCount: assigneeIds.length, deadlineAt: deadline.toISOString() } },
      });
      return { ...task, assigneeCount: assigneeIds.length, lifecycle: 'ONGOING' as const };
    });
    await this.scheduler.scheduleTask(result.id, result.deadline).catch((error) => {
      console.error(JSON.stringify({ event: 'task_reminder_schedule_failed', taskId: result.id, message: (error as Error).message }));
    });
    return result;
  }

  async softDelete(user: AuthUser, taskId: string, dto: OptionalReasonDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId, deletedAt: null } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (!this.isEnded(task)) throw new ConflictException('TASK_NOT_ENDED');
      const deletedAt = new Date();
      const changed = await tx.task.updateMany({
        where: { id: taskId, deletedAt: null },
        data: { deletedAt, deletedById: user.id, deleteReason: dto.reason?.trim() || null },
      });
      if (changed.count !== 1) throw new ConflictException('TASK_STATE_CONFLICT');
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.delete', targetType: 'task', targetId: taskId, result: 'SUCCESS', reason: dto.reason?.trim() || null, beforeData: { status: task.status, deadlineAt: task.deadline.toISOString() }, afterData: { deletedAt: deletedAt.toISOString() } },
      });
      return { id: taskId, deletedAt };
    });
    await this.scheduler.cancel('TASK', taskId).catch(() => undefined);
    return result;
  }

  async listMine(user: AuthUser, query: MyTaskListQueryDto) {
    const records = await this.prisma.taskRecord.findMany({
      where: { assigneeId: user.id, excludedAt: null, task: { deletedAt: null, status: { in: ['PUBLISHED', 'CLOSED'] } } },
      include: { task: true },
      orderBy: { updatedAt: 'desc' },
    });
    const items = records.map((record) => ({
      id: record.task.id,
      recordId: record.id,
      title: record.task.title,
      level: record.task.level,
      status: record.task.status,
      completionMode: record.task.completionMode,
      recordStatus: record.status,
      derivedStatus: this.derivedStatus(record.status, record.task.deadline),
      deadlineAt: record.task.deadline,
      completedAt: record.completedAt,
      lifecycle: this.lifecycle(record.task),
    }));
    const filtered = query.status ? items.filter((item) => item.derivedStatus === query.status) : items;
    const start = (query.page - 1) * query.pageSize;
    return { items: filtered.slice(start, start + query.pageSize), page: this.page(query.page, query.pageSize, filtered.length) };
  }

  async getMine(user: AuthUser, taskId: string) {
    const { record, viewedAt } = await this.prisma.$transaction(async (tx) => {
      const found = await tx.taskRecord.findFirst({
        where: { taskId, assigneeId: user.id, excludedAt: null, task: { deletedAt: null, status: { in: ['PUBLISHED', 'CLOSED'] } } },
        include: {
          task: { include: { attachments: { orderBy: { sortOrder: 'asc' }, include: { file: { select: { id: true, originalName: true, mimeType: true, status: true } } } } } },
          views: { orderBy: { viewedAt: 'asc' } },
          submissions: {
            orderBy: { submissionNo: 'asc' },
            include: { attachments: { orderBy: { sortOrder: 'asc' }, include: { file: { select: { id: true, originalName: true, mimeType: true, status: true } } } } },
          },
        },
      });
      if (!found) throw new NotFoundException('RESOURCE_NOT_FOUND');
      const versionNo = Math.max(1, found.task.currentVersion);
      const view = await tx.taskView.upsert({
        where: { taskRecordId_versionNo: { taskRecordId: found.id, versionNo } },
        create: { taskRecordId: found.id, versionNo },
        update: {},
      });
      return { record: found, viewedAt: view.viewedAt };
    });
    return {
      id: record.task.id,
      recordId: record.id,
      title: record.task.title,
      content: record.task.content,
      level: record.task.level,
      completionMode: record.task.completionMode,
      feedbackRequired: record.task.feedbackRequired,
      attachmentRequired: record.task.attachmentRequired,
      recordStatus: record.status,
      derivedStatus: this.derivedStatus(record.status, record.task.deadline),
      deadlineAt: record.task.deadline,
      completedAt: record.completedAt,
      lifecycle: this.lifecycle(record.task),
      viewedAt,
      currentVersion: record.task.currentVersion,
      attachments: record.task.attachments.map((item) => item.file),
      submissions: record.submissions.map(({ attachments, ...submission }) => ({ ...submission, attachments: attachments.map((item) => item.file) })),
    };
  }

  async complete(user: AuthUser, taskId: string) {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.taskRecord.findFirst({
        where: { taskId, assigneeId: user.id, excludedAt: null, task: { status: 'PUBLISHED', deletedAt: null, deadline: { gt: new Date() } } },
        include: { task: true },
      });
      if (!record) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (record.task.completionMode !== 'SIMPLE') throw new ConflictException('TASK_MODE_MISMATCH');
      if (record.status === 'COMPLETED') return { taskId, status: record.status, completedAt: record.completedAt };
      const completedAt = new Date();
      const changed = await tx.taskRecord.updateMany({
        where: { id: record.id, status: 'PENDING', lockVersion: record.lockVersion },
        data: { status: 'COMPLETED', completedAt, lockVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('TASK_STATE_CONFLICT');
      await tx.reminder.updateMany({
        where: { taskRecordId: record.id, status: { in: ['PLANNED', 'FAILED_RETRYABLE'] } },
        data: { status: 'CANCELLED' },
      });
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.complete', targetType: 'task_record', targetId: record.id, result: 'SUCCESS', afterData: { completedAt: completedAt.toISOString() } },
      });
      return { taskId, status: 'COMPLETED' as const, completedAt };
    });
  }

  async submit(user: AuthUser, taskId: string, dto: SubmitTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.taskRecord.findFirst({
        where: { taskId, assigneeId: user.id, excludedAt: null, task: { status: 'PUBLISHED', deletedAt: null, deadline: { gt: new Date() } } },
        include: { task: true, submissions: { orderBy: { submissionNo: 'desc' }, take: 1 } },
      });
      if (!record) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (record.task.completionMode !== 'REVIEW') throw new ConflictException('TASK_MODE_MISMATCH');
      if (!['PENDING', 'RETURNED'].includes(record.status)) throw new ConflictException('TASK_STATE_CONFLICT');
      if (record.task.feedbackRequired && !dto.feedback?.trim()) throw new BadRequestException('VALIDATION_FAILED');
      if (record.task.attachmentRequired && !dto.attachmentFileIds?.length) throw new BadRequestException('VALIDATION_FAILED');
      await this.readyFiles(tx, user.departmentId, user.id, dto.attachmentFileIds, 'TASK_SUBMISSION');
      const changed = await tx.taskRecord.updateMany({
        where: { id: record.id, status: record.status, lockVersion: record.lockVersion },
        data: { status: 'SUBMITTED', lockVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('TASK_STATE_CONFLICT');
      const submissionNo = (record.submissions[0]?.submissionNo ?? 0) + 1;
      const submission = await tx.taskSubmission.create({
        data: { taskRecordId: record.id, submissionNo, feedback: dto.feedback?.trim() || null },
      });
      if (dto.attachmentFileIds?.length) {
        await tx.taskSubmissionAttachment.createMany({
          data: dto.attachmentFileIds.map((fileId, sortOrder) => ({ taskSubmissionId: submission.id, fileId, sortOrder })),
        });
      }
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.submit', targetType: 'task_record', targetId: record.id, result: 'SUCCESS', afterData: { submissionId: submission.id, submissionNo } },
      });
      return submission;
    });
  }

  async review(user: AuthUser, taskId: string, recordId: string, dto: ReviewTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.taskRecord.findFirst({
        where: { id: recordId, taskId, task: { departmentId: user.departmentId, deletedAt: null, status: { in: ['PUBLISHED', 'CLOSED'] } } },
      });
      if (!record) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (record.status !== 'SUBMITTED') throw new ConflictException('TASK_STATE_CONFLICT');
      if (dto.action === 'RETURN' && !dto.comment?.trim()) throw new BadRequestException('VALIDATION_FAILED');
      const approved = dto.action === 'APPROVE';
      const now = new Date();
      const submissionChanged = await tx.taskSubmission.updateMany({
        where: { id: dto.submissionId, taskRecordId: recordId, reviewStatus: 'PENDING' },
        data: { reviewStatus: approved ? 'APPROVED' : 'RETURNED', reviewedById: user.id, reviewedAt: now, reviewComment: dto.comment?.trim() || null },
      });
      if (submissionChanged.count !== 1) throw new ConflictException('TASK_SUBMISSION_CHANGED');
      const recordChanged = await tx.taskRecord.updateMany({
        where: { id: recordId, status: 'SUBMITTED', lockVersion: record.lockVersion },
        data: { status: approved ? 'APPROVED' : 'RETURNED', lockVersion: { increment: 1 } },
      });
      if (recordChanged.count !== 1) throw new ConflictException('TASK_STATE_CONFLICT');
      if (approved) {
        await tx.reminder.updateMany({
          where: { taskRecordId: recordId, status: { in: ['PLANNED', 'FAILED_RETRYABLE'] } },
          data: { status: 'CANCELLED' },
        });
      }
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: approved ? 'task.approve' : 'task.return', targetType: 'task_submission', targetId: dto.submissionId, result: 'SUCCESS', reason: dto.comment?.trim() || null },
      });
      return tx.taskSubmission.findUniqueOrThrow({ where: { id: dto.submissionId } });
    });
  }

  async listRecords(user: AuthUser, taskId: string, query: TaskRecordPageQueryDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, departmentId: user.departmentId, deletedAt: null } });
    if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
    const records = await this.prisma.taskRecord.findMany({
      where: { taskId, excludedAt: null },
      orderBy: { assignee: { name: 'asc' } },
      include: {
        assignee: { select: { id: true, employeeNo: true, name: true, primaryGroupId: true } },
        submissions: { orderBy: { submissionNo: 'asc' } },
        views: { where: { versionNo: task.currentVersion }, orderBy: { viewedAt: 'asc' } },
      },
    });
    const cutoff = this.isEnded(task) ? (task.closedAt ?? task.deadline) : null;
    const allItems = records.map((record) => {
      const viewedAt = record.views[0]?.viewedAt ?? null;
      const viewedDuringTask = Boolean(viewedAt && (!cutoff || viewedAt.getTime() <= cutoff.getTime()));
      return {
        id: record.id,
        assignee: record.assignee,
        recordStatus: record.status,
        derivedStatus: this.derivedStatus(record.status, task.deadline),
        completedAt: record.completedAt,
        viewedAt,
        viewStatus: viewedDuringTask ? 'VIEWED' : viewedAt ? 'VIEWED_AFTER_END' : 'UNVIEWED',
        submissions: record.submissions,
      };
    });
    const counts = allItems.reduce<Record<string, number>>((result, item) => {
      result[item.derivedStatus] = (result[item.derivedStatus] ?? 0) + 1;
      return result;
    }, {});
    const start = (query.page - 1) * query.pageSize;
    return {
      items: allItems.slice(start, start + query.pageSize),
      page: this.page(query.page, query.pageSize, allItems.length),
      summary: {
        total: allItems.length,
        counts,
        viewed: allItems.filter((item) => item.viewStatus === 'VIEWED').length,
        unviewed: allItems.filter((item) => item.viewStatus !== 'VIEWED').length,
      },
    };
  }

  async addAssignees(user: AuthUser, taskId: string, selection: AssigneeSelectionDto) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (task.status !== 'PUBLISHED' || task.deadline.getTime() <= Date.now() || task.deletedAt) throw new ConflictException('TASK_STATE_CONFLICT');
      const assignees = await this.resolveAssignees(tx, user.departmentId, selection);
      const result = await tx.taskRecord.createMany({ data: assignees.map(({ id }) => ({ taskId, assigneeId: id })), skipDuplicates: true });
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.assignees_add', targetType: 'task', targetId: taskId, result: 'SUCCESS', afterData: { addedCount: result.count } },
      });
      return { requestedCount: assignees.length, addedCount: result.count };
    });
  }

  async excludeRecord(user: AuthUser, taskId: string, recordId: string, dto: RequiredReasonDto) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (task.status !== 'PUBLISHED' || task.deadline.getTime() <= Date.now() || task.deletedAt) throw new ConflictException('TASK_STATE_CONFLICT');
      const changed = await tx.taskRecord.updateMany({
        where: { id: recordId, taskId, excludedAt: null, status: { in: ['PENDING', 'RETURNED'] } },
        data: { status: 'EXCLUDED', excludedAt: new Date(), excludedById: user.id, exclusionReason: dto.reason.trim(), lockVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('TASK_STATE_CONFLICT');
      await tx.reminder.updateMany({
        where: { taskRecordId: recordId, status: { in: ['PLANNED', 'FAILED_RETRYABLE'] } },
        data: { status: 'CANCELLED' },
      });
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.assignee_exclude', targetType: 'task_record', targetId: recordId, result: 'SUCCESS', reason: dto.reason.trim() },
      });
      return { recordId, excluded: true };
    });
  }
}
