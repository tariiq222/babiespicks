import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AnalyticsController } from './analytics.controller';
import { ApprovalController } from './approval.controller';
import { SocialApprovalController } from './social-approval.controller';
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';
import { PublishingModule } from '../../infrastructure/publishing/publishing.module';

@Module({
  imports: [CoordinatorModule, PublishingModule],
  controllers: [AdminController, AnalyticsController, ApprovalController, SocialApprovalController],
})
export class AdminModule {}
