import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { DiscoveryModule } from '../../agents/discovery/discovery.module';
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';
import {
  DifyOrchestrationController,
  DifyOrchestrationGuardedController,
} from './dify-orchestration.controller';
import { DifyOrchestrationService } from './dify-orchestration.service';
import { DifyAuthGuard } from './dify-auth.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { DifyCronService } from './dify-cron.service';

@Module({
  imports: [DatabaseModule, DiscoveryModule, CoordinatorModule],
  controllers: [DifyOrchestrationController, DifyOrchestrationGuardedController],
  providers: [DifyOrchestrationService, DifyAuthGuard, IdempotencyInterceptor, DifyCronService],
})
export class DifyOrchestrationModule {}
