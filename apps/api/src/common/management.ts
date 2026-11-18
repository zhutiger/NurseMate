import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './current-user.decorator';

export function requireHeadNurse(user: AuthUser): void {
  if (user.role !== 'HEAD_NURSE') throw new ForbiddenException('PERMISSION_DENIED');
}

export function response<T>(data: T) {
  return { data, requestId: crypto.randomUUID() };
}
