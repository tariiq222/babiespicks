import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { ControlledPublishingService } from './controlled-publishing.service';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class ControlledPublishingController {
  constructor(private readonly service: ControlledPublishingService) {}

  @Post('public-offer-drafts/:id/publish')
  publish(@Param('id') id: string, @Body() body: { idempotencyKey?: string }) {
    return this.service.publishPublicOfferDraft(id, body?.idempotencyKey);
  }

  @Get('public-offers')
  list(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.listPublicOffers(
      limit ? Math.min(parseInt(limit, 10) || 50, 200) : 50,
      offset ? parseInt(offset, 10) || 0 : 0,
    );
  }

  @Post('public-offers/:id/unpublish')
  unpublish(@Param('id') id: string) {
    return this.service.unpublishPublicOffer(id);
  }
}

@Controller('public/offers')
export class PublicOffersController {
  constructor(private readonly service: ControlledPublishingService) {}

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.service.getPublicOfferBySlug(slug);
  }
}
