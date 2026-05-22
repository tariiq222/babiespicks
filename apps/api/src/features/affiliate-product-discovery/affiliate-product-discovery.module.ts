import { Module } from '@nestjs/common';
import { AffiliateUrlService } from './affiliate-url.service';
import { AmazonSearchProvider } from './amazon-search.provider';
import { NoonPlaceholderProvider } from './noon-placeholder.provider';

@Module({
  providers: [AffiliateUrlService, AmazonSearchProvider, NoonPlaceholderProvider],
  exports: [AffiliateUrlService, AmazonSearchProvider, NoonPlaceholderProvider],
})
export class AffiliateProductDiscoveryModule {}
