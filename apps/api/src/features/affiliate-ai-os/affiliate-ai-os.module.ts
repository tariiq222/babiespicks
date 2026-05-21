import { Module } from '@nestjs/common';
import { ProductDraftsController } from './product-drafts.controller';
import { ProductDraftsService } from './product-drafts.service';
import { TrendIntelligenceService } from './trend-intelligence.service';
import { TrendSignalsController } from './trend-signals.controller';
import { OfferEnrichmentsController } from './offer-enrichments.controller';
import { OfferEnrichmentsService } from './offer-enrichments.service';
import { ContentDraftsController } from './content-drafts.controller';
import { ContentDraftsService } from './content-drafts.service';

@Module({
  controllers: [
    ProductDraftsController,
    TrendSignalsController,
    OfferEnrichmentsController,
    ContentDraftsController,
  ],
  providers: [
    TrendIntelligenceService,
    ProductDraftsService,
    OfferEnrichmentsService,
    ContentDraftsService,
  ],
  exports: [
    TrendIntelligenceService,
    ProductDraftsService,
    OfferEnrichmentsService,
    ContentDraftsService,
  ],
})
export class AffiliateAiOsModule {}
