import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

type TimedJob = { targetType: 'NOTICE' | 'TASK'; targetId: string; event: 'PRE_DEADLINE' | 'OVERDUE' };
type WechatJob = { reminderId: string };

@Injectable()
export class ReminderSchedulerService implements OnModuleInit, OnModuleDestroy {
  private producer?: IORedis;
  private consumer?: IORedis;
  private queue?: Queue;
  private worker?: Worker;
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return;
    this.producer = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
    this.consumer = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue('hzy-reminders', { connection: this.producer });
    this.worker = new Worker('hzy-reminders', (job) => this.process(job), {
      connection: this.consumer,
      concurrency: 3,
    });
    this.worker.on('failed', (job, error) => {
      console.error(JSON.stringify({ event: 'reminder_job_failed', jobId: job?.id, message: error.message }));
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.consumer?.quit();
    await this.producer?.quit();
  }

  private async process(job: Job<TimedJob | WechatJob>) {
    if (job.name === 'wechat-send') return this.processWechatReminder((job.data as WechatJob).reminderId);
    const data = job.data as TimedJob;
    if (data.targetType === 'NOTICE') return this.processNotice(data.targetId, data.event, String(job.id));
    return this.processTask(data.targetId, data.event, String(job.id));
  }

  private jobOptions(jobId: string, scheduledAt: Date) {
    return {
      jobId,
      delay: Math.max(0, scheduledAt.getTime() - Date.now()),
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1000 },
      removeOnFail: { age: 30 * 24 * 60 * 60, count: 2000 },
    };
  }

  async scheduleNotice(noticeId: string, deadline: Date | null) {
    if (!this.queue || !deadline) return;
    await this.cancel('NOTICE', noticeId);
    const preMinutes = Number(process.env.REMINDER_PRE_MINUTES ?? 120);
    const overdueMinutes = Number(process.env.REMINDER_OVERDUE_DELAY_MINUTES ?? 1);
    const preAt = new Date(Math.max(Date.now() + 1000, deadline.getTime() - preMinutes * 60 * 1000));
    await Promise.all([
      this.queue.add('timed-reminder', { targetType: 'NOTICE', targetId: noticeId, event: 'PRE_DEADLINE' }, this.jobOptions(`notice-${noticeId}-pre-${deadline.getTime()}`, preAt)),
      this.queue.add('timed-reminder', { targetType: 'NOTICE', targetId: noticeId, event: 'OVERDUE' }, this.jobOptions(`notice-${noticeId}-overdue-${deadline.getTime()}`, new Date(deadline.getTime() + overdueMinutes * 60 * 1000))),
    ]);
  }

  async scheduleTask(taskId: string, deadline: Date) {
    if (!this.queue) return;
    await this.cancel('TASK', taskId);
    const preMinutes = Number(process.env.REMINDER_PRE_MINUTES ?? 120);
    const preAt = new Date(Math.max(Date.now() + 1000, deadline.getTime() - preMinutes * 60 * 1000));
    await this.queue.add('timed-reminder', { targetType: 'TASK', targetId: taskId, event: 'PRE_DEADLINE' }, this.jobOptions(`task-${taskId}-pre-${deadline.getTime()}`, preAt));
  }

  async cancel(targetType: 'NOTICE' | 'TASK', targetId: string) {
    if (!this.queue) return;
    const jobs = await this.queue.getJobs(['delayed', 'waiting', 'prioritized']);
    await Promise.all(jobs
      .filter((job) => {
        const data = job.data as TimedJob;
        return data.targetType === targetType && data.targetId === targetId;
      })
      .map((job) => job.remove()));
  }

  async enqueueWechat(reminderIds: string[]) {
    if (!this.queue) return;
    await Promise.all(reminderIds.map((reminderId) => this.queue!.add(
      'wechat-send',
      { reminderId },
      { jobId: `wechat-${reminderId}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000 },
    )));
  }

  private async processNotice(noticeId: string, event: TimedJob['event'], jobId: string) {
    const notice = await this.prisma.notice.findFirst({
      where: { id: noticeId, status: 'PUBLISHED' },
      include: { versions: true, recipients: { where: { excludedAt: null }, include: { confirmations: true, user: { include: { wechatIdentities: { where: { unboundAt: null } } } } } } },
    });
    if (!notice || !notice.requiresConfirmation) return { skipped: true };
    const version = notice.versions.find((item) => item.versionNo === notice.currentVersion)!;
    const pending = notice.recipients.filter((recipient) => {
      const current = recipient.confirmations.some((item) => item.noticeVersionId === version.id);
      const prior = recipient.confirmations.some((item) => item.noticeVersionId !== version.id);
      return !current && (version.reconfirmRequired || !prior);
    });
    let created = 0;
    for (const recipient of pending) {
      created += await this.deliverAutomatic({
        departmentId: notice.departmentId,
        targetType: 'NOTICE_RECIPIENT',
        targetId: recipient.id,
        recipientId: recipient.userId,
        title: version.title,
        deadline: version.deadline,
        page: `/pages/notices/detail?id=${notice.id}`,
        event,
        jobId,
        hasWechat: recipient.user.wechatIdentities.length > 0,
      });
    }
    return { created, pending: pending.length };
  }

  private async processTask(taskId: string, event: TimedJob['event'], jobId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, status: 'PUBLISHED', deletedAt: null, deadline: { gt: new Date() } },
      include: { records: { where: { excludedAt: null, status: { in: ['PENDING', 'RETURNED'] } }, include: { assignee: { include: { wechatIdentities: { where: { unboundAt: null } } } } } } },
    });
    if (!task) return { skipped: true };
    let created = 0;
    for (const record of task.records) {
      created += await this.deliverAutomatic({
        departmentId: task.departmentId,
        targetType: 'TASK_RECORD',
        targetId: record.id,
        recipientId: record.assigneeId,
        title: task.title,
        deadline: task.deadline,
        page: `/pages/tasks/detail?id=${task.id}`,
        event,
        jobId,
        hasWechat: record.assignee.wechatIdentities.length > 0,
      });
    }
    return { created, pending: task.records.length };
  }

  private async deliverAutomatic(input: {
    departmentId: string;
    targetType: 'NOTICE_RECIPIENT' | 'TASK_RECORD';
    targetId: string;
    recipientId: string;
    title: string;
    deadline: Date | null;
    page: string;
    event: TimedJob['event'];
    jobId: string;
    hasWechat: boolean;
  }) {
    const marker = `${input.jobId}-${input.recipientId}`.slice(0, 255);
    const existingInApp = await this.prisma.reminder.findFirst({ where: { externalMessageId: marker, channel: 'IN_APP' } });
    const inApp = existingInApp ?? await this.prisma.reminder.create({
      data: {
        departmentId: input.departmentId,
        targetType: input.targetType,
        noticeRecipientId: input.targetType === 'NOTICE_RECIPIENT' ? input.targetId : null,
        taskRecordId: input.targetType === 'TASK_RECORD' ? input.targetId : null,
        recipientId: input.recipientId,
        channel: 'IN_APP',
        status: 'SENT',
        scheduledAt: new Date(),
        sentAt: new Date(),
        attemptCount: 1,
        externalMessageId: marker,
      },
    });
    if (input.hasWechat) {
      const wechatMarker = `${marker}-wechat`.slice(0, 255);
      const existingWechat = await this.prisma.reminder.findFirst({ where: { externalMessageId: wechatMarker, channel: 'WECHAT_SUBSCRIBE' } });
      const wechat = existingWechat ?? await this.prisma.reminder.create({
        data: {
          departmentId: input.departmentId,
          targetType: input.targetType,
          noticeRecipientId: input.targetType === 'NOTICE_RECIPIENT' ? input.targetId : null,
          taskRecordId: input.targetType === 'TASK_RECORD' ? input.targetId : null,
          recipientId: input.recipientId,
          channel: 'WECHAT_SUBSCRIBE',
          status: 'PLANNED',
          scheduledAt: new Date(),
          externalMessageId: wechatMarker,
        },
      });
      if (['PLANNED', 'FAILED_RETRYABLE'].includes(wechat.status)) {
        await this.sendWechat(wechat.id, input.title, input.deadline, input.page, input.event);
      }
    }
    return existingInApp ? 0 : (inApp ? 1 : 0);
  }

  private async processWechatReminder(reminderId: string) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      include: {
        noticeRecipient: { include: { notice: true } },
        taskRecord: { include: { task: true } },
      },
    });
    if (!reminder || !['PLANNED', 'FAILED_RETRYABLE'].includes(reminder.status)) return;
    const title = reminder.noticeRecipient?.notice.title ?? reminder.taskRecord?.task.title ?? '呼吸通工作提醒';
    const deadline = reminder.noticeRecipient?.notice.deadline ?? reminder.taskRecord?.task.deadline ?? null;
    const page = reminder.noticeRecipient ? `/pages/notices/detail?id=${reminder.noticeRecipient.noticeId}` : `/pages/tasks/detail?id=${reminder.taskRecord?.taskId}`;
    await this.sendWechat(reminder.id, title, deadline, page, 'PRE_DEADLINE');
  }

  private async wechatAccessToken() {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const appId = process.env.WECHAT_APP_ID;
    const secret = process.env.WECHAT_APP_SECRET;
    if (!appId || !secret) throw new Error('WECHAT_CREDENTIALS_NOT_CONFIGURED');
    const query = new URLSearchParams({ grant_type: 'client_credential', appid: appId, secret });
    const result = await fetch(`https://api.weixin.qq.com/cgi-bin/token?${query.toString()}`);
    const body = await result.json() as { access_token?: string; expires_in?: number; errcode?: number };
    if (!result.ok || !body.access_token || body.errcode) throw new Error(`WECHAT_TOKEN_${body.errcode ?? result.status}`);
    this.accessToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 7200) * 1000 };
    return body.access_token;
  }

  private async sendWechat(reminderId: string, title: string, deadline: Date | null, page: string, event: TimedJob['event']) {
    const templateId = process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID;
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { recipient: { include: { wechatIdentities: { where: { unboundAt: null } } } } },
    });
    if (!reminder) return;
    const identity = reminder.recipient.wechatIdentities[0];
    if (!identity || !templateId) {
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: { status: 'FAILED_FINAL', attemptCount: { increment: 1 }, errorCode: !identity ? 'WECHAT_NOT_ASSOCIATED' : 'TEMPLATE_NOT_CONFIGURED' },
      });
      return;
    }
    try {
      const token = await this.wechatAccessToken();
      const result = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          touser: identity.openId,
          template_id: templateId,
          page,
          data: {
            thing1: { value: title.slice(0, 20) },
            time2: { value: deadline ? deadline.toISOString().slice(0, 16).replace('T', ' ') : '请尽快处理' },
            thing3: { value: event === 'OVERDUE' ? '事项已逾期，请及时处理' : '请登录呼吸通查看详情' },
          },
        }),
      });
      const body = await result.json() as { errcode?: number; errmsg?: string; msgid?: string | number };
      const success = result.ok && (body.errcode ?? 0) === 0;
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: success
          ? { status: 'SENT', sentAt: new Date(), attemptCount: { increment: 1 } }
          : { status: 'FAILED_FINAL', attemptCount: { increment: 1 }, errorCode: `WECHAT_${body.errcode ?? result.status}`, errorMessage: body.errmsg?.slice(0, 512) },
      });
    } catch (error) {
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: { status: 'FAILED_RETRYABLE', attemptCount: { increment: 1 }, errorCode: 'WECHAT_DEPENDENCY_ERROR', errorMessage: (error as Error).message.slice(0, 512) },
      });
      throw error;
    }
  }
}
