import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AccessService } from '../../common/access.service';
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator';
import { response } from '../../common/management';
import {
  ActivationCodeDto,
  CreateUserDto,
  GroupDto,
  ImportUsersDto,
  ReplacePermissionsDto,
  RequiredReasonDto,
  UpdateUserDto,
  UserListQueryDto,
} from './users.dto';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly access: AccessService,
  ) {}

  private async requireSelectorAccess(user: AuthUser): Promise<boolean> {
    if (user.role === 'HEAD_NURSE') return true;
    const allowed = (await this.access.has(user, 'notice.publish')) || (await this.access.has(user, 'task.publish'));
    if (!allowed) await this.access.require(user, 'user.manage');
    return false;
  }

  @Get('users')
  async list(@CurrentUser() user: AuthUser, @Query() query: UserListQueryDto) {
    return response(await this.users.list(user, query, await this.requireSelectorAccess(user)));
  }

  @Post('users')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    this.access.requireHeadNurse(user);
    return response(await this.users.create(user, dto));
  }

  @Post('users/import')
  @HttpCode(200)
  async import(@CurrentUser() user: AuthUser, @Body() dto: ImportUsersDto) {
    this.access.requireHeadNurse(user);
    return response(await this.users.import(user, dto));
  }

  @Patch('users/:userId')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    this.access.requireHeadNurse(user);
    return response(await this.users.update(user, userId, dto));
  }

  @Put('users/:userId')
  async updateForMiniProgram(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    this.access.requireHeadNurse(user);
    return response(await this.users.update(user, userId, dto));
  }

  @Post('users/:userId/activation-codes')
  async createActivationCode(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ActivationCodeDto,
  ) {
    this.access.requireHeadNurse(user);
    return response(await this.users.createActivationCode(user, userId, dto));
  }

  @Put('users/:userId/permissions')
  async replacePermissions(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ReplacePermissionsDto,
  ) {
    this.access.requireHeadNurse(user);
    return response(await this.users.replacePermissions(user, userId, dto));
  }

  @Get('users/:userId/permissions')
  async getPermissions(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string) {
    this.access.requireHeadNurse(user);
    return response(await this.users.getPermissions(user, userId));
  }

  @Delete('users/:userId/wechat-association') @HttpCode(204)
  async unbindWechat(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RequiredReasonDto,
  ) {
    this.access.requireHeadNurse(user);
    await this.users.unbindWechat(user, userId, dto);
  }

  @Delete('users/:userId/sessions') @HttpCode(204)
  async revokeSessions(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RequiredReasonDto,
  ) {
    this.access.requireHeadNurse(user);
    await this.users.revokeSessions(user, userId, dto);
  }

  @Get('groups')
  async listGroups(@CurrentUser() user: AuthUser) {
    await this.requireSelectorAccess(user);
    return response(await this.users.listGroups(user.departmentId));
  }

  @Post('groups')
  async createGroup(@CurrentUser() user: AuthUser, @Body() dto: GroupDto) {
    this.access.requireHeadNurse(user);
    return response(await this.users.createGroup(user, dto));
  }

  @Patch('groups/:groupId')
  async updateGroup(
    @CurrentUser() user: AuthUser,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: GroupDto,
  ) {
    this.access.requireHeadNurse(user);
    return response(await this.users.updateGroup(user, groupId, dto));
  }

  @Put('groups/:groupId')
  async updateGroupForMiniProgram(
    @CurrentUser() user: AuthUser,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: GroupDto,
  ) {
    this.access.requireHeadNurse(user);
    return response(await this.users.updateGroup(user, groupId, dto));
  }
}
