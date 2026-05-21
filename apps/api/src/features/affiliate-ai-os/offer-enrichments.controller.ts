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
  CreateOfferEnrichmentBodyDto,
  ListOfferEnrichmentsQueryDto,
  UpdateOfferEnrichmentBodyDto,
} from './phase-2.dto';
import { OfferEnrichmentsService } from './offer-enrichments.service';

@Controller('admin/affiliate-ai-os/offer-enrichments')
@UseGuards(AdminApiKeyGuard)
export class OfferEnrichmentsController {
  constructor(private readonly enrichments: OfferEnrichmentsService) {}

  /** GET /admin/affiliate-ai-os/offer-enrichments — list offer enrichments. */
  @Get()
  async list(@Query() query: ListOfferEnrichmentsQueryDto): Promise<unknown> {
    return this.enrichments.listEnrichments(query);
  }

  /** POST /admin/affiliate-ai-os/offer-enrichments — create an enrichment for an APPROVED ProductDraft. */
  @Post()
  @HttpCode(201)
  async create(
    @Body() body: CreateOfferEnrichmentBodyDto,
  ): Promise<unknown> {
    return this.enrichments.createEnrichment(body);
  }

  /** GET /admin/affiliate-ai-os/offer-enrichments/:id — get a single enrichment. */
  @Get(':id')
  async get(@Param('id') id: string): Promise<unknown> {
    return this.enrichments.getEnrichment(id);
  }

  /** PATCH /admin/affiliate-ai-os/offer-enrichments/:id — update enrichment fields. */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateOfferEnrichmentBodyDto,
  ): Promise<unknown> {
    return this.enrichments.updateEnrichment(id, body);
  }
}
