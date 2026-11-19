export type MiniSelectedFile = { name: string; size: number; content: ArrayBuffer };

export async function chooseMiniFiles(): Promise<MiniSelectedFile[]> {
  const wx = (globalThis as any).wx;
  if (!wx?.chooseMessageFile || !wx?.getFileSystemManager) throw new Error('当前微信版本不支持选择附件');
  const result: any = await new Promise((resolve, reject) => wx.chooseMessageFile({ count: 9, type: 'file', success: resolve, fail: reject }));
  const selected: MiniSelectedFile[] = [];
  for (const file of result.tempFiles ?? []) {
    const content: ArrayBuffer = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: file.path, success: (value: any) => resolve(value.data), fail: reject }));
    selected.push({ name: file.name, size: file.size, content });
  }
  return selected;
}

export async function openMiniAttachment(url: string, token: string, mimeType?: string): Promise<void> {
  const result: any = await new Promise((resolve, reject) => uni.downloadFile({ url, header: { authorization: `Bearer ${token}` }, success: resolve, fail: reject }));
  if (result.statusCode !== 200) throw new Error('附件下载失败，请重新登录后重试');
  if (mimeType?.startsWith('image/')) {
    await new Promise((resolve, reject) => uni.previewImage({ urls: [result.tempFilePath], success: resolve, fail: reject }));
  } else {
    await new Promise((resolve, reject) => uni.openDocument({ filePath: result.tempFilePath, showMenu: true, success: resolve, fail: reject }));
  }
}
