import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { SocialDraftService } from './social-draft.service';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class SocialDraftController {
  constructor(private readonly service: SocialDraftService) {}

  @Get('social-drafts')
  list(@Query() q: { platform?: string; status?: string; limit?: string; offset?: string }) {
    return this.service.listDrafts({
      platform: q.platform,
      status: q.status,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }

  @Get('social-drafts/:id')
  get(@Param('id') id: string) {
    return this.service.getDraft(id);
  }

  @Patch('social-drafts/:id')
  update(@Param('id') id: string, @Body() body: { content?: unknown; hashtags?: string[]; scheduledAt?: string | null }) {
    return this.service.updateDraft(id, body);
  }

  @Post('social-drafts/:id/approve')
  approve(@Param('id') id: string) {
    return this.service.approveDraft(id);
  }

  @Post('social-drafts/:id/schedule')
  schedule(@Param('id') id: string, @Body() body: { scheduledAt: string }) {
    return this.service.scheduleDraft(id, body.scheduledAt);
  }

  @Post('social-drafts/:id/publish')
  publish(@Param('id') id: string) {
    return this.service.publishDraft(id);
  }
}
