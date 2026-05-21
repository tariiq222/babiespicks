import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { OsDashboardService } from './os-dashboard.service';

@Controller('admin/affiliate-os')
@UseGuards(AdminApiKeyGuard)
export class OsDashboardController {
  constructor(private readonly service: OsDashboardService) {}

  @Get('overview')
  overview() {
    return this.service.getOverview();
  }

  @Get('activity')
  activity(@Query() q: { limit?: string }) {
    return this.service.getActivity({ limit: q.limit ? parseInt(q.limit, 10) : undefined });
  }

  @Get('risks')
  risks() {
    return this.service.getRisks();
  }

  @Get('pending-actions')
  pendingActions() {
    return this.service.getPendingActions();
  }
}
