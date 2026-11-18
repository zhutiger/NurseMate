import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const explicit = typeof raw === 'string' ? raw : typeof raw === 'object' && raw && 'message' in raw ? raw.message : null;
    const message = Array.isArray(explicit) ? explicit.join('; ') : typeof explicit === 'string' ? explicit : 'INTERNAL_ERROR';
    const code = /^[A-Z][A-Z0-9_]+$/.test(message)
      ? message
      : status === 400
        ? 'VALIDATION_FAILED'
        : status === 401
          ? 'AUTH_REQUIRED'
          : status === 403
            ? 'PERMISSION_DENIED'
            : status === 404
              ? 'RESOURCE_NOT_FOUND'
              : status === 409
                ? 'STATE_CONFLICT'
                : 'INTERNAL_ERROR';
    const requestId = request.header('x-request-id')?.slice(0, 64) || randomUUID();
    response.status(status).json({ error: { code, message }, requestId });
  }
}
