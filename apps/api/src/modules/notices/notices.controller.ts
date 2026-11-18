import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AccessService } from '../../common/access.service';
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator';
import { response } from '../../common/management';
import {
  ConfirmNoticeDto,
  CreateNoticeDto,
  MyNoticeListQueryDto,
  NoticeListQueryDto,
  OptionalReasonDto,
  RecipientPageQueryDto,
  RecipientSelectionDto,
  RequiredReasonDto,
  UpdateNoticeDto,
} from './notices.dto';
import { NoticesService } from './notices.service';

@Controller()
export class NoticesController {
  constructor(
    private readonly notices: NoticesService,
    private readonly access: AccessService,
  ) {}

  @Post('notices/recipient-preview')
  @HttpCode(200)
  async previewRecipients(@CurrentUser() user: AuthUser, @Body() dto: RecipientSelectionDto) {
    await this.access.require(user, 'notice.publish');
    return response(await this.notices.previewRecipients(user, dto));
  }

  @Get('notices')
  async listManaged(@CurrentUser() user: AuthUser, @Query() query: NoticeListQueryDto) {
    await this.access.requireAny(user, ['notice.publish', 'notice.stats', 'notice.manage']);
    const canReadAll = user.role === 'HEAD_NURSE' || await this.access.has(user, 'notice.stats') || await this.access.has(user, 'notice.manage');
    return response(await this.notices.listManaged(user, query, canReadAll));
  }

  @Post('notices')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateNoticeDto) {
    await this.access.require(user, 'notice.publish');
    return response(await this.notices.create(user, dto));
  }

  @Get('notices/:noticeId')
  async getManaged(@CurrentUser() user: AuthUser, @Param('noticeId', ParseUUIDPipe) noticeId: string) {
    await this.access.requireAny(user, ['notice.publish', 'notice.stats', 'notice.manage']);
    const canReadAll = user.role === 'HEAD_NURSE' || await this.access.has(user, 'notice.stats') || await this.access.has(user, 'notice.manage');
    return response(await this.notices.getManaged(user, noticeId, canReadAll));
  }

  @Patch('notices/:noticeId')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() dto: UpdateNoticeDto,
  ) {
    await this.access.requireAny(user, ['notice.publish', 'notice.manage']);
    return response(await this.notices.update(user, noticeId, dto, await this.access.has(user, 'notice.manage')));
  }

  @Delete('notices/:noticeId')
  @HttpCode(204)
  async cancel(@CurrentUser() user: AuthUser, @Param('noticeId', ParseUUIDPipe) noticeId: string) {
    await this.access.require(user, 'notice.publish');
    await this.notices.cancel(user, noticeId);
  }

  @Post('notices/:noticeId/publish')
  @HttpCode(200)
  async publish(@CurrentUser() user: AuthUser, @Param('noticeId', ParseUUIDPipe) noticeId: string) {
    await this.access.require(user, 'notice.publish');
    return response(await this.notices.publish(user, noticeId));
  }

  @Post('notices/:noticeId/close')
  @HttpCode(200)
  async close(
    @CurrentUser() user: AuthUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() dto: OptionalReasonDto,
  ) {
    await this.access.require(user, 'notice.manage');
    return response(await this.notices.changeLifecycle(user, noticeId, 'close', dto));
  }

  @Post('notices/:noticeId/withdraw')
  @HttpCode(200)
  async withdraw(
    @CurrentUser() user: AuthUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() dto: RequiredReasonDto,
  ) {
    await this.access.require(user, 'notice.manage');
    return response(await this.notices.changeLifecycle(user, noticeId, 'withdraw', dto));
  }

  @Get('notices/:noticeId/recipients')
  async listRecipients(
    @CurrentUser() user: AuthUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Query() query: RecipientPageQueryDto,
  ) {
    await this.access.require(user, 'notice.stats');
    return response(await this.notices.listRecipients(user, noticeId, query));
  }

  @Post('notices/:noticeId/recipients')
  @HttpCode(200)
  async addRecipients(
    @CurrentUser() user: AuthUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() dto: RecipientSelectionDto,
  ) {
    await this.access.require(user, 'notice.manage');
    return response(await this.notices.addRecipients(user, noticeId, dto));
  }

  @Post('notices/:noticeId/recipients/:userId/exclude')
  @HttpCode(200)
  async excludeRecipient(
    @CurrentUser() user: AuthUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RequiredReasonDto,
  ) {
    await this.access.require(user, 'notice.manage');
    return response(await this.notices.excludeRecipient(user, noticeId, userId, dto));
  }

  @Get('me/notices')
  async listMine(@CurrentUser() user: AuthUser, @Query() query: MyNoticeListQueryDto) {
    return response(await this.notices.listMine(user, query));
  }

  @Get('me/notices/:noticeId')
  async getMine(@CurrentUser() user: AuthUser, @Param('noticeId', ParseUUIDPipe) noticeId: string) {
    return response(await this.notices.getMine(user, noticeId));
  }

  @Post('me/notices/:noticeId/confirm')
  @HttpCode(200)
  async confirm(
    @CurrentUser() user: AuthUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() dto: ConfirmNoticeDto,
  ) {
    return response(await this.notices.confirm(user, noticeId, dto));
  }
}
