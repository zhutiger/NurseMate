import { createHash, randomUUID } from 'node:crypto';

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
  if (!expected.includes(result.status)) throw new Error(`${options.method ?? 'GET'} ${path} -> ${result.status} ${JSON.stringify(body)}`);
  return { status: result.status, data: body?.data, body };
}

const login = async (employeeNo, password) => (await request('/auth/login', {
  method: 'POST', body: JSON.stringify({ employeeNo, password, clientPlatform: 'H5', deviceName: 'files-smoke' }),
})).data;

async function upload(ownerHeaders, fileName, purpose, content) {
  const sha256 = createHash('sha256').update(content).digest('hex');
  const intent = (await request('/files/upload-intents', {
    method: 'POST', headers: ownerHeaders,
    body: JSON.stringify({
      fileName, mimeType: 'application/pdf', sizeBytes: content.length, sha256, purpose, contentPolicyAccepted: true,
    }),
  })).data;
  const uploadPath = intent.uploadUrl.replace('/api/v1', '');
  const uploaded = await fetch(`${baseUrl}${uploadPath}`, {
    method: 'PUT',
    headers: { ...ownerHeaders, 'content-type': 'application/octet-stream' },
    body: content,
  });
  const uploadBody = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok) throw new Error(`Binary upload failed: ${uploaded.status} ${JSON.stringify(uploadBody)}`);
  return (await request(`/files/${intent.id}/complete`, { method: 'POST', headers: ownerHeaders })).data;
}

const head = await login('smoke-head', headPassword);
const nurse = await login('smoke-nurse', nursePassword);
const headHeaders = { authorization: `Bearer ${head.accessToken}` };
const nurseHeaders = { authorization: `Bearer ${nurse.accessToken}` };
const deadlineAt = new Date(Date.now() + 86400000).toISOString();

await request('/files/upload-intents', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({
    fileName: '患者病历.pdf', mimeType: 'application/pdf', sizeBytes: 10,
    sha256: '0'.repeat(64), purpose: 'NOTICE_ATTACHMENT', contentPolicyAccepted: true,
  }),
}, [409]);

const noticeFile = await upload(headHeaders, `notice-${Date.now()}.pdf`, 'NOTICE_ATTACHMENT', Buffer.from('%PDF-1.4\nNurseMate notice attachment\n%%EOF'));
const notice = (await request('/notices', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({
    title: `附件通知 ${Date.now()}`, content: '验证通知附件授权。', level: 'IMPORTANT', requiresConfirmation: true,
    deadlineAt, recipientSelection: { mode: 'USERS', userIds: [nurse.user.id] }, attachmentFileIds: [noticeFile.id],
  }),
})).data;
await request(`/notices/${notice.id}/publish`, { method: 'POST', headers: headHeaders });
const noticeDetail = (await request(`/me/notices/${notice.id}`, { headers: nurseHeaders })).data;
if (noticeDetail.attachments[0]?.id !== noticeFile.id) throw new Error('Notice attachment reference missing');
const noticeDownload = await fetch(`${baseUrl}/files/${noticeFile.id}/download`, { headers: nurseHeaders });
if (!noticeDownload.ok || !(await noticeDownload.text()).includes('NurseMate notice attachment')) throw new Error('Nurse cannot download received notice attachment');

const submissionFile = await upload(nurseHeaders, `submission-${Date.now()}.pdf`, 'TASK_SUBMISSION', Buffer.from('%PDF-1.4\nNurseMate task evidence\n%%EOF'));
const task = (await request('/tasks', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({
    title: `附件任务 ${Date.now()}`, content: '验证反馈附件和授权。', level: 'IMPORTANT', completionMode: 'REVIEW',
    feedbackRequired: true, attachmentRequired: true, deadlineAt,
    assigneeSelection: { mode: 'USERS', userIds: [nurse.user.id] },
  }),
})).data;
await request(`/tasks/${task.id}/publish`, { method: 'POST', headers: headHeaders });
const myTask = (await request(`/me/tasks/${task.id}`, { headers: nurseHeaders })).data;
const submission = (await request(`/me/tasks/${task.id}/submissions`, {
  method: 'POST', headers: nurseHeaders,
  body: JSON.stringify({ feedback: '已上传完成凭证', attachmentFileIds: [submissionFile.id] }),
})).data;
await request(`/tasks/${task.id}/records/${myTask.recordId}/review`, {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ submissionId: submission.id, action: 'APPROVE', comment: '附件有效' }),
});
const taskDetail = (await request(`/me/tasks/${task.id}`, { headers: nurseHeaders })).data;
if (taskDetail.submissions[0]?.attachments[0]?.id !== submissionFile.id) throw new Error('Submission attachment history missing');
const evidenceDownload = await fetch(`${baseUrl}/files/${submissionFile.id}/download`, { headers: headHeaders });
if (!evidenceDownload.ok || !(await evidenceDownload.text()).includes('NurseMate task evidence')) throw new Error('Reviewer cannot download task evidence');

console.log(JSON.stringify({
  smoke: 'files-ok',
  sensitiveFilenameBlocked: true,
  digestAndSizeVerified: true,
  noticeAttachmentAuthorized: true,
  submissionAttachmentAuthorized: true,
  attachmentHistoryPreserved: true,
}));
