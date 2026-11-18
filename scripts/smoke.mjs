import { randomUUID } from 'node:crypto';

const baseUrl = process.env.BASE_URL;
const headPassword = process.env.SEED_HEAD_PASSWORD;
const nursePassword = process.env.SEED_NURSE_PASSWORD;
if (!baseUrl || !headPassword || !nursePassword) {
  throw new Error('BASE_URL, SEED_HEAD_PASSWORD and SEED_NURSE_PASSWORD are required');
}

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status} ${JSON.stringify(body)}`);
  return body.data ?? body;
}

async function login(employeeNo, password) {
  return call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ employeeNo, password, clientPlatform: 'H5', deviceName: 'cloud-smoke' }),
  });
}

const head = await login('smoke-head', headPassword);
const nurse = await login('smoke-nurse', nursePassword);
const headAuth = { authorization: `Bearer ${head.accessToken}` };
const nurseAuth = { authorization: `Bearer ${nurse.accessToken}` };

const notice = await call('/notices', {
  method: 'POST', headers: headAuth,
  body: JSON.stringify({
    title: `冒烟通知 ${new Date().toISOString()}`,
    content: '验证通知发布、查看和主动确认闭环。',
    level: 'IMPORTANT',
    requiresConfirmation: true,
    deadlineAt: new Date(Date.now() + 86400000).toISOString(),
    recipientSelection: { mode: 'USERS', userIds: [nurse.user.id] },
  }),
});
await call(`/notices/${notice.id}/publish`, { method: 'POST', headers: headAuth });
const viewed = await call(`/me/notices/${notice.id}`, { headers: nurseAuth });
const confirmed = await call(`/me/notices/${notice.id}/confirm`, {
  method: 'POST', headers: nurseAuth, body: JSON.stringify({ versionNo: viewed.currentVersionNo }),
});

const task = await call('/tasks', {
  method: 'POST', headers: headAuth,
  body: JSON.stringify({
    title: `冒烟任务 ${new Date().toISOString()}`,
    content: '验证任务提交和审核通过闭环。',
    level: 'IMPORTANT',
    completionMode: 'REVIEW',
    feedbackRequired: true,
    attachmentRequired: false,
    deadlineAt: new Date(Date.now() + 86400000).toISOString(),
    assigneeSelection: { mode: 'USERS', userIds: [nurse.user.id] },
  }),
});
await call(`/tasks/${task.id}/publish`, { method: 'POST', headers: headAuth });
const myTask = await call(`/me/tasks/${task.id}`, { headers: nurseAuth });
const submission = await call(`/me/tasks/${task.id}/submissions`, {
  method: 'POST', headers: nurseAuth, body: JSON.stringify({ feedback: '已完成冒烟测试反馈。' }),
});
await call(`/tasks/${task.id}/records/${myTask.recordId}/review`, {
  method: 'POST', headers: headAuth,
  body: JSON.stringify({ submissionId: submission.id, action: 'APPROVE', comment: '冒烟审核通过' }),
});
const approved = await call(`/me/tasks/${task.id}`, { headers: nurseAuth });
if (approved.recordStatus !== 'APPROVED') throw new Error(`Unexpected task status: ${approved.recordStatus}`);

console.log(JSON.stringify({
  smoke: 'ok',
  login: true,
  notice: { id: notice.id, confirmedAt: confirmed.confirmedAt },
  task: { id: task.id, status: approved.recordStatus },
}));
