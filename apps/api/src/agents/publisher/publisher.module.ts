import { Module } from '@nestjs/common';
import { PublisherService } from './publisher.service';
import { QualityGuardModule } from '../quality-guard/quality-guard.module';
import { PublishingModule } from '../../infrastructure/publishing/publishing.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [QualityGuardModule, PublishingModule, SocialModule],
  providers: [PublisherService],
  exports: [PublisherService],
})
export class PublisherModule {}
