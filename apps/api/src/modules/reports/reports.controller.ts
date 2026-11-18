import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AccessService } from '../../common/access.service';
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator';
import { response } from '../../common/management';
import { AuditListQueryDto, CreateExportDto } from './reports.dto';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly access: AccessService,
  ) {}

  @Get('dashboard/management')
  async managementDashboard(@CurrentUser() user: AuthUser) {
    await this.access.requireAny(user, ['notice.stats', 'task.stats', 'task.review']);
    return response(await this.reports.managementDashboard(user.departmentId));
  }

  @Post('exports')
  @HttpCode(202)
  async createExport(@CurrentUser() user: AuthUser, @Body() dto: CreateExportDto) {
    await this.access.require(user, 'report.export');
    return response(await this.reports.createExport(user, dto));
  }

  @Get('exports/:exportId')
  async getExport(@CurrentUser() user: AuthUser, @Param('exportId', ParseUUIDPipe) exportId: string) {
    await this.access.require(user, 'report.export');
    return response(await this.reports.getExport(user, exportId));
  }

  @Get('audit-logs')
  async listAuditLogs(@CurrentUser() user: AuthUser, @Query() query: AuditListQueryDto) {
    await this.access.require(user, 'audit.view');
    return response(await this.reports.listAuditLogs(user, query));
  }
}
