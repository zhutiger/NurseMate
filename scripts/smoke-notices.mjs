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
    method: 'POST',
    body: JSON.stringify({ employeeNo, password, clientPlatform: 'H5', deviceName: 'notices-smoke' }),
  })).data;

const head = await login(headEmployeeNo, headPassword);
const nurse = await login('smoke-nurse', nursePassword);
const headHeaders = { authorization: `Bearer ${head.accessToken}` };
const nurseHeaders = { authorization: `Bearer ${nurse.accessToken}` };
const deadlineAt = new Date(Date.now() + 2 * 86400000).toISOString();

const preview = (await request('/notices/recipient-preview', {
  method: 'POST', headers: headHeaders, body: JSON.stringify({ mode: 'ALL_ACTIVE' }),
})).data;
if (preview.recipientCount < 2) throw new Error('ALL_ACTIVE preview omitted active users');

const draftBody = {
  title: `通知全流程 ${new Date().toISOString()}`,
  content: '第一版通知正文。',
  level: 'IMPORTANT',
  requiresConfirmation: true,
  deadlineAt,
  recipientSelection: { mode: 'USERS', userIds: [nurse.user.id] },
};
const draft = (await request('/notices', {
  method: 'POST', headers: headHeaders, body: JSON.stringify(draftBody),
})).data;
await request(`/notices/${draft.id}`, {
  method: 'PATCH', headers: headHeaders,
  body: JSON.stringify({ ...draftBody, content: '发布前修订的第一版通知正文。' }),
});
await request(`/notices/${draft.id}/publish`, { method: 'POST', headers: headHeaders });

await request(`/me/notices/${draft.id}/confirm`, {
  method: 'POST', headers: nurseHeaders, body: JSON.stringify({ versionNo: 1 }),
}, [409]);
const beforeView = (await request('/me/notices?status=UNSEEN', { headers: nurseHeaders })).data;
if (!beforeView.items.some((item) => item.id === draft.id)) throw new Error('Published notice missing from UNSEEN list');

const viewedV1 = (await request(`/me/notices/${draft.id}`, { headers: nurseHeaders })).data;
const confirmedV1 = (await request(`/me/notices/${draft.id}/confirm`, {
  method: 'POST', headers: nurseHeaders, body: JSON.stringify({ versionNo: viewedV1.currentVersionNo }),
})).data;
const duplicateConfirmation = (await request(`/me/notices/${draft.id}/confirm`, {
  method: 'POST', headers: nurseHeaders, body: JSON.stringify({ versionNo: viewedV1.currentVersionNo }),
})).data;
if (confirmedV1.confirmedAt !== duplicateConfirmation.confirmedAt) throw new Error('Repeated confirmation changed server time');

const recipientsV1 = (await request(`/notices/${draft.id}/recipients`, { headers: headHeaders })).data;
if (recipientsV1.items[0]?.recipientStatus !== 'CONFIRMED') throw new Error('Management recipient status is not CONFIRMED');

const version2 = (await request(`/notices/${draft.id}`, {
  method: 'PATCH', headers: headHeaders,
  body: JSON.stringify({
    ...draftBody,
    title: `${draftBody.title}（修订）`,
    content: '第二版重要内容，要求重新确认。',
    changeReason: '自动化验证通知版本留痕',
    requireReconfirm: true,
  }),
})).data;
if (version2.currentVersion !== 2) throw new Error('Notice version did not advance');
const reconfirmList = (await request('/me/notices?status=RECONFIRM_REQUIRED', { headers: nurseHeaders })).data;
if (!reconfirmList.items.some((item) => item.id === draft.id)) throw new Error('Reconfirm-required notice not derived correctly');
const viewedV2 = (await request(`/me/notices/${draft.id}`, { headers: nurseHeaders })).data;
await request(`/me/notices/${draft.id}/confirm`, {
  method: 'POST', headers: nurseHeaders, body: JSON.stringify({ versionNo: viewedV2.currentVersionNo }),
});

const added = (await request(`/notices/${draft.id}/recipients`, {
  method: 'POST', headers: headHeaders, body: JSON.stringify({ mode: 'USERS', userIds: [head.user.id] }),
})).data;
if (added.addedCount !== 1) throw new Error('Recipient was not added');
await request(`/notices/${draft.id}/recipients/${head.user.id}/exclude`, {
  method: 'POST', headers: headHeaders, body: JSON.stringify({ reason: '自动化验证误选排除' }),
});
const afterExclude = (await request(`/notices/${draft.id}/recipients`, { headers: headHeaders })).data;
if (afterExclude.summary.total !== 1) throw new Error('Excluded recipient still affects effective statistics');
await request(`/notices/${draft.id}/close`, {
  method: 'POST', headers: headHeaders, body: JSON.stringify({ reason: '自动化全流程结束' }),
});

const cancelDraft = (await request('/notices', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ ...draftBody, title: `待取消草稿 ${Date.now()}` }),
})).data;
await request(`/notices/${cancelDraft.id}`, { method: 'DELETE', headers: headHeaders }, [204]);

const overdueDraft = (await request('/notices', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({
    ...draftBody,
    title: `逾期派生状态 ${Date.now()}`,
    deadlineAt: new Date(Date.now() + 2000).toISOString(),
  }),
})).data;
await request(`/notices/${overdueDraft.id}/publish`, { method: 'POST', headers: headHeaders });
await new Promise((resolve) => setTimeout(resolve, 2500));
const overdueRecipients = (await request(`/notices/${overdueDraft.id}/recipients`, { headers: headHeaders })).data;
if (overdueRecipients.items[0]?.recipientStatus !== 'OVERDUE_UNSEEN') throw new Error('Overdue unseen status was not derived');

console.log(JSON.stringify({
  smoke: 'notices-ok',
  recipientPreview: true,
  draftUpdateAndCancel: true,
  publishAndConfirm: true,
  duplicateConfirmStable: true,
  versionAndReconfirm: true,
  recipientAddExclude: true,
  overdueDerived: true,
  close: true,
}));
