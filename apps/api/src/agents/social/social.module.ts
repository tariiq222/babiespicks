import { Module } from '@nestjs/common';
import { TweetCrafterService } from './tweet-crafter.service';
import { HashtagMinerService } from './hashtag-miner.service';
import { SocialGuardService } from './social-guard.service';
import { VisualMakerService } from './visual-maker.service';
import { SocialCoordinatorService } from './social-coordinator.service';
import { PublishingModule } from '../../infrastructure/publishing/publishing.module';
import { SocialDraftService } from './social-drafts.service';

// SettingsModule is @Global() — no need to import it here
@Module({
  imports: [PublishingModule],
  providers: [
    TweetCrafterService,
    HashtagMinerService,
    SocialGuardService,
    VisualMakerService,
    SocialCoordinatorService,
    SocialDraftService,
  ],
  exports: [SocialCoordinatorService, SocialDraftService],
})
export class SocialModule {}
