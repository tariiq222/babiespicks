import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { AnalyticsService } from './analytics.service';

@Controller('admin/analytics')
@UseGuards(AdminApiKeyGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('overview')
  overview() {
    return this.service.getOverview();
  }

  @Get('offers/:id')
  offerAnalytics(@Param('id') id: string) {
    return this.service.getOfferAnalytics(id);
  }

  @Get('social/:id')
  socialAnalytics(@Param('id') id: string) {
    return this.service.getSocialAnalytics(id);
  }
}
