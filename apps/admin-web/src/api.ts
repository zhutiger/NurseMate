const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const ACCESS_TOKEN = 'hzy_admin_access_token';
const REFRESH_TOKEN = 'hzy_admin_refresh_token';

export function hasSession() {
  return Boolean(sessionStorage.getItem(ACCESS_TOKEN));
}

export function saveSession(result: any) {
  sessionStorage.setItem(ACCESS_TOKEN, result.accessToken);
  sessionStorage.setItem(REFRESH_TOKEN, result.refreshToken);
}

export function clearSession() {
  sessionStorage.removeItem(ACCESS_TOKEN);
  sessionStorage.removeItem(REFRESH_TOKEN);
}

function requestId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

async function raw(path: string, options: RequestInit = {}) {
  const token = sessionStorage.getItem(ACCESS_TOKEN);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': requestId(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.message ?? `请求失败（${response.status}）`;
    throw Object.assign(new Error(message), { status: response.status, payload });
  }
  return payload?.data ?? payload;
}

export async function api(path: string, options: RequestInit = {}): Promise<any> {
  try {
    return await raw(path, options);
  } catch (error: any) {
    if (error?.status !== 401 || path.startsWith('/auth/')) throw error;
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN);
    if (!refreshToken) throw error;
    try {
      const session = await raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
      saveSession(session);
      return await raw(path, options);
    } catch (refreshError) {
      clearSession();
      window.dispatchEvent(new Event('hzy-session-expired'));
      throw refreshError;
    }
  }
}

export async function login(employeeNo: string, password: string) {
  const session = await raw('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ employeeNo, password, clientPlatform: 'ADMIN_WEB', deviceName: '护知音电脑管理端' }),
  });
  saveSession(session);
  return session;
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    clearSession();
  }
}

export async function download(path: string, filename: string) {
  const token = sessionStorage.getItem(ACCESS_TOKEN);
  const response = await fetch(`${API_BASE}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error(`下载失败（${response.status}）`);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export const post = (path: string, body?: unknown) => api(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const patch = (path: string, body?: unknown) => api(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
