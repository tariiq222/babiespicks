import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronService } from './cron.service';
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';
import { CouponsModule } from '../coupons/coupons.module';
import { PublisherModule } from '../../agents/publisher/publisher.module';
import { PublishingModule } from '../../infrastructure/publishing/publishing.module';
import { AiOsModule } from '../ai-os/ai-os.module';

@Module({
  imports: [ScheduleModule.forRoot(), CoordinatorModule, CouponsModule, PublisherModule, PublishingModule, AiOsModule],
  providers: [CronService],
})
export class CronModule {}
