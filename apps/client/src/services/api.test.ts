import { afterEach, expect, it, vi } from 'vitest';
import { api, saveSession } from './api';

afterEach(() => vi.unstubAllGlobals());

it('并发页面请求只轮换一次刷新令牌', async () => {
  const storage = new Map<string, string>();
  let refreshCount = 0;
  const mockUni = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: string) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: any) => {
      if (options.url.endsWith('/auth/refresh')) {
        refreshCount++;
        setTimeout(() => options.success({ statusCode: 200, data: { data: { accessToken: 'new', refreshToken: 'new-refresh' } } }), 5);
      } else if (options.header.authorization === 'Bearer old') {
        queueMicrotask(() => options.success({ statusCode: 401, data: { error: { code: 'AUTH_REQUIRED' } } }));
      } else {
        queueMicrotask(() => options.success({ statusCode: 200, data: { data: { ok: true } } }));
      }
    },
  };
  vi.stubGlobal('uni', mockUni);
  saveSession({ accessToken: 'old', refreshToken: 'old-refresh' });

  const results = await Promise.all([api('/me'), api('/me/dashboard')]);
  expect(results).toEqual([{ ok: true }, { ok: true }]);
  expect(refreshCount).toBe(1);
  expect(storage.get('hzy_access_token')).toBe('new');
});
