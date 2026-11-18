import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssigneeSelectionDto,
  CreateTaskDto,
  MyTaskListQueryDto,
  OptionalReasonDto,
  RequiredReasonDto,
  ReviewTaskDto,
  SubmitTaskDto,
  TaskListQueryDto,
  TaskRecordPageQueryDto,
} from './tasks.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (deadline.getTime() < Date.now() && status === 'PENDING') return 'OVERDUE_PENDING';
    if (deadline.getTime() < Date.now() && status === 'RETURNED') return 'OVERDUE_RETURNED';
    return status;
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

  private async readyFiles(tx: Tx, departmentId: string, fileIds: string[] = []) {
    if (!fileIds.length) return [];
    const files = await tx.fileObject.findMany({
      where: { id: { in: fileIds }, status: 'READY', uploadedBy: { departmentId } },
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
      await this.readyFiles(tx, user.departmentId, dto.attachmentFileIds);
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
    const where: Prisma.TaskWhereInput = {
      departmentId: user.departmentId,
      ...(query.status ? { status: query.status } : {}),
      ...(!canReadAll ? { createdById: user.id } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { records: { where: { excludedAt: null } } } } },
      }),
      this.prisma.task.count({ where }),
    ]);
    return { items: items.map(({ _count, ...item }) => ({ ...item, assigneeCount: _count.records })), page: this.page(query.page, query.pageSize, total) };
  }

  async getManaged(user: AuthUser, taskId: string, canReadAll: boolean) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, departmentId: user.departmentId, ...(!canReadAll ? { createdById: user.id } : {}) },
      include: {
        attachments: { orderBy: { sortOrder: 'asc' }, include: { file: { select: { id: true, originalName: true, mimeType: true, status: true } } } },
        _count: { select: { records: { where: { excludedAt: null } } } },
      },
    });
    if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
    const { _count, ...data } = task;
    return { ...data, assigneeCount: _count.records };
  }

  async update(user: AuthUser, taskId: string, dto: CreateTaskDto) {
    this.validateMode(dto);
    const deadline = this.deadline(dto.deadlineAt);
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (task.status !== 'DRAFT') throw new ConflictException('TASK_STATE_CONFLICT');
      if (task.createdById !== user.id && user.role !== 'HEAD_NURSE') throw new ForbiddenException('PERMISSION_DENIED');
      const assignees = await this.resolveAssignees(tx, user.departmentId, dto.assigneeSelection);
      if (!assignees.length) throw new ConflictException('TASK_ASSIGNEES_EMPTY');
      await this.readyFiles(tx, user.departmentId, dto.attachmentFileIds);
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
        },
      });
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.draft_update', targetType: 'task', targetId: taskId, result: 'SUCCESS' },
      });
      return { ...updated, assigneePreviewCount: assignees.length };
    });
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
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (task.status !== 'DRAFT') throw new ConflictException('TASK_STATE_CONFLICT');
      if (task.createdById !== user.id && user.role !== 'HEAD_NURSE') throw new ForbiddenException('PERMISSION_DENIED');
      const assignees = await this.resolveAssignees(tx, user.departmentId, task.assigneeSelection as unknown as AssigneeSelectionDto);
      if (!assignees.length) throw new ConflictException('TASK_ASSIGNEES_EMPTY');
      const changed = await tx.task.updateMany({
        where: { id: taskId, status: 'DRAFT' },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: user.id },
      });
      if (changed.count !== 1) throw new ConflictException('TASK_STATE_CONFLICT');
      await tx.taskRecord.createMany({ data: assignees.map(({ id }) => ({ taskId, assigneeId: id })) });
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.publish', targetType: 'task', targetId: taskId, result: 'SUCCESS', afterData: { assigneeCount: assignees.length } },
      });
      return { ...task, status: 'PUBLISHED' as const, assigneeCount: assignees.length };
    });
  }

  async changeLifecycle(user: AuthUser, taskId: string, action: 'close' | 'withdraw', dto: OptionalReasonDto | RequiredReasonDto) {
    if (action === 'withdraw' && !dto.reason?.trim()) throw new ConflictException('REASON_REQUIRED');
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (task.status !== 'PUBLISHED') throw new ConflictException('TASK_STATE_CONFLICT');
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
  }

  async listMine(user: AuthUser, query: MyTaskListQueryDto) {
    const records = await this.prisma.taskRecord.findMany({
      where: { assigneeId: user.id, excludedAt: null, task: { status: { in: ['PUBLISHED', 'CLOSED'] } } },
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
    }));
    const filtered = query.status ? items.filter((item) => item.derivedStatus === query.status) : items;
    const start = (query.page - 1) * query.pageSize;
    return { items: filtered.slice(start, start + query.pageSize), page: this.page(query.page, query.pageSize, filtered.length) };
  }

  async getMine(user: AuthUser, taskId: string) {
    const record = await this.prisma.taskRecord.findFirst({
      where: { taskId, assigneeId: user.id, excludedAt: null, task: { status: { in: ['PUBLISHED', 'CLOSED'] } } },
      include: {
        task: { include: { attachments: { orderBy: { sortOrder: 'asc' }, include: { file: { select: { id: true, originalName: true, mimeType: true, status: true } } } } } },
        submissions: {
          orderBy: { submissionNo: 'asc' },
          include: { attachments: { orderBy: { sortOrder: 'asc' }, include: { file: { select: { id: true, originalName: true, mimeType: true, status: true } } } } },
        },
      },
    });
    if (!record) throw new NotFoundException('RESOURCE_NOT_FOUND');
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
      attachments: record.task.attachments.map((item) => item.file),
      submissions: record.submissions.map(({ attachments, ...submission }) => ({ ...submission, attachments: attachments.map((item) => item.file) })),
    };
  }

  async complete(user: AuthUser, taskId: string) {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.taskRecord.findFirst({
        where: { taskId, assigneeId: user.id, excludedAt: null, task: { status: 'PUBLISHED' } },
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
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.complete', targetType: 'task_record', targetId: record.id, result: 'SUCCESS', afterData: { completedAt: completedAt.toISOString() } },
      });
      return { taskId, status: 'COMPLETED' as const, completedAt };
    });
  }

  async submit(user: AuthUser, taskId: string, dto: SubmitTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.taskRecord.findFirst({
        where: { taskId, assigneeId: user.id, excludedAt: null, task: { status: 'PUBLISHED' } },
        include: { task: true, submissions: { orderBy: { submissionNo: 'desc' }, take: 1 } },
      });
      if (!record) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (record.task.completionMode !== 'REVIEW') throw new ConflictException('TASK_MODE_MISMATCH');
      if (!['PENDING', 'RETURNED'].includes(record.status)) throw new ConflictException('TASK_STATE_CONFLICT');
      if (record.task.feedbackRequired && !dto.feedback?.trim()) throw new BadRequestException('VALIDATION_FAILED');
      if (record.task.attachmentRequired && !dto.attachmentFileIds?.length) throw new BadRequestException('VALIDATION_FAILED');
      await this.readyFiles(tx, user.departmentId, dto.attachmentFileIds);
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
        where: { id: recordId, taskId, task: { departmentId: user.departmentId, status: 'PUBLISHED' } },
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
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: approved ? 'task.approve' : 'task.return', targetType: 'task_submission', targetId: dto.submissionId, result: 'SUCCESS', reason: dto.comment?.trim() || null },
      });
      return tx.taskSubmission.findUniqueOrThrow({ where: { id: dto.submissionId } });
    });
  }

  async listRecords(user: AuthUser, taskId: string, query: TaskRecordPageQueryDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, departmentId: user.departmentId } });
    if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
    const records = await this.prisma.taskRecord.findMany({
      where: { taskId, excludedAt: null },
      orderBy: { assignee: { name: 'asc' } },
      include: {
        assignee: { select: { id: true, employeeNo: true, name: true, primaryGroupId: true } },
        submissions: { orderBy: { submissionNo: 'asc' } },
      },
    });
    const allItems = records.map((record) => ({
      id: record.id,
      assignee: record.assignee,
      recordStatus: record.status,
      derivedStatus: this.derivedStatus(record.status, task.deadline),
      completedAt: record.completedAt,
      submissions: record.submissions,
    }));
    const counts = allItems.reduce<Record<string, number>>((result, item) => {
      result[item.derivedStatus] = (result[item.derivedStatus] ?? 0) + 1;
      return result;
    }, {});
    const start = (query.page - 1) * query.pageSize;
    return {
      items: allItems.slice(start, start + query.pageSize),
      page: this.page(query.page, query.pageSize, allItems.length),
      summary: { total: allItems.length, counts },
    };
  }

  async addAssignees(user: AuthUser, taskId: string, selection: AssigneeSelectionDto) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (task.status !== 'PUBLISHED') throw new ConflictException('TASK_STATE_CONFLICT');
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
      if (task.status !== 'PUBLISHED') throw new ConflictException('TASK_STATE_CONFLICT');
      const changed = await tx.taskRecord.updateMany({
        where: { id: recordId, taskId, excludedAt: null, status: { in: ['PENDING', 'RETURNED'] } },
        data: { status: 'EXCLUDED', excludedAt: new Date(), excludedById: user.id, exclusionReason: dto.reason.trim(), lockVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('TASK_STATE_CONFLICT');
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'task.assignee_exclude', targetType: 'task_record', targetId: recordId, result: 'SUCCESS', reason: dto.reason.trim() },
      });
      return { recordId, excluded: true };
    });
  }
}
