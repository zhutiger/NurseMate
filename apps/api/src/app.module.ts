import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccessModule } from './common/access.module';
import { AuthGuard } from './common/auth.guard';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { FilesModule } from './modules/files/files.module';
import { NoticesModule } from './modules/notices/notices.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_ACCESS_SECRET ?? 'development-only-secret',
      signOptions: { expiresIn: '30m' },
    }),
    PrismaModule,
    AccessModule,
    AuthModule,
    UsersModule,
    HealthModule,
    FilesModule,
    NoticesModule,
    TasksModule,
    RemindersModule,
    ReportsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
