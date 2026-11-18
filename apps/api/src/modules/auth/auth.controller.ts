import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator';
import { response } from '../../common/management';
import { Public } from '../../common/public.decorator';
import {
  ActivateDto,
  AssociateWechatDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
} from './auth.dto';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('auth/activate')
  @HttpCode(200)
  async activate(@Body() dto: ActivateDto) {
    return response(await this.auth.activate(dto));
  }

  @Public() @Post('auth/login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    return response(await this.auth.login(dto));
  }

  @Public() @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto) {
    return response(await this.auth.refresh(dto));
  }

  @Public() @Post('auth/reset-password') @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto);
  }

  @Post('auth/logout') @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user);
  }

  @Post('auth/wechat/associate')
  @HttpCode(200)
  async associateWechat(@CurrentUser() user: AuthUser, @Body() dto: AssociateWechatDto) {
    return response(await this.auth.associateWechat(user, dto));
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return response(await this.auth.me(user));
  }
}
