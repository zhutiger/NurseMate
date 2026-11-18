import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  departmentId: string;
  employeeNo: string;
  name: string;
  role: 'HEAD_NURSE' | 'COORDINATOR' | 'NURSE';
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
