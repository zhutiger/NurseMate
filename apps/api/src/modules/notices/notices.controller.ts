import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AccessService } from '../../common/access.service';
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator';
import { response } from '../../common/management';
import { ConfirmNoticeDto, CreateNoticeDto } from './notices.dto';
import { NoticesService } from './notices.service';

@Controller()
export class NoticesController {
  constructor(
    private readonly notices: NoticesService,
    private readonly access: AccessService,
  ) {}

  @Post('notices')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateNoticeDto) {
    await this.access.require(user, 'notice.publish');
    return response(await this.notices.create(user, dto));
  }

  @Post('notices/:noticeId/publish')
  async publish(
    @CurrentUser() user: AuthUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
  ) {
    await this.access.require(user, 'notice.publish');
    return response(await this.notices.publish(user, noticeId));
  }

  @Get('me/notices/:noticeId')
  async getMine(
    @CurrentUser() user: AuthUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
  ) {
    return response(await this.notices.getMine(user, noticeId));
  }

  @Post('me/notices/:noticeId/confirm')
  async confirm(
    @CurrentUser() user: AuthUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() dto: ConfirmNoticeDto,
  ) {
    return response(await this.notices.confirm(user, noticeId, dto));
  }
}
