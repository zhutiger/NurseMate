import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../../../../packages/constants/src/sha256';

describe('附件摘要', () => {
  it('与服务端 SHA-256 结果一致', () => {
    for (const content of [Buffer.alloc(0), Buffer.from('abc'), randomBytes(1024 * 1024)]) {
      expect(sha256(content)).toBe(createHash('sha256').update(content).digest('hex'));
    }
  });
});
