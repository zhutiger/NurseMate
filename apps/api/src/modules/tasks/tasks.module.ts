import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { RemindersModule } from '../reminders/reminders.module';

@Module({ imports: [RemindersModule], controllers: [TasksController], providers: [TasksService] })
export class TasksModule {}
