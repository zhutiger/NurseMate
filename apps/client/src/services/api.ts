const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const ACCESS_TOKEN_KEY = 'hzy_access_token';
export const REFRESH_TOKEN_KEY = 'hzy_refresh_token';

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
          reject(Object.assign(new Error((result.data as any)?.error?.message ?? '请求失败'), { statusCode: result.statusCode, body: result.data }));
        }
      },
      fail: reject,
    });
  });
}

export async function api<T>(path: string, method: UniApp.RequestOptions['method'] = 'GET', data?: unknown): Promise<T> {
  try {
    return await rawRequest<T>(path, { url: '', method, data });
  } catch (error: any) {
    if (error?.statusCode !== 401 || path.startsWith('/auth/')) throw error;
    const refreshToken = uni.getStorageSync(REFRESH_TOKEN_KEY);
    if (!refreshToken) throw error;
    try {
      const session = await rawRequest<any>('/auth/refresh', { url: '', method: 'POST', data: { refreshToken } });
      saveSession(session);
      return await rawRequest<T>(path, { url: '', method, data });
    } catch (refreshError) {
      clearSession();
      uni.reLaunch({ url: '/pages/login/login' });
      throw refreshError;
    }
  }
}

export const healthReady = () => api<{ status: string; database: string }>('/health/ready');
export const login = (data: any) => rawRequest<any>('/auth/login', { url: '', method: 'POST', data });
export const activate = (data: any) => rawRequest<any>('/auth/activate', { url: '', method: 'POST', data });

export async function logout() {
  try { await api('/auth/logout', 'POST'); } finally { clearSession(); }
}
