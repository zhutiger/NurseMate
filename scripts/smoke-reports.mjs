import { randomUUID } from 'node:crypto';

const baseUrl = process.env.BASE_URL;
const headEmployeeNo = process.env.SEED_HEAD_EMPLOYEE_NO ?? 'admin';
const headPassword = process.env.SEED_HEAD_PASSWORD;
if (!baseUrl || !headPassword) throw new Error('BASE_URL and SEED_HEAD_PASSWORD are required');

async function request(path, options = {}, expected = [200, 201, 202, 204]) {
  const result = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID(), ...options.headers },
  });
  const body = result.status === 204 ? null : await result.json().catch(() => ({}));
  if (!expected.includes(result.status)) throw new Error(`${options.method ?? 'GET'} ${path} -> ${result.status} ${JSON.stringify(body)}`);
  return { status: result.status, data: body?.data, body };
}

const head = (await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ employeeNo: headEmployeeNo, password: headPassword, clientPlatform: 'H5', deviceName: 'reports-smoke' }),
})).data;
const headers = { authorization: `Bearer ${head.accessToken}` };

const dashboard = (await request('/dashboard/management', { headers })).data;
for (const key of ['pendingNotices', 'pendingTasks', 'pendingReviews', 'overdue']) {
  if (!Number.isInteger(dashboard.counts[key]) || dashboard.counts[key] < 0) throw new Error(`Invalid dashboard count: ${key}`);
}

const noticeExport = (await request('/exports', {
  method: 'POST', headers, body: JSON.stringify({ type: 'NOTICE_RECIPIENTS', filters: {} }),
})).data;
if (noticeExport.status !== 'SUCCEEDED' || !noticeExport.downloadUrl) throw new Error('Notice export did not complete');
const taskExport = (await request('/exports', {
  method: 'POST', headers, body: JSON.stringify({ type: 'TASK_RECORDS', filters: {} }),
})).data;
if (taskExport.status !== 'SUCCEEDED' || !taskExport.downloadUrl) throw new Error('Task export did not complete');

for (const [exportJob, expectedHeader] of [[noticeExport, '通知ID'], [taskExport, '任务ID']]) {
  const status = (await request(`/exports/${exportJob.id}`, { headers })).data;
  if (status.status !== 'SUCCEEDED' || status.downloadUrl !== exportJob.downloadUrl) throw new Error('Export status is inconsistent');
  const downloadPath = exportJob.downloadUrl.replace('/api/v1', '');
  const downloaded = await fetch(`${baseUrl}${downloadPath}`, { headers });
  const text = await downloaded.text();
  if (!downloaded.ok || !text.includes(expectedHeader)) throw new Error(`CSV download failed: ${downloaded.status}`);
}

const audit = (await request('/audit-logs?action=report.export', { headers })).data;
if (audit.page.total < 2 || audit.items.some((item) => item.action !== 'report.export')) {
  throw new Error('Export audit records are incomplete');
}

console.log(JSON.stringify({
  smoke: 'reports-ok',
  managementDashboard: true,
  noticeCsv: true,
  taskCsv: true,
  authorizedDownload: true,
  auditQuery: true,
}));
