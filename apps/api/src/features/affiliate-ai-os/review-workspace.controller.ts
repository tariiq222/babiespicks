import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe,
} from '@nestjs/common';
import { ReviewWorkspaceService, REVIEW_STATUSES } from './review-workspace.service';

@Controller('admin/review-workspace')
export class ReviewWorkspaceController {
  constructor(private readonly reviewWorkspace: ReviewWorkspaceService) {}

  @Get()
  async listReviewItems(
    @Query('status') status?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    if (status && !REVIEW_STATUSES.includes(status as any)) {
      return { items: [], total: 0, error: `Invalid status. Must be one of: ${REVIEW_STATUSES.join(', ')}` };
    }
    return this.reviewWorkspace.listReviewItems({ status: status as any, limit, offset });
  }

  @Get(':id')
  async getReviewItem(@Param('id') id: string) {
    return this.reviewWorkspace.getReviewItem(id);
  }

  @Post()
  async createReviewItem(@Body('contentDraftId') contentDraftId: string) {
    if (!contentDraftId) {
      return { error: 'contentDraftId is required' };
    }
    return this.reviewWorkspace.createReviewItem(contentDraftId);
  }

  @Patch(':id')
  async updateReviewItem(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true })) body: { reviewNotes?: string; revisionRequested?: boolean },
  ) {
    return this.reviewWorkspace.updateReviewItem(id, body);
  }

  @Post(':id/approve')
  async approveReviewItem(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.reviewWorkspace.approveReviewItem(id, reason);
  }

  @Post(':id/reject')
  async rejectReviewItem(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.reviewWorkspace.rejectReviewItem(id, reason);
  }

  @Post(':id/request-revision')
  async requestRevision(
    @Param('id') id: string,
    @Body('notes') notes: string,
  ) {
    if (!notes) {
      return { error: 'notes is required when requesting revision' };
    }
    return this.reviewWorkspace.requestRevision(id, notes);
  }
}
