import { Module } from '@nestjs/common';
import { AffiliateController } from './affiliate.controller';
import { AffiliateService } from './affiliate.service';
import { ArabClicksService } from './networks/arabclicks.service';

@Module({
  controllers: [AffiliateController],
  providers: [AffiliateService, ArabClicksService],
})
export class AffiliateModule {}
