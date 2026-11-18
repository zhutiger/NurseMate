import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, type AuthUser } from '../../common/current-user.decorator';
import { response } from '../../common/management';
import { CreateUploadIntentDto } from './files.dto';
import { FilesService } from './files.service';

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('files/upload-intents')
  async createIntent(@CurrentUser() user: AuthUser, @Body() dto: CreateUploadIntentDto) {
    return response(await this.files.createIntent(user, dto));
  }

  @Put('files/:fileId/content')
  @HttpCode(200)
  async uploadContent(
    @CurrentUser() user: AuthUser,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() content: Buffer,
  ) {
    return response(await this.files.uploadContent(user, fileId, Buffer.isBuffer(content) ? content : Buffer.alloc(0)));
  }

  @Post('files/:fileId/complete')
  @HttpCode(200)
  async complete(@CurrentUser() user: AuthUser, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return response(await this.files.complete(user, fileId));
  }

  @Get('files/:fileId/download')
  @Header('cache-control', 'private, no-store')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) result: Response,
  ) {
    const downloaded = await this.files.download(user, fileId);
    result.setHeader('content-type', downloaded.file.mimeType);
    result.setHeader('content-disposition', `attachment; filename="${downloaded.file.id}"`);
    return new StreamableFile(downloaded.content);
  }
}
