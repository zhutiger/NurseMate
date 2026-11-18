import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderRequestDto } from './reminders.dto';

type ReminderTarget = {
  targetType: 'NOTICE_RECIPIENT' | 'TASK_RECORD';
  targetId: string;
  recipientId: string;
};

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  private async createReminders(user: AuthUser, businessTargetId: string, targets: ReminderTarget[], dto: ReminderRequestDto) {
    if (!targets.length) throw new ConflictException('NO_ELIGIBLE_REMINDER_TARGETS');
    const now = new Date();
    const cooldownStart = new Date(now.getTime() - 10 * 60 * 1000);
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);

    return this.prisma.$transaction(async (tx) => {
      for (const target of targets) {
        for (const channel of dto.channels) {
          const targetWhere = target.targetType === 'NOTICE_RECIPIENT'
            ? { noticeRecipientId: target.targetId }
            : { taskRecordId: target.targetId };
          const recent = await tx.reminder.count({ where: { ...targetWhere, channel, createdAt: { gte: cooldownStart }, status: { not: 'CANCELLED' } } });
          const today = await tx.reminder.count({ where: { ...targetWhere, channel, createdAt: { gte: dayStart }, status: { not: 'CANCELLED' } } });
          if (recent > 0 || today >= 3) throw new HttpException('REMINDER_RATE_LIMITED', 429);
        }
      }

      const rows: Prisma.ReminderCreateManyInput[] = [];
      for (const target of targets) {
        for (const channel of dto.channels) {
          const sentImmediately = channel === 'IN_APP' || channel === 'MANUAL';
          rows.push({
            departmentId: user.departmentId,
            targetType: target.targetType,
            noticeRecipientId: target.targetType === 'NOTICE_RECIPIENT' ? target.targetId : null,
            taskRecordId: target.targetType === 'TASK_RECORD' ? target.targetId : null,
            recipientId: target.recipientId,
            channel,
            status: sentImmediately ? 'SENT' : 'PLANNED',
            scheduledAt: now,
            sentAt: sentImmediately ? now : null,
            attemptCount: sentImmediately ? 1 : 0,
            requestedById: user.id,
          });
        }
      }
      await tx.reminder.createMany({ data: rows });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: targets[0].targetType === 'NOTICE_RECIPIENT' ? 'notice.remind' : 'task.remind',
          targetType: targets[0].targetType === 'NOTICE_RECIPIENT' ? 'notice' : 'task',
          targetId: businessTargetId,
          result: 'SUCCESS',
          reason: dto.note?.trim(),
          afterData: { targetCount: targets.length, reminderCount: rows.length, channels: dto.channels },
        },
      });
      return {
        targetCount: targets.length,
        reminderCount: rows.length,
        channels: dto.channels,
        queuedWechatCount: rows.filter((row) => row.channel === 'WECHAT_SUBSCRIBE').length,
      };
    });
  }

  async remindNotice(user: AuthUser, noticeId: string, dto: ReminderRequestDto) {
    const notice = await this.prisma.notice.findFirst({
      where: { id: noticeId, departmentId: user.departmentId, status: 'PUBLISHED' },
      include: {
        versions: { orderBy: { versionNo: 'desc' } },
        recipients: { where: { excludedAt: null }, include: { confirmations: true } },
      },
    });
    if (!notice) throw new NotFoundException('RESOURCE_NOT_FOUND');
    if (!notice.requiresConfirmation) throw new ConflictException('CONFIRMATION_NOT_REQUIRED');
    const version = notice.versions.find((item) => item.versionNo === notice.currentVersion)!;
    const selected = dto.targetUserIds ? new Set(dto.targetUserIds) : null;
    const targets = notice.recipients
      .filter((recipient) => !selected || selected.has(recipient.userId))
      .filter((recipient) => {
        const current = recipient.confirmations.some((item) => item.noticeVersionId === version.id);
        const prior = recipient.confirmations.some((item) => item.noticeVersionId !== version.id);
        return !current && (version.reconfirmRequired || !prior);
      })
      .map((recipient) => ({ targetType: 'NOTICE_RECIPIENT' as const, targetId: recipient.id, recipientId: recipient.userId }));
    return this.createReminders(user, noticeId, targets, dto);
  }

  async remindTask(user: AuthUser, taskId: string, dto: ReminderRequestDto) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, departmentId: user.departmentId, status: 'PUBLISHED' },
      include: { records: { where: { excludedAt: null, status: { in: ['PENDING', 'RETURNED'] } } } },
    });
    if (!task) throw new NotFoundException('RESOURCE_NOT_FOUND');
    const selected = dto.targetUserIds ? new Set(dto.targetUserIds) : null;
    const targets = task.records
      .filter((record) => !selected || selected.has(record.assigneeId))
      .map((record) => ({ targetType: 'TASK_RECORD' as const, targetId: record.id, recipientId: record.assigneeId }));
    return this.createReminders(user, taskId, targets, dto);
  }

  async listMine(user: AuthUser) {
    return this.prisma.reminder.findMany({
      where: { recipientId: user.id, status: { in: ['PLANNED', 'SENT', 'FAILED_RETRYABLE', 'FAILED_FINAL'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, targetType: true, noticeRecipientId: true, taskRecordId: true,
        channel: true, status: true, scheduledAt: true, sentAt: true, createdAt: true,
      },
    });
  }

  async personalDashboard(user: AuthUser) {
    const [noticeRecipients, taskRecords] = await Promise.all([
      this.prisma.noticeRecipient.findMany({
        where: { userId: user.id, excludedAt: null, notice: { status: 'PUBLISHED' } },
        include: { notice: { include: { versions: { orderBy: { versionNo: 'desc' } } } }, views: true, confirmations: true },
      }),
      this.prisma.taskRecord.findMany({
        where: { assigneeId: user.id, excludedAt: null, task: { status: 'PUBLISHED' }, status: { in: ['PENDING', 'RETURNED'] } },
        include: { task: true },
      }),
    ]);
    const notices = noticeRecipients.flatMap((recipient) => {
      if (!recipient.notice.requiresConfirmation) return [];
      const version = recipient.notice.versions.find((item) => item.versionNo === recipient.notice.currentVersion)!;
      const currentConfirmed = recipient.confirmations.some((item) => item.noticeVersionId === version.id);
      const priorConfirmed = recipient.confirmations.some((item) => item.noticeVersionId !== version.id);
      if (currentConfirmed || (!version.reconfirmRequired && priorConfirmed)) return [];
      const viewed = recipient.views.some((item) => item.noticeVersionId === version.id);
      const overdue = Boolean(version.deadline && version.deadline < new Date());
      return [{
        id: recipient.notice.id, title: version.title, level: version.level, deadlineAt: version.deadline,
        status: overdue ? (viewed ? 'OVERDUE_UNCONFIRMED' : 'OVERDUE_UNSEEN') : (viewed ? 'VIEWED' : 'UNSEEN'),
      }];
    });
    const tasks = taskRecords.map((record) => ({
      id: record.task.id, title: record.task.title, level: record.task.level, deadlineAt: record.task.deadline,
      status: record.task.deadline < new Date() ? (record.status === 'RETURNED' ? 'OVERDUE_RETURNED' : 'OVERDUE_PENDING') : record.status,
    }));
    return {
      counts: {
        pendingNotices: notices.length,
        pendingTasks: tasks.length,
        overdue: notices.filter((item) => item.status.startsWith('OVERDUE')).length + tasks.filter((item) => item.status.startsWith('OVERDUE')).length,
      },
      notices: notices.slice(0, 10),
      tasks: tasks.slice(0, 10),
    };
  }
}
