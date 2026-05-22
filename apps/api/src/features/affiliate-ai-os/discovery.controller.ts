import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { DiscoveryService } from './discovery.service';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class DiscoveryController {
  constructor(private readonly service: DiscoveryService) {}

  /** POST /admin/discovery/trigger — تشغيل يدوي للـ discovery pipeline */
  @Post('discovery/trigger')
  trigger(@Body() body: { source?: 'amazon' | 'noon' | 'all'; maxProducts?: number }) {
    return this.service.triggerDiscovery(body.source ?? 'all', body.maxProducts ?? 10);
  }

  /** GET /admin/discovery/runs — سجل تشغيلات الـ discovery */
  @Get('discovery/runs')
  getRuns(@Query() q: { limit?: string; offset?: string; source?: string }) {
    return this.service.getRuns({
      limit: q.limit ? Number(q.limit) : 50,
      offset: q.offset ? Number(q.offset) : 0,
      source: q.source,
    });
  }

  /** GET /admin/discovery/trend-signals — المنتجات المرشحة من الاكتشاف */
  @Get('discovery/trend-signals')
  getTrendSignals(@Query() q: { limit?: string; offset?: string; status?: string }) {
    return this.service.getTrendSignals({
      limit: q.limit ? Number(q.limit) : 50,
      offset: q.offset ? Number(q.offset) : 0,
      status: q.status,
    });
  }

  /** GET /admin/discovery/products — المنتجات الناتجة عن الاكتشاف */
  @Get('discovery/products')
  getProducts(@Query() q: { limit?: string; offset?: string; status?: string }) {
    return this.service.getProducts({
      limit: q.limit ? Number(q.limit) : 50,
      offset: q.offset ? Number(q.offset) : 0,
      status: q.status,
    });
  }

  /** GET /admin/discovery/stats — إحصائيات سريعة */
  @Get('discovery/stats')
  getStats() {
    return this.service.getStats();
  }

  /** GET /admin/discovery/config — إعدادات الكورن الحالية */
  @Get('discovery/config')
  getConfig() {
    return this.service.getConfig();
  }

  /** POST /admin/discovery/config — تحديث إعدادات الكورن */
  @Post('discovery/config')
  updateConfig(
    @Body()
    body: {
      amazonCron?: string;
      noonCron?: string;
      maxProducts?: number;
      enabled?: boolean;
    },
  ) {
    return this.service.updateConfig(body);
  }
}