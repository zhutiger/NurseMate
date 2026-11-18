import { randomBytes, randomUUID } from 'node:crypto';

const baseUrl = process.env.BASE_URL;
const headPassword = process.env.SEED_HEAD_PASSWORD;
if (!baseUrl || !headPassword) throw new Error('BASE_URL and SEED_HEAD_PASSWORD are required');

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
  return { status: result.status, body, data: body?.data };
}

const login = async (employeeNo, password) =>
  (await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ employeeNo, password, clientPlatform: 'H5', deviceName: 'auth-users-smoke' }),
  })).data;

const head = await login('smoke-head', headPassword);
const headHeaders = { authorization: `Bearer ${head.accessToken}` };
const suffix = Date.now().toString(36);
const initialPassword = `Init${randomBytes(9).toString('hex')}7`;
const resetPassword = `Reset${randomBytes(9).toString('hex')}8`;

const group = (await request('/groups', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ code: `S${suffix.slice(-8)}`, name: `冒烟分组-${suffix}`, enabled: true }),
})).data;

const imported = (await request('/users/import', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ rows: [
    { employeeNo: `smoke-i-${suffix}`, name: '批量导入测试护士', role: 'NURSE', primaryGroupId: group.id },
    { employeeNo: 'smoke-head', name: '重复工号', role: 'NURSE' },
  ] }),
})).data;
if (imported.succeeded !== 1 || imported.failed !== 1 || imported.results[1]?.errorCode !== 'EMPLOYEE_NO_CONFLICT') {
  throw new Error('Batch import did not return correct row-level results');
}

const nurse = (await request('/users', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ employeeNo: `smoke-n-${suffix}`, name: '激活测试护士', role: 'NURSE', primaryGroupId: group.id }),
})).data;
const activation = (await request(`/users/${nurse.id}/activation-codes`, {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ purpose: 'ACTIVATE_ACCOUNT', reason: '自动化身份验收' }),
})).data;
const activated = (await request('/auth/activate', {
  method: 'POST',
  body: JSON.stringify({
    employeeNo: nurse.employeeNo,
    activationCode: activation.activationCode,
    password: initialPassword,
    clientPlatform: 'H5',
    deviceName: 'activation-smoke',
  }),
})).data;
if (activated.user.id !== nurse.id) throw new Error('Activation returned a different internal user');
const repeatedActivation = (await request('/auth/activate', {
  method: 'POST',
  body: JSON.stringify({
    employeeNo: nurse.employeeNo,
    activationCode: activation.activationCode,
    password: initialPassword,
    clientPlatform: 'H5',
    deviceName: 'activation-smoke-retry',
  }),
})).data;
if (repeatedActivation.user.id !== nurse.id) throw new Error('Repeated activation created a different identity');

const refreshed = (await request('/auth/refresh', {
  method: 'POST', body: JSON.stringify({ refreshToken: activated.refreshToken }),
})).data;
await request('/me', { headers: { authorization: `Bearer ${activated.accessToken}` } }, [401]);
await request('/me', { headers: { authorization: `Bearer ${refreshed.accessToken}` } });

const resetCode = (await request(`/users/${nurse.id}/activation-codes`, {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ purpose: 'RESET_PASSWORD', reason: '自动化密码重置验收' }),
})).data;
await request('/auth/reset-password', {
  method: 'POST',
  body: JSON.stringify({ employeeNo: nurse.employeeNo, resetCode: resetCode.activationCode, newPassword: resetPassword }),
}, [204]);
await request('/auth/reset-password', {
  method: 'POST',
  body: JSON.stringify({ employeeNo: nurse.employeeNo, resetCode: resetCode.activationCode, newPassword: resetPassword }),
}, [204]);
await request('/me', { headers: { authorization: `Bearer ${refreshed.accessToken}` } }, [401]);
let nurseSession = await login(nurse.employeeNo, resetPassword);

await request('/auth/logout', {
  method: 'POST', headers: { authorization: `Bearer ${nurseSession.accessToken}` },
}, [204]);
await request('/me', { headers: { authorization: `Bearer ${nurseSession.accessToken}` } }, [401]);

const coordinator = (await request('/users', {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ employeeNo: `smoke-c-${suffix}`, name: '无权限协管员', role: 'COORDINATOR' }),
})).data;
const coordinatorCode = (await request(`/users/${coordinator.id}/activation-codes`, {
  method: 'POST', headers: headHeaders,
  body: JSON.stringify({ purpose: 'ACTIVATE_ACCOUNT', reason: '自动化权限验收' }),
})).data;
const coordinatorPassword = `Coord${randomBytes(9).toString('hex')}9`;
const coordinatorSession = (await request('/auth/activate', {
  method: 'POST',
  body: JSON.stringify({
    employeeNo: coordinator.employeeNo,
    activationCode: coordinatorCode.activationCode,
    password: coordinatorPassword,
    clientPlatform: 'H5',
    deviceName: 'coordinator-smoke',
  }),
})).data;
const coordinatorHeaders = { authorization: `Bearer ${coordinatorSession.accessToken}` };
await request('/users', { headers: coordinatorHeaders }, [403]);
await request(`/users/${coordinator.id}/permissions`, {
  method: 'PUT', headers: headHeaders,
  body: JSON.stringify({ permissions: ['notice.publish'] }),
});
await request('/users?status=DISABLED', { headers: coordinatorHeaders }, [200]);

await request(`/users/${head.user.id}`, {
  method: 'PATCH', headers: headHeaders,
  body: JSON.stringify({ status: 'DISABLED', reason: '验证最后一名护士长保护' }),
}, [409]);

nurseSession = await login(nurse.employeeNo, resetPassword);
await request(`/users/${nurse.id}`, {
  method: 'PATCH', headers: headHeaders,
  body: JSON.stringify({ status: 'DISABLED', reason: '自动化停用验收' }),
});
await request('/me', { headers: { authorization: `Bearer ${nurseSession.accessToken}` } }, [401]);

console.log(JSON.stringify({
  smoke: 'auth-users-ok',
  activation: true,
  activationRetry: true,
  refreshRotation: true,
  resetAndLogout: true,
  coordinatorPermission: true,
  batchImportResults: true,
  lastHeadProtection: true,
  disabledSessionRejected: true,
}));
