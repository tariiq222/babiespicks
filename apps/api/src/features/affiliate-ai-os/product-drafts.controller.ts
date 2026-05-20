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
import { SERVER_DERIVED_APPROVAL_ACTOR_ID } from '../../infrastructure/approval/approval-audit';
import {
  CreateProductDraftFromTrendSignalBodyDto,
  ProductDraftEvaluationBodyDto,
  ListProductDraftsQueryDto,
  ProductDraftTransitionBodyDto,
  UpdateProductDraftBodyDto,
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

  /** GET /admin/product-drafts/:id — inspect a draft before approval. */
  @Get(':id')
  async get(@Param('id') id: string): Promise<unknown> {
    return this.drafts.getDraft(id);
  }

  /** POST /admin/product-drafts/from-trend-signal — queue a draft from a trend signal. */
  @Post('from-trend-signal')
  @HttpCode(201)
  async createFromTrendSignal(
    @Body() body: CreateProductDraftFromTrendSignalBodyDto,
  ): Promise<unknown> {
    return this.drafts.createDraftFromSignal(body.trendSignalId);
  }

  /** PATCH /admin/product-drafts/:id — edit a draft before approval. */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateProductDraftBodyDto,
  ): Promise<unknown> {
    return this.drafts.updateDraft(id, body);
  }

  /**
   * POST /admin/product-drafts/:id/approve — human approval gate.
   * Phase 1 only records approval and never publishes public products.
   */
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

}
