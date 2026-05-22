import { Module } from '@nestjs/common';
import { ProductDraftsController } from './product-drafts.controller';
import { ProductDraftsService } from './product-drafts.service';
import { TrendIntelligenceService } from './trend-intelligence.service';
import { TrendSignalsController } from './trend-signals.controller';
import { OfferEnrichmentController, ContentDraftController } from './offer-enrichment.controller';
import { OfferEnrichmentService } from './offer-enrichment.service';
import { ContentDraftService } from './content-draft.service';
import { ReviewWorkspaceController } from './review-workspace.controller';
import { ReviewWorkspaceService } from './review-workspace.service';
import { PublicOfferDraftController } from './public-offer-draft.controller';
import { PublicOfferDraftService } from './public-offer-draft.service';
import { ControlledPublishingController, PublicOffersController } from './controlled-publishing.controller';
import { ControlledPublishingService } from './controlled-publishing.service';
import { SocialDraftController } from './social-draft.controller';
import { SocialDraftService } from './social-draft.service';
import { ScheduledJobsController } from './scheduled-jobs.controller';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { ConnectorController } from './connector.controller';
import { ConnectorService } from './connector.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AutomationRulesController } from './automation-rules.controller';
import { AutomationRulesService } from './automation-rules.service';
import { OsDashboardController } from './os-dashboard.controller';
import { OsDashboardService } from './os-dashboard.service';
import { AiOsModule } from '../ai-os/ai-os.module';

@Module({
  imports: [AiOsModule],
  controllers: [
    ProductDraftsController,
    TrendSignalsController,
    OfferEnrichmentController,
    ContentDraftController,
    ReviewWorkspaceController,
    PublicOfferDraftController,
    ControlledPublishingController,
    PublicOffersController,
    SocialDraftController,
    ScheduledJobsController,
    ConnectorController,
    AnalyticsController,
    AutomationRulesController,
    OsDashboardController,
  ],
  providers: [
    TrendIntelligenceService,
    ProductDraftsService,
    OfferEnrichmentService,
    ContentDraftService,
    ReviewWorkspaceService,
    PublicOfferDraftService,
    ControlledPublishingService,
    SocialDraftService,
    ScheduledJobsService,
    ConnectorService,
    AnalyticsService,
    AutomationRulesService,
    OsDashboardService,
  ],
  exports: [
    TrendIntelligenceService,
    ProductDraftsService,
    OfferEnrichmentService,
    ContentDraftService,
    ReviewWorkspaceService,
    PublicOfferDraftService,
    ControlledPublishingService,
    SocialDraftService,
    ScheduledJobsService,
    ConnectorService,
    AnalyticsService,
    AutomationRulesService,
    OsDashboardService,
  ],
})
export class AffiliateAiOsModule {}
