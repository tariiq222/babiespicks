import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { DiscoveryModule } from '../../agents/discovery/discovery.module';
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';
import {
  DifyOrchestrationController,
  DifyOrchestrationGuardedController,
  DifyOrchestrationAdminController,
} from './dify-orchestration.controller';
import { DifyOrchestrationService } from './dify-orchestration.service';
import { DifyAuthGuard } from './dify-auth.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { DifyCronService } from './dify-cron.service';
import { DifyExceptionFilter } from './dify-exception.filter';

@Module({
  imports: [DatabaseModule, DiscoveryModule, CoordinatorModule],
  controllers: [
    DifyOrchestrationController,
    DifyOrchestrationGuardedController,
    DifyOrchestrationAdminController,
  ],
  providers: [
    DifyOrchestrationService,
    DifyAuthGuard,
    IdempotencyInterceptor,
    DifyCronService,
    {
      provide: APP_FILTER,
      useClass: DifyExceptionFilter,
    },
  ],
})
export class DifyOrchestrationModule {}
