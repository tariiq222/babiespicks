import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { DifyOrchestrationController } from './dify-orchestration.controller';
import { DifyOrchestrationService } from './dify-orchestration.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DifyOrchestrationController],
  providers: [DifyOrchestrationService],
})
export class DifyOrchestrationModule {}
