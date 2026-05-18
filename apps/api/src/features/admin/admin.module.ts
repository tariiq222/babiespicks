import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AnalyticsController } from './analytics.controller';
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';

@Module({
  imports: [CoordinatorModule],
  controllers: [AdminController, AnalyticsController],
})
export class AdminModule {}
