import { Body, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { ConnectorService } from './connector.service';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class ConnectorController {
  constructor(private readonly service: ConnectorService) {}

  @Get('connectors')
  list() {
    return this.service.listConnectors();
  }

  @Get('connectors/:platform/health')
  health(@Param('platform') platform: string) {
    return this.service.healthCheck(platform);
  }
}

@Controller('admin/analytics')
@UseGuards(AdminApiKeyGuard)
export class AnalyticsController {
  constructor(private readonly service: ConnectorService) {}

  @Get('summary')
  summary(@Query() q: { from?: string; to?: string }) {
    return this.service.getAnalyticsSummary({ from: q.from, to: q.to });
  }
}
