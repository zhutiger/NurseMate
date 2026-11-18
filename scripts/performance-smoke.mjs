import { performance } from 'node:perf_hooks';

const baseUrl = process.env.BASE_URL;
const headEmployeeNo = process.env.SEED_HEAD_EMPLOYEE_NO ?? 'admin';
const headPassword = process.env.SEED_HEAD_PASSWORD;
if (!baseUrl || !headPassword) throw new Error('BASE_URL and SEED_HEAD_PASSWORD are required');

async function json(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  const body = await response.json();
  return body.data ?? body;
}

const session = await json('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ employeeNo: headEmployeeNo, password: headPassword, clientPlatform: 'H5', deviceName: 'performance-smoke' }),
});
const headers = { authorization: `Bearer ${session.accessToken}` };
const paths = ['/me', '/dashboard/management', '/notices?pageSize=20', '/tasks?pageSize=20'];
const samples = [];

for (let round = 0; round < 20; round += 1) {
  const batch = paths.map(async (path) => {
    const startedAt = performance.now();
    await json(path, { headers });
    samples.push(performance.now() - startedAt);
  });
  await Promise.all(batch);
}

samples.sort((left, right) => left - right);
const percentile = (value) => samples[Math.min(samples.length - 1, Math.ceil(samples.length * value) - 1)];
const result = {
  smoke: 'performance-ok',
  requests: samples.length,
  p50Ms: Math.round(percentile(0.5)),
  p95Ms: Math.round(percentile(0.95)),
  maxMs: Math.round(samples.at(-1)),
};
if (result.p95Ms > 2000) throw new Error(`P95 exceeded 2000ms: ${JSON.stringify(result)}`);
console.log(JSON.stringify(result));
