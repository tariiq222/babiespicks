import { Module } from '@nestjs/common';
import { PublisherService } from './publisher.service';
import { QualityGuardModule } from '../quality-guard/quality-guard.module';

@Module({
  imports: [QualityGuardModule],
  providers: [PublisherService],
  exports: [PublisherService],
})
export class PublisherModule {}
