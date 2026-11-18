import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'ok' };
    } catch {
      throw new ServiceUnavailableException('DATABASE_UNAVAILABLE');
    }
  }
}
