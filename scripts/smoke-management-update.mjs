import { createHash, randomUUID } from 'node:crypto';

const base = process.env.BASE_URL;
const headNo = process.env.SEED_HEAD_EMPLOYEE_NO ?? 'admin';
const headPassword = process.env.SEED_HEAD_PASSWORD;
const nursePassword = process.env.SEED_NURSE_PASSWORD;
if (!base || !headPassword || !nursePassword) throw new Error('缺少云端冒烟测试环境变量');

async function request(path, method = 'GET', data, token, expected = [200, 201, 204]) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!expected.includes(response.status)) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body?.data;
}

const login = (employeeNo, password) => request('/auth/login', 'POST', { employeeNo, password, clientPlatform: 'H5', deviceName: 'management-update-smoke' });
const head = await login(headNo, headPassword);
const nurse = await login('smoke-nurse', nursePassword);
const suffix = Date.now().toString(36);

const group = await request('/groups', 'POST', { code: `U${suffix.slice(-8)}`, name: '回归分组' }, head.accessToken);
const updatedGroup = await request(`/groups/${group.id}`, 'PATCH', { code: group.code, name: '回归分组已修改', enabled: true }, head.accessToken);
if (updatedGroup.name !== '回归分组已修改') throw new Error('分组编辑未生效');

const account = await request('/users', 'POST', { employeeNo: `m-${suffix}`, name: '回归护士', role: 'NURSE', primaryGroupId: group.id }, head.accessToken);
const changedNo = `m2-${suffix}`;
const edited = await request(`/users/${account.id}`, 'PATCH', { employeeNo: changedNo, name: '回归护士已修改', reason: '验证人员编辑' }, head.accessToken);
if (edited.employeeNo !== changedNo || edited.name !== '回归护士已修改') throw new Error('工号或姓名编辑未生效');
const disabled = await request(`/users/${account.id}`, 'PATCH', { status: 'DISABLED', reason: '云端测试停用原因' }, head.accessToken);
if (!disabled.disabledAt || disabled.disabledReason !== '云端测试停用原因') throw new Error('停用记录不完整');
const disabledList = await request('/users?pageSize=100&status=DISABLED', 'GET', undefined, head.accessToken);
if (!disabledList.items.some((item) => item.id === account.id)) throw new Error('账号状态筛选未返回停用人员');
const reenabled = await request(`/users/${account.id}`, 'PATCH', { status: 'PENDING_ACTIVATION', reason: '云端测试重新启用' }, head.accessToken);
if (reenabled.status !== 'PENDING_ACTIVATION' || reenabled.disabledReason !== '云端测试停用原因') throw new Error('重新启用或历史停用信息异常');
const activation = await request(`/users/${account.id}/activation-codes`, 'POST', { purpose: 'ACTIVATE_ACCOUNT', reason: '重新启用测试' }, head.accessToken);
const activated = await request('/auth/activate', 'POST', { employeeNo: changedNo, activationCode: activation.activationCode, password: `Cloud${suffix}9!`, clientPlatform: 'H5', deviceName: 'reactivation-smoke' });
if (activated.user.id !== account.id) throw new Error('重新启用激活身份不一致');

const coordinator = await request('/users', 'POST', { employeeNo: `c-${suffix}`, name: '回归协管员', role: 'COORDINATOR' }, head.accessToken);
await request(`/users/${coordinator.id}/permissions`, 'PUT', { permissions: ['notice.publish', 'task.review'] }, head.accessToken);
const permissions = await request(`/users/${coordinator.id}/permissions`, 'GET', undefined, head.accessToken);
if (permissions.permissions.join(',') !== 'notice.publish,task.review') throw new Error('权限读取或保存异常');

const content = Buffer.from('NurseMate Word attachment smoke');
const fileName = `task-${suffix}.docx`;
const intent = await request('/files/upload-intents', 'POST', {
  fileName, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  sizeBytes: content.length, sha256: createHash('sha256').update(content).digest('hex'),
  purpose: 'TASK_ATTACHMENT', contentPolicyAccepted: true,
}, head.accessToken);
const upload = await fetch(`${base}/files/${intent.id}/content`, { method: 'PUT', headers: { authorization: `Bearer ${head.accessToken}`, 'content-type': 'application/octet-stream' }, body: content });
if (!upload.ok) throw new Error(`Word 附件上传失败：${upload.status}`);
await request(`/files/${intent.id}/complete`, 'POST', {}, head.accessToken);

const deadline = new Date(Date.now() + 4 * 3600000); deadline.setUTCSeconds(0, 0);
const task = await request('/tasks', 'POST', {
  title: `附件与精确时间回归 ${suffix}`, content: '验证发布任务附件和分钟精度。', level: 'IMPORTANT',
  completionMode: 'REVIEW', feedbackRequired: true, attachmentRequired: false,
  deadlineAt: deadline.toISOString(), assigneeSelection: { mode: 'USERS', userIds: [nurse.user.id] },
  attachmentFileIds: [intent.id],
}, head.accessToken);
await request(`/tasks/${task.id}/publish`, 'POST', {}, head.accessToken);
const taskDetail = await request(`/tasks/${task.id}`, 'GET', undefined, head.accessToken);
if (new Date(taskDetail.deadline).toISOString() !== deadline.toISOString() || taskDetail.attachments?.[0]?.file?.id !== intent.id) throw new Error('任务附件或分钟精度未保存');
const nurseDetail = await request(`/me/tasks/${task.id}`, 'GET', undefined, nurse.accessToken);
if (nurseDetail.attachments?.[0]?.id !== intent.id) throw new Error('护士端未收到任务附件');
const download = await fetch(`${base}/files/${intent.id}/download`, { headers: { authorization: `Bearer ${nurse.accessToken}` } });
if (!download.ok || !(await download.arrayBuffer()).byteLength) throw new Error('护士无法下载任务附件');
await request(`/files/${intent.id}/download`, 'GET', undefined, activated.accessToken, [403]);

const notice = await request('/notices', 'POST', {
  title: `级别筛选回归 ${suffix}`, content: '验证全部状态下的通知级别筛选。', level: 'URGENT',
  requiresConfirmation: true, deadlineAt: deadline.toISOString(), recipientSelection: { mode: 'USERS', userIds: [nurse.user.id] },
}, head.accessToken);
const urgent = await request('/notices?pageSize=100&status=DRAFT&level=URGENT', 'GET', undefined, head.accessToken);
const normal = await request('/notices?pageSize=100&status=DRAFT&level=NORMAL', 'GET', undefined, head.accessToken);
if (!urgent.items.some((item) => item.id === notice.id) || normal.items.some((item) => item.id === notice.id)) throw new Error('通知级别或状态筛选异常');

const audit = await request('/audit-logs?pageSize=100', 'GET', undefined, head.accessToken);
for (const action of ['user.update', 'user.permissions_replace', 'task.publish']) {
  if (!audit.items.some((item) => item.action === action)) throw new Error(`缺少审计记录：${action}`);
}

console.log(JSON.stringify({ smoke: 'management-update-ok', personnel: true, permissions: true, reactivation: true, attachment: true, deadlineMinutes: true, noticeFilters: true, audit: true }));
