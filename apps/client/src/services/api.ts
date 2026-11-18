const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export async function healthReady(): Promise<{ status: string; database: string }> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${baseUrl}/health/ready`,
      success: (result) => resolve(result.data as { status: string; database: string }),
      fail: reject,
    });
  });
}
