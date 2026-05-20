import { Module } from '@nestjs/common';
import { AiOsController } from './ai-os.controller';
import { AiOsService } from './ai-os.service';
import { AiOsWorkerService } from './ai-os-worker.service';
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';
import { SocialModule } from '../../agents/social/social.module';

@Module({
  imports: [CoordinatorModule, SocialModule],
  controllers: [AiOsController],
  providers: [AiOsService, AiOsWorkerService],
  exports: [AiOsService],
})
export class AiOsModule {}
