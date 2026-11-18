import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { catchError, from, mergeMap, Observable, of, throwError } from 'rxjs';
import type { AuthUser } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PrismaService } from '../modules/prisma/prisma.service';

type AuthenticatedRequest = Request & { user?: AuthUser };

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  private canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.canonical(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.canonical(item)}`);
      return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (
      isPublic
      || request.is('application/octet-stream')
      || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
      || !request.user
    ) return next.handle();

    const idempotencyKey = request.header('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 128) throw new ConflictException('IDEMPOTENCY_KEY_REQUIRED');
    const path = request.originalUrl.split('?')[0].slice(0, 255);
    const requestHash = createHash('sha256').update(this.canonical(request.body ?? null)).digest('hex');
    const identity = { userId: request.user.id, idempotencyKey, method: request.method, path };

    await this.prisma.idempotencyRecord.deleteMany({ where: { ...identity, expiresAt: { lte: new Date() } } });
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_idempotencyKey_method_path: identity },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
      if (existing.responseStatus === null) throw new ConflictException('IDEMPOTENCY_IN_PROGRESS');
      response.status(existing.responseStatus);
      return of(existing.responseBody === null ? undefined : existing.responseBody);
    }

    let record;
    try {
      record = await this.prisma.idempotencyRecord.create({
        data: { ...identity, requestHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('IDEMPOTENCY_IN_PROGRESS');
      }
      throw error;
    }

    return next.handle().pipe(
      mergeMap((body) => from(this.prisma.idempotencyRecord.update({
        where: { id: record.id },
        data: {
          responseStatus: response.statusCode,
          responseBody: body === undefined ? Prisma.JsonNull : JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue,
        },
      })).pipe(mergeMap(() => of(body)))),
      catchError((error) => from(this.prisma.idempotencyRecord.deleteMany({ where: { id: record.id } })).pipe(
        mergeMap(() => throwError(() => error)),
      )),
    );
  }
}
