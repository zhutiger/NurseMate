import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator';
import { Public } from '../../common/public.decorator';
import { response } from '../../common/management';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/login')
  async login(@Body() dto: LoginDto) {
    return response(await this.auth.login(dto));
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return response({ user, permissions: [], wechatAssociated: false });
  }
}
