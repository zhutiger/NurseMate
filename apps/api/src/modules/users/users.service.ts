import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthUser } from '../../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivationCodeDto,
  CreateUserDto,
  GroupDto,
  ImportUsersDto,
  ReplacePermissionsDto,
  RequiredReasonDto,
  UpdateUserDto,
  UserListQueryDto,
} from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private userSelect = {
    id: true,
    employeeNo: true,
    name: true,
    role: true,
    status: true,
    primaryGroupId: true,
    activatedAt: true,
    disabledAt: true,
    disabledReason: true,
    createdAt: true,
  } satisfies Prisma.UserSelect;

  private codeHash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private snapshot(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async ensureGroup(departmentId: string, groupId?: string | null): Promise<void> {
    if (!groupId) return;
    const group = await this.prisma.nursingGroup.findFirst({ where: { id: groupId, departmentId, enabled: true } });
    if (!group) throw new NotFoundException('RESOURCE_NOT_FOUND');
  }

  async list(user: AuthUser, query: UserListQueryDto, full: boolean) {
    const where: Prisma.UserWhereInput = {
      departmentId: user.departmentId,
      ...(query.role ? { role: query.role } : {}),
      ...(!full ? { status: 'ACTIVE' } : query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: this.userSelect,
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, page: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    await this.ensureGroup(actor.departmentId, dto.primaryGroupId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            departmentId: actor.departmentId,
            employeeNo: dto.employeeNo.trim(),
            name: dto.name.trim(),
            role: dto.role,
            primaryGroupId: dto.primaryGroupId || null,
          },
          select: this.userSelect,
        });
        await tx.auditLog.create({
          data: {
            departmentId: actor.departmentId,
            actorId: actor.id,
            action: 'user.create',
            targetType: 'user',
            targetId: user.id,
            result: 'SUCCESS',
            afterData: this.snapshot(user),
          },
        });
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('EMPLOYEE_NO_CONFLICT');
      }
      throw error;
    }
  }

  async import(actor: AuthUser, dto: ImportUsersDto) {
    const results: Array<{ row: number; employeeNo: string; success: boolean; userId?: string; errorCode?: string }> = [];
    for (const [index, row] of dto.rows.entries()) {
      try {
        const created = await this.create(actor, row);
        results.push({ row: index + 1, employeeNo: row.employeeNo, success: true, userId: created.id });
      } catch (error) {
        results.push({
          row: index + 1,
          employeeNo: row.employeeNo,
          success: false,
          errorCode: error instanceof ConflictException ? 'EMPLOYEE_NO_CONFLICT' : 'IMPORT_ROW_INVALID',
        });
      }
    }
    return {
      total: results.length,
      succeeded: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
      results,
    };
  }

  async update(actor: AuthUser, userId: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findFirst({ where: { id: userId, departmentId: actor.departmentId } });
    if (!target) throw new NotFoundException('RESOURCE_NOT_FOUND');
    await this.ensureGroup(actor.departmentId, dto.primaryGroupId);

    const removesActiveHead =
      target.role === 'HEAD_NURSE' &&
      target.status === 'ACTIVE' &&
      ((dto.role && dto.role !== 'HEAD_NURSE') || (dto.status && dto.status !== 'ACTIVE'));
    if (removesActiveHead) {
      const otherHeads = await this.prisma.user.count({
        where: { departmentId: actor.departmentId, role: 'HEAD_NURSE', status: 'ACTIVE', id: { not: target.id } },
      });
      if (otherHeads === 0) throw new ConflictException('LAST_HEAD_NURSE_REQUIRED');
    }
    if (dto.status === 'DISABLED' && !dto.reason) throw new ConflictException('REASON_REQUIRED');
    if (target.status === 'DISABLED' && dto.status === 'ACTIVE') {
      throw new ConflictException('REACTIVATION_REQUIRES_ACTIVATION');
    }
    if (dto.status && dto.status !== target.status && !(
      dto.status === 'DISABLED'
      || (target.status === 'DISABLED' && dto.status === 'PENDING_ACTIVATION')
      || (target.status === 'LOCKED' && dto.status === 'ACTIVE')
    )) throw new ConflictException('STATE_CONFLICT');

    try { return await this.prisma.$transaction(async (tx) => {
      const reactivating = target.status === 'DISABLED' && dto.status === 'PENDING_ACTIVATION';
      const updated = await tx.user.update({
        where: { id: target.id },
        data: {
          ...(dto.employeeNo ? { employeeNo: dto.employeeNo.trim() } : {}),
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.role ? { role: dto.role } : {}),
          ...(dto.primaryGroupId !== undefined ? { primaryGroupId: dto.primaryGroupId || null } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.status === 'DISABLED'
            ? { disabledAt: new Date(), disabledReason: dto.reason }
            : reactivating
              ? { passwordHash: null, activatedAt: null }
              : {}),
          ...(dto.status === 'ACTIVE' ? { lockedUntil: null, failedLoginCount: 0 } : {}),
        },
        select: this.userSelect,
      });
      if (dto.status === 'DISABLED' || reactivating) {
        await tx.refreshSession.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: dto.status === 'DISABLED' ? 'ACCOUNT_DISABLED' : 'ACCOUNT_REACTIVATED' },
        });
      }
      if (reactivating) await tx.activationCode.updateMany({ where: { userId: target.id, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: new Date() } });
      if (dto.role && dto.role !== 'COORDINATOR') await tx.userPermission.deleteMany({ where: { userId: target.id } });
      await tx.auditLog.create({
        data: {
          departmentId: actor.departmentId,
          actorId: actor.id,
          action: 'user.update',
          targetType: 'user',
          targetId: target.id,
          result: 'SUCCESS',
          reason: dto.reason,
          beforeData: this.snapshot(target),
          afterData: this.snapshot(updated),
        },
      });
      return updated;
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('EMPLOYEE_NO_CONFLICT');
      throw error;
    }
  }

  async getPermissions(actor: AuthUser, userId: string) {
    const target = await this.prisma.user.findFirst({ where: { id: userId, departmentId: actor.departmentId }, select: { id: true, role: true } });
    if (!target) throw new NotFoundException('RESOURCE_NOT_FOUND');
    const permissions = await this.prisma.userPermission.findMany({ where: { userId }, select: { permissionCode: true } });
    return { permissions: permissions.map((item) => item.permissionCode) };
  }

  async createActivationCode(actor: AuthUser, userId: string, dto: ActivationCodeDto) {
    const target = await this.prisma.user.findFirst({ where: { id: userId, departmentId: actor.departmentId } });
    if (!target) throw new NotFoundException('RESOURCE_NOT_FOUND');
    if (dto.purpose === 'ACTIVATE_ACCOUNT' && target.status !== 'PENDING_ACTIVATION') {
      throw new ConflictException('ACCOUNT_ALREADY_ACTIVATED');
    }
    if (dto.purpose === 'RESET_PASSWORD' && !['ACTIVE', 'LOCKED'].includes(target.status)) {
      throw new ConflictException('STATE_CONFLICT');
    }
    const plaintext = randomBytes(8).toString('base64url').replace(/[-_]/g, '').slice(0, 10).toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.$transaction(async (tx) => {
      await tx.activationCode.updateMany({
        where: { userId, purpose: dto.purpose, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
      });
      await tx.activationCode.create({
        data: {
          userId,
          purpose: dto.purpose,
          codeHash: this.codeHash(plaintext),
          expiresAt,
          createdById: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          departmentId: actor.departmentId,
          actorId: actor.id,
          action: dto.purpose === 'ACTIVATE_ACCOUNT' ? 'user.activation_code_create' : 'user.reset_code_create',
          targetType: 'user',
          targetId: userId,
          result: 'SUCCESS',
          reason: dto.reason,
        },
      });
    });
    return { activationCode: plaintext, expiresAt };
  }

  async replacePermissions(actor: AuthUser, userId: string, dto: ReplacePermissionsDto) {
    const target = await this.prisma.user.findFirst({ where: { id: userId, departmentId: actor.departmentId } });
    if (!target) throw new NotFoundException('RESOURCE_NOT_FOUND');
    if (target.role !== 'COORDINATOR') throw new ConflictException('COORDINATOR_REQUIRED');
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } });
      if (dto.permissions.length) {
        await tx.userPermission.createMany({
          data: dto.permissions.map((permissionCode) => ({ userId, permissionCode, grantedById: actor.id })),
        });
      }
      await tx.auditLog.create({
        data: {
          departmentId: actor.departmentId,
          actorId: actor.id,
          action: 'user.permissions_replace',
          targetType: 'user',
          targetId: userId,
          result: 'SUCCESS',
          afterData: { permissions: dto.permissions },
        },
      });
    });
    return { permissions: dto.permissions };
  }

  async unbindWechat(actor: AuthUser, userId: string, dto: RequiredReasonDto): Promise<void> {
    const target = await this.prisma.user.findFirst({ where: { id: userId, departmentId: actor.departmentId } });
    if (!target) throw new NotFoundException('RESOURCE_NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await tx.wechatIdentity.updateMany({ where: { userId, unboundAt: null }, data: { unboundAt: new Date() } });
      await tx.auditLog.create({
        data: {
          departmentId: actor.departmentId,
          actorId: actor.id,
          action: 'user.wechat_unbind',
          targetType: 'user',
          targetId: userId,
          result: 'SUCCESS',
          reason: dto.reason,
        },
      });
    });
  }

  async revokeSessions(actor: AuthUser, userId: string, dto: RequiredReasonDto): Promise<void> {
    const target = await this.prisma.user.findFirst({ where: { id: userId, departmentId: actor.departmentId } });
    if (!target) throw new NotFoundException('RESOURCE_NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'ADMIN_REVOKED' },
      });
      await tx.auditLog.create({
        data: {
          departmentId: actor.departmentId,
          actorId: actor.id,
          action: 'user.sessions_revoke',
          targetType: 'user',
          targetId: userId,
          result: 'SUCCESS',
          reason: dto.reason,
        },
      });
    });
  }

  async listGroups(departmentId: string) {
    return this.prisma.nursingGroup.findMany({
      where: { departmentId },
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createGroup(actor: AuthUser, dto: GroupDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const group = await tx.nursingGroup.create({
          data: { departmentId: actor.departmentId, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), enabled: dto.enabled },
        });
        await tx.auditLog.create({
          data: {
            departmentId: actor.departmentId,
            actorId: actor.id,
            action: 'group.create',
            targetType: 'nursing_group',
            targetId: group.id,
            result: 'SUCCESS',
            afterData: this.snapshot(group),
          },
        });
        return group;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('GROUP_CONFLICT');
      }
      throw error;
    }
  }

  async updateGroup(actor: AuthUser, groupId: string, dto: GroupDto) {
    const target = await this.prisma.nursingGroup.findFirst({ where: { id: groupId, departmentId: actor.departmentId } });
    if (!target) throw new NotFoundException('RESOURCE_NOT_FOUND');
    try { return await this.prisma.$transaction(async (tx) => {
      const group = await tx.nursingGroup.update({
        where: { id: groupId },
        data: { code: dto.code.trim().toUpperCase(), name: dto.name.trim(), enabled: dto.enabled },
      });
      await tx.auditLog.create({
        data: {
          departmentId: actor.departmentId,
          actorId: actor.id,
          action: 'group.update',
          targetType: 'nursing_group',
          targetId: groupId,
          result: 'SUCCESS',
          beforeData: this.snapshot(target),
          afterData: this.snapshot(group),
        },
      });
      return group;
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('GROUP_CONFLICT');
      throw error;
    }
  }
}
