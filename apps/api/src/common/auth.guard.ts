import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PrismaService } from '../modules/prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const value = request.headers.authorization as string | undefined;
    if (!value?.startsWith('Bearer ')) throw new UnauthorizedException('AUTH_REQUIRED');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(value.slice(7));
      const [user, session] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: payload.sub } }),
        this.prisma.refreshSession.findUnique({ where: { id: payload.sid } }),
      ]);
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        !session ||
        session.userId !== user.id ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException('SESSION_REVOKED');
      }
      request.user = {
        id: user.id,
        sessionId: session.id,
        departmentId: user.departmentId,
        employeeNo: user.employeeNo,
        name: user.name,
        role: user.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('AUTH_REQUIRED');
    }
  }
}
