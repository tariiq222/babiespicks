import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronService } from './cron.service';
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';

@Module({
  imports: [ScheduleModule.forRoot(), CoordinatorModule],
  providers: [CronService],
})
export class CronModule {}
