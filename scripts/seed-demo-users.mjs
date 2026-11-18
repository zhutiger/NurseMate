import { randomUUID } from 'node:crypto';

const baseUrl = process.env.BASE_URL;
const headEmployeeNo = process.env.SEED_HEAD_EMPLOYEE_NO ?? 'admin';
const headPassword = process.env.SEED_HEAD_PASSWORD;
const demoPassword = process.env.DEMO_NURSE_PASSWORD ?? process.env.SEED_NURSE_PASSWORD;
if (!baseUrl || !headPassword || !demoPassword) {
  throw new Error('BASE_URL, SEED_HEAD_PASSWORD and DEMO_NURSE_PASSWORD or SEED_NURSE_PASSWORD are required');
}

async function request(path, options = {}, expected = [200, 201, 204]) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!expected.includes(response.status)) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status} ${JSON.stringify(body)}`);
  }
  return body?.data ?? body;
}

const head = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ employeeNo: headEmployeeNo, password: headPassword, clientPlatform: 'ADMIN_WEB', deviceName: 'demo-data-seed' }),
});
const headHeaders = { authorization: `Bearer ${head.accessToken}` };

let groups = await request('/groups', { headers: headHeaders });
groups = groups.items ?? groups;
for (const definition of [
  { code: 'DEMO-A', name: '演示护理一组', enabled: true },
  { code: 'DEMO-B', name: '演示护理二组', enabled: true },
]) {
  if (!groups.some((group) => group.code === definition.code)) {
    await request('/groups', { method: 'POST', headers: headHeaders, body: JSON.stringify(definition) });
  }
}
groups = await request('/groups', { headers: headHeaders });
groups = groups.items ?? groups;
const demoGroups = groups.filter((group) => ['DEMO-A', 'DEMO-B'].includes(group.code));

let usersResult = await request('/users?pageSize=100', { headers: headHeaders });
let users = usersResult.items;
let created = 0;
let activated = 0;

for (let index = 1; index <= 10; index += 1) {
  const suffix = String(index).padStart(2, '0');
  const employeeNo = `demo-nurse-${suffix}`;
  const primaryGroupId = demoGroups[(index - 1) % demoGroups.length].id;
  let user = users.find((item) => item.employeeNo === employeeNo);
  if (!user) {
    user = await request('/users', {
      method: 'POST',
      headers: headHeaders,
      body: JSON.stringify({ employeeNo, name: `演示护士${suffix}`, role: 'NURSE', primaryGroupId }),
    });
    created += 1;
  }
  if (user.status === 'PENDING_ACTIVATION') {
    const code = await request(`/users/${user.id}/activation-codes`, {
      method: 'POST',
      headers: headHeaders,
      body: JSON.stringify({ purpose: 'ACTIVATE_ACCOUNT', reason: '初始化演示人员' }),
    });
    await request('/auth/activate', {
      method: 'POST',
      body: JSON.stringify({ employeeNo, activationCode: code.activationCode, password: demoPassword, clientPlatform: 'H5', deviceName: 'demo-data-seed' }),
    });
    activated += 1;
  }
}

usersResult = await request('/users?pageSize=100', { headers: headHeaders });
users = usersResult.items.filter((item) => item.employeeNo.startsWith('demo-nurse-'));
if (users.length !== 10 || users.some((item) => item.status !== 'ACTIVE')) {
  throw new Error(`Demo user verification failed: count=${users.length}`);
}

console.log(JSON.stringify({ seed: 'demo-users-ok', total: users.length, created, activated, groups: demoGroups.length }));
