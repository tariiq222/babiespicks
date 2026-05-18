import { Module } from '@nestjs/common';
import { AffiliateController } from './affiliate.controller';
import { AffiliateService } from './affiliate.service';
import { ArabClicksService } from './networks/arabclicks.service';
import { AdmitadService } from './networks/admitad.service';

@Module({
  controllers: [AffiliateController],
  providers: [AffiliateService, ArabClicksService, AdmitadService],
})
export class AffiliateModule {}
