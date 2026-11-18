import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuthUser } from '../../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditListQueryDto, CreateExportDto } from './reports.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private csvCell(value: unknown): string {
    const text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }

  private csv(rows: unknown[][]): Buffer {
    return Buffer.from(`\uFEFF${rows.map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\r\n')}\r\n`, 'utf8');
  }

  async managementDashboard(departmentId: string) {
    const now = new Date();
    const [notices, tasks] = await Promise.all([
      this.prisma.notice.findMany({
        where: { departmentId, status: 'PUBLISHED' },
        include: { versions: true, recipients: { where: { excludedAt: null }, include: { confirmations: true } } },
      }),
      this.prisma.task.findMany({
        where: { departmentId, status: 'PUBLISHED' },
        include: { records: { where: { excludedAt: null } } },
      }),
    ]);
    const noticeDetails = notices.map((notice) => {
      const version = notice.versions.find((item) => item.versionNo === notice.currentVersion)!;
      const pending = notice.recipients.filter((recipient) => {
        const current = recipient.confirmations.some((item) => item.noticeVersionId === version.id);
        const prior = recipient.confirmations.some((item) => item.noticeVersionId !== version.id);
        return notice.requiresConfirmation && !current && (version.reconfirmRequired || !prior);
      }).length;
      return { id: notice.id, title: version.title, pending, overdue: Boolean(version.deadline && version.deadline < now) ? pending : 0 };
    });
    const taskDetails = tasks.map((task) => {
      const pending = task.records.filter((record) => ['PENDING', 'RETURNED'].includes(record.status)).length;
      const pendingReview = task.records.filter((record) => record.status === 'SUBMITTED').length;
      const overdue = task.deadline < now ? pending : 0;
      return { id: task.id, title: task.title, pending, pendingReview, overdue };
    });
    return {
      counts: {
        pendingNotices: noticeDetails.reduce((sum, item) => sum + item.pending, 0),
        pendingTasks: taskDetails.reduce((sum, item) => sum + item.pending, 0),
        pendingReviews: taskDetails.reduce((sum, item) => sum + item.pendingReview, 0),
        overdue: noticeDetails.reduce((sum, item) => sum + item.overdue, 0) + taskDetails.reduce((sum, item) => sum + item.overdue, 0),
      },
      notices: noticeDetails.filter((item) => item.pending > 0).slice(0, 20),
      tasks: taskDetails.filter((item) => item.pending > 0 || item.pendingReview > 0).slice(0, 20),
    };
  }

  private async noticeCsv(departmentId: string, filters: Record<string, unknown>) {
    const noticeId = typeof filters.noticeId === 'string' ? filters.noticeId : undefined;
    const recipients = await this.prisma.noticeRecipient.findMany({
      where: { notice: { departmentId, ...(noticeId ? { id: noticeId } : {}) } },
      orderBy: [{ notice: { publishedAt: 'desc' } }, { user: { name: 'asc' } }],
      include: { user: true, notice: { include: { versions: true } }, views: true, confirmations: true },
    });
    const rows: unknown[][] = [['通知ID', '通知标题', '当前版本', '工号', '姓名', '是否有效接收人', '首次查看时间', '确认时间', '确认版本', '截止时间']];
    for (const recipient of recipients) {
      const version = recipient.notice.versions.find((item) => item.versionNo === recipient.notice.currentVersion)!;
      const view = recipient.views.find((item) => item.noticeVersionId === version.id);
      const confirmation = recipient.confirmations.find((item) => item.noticeVersionId === version.id);
      rows.push([
        recipient.noticeId, version.title, version.versionNo, recipient.user.employeeNo, recipient.user.name,
        recipient.excludedAt ? '否' : '是', view?.viewedAt, confirmation?.confirmedAt, confirmation ? version.versionNo : null, version.deadline,
      ]);
    }
    return this.csv(rows);
  }

  private async taskCsv(departmentId: string, filters: Record<string, unknown>) {
    const taskId = typeof filters.taskId === 'string' ? filters.taskId : undefined;
    const records = await this.prisma.taskRecord.findMany({
      where: { task: { departmentId, ...(taskId ? { id: taskId } : {}) } },
      orderBy: [{ task: { publishedAt: 'desc' } }, { assignee: { name: 'asc' } }],
      include: { assignee: true, task: true, submissions: { orderBy: { submissionNo: 'asc' } } },
    });
    const rows: unknown[][] = [['任务ID', '任务标题', '完成模式', '工号', '姓名', '执行状态', '完成时间', '提交次数', '最后提交时间', '最后审核时间', '最后审核意见', '截止时间']];
    for (const record of records) {
      const latest = record.submissions.at(-1);
      rows.push([
        record.taskId, record.task.title, record.task.completionMode, record.assignee.employeeNo, record.assignee.name,
        record.status, record.completedAt, record.submissions.length, latest?.submittedAt, latest?.reviewedAt, latest?.reviewComment, record.task.deadline,
      ]);
    }
    return this.csv(rows);
  }

  async createExport(user: AuthUser, dto: CreateExportDto) {
    const filters = dto.filters ?? {};
    const content = dto.type === 'NOTICE_RECIPIENTS'
      ? await this.noticeCsv(user.departmentId, filters)
      : await this.taskCsv(user.departmentId, filters);
    const storageRoot = process.env.FILE_STORAGE_PATH ?? '/data/nursemate';
    await mkdir(storageRoot, { recursive: true });
    const fileId = randomUUID();
    const storageKey = `exports/${fileId}.csv`;
    const absolutePath = join(storageRoot, storageKey);
    await mkdir(join(storageRoot, 'exports'), { recursive: true });
    await writeFile(absolutePath, content, { flag: 'wx' });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const result = await this.prisma.$transaction(async (tx) => {
      const file = await tx.fileObject.create({
        data: {
          id: fileId,
          storageKey,
          originalName: dto.type === 'NOTICE_RECIPIENTS' ? 'notice-recipients.csv' : 'task-records.csv',
          mimeType: 'text/csv; charset=utf-8',
          sizeBytes: BigInt(content.length),
          sha256: createHash('sha256').update(content).digest('hex'),
          status: 'READY',
          uploadedById: user.id,
          readyAt: now,
        },
      });
      const job = await tx.exportJob.create({
        data: {
          departmentId: user.departmentId,
          requestedById: user.id,
          type: dto.type,
          status: 'SUCCEEDED',
          filters: filters as Prisma.InputJsonValue,
          outputFileId: file.id,
          startedAt: now,
          completedAt: now,
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'report.export', targetType: 'export_job', targetId: job.id, result: 'SUCCESS', afterData: { type: dto.type, outputFileId: file.id } },
      });
      return { job, file };
    });
    return {
      id: result.job.id,
      type: result.job.type,
      status: result.job.status,
      completedAt: result.job.completedAt,
      expiresAt: result.job.expiresAt,
      downloadUrl: `/api/v1/files/${result.file.id}/download`,
    };
  }

  async getExport(user: AuthUser, exportId: string) {
    const job = await this.prisma.exportJob.findFirst({
      where: { id: exportId, departmentId: user.departmentId, ...(user.role === 'HEAD_NURSE' ? {} : { requestedById: user.id }) },
    });
    if (!job) throw new NotFoundException('RESOURCE_NOT_FOUND');
    return {
      ...job,
      downloadUrl: job.outputFileId && job.expiresAt && job.expiresAt > new Date() ? `/api/v1/files/${job.outputFileId}/download` : null,
    };
  }

  async download(user: AuthUser, fileId: string) {
    const file = await this.prisma.fileObject.findFirst({
      where: { id: fileId, status: 'READY', uploadedBy: { departmentId: user.departmentId } },
    });
    if (!file) throw new NotFoundException('RESOURCE_NOT_FOUND');
    if (user.role !== 'HEAD_NURSE' && file.uploadedById !== user.id) throw new ForbiddenException('PERMISSION_DENIED');
    const storageRoot = process.env.FILE_STORAGE_PATH ?? '/data/nursemate';
    return { file, content: await readFile(join(storageRoot, file.storageKey)) };
  }

  async listAuditLogs(user: AuthUser, query: AuditListQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      departmentId: user.departmentId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { actor: { select: { id: true, employeeNo: true, name: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, page: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }
}
