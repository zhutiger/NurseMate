import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from './current-user.decorator';
import { PrismaService } from '../modules/prisma/prisma.service';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async has(user: AuthUser, permission: string): Promise<boolean> {
    if (user.role === 'HEAD_NURSE') return true;
    if (user.role !== 'COORDINATOR') return false;
    return Boolean(
      await this.prisma.userPermission.findUnique({
        where: { userId_permissionCode: { userId: user.id, permissionCode: permission } },
      }),
    );
  }

  async require(user: AuthUser, permission: string): Promise<void> {
    if (!(await this.has(user, permission))) throw new ForbiddenException('PERMISSION_DENIED');
  }

  async requireAny(user: AuthUser, permissions: string[]): Promise<void> {
    const results = await Promise.all(permissions.map((permission) => this.has(user, permission)));
    if (!results.some(Boolean)) throw new ForbiddenException('PERMISSION_DENIED');
  }

  requireHeadNurse(user: AuthUser): void {
    if (user.role !== 'HEAD_NURSE') throw new ForbiddenException('PERMISSION_DENIED');
  }
}
