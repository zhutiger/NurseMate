import { Module } from '@nestjs/common';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';
import { RemindersModule } from '../reminders/reminders.module';

@Module({ imports: [RemindersModule], controllers: [NoticesController], providers: [NoticesService] })
export class NoticesModule {}
