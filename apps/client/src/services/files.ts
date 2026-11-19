import { sha256 } from '../../../../packages/constants/src/sha256';
import { currentPlatform } from '../platform';
import { chooseMiniFiles, openMiniAttachment } from '../platform/files';
import { ACCESS_TOKEN_KEY, API_BASE_URL, api } from './api';

type SelectedFile = { name: string; mimeType: string; size: number; content: ArrayBuffer };

const types: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function validate(name: string, size: number): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (!types[extension]) throw new Error('仅支持图片、PDF 和 Word 文件');
  if (size < 1 || size > 10 * 1024 * 1024) throw new Error('单个附件大小须在 10 MB 以内');
  return types[extension];
}

export async function chooseTaskFiles(): Promise<SelectedFile[]> {
  if (currentPlatform() === 'mp-weixin') {
    const selected: SelectedFile[] = [];
    for (const file of await chooseMiniFiles()) {
      const mimeType = validate(file.name, file.size);
      selected.push({ ...file, mimeType });
    }
    return selected;
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.accept = '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx';
    input.onchange = async () => {
      try {
        const files = Array.from(input.files ?? []);
        const selected: SelectedFile[] = [];
        for (const file of files) selected.push({ name: file.name, mimeType: validate(file.name, file.size), size: file.size, content: await file.arrayBuffer() });
        resolve(selected);
      } catch (error) { reject(error); }
    };
    input.click();
  });
}

export async function uploadTaskFile(file: SelectedFile) {
  const intent: any = await api('/files/upload-intents', 'POST', {
    fileName: file.name, mimeType: file.mimeType, sizeBytes: file.size, sha256: sha256(file.content),
    purpose: 'TASK_ATTACHMENT', contentPolicyAccepted: true,
  });
  await api(`/files/${intent.id}/content`, 'PUT', file.content, { 'content-type': 'application/octet-stream' });
  return api<any>(`/files/${intent.id}/complete`, 'POST');
}

export async function downloadAttachment(file: { id: string; originalName?: string; fileName?: string; mimeType?: string }) {
  const url = `${API_BASE_URL}/files/${file.id}/download`;
  const token = uni.getStorageSync(ACCESS_TOKEN_KEY);
  if (currentPlatform() === 'mp-weixin') {
    return openMiniAttachment(url, token, file.mimeType);
  }
  const result = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!result.ok) throw new Error('附件下载失败，请重新登录后重试');
  const href = URL.createObjectURL(await result.blob());
  const anchor = document.createElement('a'); anchor.href = href; anchor.download = file.originalName ?? file.fileName ?? '附件'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
