import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AccessService } from '../../common/access.service';
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator';
import { response } from '../../common/management';
import { ReminderRequestDto } from './reminders.dto';
import { RemindersService } from './reminders.service';

@Controller()
export class RemindersController {
  constructor(
    private readonly reminders: RemindersService,
    private readonly access: AccessService,
  ) {}

  @Post('notices/:noticeId/reminders')
  @HttpCode(202)
  async remindNotice(
    @CurrentUser() user: AuthUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() dto: ReminderRequestDto,
  ) {
    await this.access.require(user, 'notice.remind');
    return response(await this.reminders.remindNotice(user, noticeId, dto));
  }

  @Post('tasks/:taskId/reminders')
  @HttpCode(202)
  async remindTask(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: ReminderRequestDto,
  ) {
    await this.access.require(user, 'task.remind');
    return response(await this.reminders.remindTask(user, taskId, dto));
  }

  @Get('me/reminders')
  async listMine(@CurrentUser() user: AuthUser) {
    return response(await this.reminders.listMine(user));
  }

  @Get('me/dashboard')
  async personalDashboard(@CurrentUser() user: AuthUser) {
    return response(await this.reminders.personalDashboard(user));
  }
}
