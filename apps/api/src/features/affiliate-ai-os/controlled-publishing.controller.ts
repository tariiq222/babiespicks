import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { ControlledPublishingService } from './controlled-publishing.service';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class ControlledPublishingController {
  constructor(private readonly service: ControlledPublishingService) {}

  /** POST /admin/public-offer-drafts/:id/publish — publish an APPROVED draft */
  @Post('public-offer-drafts/:id/publish')
  async publish(@Param('id') id: string, @Body() body: { idempotencyKey?: string }) {
    return this.service.publishPublicOfferDraft(id, body.idempotencyKey);
  }
}
