import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, ReviewTaskDto, SubmitTaskDto } from './tasks.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          departmentId: user.departmentId,
          title: dto.title,
          content: dto.content,
          level: dto.level,
          completionMode: dto.completionMode,
          feedbackRequired: dto.feedbackRequired,
          attachmentRequired: dto.attachmentRequired,
          deadline: new Date(dto.deadlineAt),
          assigneeSelection: dto.assigneeSelection as unknown as Prisma.InputJsonValue,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'task.create',
          targetType: 'task',
          targetId: task.id,
          result: 'SUCCESS',
        },
      });
      return task;
    });
  }

  async publish(user: AuthUser, taskId: string) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, departmentId: user.departmentId } });
      if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
      if (task.status !== 'DRAFT') throw new ConflictException('TASK_STATE_CONFLICT');
      const selection = task.assigneeSelection as { userIds?: string[] } | null;
      const userIds = [...new Set(selection?.userIds ?? [])];
      const validUsers = await tx.user.findMany({
        where: { id: { in: userIds }, departmentId: user.departmentId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!validUsers.length) throw new ConflictException('TASK_ASSIGNEES_EMPTY');
      await tx.taskRecord.createMany({
        data: validUsers.map(({ id }) => ({ taskId, assigneeId: id })),
      });
      const published = await tx.task.update({
        where: { id: taskId },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: user.id },
      });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'task.publish',
          targetType: 'task',
          targetId: taskId,
          result: 'SUCCESS',
          afterData: { assigneeCount: validUsers.length },
        },
      });
      return { ...published, assigneeCount: validUsers.length };
    });
  }

  async getMine(user: AuthUser, taskId: string) {
    const record = await this.prisma.taskRecord.findFirst({
      where: { taskId, assigneeId: user.id, excludedAt: null, task: { status: 'PUBLISHED' } },
      include: { task: true, submissions: { orderBy: { submissionNo: 'asc' } } },
    });
    if (!record) throw new NotFoundException('RESOURCE_NOT_FOUND');
    return {
      id: record.task.id,
      recordId: record.id,
      title: record.task.title,
      content: record.task.content,
      completionMode: record.task.completionMode,
      recordStatus: record.status,
      deadlineAt: record.task.deadline,
      submissions: record.submissions,
    };
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
      if (record.task.feedbackRequired && !dto.feedback?.trim()) {
        throw new BadRequestException('VALIDATION_FAILED');
      }
      const submissionNo = (record.submissions[0]?.submissionNo ?? 0) + 1;
      const submission = await tx.taskSubmission.create({
        data: { taskRecordId: record.id, submissionNo, feedback: dto.feedback?.trim() || null },
      });
      await tx.taskRecord.update({
        where: { id: record.id },
        data: { status: 'SUBMITTED', lockVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'task.submit',
          targetType: 'task_record',
          targetId: record.id,
          result: 'SUCCESS',
          afterData: { submissionId: submission.id, submissionNo },
        },
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
      const submission = await tx.taskSubmission.findFirst({
        where: { id: dto.submissionId, taskRecordId: recordId, reviewStatus: 'PENDING' },
      });
      if (!submission) throw new ConflictException('TASK_SUBMISSION_CHANGED');
      if (dto.action === 'RETURN' && !dto.comment?.trim()) {
        throw new BadRequestException('VALIDATION_FAILED');
      }
      const approved = dto.action === 'APPROVE';
      const reviewed = await tx.taskSubmission.update({
        where: { id: submission.id },
        data: {
          reviewStatus: approved ? 'APPROVED' : 'RETURNED',
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewComment: dto.comment?.trim() || null,
        },
      });
      await tx.taskRecord.update({
        where: { id: recordId },
        data: { status: approved ? 'APPROVED' : 'RETURNED', lockVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: approved ? 'task.approve' : 'task.return',
          targetType: 'task_submission',
          targetId: submission.id,
          result: 'SUCCESS',
          reason: dto.comment?.trim() || null,
        },
      });
      return reviewed;
    });
  }
}
