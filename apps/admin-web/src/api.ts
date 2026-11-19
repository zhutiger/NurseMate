import { errorText } from './format';
import { sha256 } from '../../../packages/constants/src/sha256';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const ACCESS_TOKEN = 'hzy_admin_access_token';
const REFRESH_TOKEN = 'hzy_admin_refresh_token';
let refreshInFlight: Promise<void> | null = null;

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
  let response: Response;
  try { response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': requestId(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  }); } catch { throw Object.assign(new Error('网络连接失败，请检查网络后重试'), { network: true }); }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = errorText(payload?.error?.code ?? payload?.error?.message ?? payload?.message);
    throw Object.assign(new Error(message), { status: response.status, payload });
  }
  return payload?.data ?? payload;
}

export async function api(path: string, options: RequestInit = {}): Promise<any> {
  const accessToken = sessionStorage.getItem(ACCESS_TOKEN);
  const attempt = async () => {
    try { return await raw(path, options); }
    catch (error: any) {
      if ((!options.method || options.method === 'GET') && error?.network) return raw(path, options);
      throw error;
    }
  };
  try {
    return await attempt();
  } catch (error: any) {
    if (error?.status !== 401 || path.startsWith('/auth/')) throw error;
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN);
    if (!refreshToken) throw error;
    try {
      if (sessionStorage.getItem(ACCESS_TOKEN) === accessToken) {
        if (!refreshInFlight) {
          refreshInFlight = raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) })
            .then(saveSession).finally(() => { refreshInFlight = null; });
        }
        await refreshInFlight;
      }
    } catch (refreshError) {
      clearSession();
      window.dispatchEvent(new Event('hzy-session-expired'));
      throw refreshError;
    }
    return attempt();
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
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const post = (path: string, body?: unknown) => api(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const patch = (path: string, body?: unknown) => api(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });

const attachmentTypes: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function uploadTaskFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = attachmentTypes[extension];
  if (!mimeType) throw new Error('仅支持 JPG、PNG、WEBP 图片、PDF 和 Word 文档');
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('单个附件大小须在 10 MB 以内');
  const content = await file.arrayBuffer();
  const intent = await post('/files/upload-intents', {
    fileName: file.name, mimeType, sizeBytes: file.size, sha256: sha256(content),
    purpose: 'TASK_ATTACHMENT', contentPolicyAccepted: true,
  });
  await api(`/files/${intent.id}/content`, { method: 'PUT', body: content, headers: { 'content-type': 'application/octet-stream' } });
  return post(`/files/${intent.id}/complete`);
}
