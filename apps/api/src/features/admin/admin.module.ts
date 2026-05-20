import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AnalyticsController } from './analytics.controller';
import { ApprovalController } from './approval.controller';
import { SocialApprovalController } from './social-approval.controller';
import { SocialChannelsController } from './social-channels.controller';
import { ContentPagesController } from './content-pages.controller';
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';
import { PublishingModule } from '../../infrastructure/publishing/publishing.module';
import { AiOsModule } from '../ai-os/ai-os.module';

@Module({
  imports: [CoordinatorModule, PublishingModule, AiOsModule],
  controllers: [
    AdminController,
    AnalyticsController,
    ApprovalController,
    SocialApprovalController,
    SocialChannelsController,
    ContentPagesController,
  ],
})
export class AdminModule {}
