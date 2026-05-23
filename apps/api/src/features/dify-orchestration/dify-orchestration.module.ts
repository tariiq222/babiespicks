import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import {
  DifyOrchestrationController,
  DifyOrchestrationGuardedController,
} from './dify-orchestration.controller';
import { DifyOrchestrationService } from './dify-orchestration.service';
import { DifyAuthGuard } from './dify-auth.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [DifyOrchestrationController, DifyOrchestrationGuardedController],
  providers: [DifyOrchestrationService, DifyAuthGuard],
})
export class DifyOrchestrationModule {}
