import { errorText } from './display';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
export const API_BASE_URL = baseUrl;

export const ACCESS_TOKEN_KEY = 'hzy_access_token';
export const REFRESH_TOKEN_KEY = 'hzy_refresh_token';
let refreshInFlight: Promise<void> | null = null;

function idempotencyKey() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export function hasSession() {
  return Boolean(uni.getStorageSync(ACCESS_TOKEN_KEY));
}

export function clearSession() {
  uni.removeStorageSync(ACCESS_TOKEN_KEY);
  uni.removeStorageSync(REFRESH_TOKEN_KEY);
}

export function saveSession(result: any) {
  uni.setStorageSync(ACCESS_TOKEN_KEY, result.accessToken);
  uni.setStorageSync(REFRESH_TOKEN_KEY, result.refreshToken);
}

function rawRequest<T>(path: string, options: UniApp.RequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      ...options,
      timeout: 12000,
      url: `${baseUrl}${path}`,
      header: {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey(),
        ...(uni.getStorageSync(ACCESS_TOKEN_KEY) ? { authorization: `Bearer ${uni.getStorageSync(ACCESS_TOKEN_KEY)}` } : {}),
        ...(options.header ?? {}),
      },
      success: (result) => {
        if (result.statusCode >= 200 && result.statusCode < 300) {
          const payload = result.data as any;
          resolve((payload?.data ?? payload) as T);
        } else {
          const code = (result.data as any)?.error?.code ?? (result.data as any)?.error?.message;
          reject(Object.assign(new Error(errorText(code)), { statusCode: result.statusCode, body: result.data }));
        }
      },
      fail: () => reject(Object.assign(new Error('网络连接失败，请检查网络后重试'), { network: true })),
    });
  });
}

export async function api<T>(path: string, method: UniApp.RequestOptions['method'] = 'GET', data?: unknown, header?: Record<string, string>): Promise<T> {
  const accessToken = uni.getStorageSync(ACCESS_TOKEN_KEY);
  const attempt = async () => {
    try { return await rawRequest<T>(path, { url: '', method, data, header }); }
    catch (error: any) {
      if (method === 'GET' && error?.network) return rawRequest<T>(path, { url: '', method, data, header });
      throw error;
    }
  };
  try {
    return await attempt();
  } catch (error: any) {
    if (error?.statusCode !== 401 || path.startsWith('/auth/')) throw error;
    const refreshToken = uni.getStorageSync(REFRESH_TOKEN_KEY);
    if (!refreshToken) throw error;
    try {
      if (uni.getStorageSync(ACCESS_TOKEN_KEY) === accessToken) {
        if (!refreshInFlight) {
          refreshInFlight = rawRequest<any>('/auth/refresh', { url: '', method: 'POST', data: { refreshToken } })
            .then(saveSession).finally(() => { refreshInFlight = null; });
        }
        await refreshInFlight;
      }
    } catch (refreshError) {
      clearSession();
      uni.reLaunch({ url: '/pages/login/login' });
      throw refreshError;
    }
    return attempt();
  }
}

export const healthReady = () => api<{ status: string; database: string }>('/health/ready');
export const login = (data: any) => rawRequest<any>('/auth/login', { url: '', method: 'POST', data });
export const activate = (data: any) => rawRequest<any>('/auth/activate', { url: '', method: 'POST', data });
export const resetPassword = (data: any) => rawRequest<any>('/auth/reset-password', { url: '', method: 'POST', data });

export async function logout() {
  try { await api('/auth/logout', 'POST'); } finally { clearSession(); }
}
