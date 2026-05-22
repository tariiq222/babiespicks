import { Module } from '@nestjs/common';
import { AffiliateController } from './affiliate.controller';
import { AffiliateService } from './affiliate.service';
import { ArabClicksService } from './networks/arabclicks.service';
import { AdmitadService } from './networks/admitad.service';
import { AmazonAssociatesService } from './networks/amazon.service';
import { NoonAffiliateService } from './networks/noon.service';

@Module({
  controllers: [AffiliateController],
  providers: [AffiliateService, ArabClicksService, AdmitadService, AmazonAssociatesService, NoonAffiliateService],
  exports: [AffiliateService],
})
export class AffiliateModule {}
