import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import {
  OfferEnrichmentUpdateBodyDto,
  EnrichProductDraftBodyDto,
  GenerateContentBodyDto,
  ListOfferEnrichmentsQueryDto,
} from './dto/offer-enrichment.dto';
import { OfferEnrichmentService } from './offer-enrichment.service';
import { ContentDraftService } from './content-draft.service';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class OfferEnrichmentController {
  constructor(private readonly enrichment: OfferEnrichmentService) {}

  /** GET /admin/offer-enrichments — list all enrichment records */
  @Get('offer-enrichments')
  async listEnrichments(@Query() query: ListOfferEnrichmentsQueryDto): Promise<unknown> {
    return this.enrichment.listEnrichments(query);
  }

  /** GET /admin/offer-enrichments/:id — inspect a single enrichment */
  @Get('offer-enrichments/:id')
  async getEnrichment(@Param('id') id: string): Promise<unknown> {
    return this.enrichment.getEnrichment(id);
  }

  /** PATCH /admin/offer-enrichments/:id — update enrichment fields */
  @Patch('offer-enrichments/:id')
  async updateEnrichment(
    @Param('id') id: string,
    @Body() body: OfferEnrichmentUpdateBodyDto,
  ): Promise<unknown> {
    return this.enrichment.updateEnrichment(id, body);
  }

  /**
   * POST /admin/product-drafts/:id/enrich — create/refresh enrichment from APPROVED draft.
   * Phase 2 entrypoint after draft approval.
   */
  @Post('product-drafts/:id/enrich')
  @HttpCode(200)
  async enrichDraft(
    @Param('id') id: string,
    @Body() body: EnrichProductDraftBodyDto = {},
  ): Promise<unknown> {
    return this.enrichment.enrichDraft(id, {
      idempotencyKey: body.idempotencyKey,
    });
  }

  /**
   * POST /admin/offer-enrichments/:id/generate-content — create content drafts.
   * Phase 2 step after enrichment.
   */
  @Post('offer-enrichments/:id/generate-content')
  @HttpCode(200)
  async generateContent(
    @Param('id') id: string,
    @Body() body: GenerateContentBodyDto = {},
  ): Promise<unknown> {
    return this.enrichment.generateContentDrafts(id, {
      idempotencyKey: body.idempotencyKey,
    });
  }

  /**
   * POST /admin/offer-enrichments/:id/create-offer
   * Shortcut: skip the content-drafts review stage and create a PublicOfferDraft
   * directly from the enrichment. Used when only the on-site offer page is needed.
   */
  @Post('offer-enrichments/:id/create-offer')
  @HttpCode(200)
  async createOfferDirect(@Param('id') id: string): Promise<unknown> {
    return this.enrichment.createPublicOfferDraftDirect(id);
  }
}

@Controller('admin/content-drafts')
@UseGuards(AdminApiKeyGuard)
export class ContentDraftController {
  constructor(private readonly drafts: ContentDraftService) {}

  /** GET /admin/content-drafts — list content drafts */
  @Get()
  async listDrafts(@Query() query: any): Promise<unknown> {
    return this.drafts.listDrafts(query);
  }

  /** GET /admin/content-drafts/:id — inspect a single draft */
  @Get(':id')
  async getDraft(@Param('id') id: string): Promise<unknown> {
    return this.drafts.getDraft(id);
  }

  /** PATCH /admin/content-drafts/:id — edit draft fields */
  @Patch(':id')
  async updateDraft(
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<unknown> {
    return this.drafts.updateDraft(id, body);
  }

  /**
   * POST /admin/content-drafts/:id/approve — approve content.
   * Does NOT publish or schedule - approval only changes status.
   */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Param('id') id: string,
    @Body() body: any = {},
  ): Promise<unknown> {
    return this.drafts.approveDraft(id, {
      idempotencyKey: body.idempotencyKey,
      reason: body.reason,
    });
  }

  /** POST /admin/content-drafts/:id/reject — reject content */
  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id') id: string,
    @Body() body: any = {},
  ): Promise<unknown> {
    return this.drafts.rejectDraft(id, {
      idempotencyKey: body.idempotencyKey,
      reason: body.reason,
    });
  }
}