import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronService } from './cron.service';
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';
import { CouponsModule } from '../coupons/coupons.module';
import { PublisherModule } from '../../agents/publisher/publisher.module';
import { PublishingModule } from '../../infrastructure/publishing/publishing.module';
import { AiOsModule } from '../ai-os/ai-os.module';
import { SchedulerService } from './scheduler.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TwitterPublisherService } from '../../infrastructure/publishing/twitter-publisher.service';
import { TelegramPublisherService } from '../../infrastructure/publishing/telegram-publisher.service';

@Module({
  imports: [ScheduleModule.forRoot(), CoordinatorModule, CouponsModule, PublisherModule, PublishingModule, AiOsModule],
  providers: [
    CronService,
    {
      provide: SchedulerService,
      useFactory: (
        prisma: PrismaService,
        twitter: TwitterPublisherService,
        telegram: TelegramPublisherService,
      ) => new SchedulerService(prisma, {}, twitter, telegram),
      inject: [PrismaService, TwitterPublisherService, TelegramPublisherService],
    },
  ],
  exports: [SchedulerService],
})
export class CronModule {}
