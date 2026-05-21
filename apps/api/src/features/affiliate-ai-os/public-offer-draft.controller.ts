import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { PublicOfferDraftService } from './public-offer-draft.service';
import {
  CreatePublicOfferDraftBodyDto,
  UpdatePublicOfferDraftBodyDto,
  ListPublicOfferDraftsQueryDto,
  PublicOfferDraftTransitionBodyDto,
} from './dto/public-offer-draft.dto';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class PublicOfferDraftController {
  constructor(private readonly service: PublicOfferDraftService) {}

  /** GET /admin/public-offer-drafts — list all public offer drafts */
  @Get('public-offer-drafts')
  async listDrafts(@Query() query: ListPublicOfferDraftsQueryDto) {
    return this.service.listDrafts(query);
  }

  /** GET /admin/public-offer-drafts/:id — get single draft */
  @Get('public-offer-drafts/:id')
  async getDraft(@Param('id') id: string) {
    return this.service.getDraft(id);
  }

  /** POST /admin/content-drafts/:id/create-public-offer-draft — create from APPROVED content draft */
  @Post('content-drafts/:id/create-public-offer-draft')
  async createFromContentDraft(
    @Param('id') contentDraftId: string,
    @Body() body: CreatePublicOfferDraftBodyDto,
  ) {
    return this.service.createFromContentDraft(contentDraftId, body, body.idempotencyKey);
  }

  /** PATCH /admin/public-offer-drafts/:id — update draft fields */
  @Patch('public-offer-drafts/:id')
  async updateDraft(@Param('id') id: string, @Body() body: UpdatePublicOfferDraftBodyDto) {
    return this.service.updateDraft(id, body);
  }

  /** POST /admin/public-offer-drafts/:id/approve — approve (status change only, no publishing) */
  @Post('public-offer-drafts/:id/approve')
  async approveDraft(@Param('id') id: string, @Body() _body: PublicOfferDraftTransitionBodyDto = {}) {
    return this.service.approveDraft(id);
  }

  /** POST /admin/public-offer-drafts/:id/reject — reject draft */
  @Post('public-offer-drafts/:id/reject')
  async rejectDraft(@Param('id') id: string, @Body() _body: PublicOfferDraftTransitionBodyDto = {}) {
    return this.service.rejectDraft(id);
  }
}