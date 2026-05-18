import { Module } from '@nestjs/common';
import { TweetCrafterService } from './tweet-crafter.service';
import { HashtagMinerService } from './hashtag-miner.service';
import { SocialGuardService } from './social-guard.service';
import { VisualMakerService } from './visual-maker.service';
import { SocialCoordinatorService } from './social-coordinator.service';

// SettingsModule is @Global() — no need to import it here
@Module({
  providers: [
    TweetCrafterService,
    HashtagMinerService,
    SocialGuardService,
    VisualMakerService,
    SocialCoordinatorService,
  ],
  exports: [SocialCoordinatorService],
})
export class SocialModule {}
