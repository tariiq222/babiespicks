import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { SERVER_DERIVED_APPROVAL_ACTOR_ID } from '../../infrastructure/approval/approval-audit';
import {
  ProductDraftEvaluationBodyDto,
  ProductDraftPublishBodyDto,
  ListProductDraftsQueryDto,
  ProductDraftTransitionBodyDto,
} from './dto/product-drafts.dto';
import { ProductDraftsService } from './product-drafts.service';

@Controller('admin/product-drafts')
@UseGuards(AdminApiKeyGuard)
export class ProductDraftsController {
  constructor(private readonly drafts: ProductDraftsService) {}

  /** GET /admin/product-drafts — review queue for Affiliate AI OS drafts. */
  @Get()
  async list(@Query() query: ListProductDraftsQueryDto): Promise<unknown> {
    return this.drafts.listDrafts(query);
  }

  /** POST /admin/product-drafts/:id/approve — mark a draft approved without publishing. */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Param('id') id: string,
    @Body() body: ProductDraftTransitionBodyDto = {},
  ): Promise<unknown> {
    return this.drafts.transitionDraft(id, {
      action: 'approve',
      reviewerId: SERVER_DERIVED_APPROVAL_ACTOR_ID,
      idempotencyKey: body.idempotencyKey,
    });
  }

  /** POST /admin/product-drafts/:id/reject — reject a draft with an optional reason. */
  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id') id: string,
    @Body() body: ProductDraftTransitionBodyDto = {},
  ): Promise<unknown> {
    return this.drafts.transitionDraft(id, {
      action: 'reject',
      reviewerId: SERVER_DERIVED_APPROVAL_ACTOR_ID,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
    });
  }

  /** POST /admin/product-drafts/:id/needs-edit — return a draft for curation edits. */
  @Post(':id/needs-edit')
  @HttpCode(200)
  async needsEdit(
    @Param('id') id: string,
    @Body() body: ProductDraftTransitionBodyDto = {},
  ): Promise<unknown> {
    return this.drafts.transitionDraft(id, {
      action: 'needs_edit',
      reviewerId: SERVER_DERIVED_APPROVAL_ACTOR_ID,
      notes: body.notes,
      idempotencyKey: body.idempotencyKey,
    });
  }

  /** POST /admin/product-drafts/:id/evaluate — create or refresh the draft score only. */
  @Post(':id/evaluate')
  @HttpCode(200)
  async evaluate(
    @Param('id') id: string,
    @Body() body: ProductDraftEvaluationBodyDto = {},
  ): Promise<unknown> {
    return this.drafts.evaluateDraft(id, {
      aiRunId: body.aiRunId,
      idempotencyKey: body.idempotencyKey,
    });
  }

  /** POST /admin/product-drafts/:id/publish — publish an approved and scored draft. */
  @Post(':id/publish')
  @HttpCode(200)
  async publish(
    @Param('id') id: string,
    @Body() body: ProductDraftPublishBodyDto = {},
  ): Promise<unknown> {
    return this.drafts.publishApprovedDraft(id, {
      actorId: SERVER_DERIVED_APPROVAL_ACTOR_ID,
      idempotencyKey: body.idempotencyKey,
    });
  }
}
