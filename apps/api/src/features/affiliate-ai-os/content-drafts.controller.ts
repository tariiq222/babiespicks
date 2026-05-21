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
  ContentDraftTransitionBodyDto,
  CreateContentDraftBodyDto,
  ListContentDraftsQueryDto,
  UpdateContentDraftBodyDto,
} from './phase-2.dto';
import { ContentDraftsService } from './content-drafts.service';

@Controller('admin/affiliate-ai-os/content-drafts')
@UseGuards(AdminApiKeyGuard)
export class ContentDraftsController {
  constructor(private readonly drafts: ContentDraftsService) {}

  /** GET /admin/affiliate-ai-os/content-drafts — list content drafts. */
  @Get()
  async list(@Query() query: ListContentDraftsQueryDto): Promise<unknown> {
    return this.drafts.listDrafts(query);
  }

  /** POST /admin/affiliate-ai-os/content-drafts — create a draft from an offer enrichment. */
  @Post()
  @HttpCode(201)
  async create(
    @Body() body: CreateContentDraftBodyDto,
  ): Promise<unknown> {
    return this.drafts.createDraft(body);
  }

  /** GET /admin/affiliate-ai-os/content-drafts/:id — get a single draft. */
  @Get(':id')
  async get(@Param('id') id: string): Promise<unknown> {
    return this.drafts.getDraft(id);
  }

  /** PATCH /admin/affiliate-ai-os/content-drafts/:id — update editable draft fields. */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateContentDraftBodyDto,
  ): Promise<unknown> {
    return this.drafts.updateDraft(id, body);
  }

  /** POST /admin/affiliate-ai-os/content-drafts/:id/approve — approve the draft. */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Param('id') id: string,
    @Body() body: ContentDraftTransitionBodyDto = {},
  ): Promise<unknown> {
    return this.drafts.approveDraft(id, body);
  }

  /** POST /admin/affiliate-ai-os/content-drafts/:id/reject — reject the draft. */
  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id') id: string,
    @Body() body: ContentDraftTransitionBodyDto = {},
  ): Promise<unknown> {
    return this.drafts.rejectDraft(id, body);
  }
}
