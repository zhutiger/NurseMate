import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { employeeNo: dto.employeeNo } });
    const valid = Boolean(user?.passwordHash && (await verify(user.passwordHash, dto.password)));
    if (!user || user.status !== 'ACTIVE' || !valid) {
      throw new UnauthorizedException('CREDENTIALS_INVALID');
    }

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.refreshSession.create({
        data: {
          userId: user.id,
          platform: dto.clientPlatform,
          tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
          userAgent: dto.deviceName,
          expiresAt,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          departmentId: user.departmentId,
          actorId: user.id,
          action: 'auth.login',
          targetType: 'user',
          targetId: user.id,
          result: 'SUCCESS',
        },
      }),
    ]);

    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return {
      accessToken,
      refreshToken,
      expiresIn: 1800,
      user: {
        id: user.id,
        employeeNo: user.employeeNo,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    };
  }
}
