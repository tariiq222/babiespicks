import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronService } from './cron.service';
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [ScheduleModule.forRoot(), CoordinatorModule, CouponsModule],
  providers: [CronService],
})
export class CronModule {}
