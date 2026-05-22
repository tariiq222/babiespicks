import { Module } from '@nestjs/common';
import { AffiliateDiscoveryController } from './affiliate-discovery.controller';
import { AffiliateDiscoveryService } from './services/affiliate-discovery.service';

@Module({
  controllers: [AffiliateDiscoveryController],
  providers: [AffiliateDiscoveryService],
})
export class AffiliateDiscoveryModule {}
