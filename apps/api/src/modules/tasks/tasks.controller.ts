import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AccessService } from '../../common/access.service';
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator';
import { response } from '../../common/management';
import { CreateTaskDto, ReviewTaskDto, SubmitTaskDto } from './tasks.dto';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly access: AccessService,
  ) {}

  @Post('tasks')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    await this.access.require(user, 'task.publish');
    return response(await this.tasks.create(user, dto));
  }

  @Post('tasks/:taskId/publish')
  async publish(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    await this.access.require(user, 'task.publish');
    return response(await this.tasks.publish(user, taskId));
  }

  @Get('me/tasks/:taskId')
  async getMine(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return response(await this.tasks.getMine(user, taskId));
  }

  @Post('me/tasks/:taskId/submissions')
  async submit(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: SubmitTaskDto,
  ) {
    return response(await this.tasks.submit(user, taskId, dto));
  }

  @Post('tasks/:taskId/records/:recordId/review')
  async review(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() dto: ReviewTaskDto,
  ) {
    await this.access.require(user, 'task.review');
    return response(await this.tasks.review(user, taskId, recordId, dto));
  }
}
