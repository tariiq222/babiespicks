import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AiRunType } from '@prisma/client';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { OsDashboardService } from './os-dashboard.service';
import { AiOsService } from '../ai-os/ai-os.service';

const ALLOWED_TRIGGERS: Record<string, { type: AiRunType; name: string; input: Record<string, unknown> }> = {
  amazon_discovery: { type: AiRunType.DISCOVERY, name: 'manual:amazon-discovery', input: { source: 'amazon-sa', triggeredBy: 'admin' } },
  noon_discovery: { type: AiRunType.DISCOVERY, name: 'manual:noon-discovery', input: { source: 'noon-sa', triggeredBy: 'admin' } },
  product_pipeline: { type: AiRunType.PRODUCT_PIPELINE, name: 'manual:product-pipeline', input: { triggeredBy: 'admin' } },
  content_pipeline: { type: AiRunType.CONTENT_PIPELINE, name: 'manual:content-pipeline', input: { triggeredBy: 'admin' } },
};

@Controller('admin/affiliate-os')
@UseGuards(AdminApiKeyGuard)
export class OsDashboardController {
  constructor(
    private readonly service: OsDashboardService,
    private readonly aiOs: AiOsService,
  ) {}

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

  /** POST /admin/affiliate-os/trigger — manually trigger a pipeline run (admin-only). */
  @Post('trigger')
  async trigger(@Body() body: { kind?: string }) {
    const cfg = ALLOWED_TRIGGERS[body?.kind ?? ''];
    if (!cfg) {
      throw new BadRequestException(
        `Unknown trigger kind. Allowed: ${Object.keys(ALLOWED_TRIGGERS).join(', ')}`,
      );
    }
    const run = await this.aiOs.createRun({ type: cfg.type, name: cfg.name, input: cfg.input });
    await this.aiOs.enqueueRun(run.id);
    return { success: true, runId: run.id, kind: body.kind };
  }
}
