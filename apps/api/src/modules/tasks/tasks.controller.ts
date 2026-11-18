import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AccessService } from '../../common/access.service';
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator';
import { response } from '../../common/management';
import {
  AssigneeSelectionDto,
  CreateTaskDto,
  MyTaskListQueryDto,
  OptionalReasonDto,
  RequiredReasonDto,
  ReviewTaskDto,
  SubmitTaskDto,
  TaskListQueryDto,
  TaskRecordPageQueryDto,
} from './tasks.dto';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly access: AccessService,
  ) {}

  @Post('tasks/assignee-preview')
  @HttpCode(200)
  async previewAssignees(@CurrentUser() user: AuthUser, @Body() dto: AssigneeSelectionDto) {
    await this.access.require(user, 'task.publish');
    return response(await this.tasks.previewAssignees(user, dto));
  }

  @Get('tasks')
  async listManaged(@CurrentUser() user: AuthUser, @Query() query: TaskListQueryDto) {
    await this.access.requireAny(user, ['task.publish', 'task.stats', 'task.review', 'task.manage']);
    const canReadAll = user.role === 'HEAD_NURSE'
      || await this.access.has(user, 'task.stats')
      || await this.access.has(user, 'task.review')
      || await this.access.has(user, 'task.manage');
    return response(await this.tasks.listManaged(user, query, canReadAll));
  }

  @Post('tasks')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    await this.access.require(user, 'task.publish');
    return response(await this.tasks.create(user, dto));
  }

  @Get('tasks/:taskId')
  async getManaged(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    await this.access.requireAny(user, ['task.publish', 'task.stats', 'task.review', 'task.manage']);
    const canReadAll = user.role === 'HEAD_NURSE'
      || await this.access.has(user, 'task.stats')
      || await this.access.has(user, 'task.review')
      || await this.access.has(user, 'task.manage');
    return response(await this.tasks.getManaged(user, taskId, canReadAll));
  }

  @Patch('tasks/:taskId')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateTaskDto,
  ) {
    await this.access.require(user, 'task.publish');
    return response(await this.tasks.update(user, taskId, dto));
  }

  @Delete('tasks/:taskId')
  @HttpCode(204)
  async cancel(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    await this.access.require(user, 'task.publish');
    await this.tasks.cancel(user, taskId);
  }

  @Post('tasks/:taskId/publish')
  @HttpCode(200)
  async publish(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    await this.access.require(user, 'task.publish');
    return response(await this.tasks.publish(user, taskId));
  }

  @Post('tasks/:taskId/close')
  @HttpCode(200)
  async close(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: OptionalReasonDto,
  ) {
    await this.access.require(user, 'task.manage');
    return response(await this.tasks.changeLifecycle(user, taskId, 'close', dto));
  }

  @Post('tasks/:taskId/withdraw')
  @HttpCode(200)
  async withdraw(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: RequiredReasonDto,
  ) {
    await this.access.require(user, 'task.manage');
    return response(await this.tasks.changeLifecycle(user, taskId, 'withdraw', dto));
  }

  @Get('tasks/:taskId/records')
  async listRecords(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query: TaskRecordPageQueryDto,
  ) {
    await this.access.requireAny(user, ['task.stats', 'task.review']);
    return response(await this.tasks.listRecords(user, taskId, query));
  }

  @Post('tasks/:taskId/records')
  @HttpCode(200)
  async addAssignees(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: AssigneeSelectionDto,
  ) {
    await this.access.require(user, 'task.manage');
    return response(await this.tasks.addAssignees(user, taskId, dto));
  }

  @Post('tasks/:taskId/records/:recordId/review')
  @HttpCode(200)
  async review(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() dto: ReviewTaskDto,
  ) {
    await this.access.require(user, 'task.review');
    return response(await this.tasks.review(user, taskId, recordId, dto));
  }

  @Post('tasks/:taskId/records/:recordId/exclude')
  @HttpCode(200)
  async excludeRecord(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() dto: RequiredReasonDto,
  ) {
    await this.access.require(user, 'task.manage');
    return response(await this.tasks.excludeRecord(user, taskId, recordId, dto));
  }

  @Get('me/tasks')
  async listMine(@CurrentUser() user: AuthUser, @Query() query: MyTaskListQueryDto) {
    return response(await this.tasks.listMine(user, query));
  }

  @Get('me/tasks/:taskId')
  async getMine(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return response(await this.tasks.getMine(user, taskId));
  }

  @Post('me/tasks/:taskId/complete')
  @HttpCode(200)
  async complete(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return response(await this.tasks.complete(user, taskId));
  }

  @Post('me/tasks/:taskId/submissions')
  async submit(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: SubmitTaskDto,
  ) {
    return response(await this.tasks.submit(user, taskId, dto));
  }
}
