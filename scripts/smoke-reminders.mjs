import { randomUUID } from 'node:crypto';

const baseUrl = process.env.BASE_URL;
const headPassword = process.env.SEED_HEAD_PASSWORD;
const nursePassword = process.env.SEED_NURSE_PASSWORD;
if (!baseUrl || !headPassword || !nursePassword) throw new Error('Smoke environment is incomplete');

async function request(path, options = {}, expected = [200, 201, 202, 204]) {
  const result = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID(), ...options.headers },
  });
  const body = result.status === 204 ? null : await result.json().catch(() => ({}));
  if (!expected.includes(result.status)) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${result.status} ${JSON.stringify(body)}`);
  }
  return { status: result.status, data: body?.data, body };
}

const login = async (employeeNo, password) => (await request('/auth/login', {
  method: 'POST', body: JSON.stringify({ employeeNo, password, clientPlatform: 'H5', deviceName: 'reminders-smoke' }),
})).data;

const head = await login('smoke-head', headPassword);
const nurse = await login('smoke-nurse', nursePassword);
const headHeaders = { authorization: `Bearer ${head.accessToken}` };
const nurseHeaders = { authorization: `Bearer ${nurse.accessToken}` };
const deadlineAt = new Date(Date.now() + 86400000).toISOString();

const notice = (await request('/notices', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({
    title: `催办通知 ${Date.now()}`, content: '验证催办不改变确认状态。', level: 'IMPORTANT',
    requiresConfirmation: true, deadlineAt,
    recipientSelection: { mode: 'USERS', userIds: [nurse.user.id] },
  }),
})).data;
await request(`/notices/${notice.id}/publish`, { method: 'POST', headers: headHeaders });
const noticeRecipients = (await request(`/notices/${notice.id}/recipients`, { headers: headHeaders })).data;
const noticeRecipientId = noticeRecipients.items[0].recipientId;
const noticeReminder = (await request(`/notices/${notice.id}/reminders`, {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ targetUserIds: [nurse.user.id], channels: ['IN_APP'], note: '自动化通知催办' }),
})).data;
if (noticeReminder.reminderCount !== 1) throw new Error('Notice reminder count is invalid');
await request(`/notices/${notice.id}/reminders`, {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ targetUserIds: [nurse.user.id], channels: ['IN_APP'], note: '重复催办应限流' }),
}, [429]);

const myReminders = (await request('/me/reminders', { headers: nurseHeaders })).data;
if (!myReminders.some((item) => item.noticeRecipientId === noticeRecipientId && item.status === 'SENT')) {
  throw new Error('In-app reminder is missing for recipient');
}
const unchangedNotice = (await request(`/notices/${notice.id}/recipients`, { headers: headHeaders })).data;
if (unchangedNotice.items[0].recipientStatus !== 'UNSEEN') throw new Error('Reminder incorrectly changed notice status');

const task = (await request('/tasks', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({
    title: `催办任务 ${Date.now()}`, content: '验证任务人工催办。', level: 'IMPORTANT',
    completionMode: 'SIMPLE', feedbackRequired: false, attachmentRequired: false, deadlineAt,
    assigneeSelection: { mode: 'USERS', userIds: [nurse.user.id] },
  }),
})).data;
await request(`/tasks/${task.id}/publish`, { method: 'POST', headers: headHeaders });
const taskReminder = (await request(`/tasks/${task.id}/reminders`, {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ channels: ['MANUAL'], note: '自动化任务人工催办' }),
})).data;
if (taskReminder.reminderCount !== 1) throw new Error('Task reminder count is invalid');
const taskRecords = (await request(`/tasks/${task.id}/records`, { headers: headHeaders })).data;
if (taskRecords.items[0].recordStatus !== 'PENDING') throw new Error('Reminder incorrectly changed task state');

const dashboard = (await request('/me/dashboard', { headers: nurseHeaders })).data;
if (dashboard.counts.pendingNotices < 1 || dashboard.counts.pendingTasks < 1) throw new Error('Personal dashboard omitted pending work');

console.log(JSON.stringify({
  smoke: 'reminders-ok',
  personalDashboard: true,
  noticeReminder: true,
  taskReminder: true,
  rateLimit: true,
  businessStateIndependent: true,
}));
