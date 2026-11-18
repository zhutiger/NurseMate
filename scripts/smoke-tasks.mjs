import { randomUUID } from 'node:crypto';

const baseUrl = process.env.BASE_URL;
const headEmployeeNo = process.env.SEED_HEAD_EMPLOYEE_NO ?? 'admin';
const headPassword = process.env.SEED_HEAD_PASSWORD;
const nursePassword = process.env.SEED_NURSE_PASSWORD;
if (!baseUrl || !headPassword || !nursePassword) {
  throw new Error('BASE_URL, SEED_HEAD_PASSWORD and SEED_NURSE_PASSWORD are required');
}

async function request(path, options = {}, expected = [200, 201, 204]) {
  const result = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      ...options.headers,
    },
  });
  const body = result.status === 204 ? null : await result.json().catch(() => ({}));
  if (!expected.includes(result.status)) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${result.status} ${JSON.stringify(body)}`);
  }
  return { status: result.status, data: body?.data, body };
}

const login = async (employeeNo, password) =>
  (await request('/auth/login', {
    method: 'POST', body: JSON.stringify({ employeeNo, password, clientPlatform: 'H5', deviceName: 'tasks-smoke' }),
  })).data;

const head = await login(headEmployeeNo, headPassword);
const nurse = await login('smoke-nurse', nursePassword);
const headHeaders = { authorization: `Bearer ${head.accessToken}` };
const nurseHeaders = { authorization: `Bearer ${nurse.accessToken}` };

const preview = (await request('/tasks/assignee-preview', {
  method: 'POST', headers: headHeaders, body: JSON.stringify({ mode: 'ALL_ACTIVE' }),
})).data;
if (preview.assigneeCount < 2) throw new Error('ALL_ACTIVE assignee preview omitted active users');

const baseTask = {
  title: `任务全流程 ${new Date().toISOString()}`,
  content: '自动化验证任务闭环。',
  level: 'IMPORTANT',
  completionMode: 'REVIEW',
  feedbackRequired: true,
  attachmentRequired: false,
  deadlineAt: new Date(Date.now() + 2 * 86400000).toISOString(),
  assigneeSelection: { mode: 'USERS', userIds: [nurse.user.id] },
};

const simple = (await request('/tasks', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ ...baseTask, title: `简单任务 ${Date.now()}`, completionMode: 'SIMPLE', feedbackRequired: false }),
})).data;
await request(`/tasks/${simple.id}/publish`, { method: 'POST', headers: headHeaders });
const completed = (await request(`/me/tasks/${simple.id}/complete`, { method: 'POST', headers: nurseHeaders })).data;
const repeatedComplete = (await request(`/me/tasks/${simple.id}/complete`, { method: 'POST', headers: nurseHeaders })).data;
if (completed.completedAt !== repeatedComplete.completedAt) throw new Error('Repeated simple completion changed server time');

const reviewTask = (await request('/tasks', {
  method: 'POST', headers: headHeaders, body: JSON.stringify(baseTask),
})).data;
await request(`/tasks/${reviewTask.id}`, {
  method: 'PATCH', headers: headHeaders,
  body: JSON.stringify({ ...baseTask, content: '发布前修订的审核任务正文。' }),
});
await request(`/tasks/${reviewTask.id}/publish`, { method: 'POST', headers: headHeaders });
let mine = (await request(`/me/tasks/${reviewTask.id}`, { headers: nurseHeaders })).data;
const firstSubmission = (await request(`/me/tasks/${reviewTask.id}/submissions`, {
  method: 'POST', headers: nurseHeaders, body: JSON.stringify({ feedback: '第一次反馈' }),
})).data;
await request(`/tasks/${reviewTask.id}/records/${mine.recordId}/review`, {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ submissionId: firstSubmission.id, action: 'RETURN', comment: '请补充执行结果' }),
});
mine = (await request(`/me/tasks/${reviewTask.id}`, { headers: nurseHeaders })).data;
if (mine.recordStatus !== 'RETURNED' || mine.submissions.length !== 1) throw new Error('Return did not preserve first submission');

const secondSubmission = (await request(`/me/tasks/${reviewTask.id}/submissions`, {
  method: 'POST', headers: nurseHeaders, body: JSON.stringify({ feedback: '第二次补充反馈' }),
})).data;
const reviewPath = `/tasks/${reviewTask.id}/records/${mine.recordId}/review`;
const concurrentResults = await Promise.all([
  request(reviewPath, {
    method: 'POST', headers: headHeaders,
    body: JSON.stringify({ submissionId: secondSubmission.id, action: 'APPROVE', comment: '并发审核一' }),
  }, [200, 409]),
  request(reviewPath, {
    method: 'POST', headers: headHeaders,
    body: JSON.stringify({ submissionId: secondSubmission.id, action: 'APPROVE', comment: '并发审核二' }),
  }, [200, 409]),
]);
if (concurrentResults.filter((result) => result.status === 200).length !== 1
  || concurrentResults.filter((result) => result.status === 409).length !== 1) {
  throw new Error(`Concurrent review was not serialized: ${concurrentResults.map((result) => result.status).join(',')}`);
}
mine = (await request(`/me/tasks/${reviewTask.id}`, { headers: nurseHeaders })).data;
if (mine.recordStatus !== 'APPROVED' || mine.submissions.length !== 2) throw new Error('Resubmission approval history is invalid');

const addResult = (await request(`/tasks/${reviewTask.id}/records`, {
  method: 'POST', headers: headHeaders, body: JSON.stringify({ mode: 'USERS', userIds: [head.user.id] }),
})).data;
if (addResult.addedCount !== 1) throw new Error('Task assignee was not added');
let records = (await request(`/tasks/${reviewTask.id}/records`, { headers: headHeaders })).data;
const headRecord = records.items.find((item) => item.assignee.id === head.user.id);
if (!headRecord) throw new Error('Added task assignee missing from records');
await request(`/tasks/${reviewTask.id}/records/${headRecord.id}/exclude`, {
  method: 'POST', headers: headHeaders, body: JSON.stringify({ reason: '自动化验证误选负责人排除' }),
});
records = (await request(`/tasks/${reviewTask.id}/records`, { headers: headHeaders })).data;
if (records.summary.total !== 1 || records.items[0]?.recordStatus !== 'APPROVED') {
  throw new Error('Excluded assignee still affects effective task statistics');
}
await request(`/tasks/${reviewTask.id}/close`, {
  method: 'POST', headers: headHeaders, body: JSON.stringify({ reason: '自动化任务闭环结束' }),
});

const cancelDraft = (await request('/tasks', {
  method: 'POST', headers: headHeaders, body: JSON.stringify({ ...baseTask, title: `待取消任务 ${Date.now()}` }),
})).data;
await request(`/tasks/${cancelDraft.id}`, { method: 'DELETE', headers: headHeaders }, [204]);

const idempotencyKey = randomUUID();
const idempotentBody = JSON.stringify({ ...baseTask, title: `幂等任务 ${Date.now()}` });
const idempotentFirst = (await request('/tasks', {
  method: 'POST', headers: { ...headHeaders, 'idempotency-key': idempotencyKey }, body: idempotentBody,
})).data;
const idempotentReplay = (await request('/tasks', {
  method: 'POST', headers: { ...headHeaders, 'idempotency-key': idempotencyKey }, body: idempotentBody,
})).data;
if (idempotentFirst.id !== idempotentReplay.id) throw new Error('Idempotent replay created a second task');
await request('/tasks', {
  method: 'POST', headers: { ...headHeaders, 'idempotency-key': idempotencyKey },
  body: JSON.stringify({ ...baseTask, title: `错误复用幂等键 ${Date.now()}` }),
}, [409]);

const overdue = (await request('/tasks', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ ...baseTask, title: `任务逾期派生 ${Date.now()}`, deadlineAt: new Date(Date.now() + 2000).toISOString() }),
})).data;
await request(`/tasks/${overdue.id}/publish`, { method: 'POST', headers: headHeaders });
await new Promise((resolve) => setTimeout(resolve, 2500));
const overdueRecords = (await request(`/tasks/${overdue.id}/records`, { headers: headHeaders })).data;
if (overdueRecords.items[0]?.derivedStatus !== 'OVERDUE_PENDING') throw new Error('Task overdue status was not derived');

console.log(JSON.stringify({
  smoke: 'tasks-ok',
  assigneePreview: true,
  simpleCompletionIdempotent: true,
  returnAndResubmitHistory: true,
  concurrentReviewSerialized: true,
  assigneeAddExclude: true,
  overdueDerived: true,
  draftUpdateAndCancel: true,
  idempotencyReplay: true,
  close: true,
}));
