import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { DiscoveryModule } from '../../agents/discovery/discovery.module';
import {
  DifyOrchestrationController,
  DifyOrchestrationGuardedController,
} from './dify-orchestration.controller';
import { DifyOrchestrationService } from './dify-orchestration.service';
import { DifyAuthGuard } from './dify-auth.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Module({
  imports: [DatabaseModule, DiscoveryModule],
  controllers: [DifyOrchestrationController, DifyOrchestrationGuardedController],
  providers: [DifyOrchestrationService, DifyAuthGuard, IdempotencyInterceptor],
})
export class DifyOrchestrationModule {}
