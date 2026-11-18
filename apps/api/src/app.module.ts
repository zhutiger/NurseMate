import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './common/auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { NoticesModule } from './modules/notices/notices.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { TasksModule } from './modules/tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_ACCESS_SECRET ?? 'development-only-secret',
      signOptions: { expiresIn: '30m' },
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    NoticesModule,
    TasksModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
