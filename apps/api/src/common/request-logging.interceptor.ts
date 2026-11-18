import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { finalize, Observable } from 'rxjs';
import type { AuthUser } from './current-user.decorator';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = request.header('x-request-id')?.slice(0, 64) || randomUUID();
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);
    return next.handle().pipe(finalize(() => {
      console.info(JSON.stringify({
        event: 'http_request',
        requestId,
        method: request.method,
        path: request.originalUrl.split('?')[0],
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
        userId: request.user?.id ?? null,
      }));
    }));
  }
}
