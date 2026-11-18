import {
  BadGatewayException,
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type ClientPlatform, type User } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthUser } from '../../common/current-user.decorator';
import { hashPassword, verifyPassword } from '../../common/password';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivateDto,
  AssociateWechatDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
} from './auth.dto';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async createSession(db: Db, user: User, platform: ClientPlatform, deviceName: string) {
    const refreshToken = randomBytes(48).toString('base64url');
    const session = await db.refreshSession.create({
      data: {
        userId: user.id,
        platform,
        tokenHash: this.tokenHash(refreshToken),
        userAgent: deviceName,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    return { session, refreshToken };
  }

  private async authResult(user: User, sessionId: string, refreshToken: string) {
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, sid: sessionId }),
      refreshToken,
      expiresIn: 1800,
      user: {
        id: user.id,
        employeeNo: user.employeeNo,
        name: user.name,
        role: user.role,
        status: user.status,
        primaryGroupId: user.primaryGroupId,
      },
    };
  }

  private async registerFailure(user: User, action: string): Promise<void> {
    const count = user.failedLoginCount + 1;
    const lock = count >= 5;
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: count,
          lockedUntil: lock ? new Date(Date.now() + 15 * 60 * 1000) : user.lockedUntil,
          ...(lock && user.status === 'ACTIVE' ? { status: 'LOCKED' as const } : {}),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action,
          targetType: 'user',
          targetId: user.id,
          result: 'FAILURE',
          reason: lock ? 'ATTEMPT_LIMIT_REACHED' : 'CREDENTIAL_INVALID',
        },
      }),
    ]);
  }

  async login(dto: LoginDto) {
    let user = await this.prisma.user.findUnique({ where: { employeeNo: dto.employeeNo } });
    if (!user) throw new UnauthorizedException('CREDENTIALS_INVALID');
    if (user.status === 'LOCKED') {
      if (!user.lockedUntil || user.lockedUntil > new Date()) throw new HttpException('ACCOUNT_LOCKED', 423);
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null },
      });
    }
    if (user.status !== 'ACTIVE' || !user.passwordHash || !(await verifyPassword(user.passwordHash, dto.password))) {
      if (user.status === 'ACTIVE') await this.registerFailure(user, 'auth.login_failed');
      throw new UnauthorizedException('CREDENTIALS_INVALID');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      const issued = await this.createSession(tx, current, dto.clientPlatform, dto.deviceName);
      await tx.auditLog.create({
        data: {
          departmentId: current.departmentId,
          actorId: current.id,
          action: 'auth.login',
          targetType: 'user',
          targetId: current.id,
          result: 'SUCCESS',
        },
      });
      return { user: current, ...issued };
    });
    return this.authResult(result.user, result.session.id, result.refreshToken);
  }

  async activate(dto: ActivateDto) {
    const user = await this.prisma.user.findUnique({ where: { employeeNo: dto.employeeNo } });
    if (!user) throw new UnauthorizedException('ACTIVATION_CODE_INVALID');
    const normalizedCodeHash = this.tokenHash(dto.activationCode.trim().toUpperCase());
    if (user.status === 'ACTIVE' && user.passwordHash && await verifyPassword(user.passwordHash, dto.password)) {
      const usedCode = await this.prisma.activationCode.findFirst({
        where: { userId: user.id, purpose: 'ACTIVATE_ACCOUNT', codeHash: normalizedCodeHash, usedAt: { not: null } },
      });
      if (usedCode) {
        const issued = await this.prisma.$transaction(async (tx) => {
          const session = await this.createSession(tx, user, dto.clientPlatform, dto.deviceName);
          await tx.auditLog.create({
            data: { departmentId: user.departmentId, actorId: user.id, action: 'auth.activate_retry', targetType: 'user', targetId: user.id, result: 'SUCCESS' },
          });
          return session;
        });
        return this.authResult(user, issued.session.id, issued.refreshToken);
      }
    }
    if (user.status !== 'PENDING_ACTIVATION') throw new ConflictException('ACCOUNT_ALREADY_ACTIVATED');
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new HttpException('ACCOUNT_LOCKED', 423);
    const code = await this.prisma.activationCode.findFirst({
      where: {
        userId: user.id,
        purpose: 'ACTIVATE_ACCOUNT',
        codeHash: normalizedCodeHash,
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!code) {
      await this.registerFailure(user, 'auth.activate_failed');
      throw new UnauthorizedException('ACTIVATION_CODE_INVALID');
    }

    const passwordHash = await hashPassword(dto.password);
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.activationCode.updateMany({
        where: { id: code.id, usedAt: null, invalidatedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('ACTIVATION_CODE_USED');
      const activated = await tx.user.update({
        where: { id: user.id },
        data: {
          status: 'ACTIVE',
          passwordHash,
          passwordChangedAt: new Date(),
          activatedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.activationCode.updateMany({
        where: { userId: user.id, purpose: 'ACTIVATE_ACCOUNT', usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
      });
      const issued = await this.createSession(tx, activated, dto.clientPlatform, dto.deviceName);
      await tx.auditLog.create({
        data: {
          departmentId: activated.departmentId,
          actorId: activated.id,
          action: 'auth.activate',
          targetType: 'user',
          targetId: activated.id,
          result: 'SUCCESS',
        },
      });
      return { user: activated, ...issued };
    });
    return this.authResult(result.user, result.session.id, result.refreshToken);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { employeeNo: dto.employeeNo } });
    if (!user || user.status === 'DISABLED' || user.status === 'PENDING_ACTIVATION') {
      throw new UnauthorizedException('ACTIVATION_CODE_INVALID');
    }
    const normalizedCodeHash = this.tokenHash(dto.resetCode.trim().toUpperCase());
    const code = await this.prisma.activationCode.findFirst({
      where: {
        userId: user.id,
        purpose: 'RESET_PASSWORD',
        codeHash: normalizedCodeHash,
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!code) {
      const usedCode = await this.prisma.activationCode.findFirst({
        where: { userId: user.id, purpose: 'RESET_PASSWORD', codeHash: normalizedCodeHash, usedAt: { not: null } },
      });
      if (usedCode && user.passwordHash && await verifyPassword(user.passwordHash, dto.newPassword)) return;
      throw new UnauthorizedException('ACTIVATION_CODE_INVALID');
    }
    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.activationCode.updateMany({
        where: { id: code.id, usedAt: null, invalidatedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('ACTIVATION_CODE_USED');
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          status: 'ACTIVE',
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.refreshSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'PASSWORD_RESET' },
      });
      await tx.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'auth.password_reset',
          targetType: 'user',
          targetId: user.id,
          result: 'SUCCESS',
        },
      });
    });
  }

  async refresh(dto: RefreshDto) {
    const old = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.tokenHash(dto.refreshToken) },
      include: { user: true },
    });
    if (!old || old.revokedAt || old.expiresAt <= new Date() || old.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('SESSION_REVOKED');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshSession.updateMany({
        where: { id: old.id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'TOKEN_ROTATED', lastUsedAt: new Date() },
      });
      if (revoked.count !== 1) throw new UnauthorizedException('SESSION_REVOKED');
      const issued = await this.createSession(tx, old.user, old.platform, old.userAgent ?? 'refreshed-session');
      return issued;
    });
    return this.authResult(old.user, result.session.id, result.refreshToken);
  }

  async logout(user: AuthUser): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshSession.update({
        where: { id: user.sessionId },
        data: { revokedAt: new Date(), revokeReason: 'USER_LOGOUT' },
      }),
      this.prisma.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'auth.logout',
          targetType: 'session',
          targetId: user.sessionId,
          result: 'SUCCESS',
        },
      }),
    ]);
  }

  async associateWechat(user: AuthUser, dto: AssociateWechatDto) {
    const appId = process.env.WECHAT_APP_ID;
    const secret = process.env.WECHAT_APP_SECRET;
    if (!appId || !secret) throw new BadGatewayException('WECHAT_CODE_EXCHANGE_FAILED');
    const query = new URLSearchParams({ appid: appId, secret, js_code: dto.code, grant_type: 'authorization_code' });
    const exchange = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`);
    const data = (await exchange.json()) as { openid?: string; unionid?: string; errcode?: number };
    if (!exchange.ok || !data.openid || data.errcode) throw new BadGatewayException('WECHAT_CODE_EXCHANGE_FAILED');
    try {
      const identity = await this.prisma.$transaction(async (tx) => {
        const conflict = await tx.wechatIdentity.findUnique({
          where: { appId_openId: { appId, openId: data.openid! } },
        });
        if (conflict && conflict.userId !== user.id && !conflict.unboundAt) {
          throw new ConflictException('WECHAT_IDENTITY_CONFLICT');
        }
        const saved = await tx.wechatIdentity.upsert({
          where: { userId_appId: { userId: user.id, appId } },
          create: { userId: user.id, appId, openId: data.openid!, unionId: data.unionid },
          update: { openId: data.openid!, unionId: data.unionid, boundAt: new Date(), unboundAt: null },
        });
        await tx.auditLog.create({
          data: {
            departmentId: user.departmentId,
            actorId: user.id,
            action: 'auth.wechat_associate',
            targetType: 'wechat_identity',
            targetId: saved.id,
            result: 'SUCCESS',
          },
        });
        return saved;
      });
      return { associated: true, associatedAt: identity.boundAt };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('WECHAT_IDENTITY_CONFLICT');
      }
      throw error;
    }
  }

  async me(user: AuthUser) {
    const [permissions, identity] = await Promise.all([
      this.prisma.userPermission.findMany({ where: { userId: user.id }, select: { permissionCode: true } }),
      this.prisma.wechatIdentity.findFirst({ where: { userId: user.id, unboundAt: null } }),
    ]);
    return {
      user,
      permissions: user.role === 'HEAD_NURSE' ? ['*'] : permissions.map((item) => item.permissionCode),
      wechatAssociated: Boolean(identity),
    };
  }
}
