import { Module } from '@nestjs/common';
import { ProductDraftsController } from './product-drafts.controller';
import { ProductDraftsService } from './product-drafts.service';
import { TrendIntelligenceService } from './trend-intelligence.service';
import { TrendSignalsController } from './trend-signals.controller';

@Module({
  controllers: [ProductDraftsController, TrendSignalsController],
  providers: [TrendIntelligenceService, ProductDraftsService],
  exports: [TrendIntelligenceService, ProductDraftsService],
})
export class AffiliateAiOsModule {}
