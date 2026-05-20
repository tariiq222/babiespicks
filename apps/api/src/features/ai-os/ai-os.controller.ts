import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AiOsService } from './ai-os.service';
import { ListRunsDto, CreateRunDto, CancelRunDto } from './dto/ai-os.dto';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';

@Controller('admin/ai-os')
@UseGuards(AdminApiKeyGuard)
export class AiOsController {
  constructor(private readonly aiOs: AiOsService) {}

  /**
   * GET /admin/ai-os/overview
   * Unified stats combining new AiRun data and legacy AgentJob counts.
   */
  @Get('overview')
  async getOverview() {
    return this.aiOs.getOverview();
  }

  /**
   * GET /admin/ai-os/runs
   * Paginated list of AI runs with optional type/status filters.
   */
  @Get('runs')
  async listRuns(@Query() query: ListRunsDto) {
    return this.aiOs.listRuns(query);
  }

  /**
   * GET /admin/ai-os/runs/:id
   * Full detail of a single run including steps, artifacts, events, approvals.
   */
  @Get('runs/:id')
  async getRun(@Param('id') id: string) {
    return this.aiOs.getRun(id);
  }

  /**
   * POST /admin/ai-os/runs
   * Create a manual run record in PENDING state. No execution in Phase 1.
   */
  @Post('runs')
  async createRun(@Body() body: CreateRunDto) {
    return this.aiOs.createRun(body);
  }

  /**
   * PATCH /admin/ai-os/runs/:id/cancel
   * Cancel a run by setting its status to CANCELLED. Status-only, no execution interruption.
   */
  @Patch('runs/:id/cancel')
  async cancelRun(@Param('id') id: string, @Body() _body: CancelRunDto) {
    return this.aiOs.cancelRun(id);
  }

  /**
   * POST /admin/ai-os/runs/:id/enqueue
   * Enqueue a PENDING run for worker processing.
   * Moves the run through: PENDING -> (worker) -> RUNNING -> COMPLETED.
   */
  @Post('runs/:id/enqueue')
  async enqueueRun(@Param('id') id: string) {
    await this.aiOs.enqueueRun(id);
    return { success: true, message: 'Run enqueued', runId: id };
  }
}
