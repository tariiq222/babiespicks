import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { ScheduledJobsService } from './scheduled-jobs.service';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class ScheduledJobsController {
  constructor(private readonly service: ScheduledJobsService) {}

  @Get('scheduled-jobs')
  list(@Query() q: { status?: string; limit?: string; offset?: string }) {
    return this.service.list({
      status: q.status,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }

  @Get('scheduled-jobs/:id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post('scheduled-jobs/:id/pause')
  pause(@Param('id') id: string) {
    return this.service.pause(id);
  }

  @Post('scheduled-jobs/:id/resume')
  resume(@Param('id') id: string) {
    return this.service.resume(id);
  }

  @Post('scheduled-jobs/:id/trigger')
  trigger(@Param('id') id: string, @Body() body: { scheduledFor?: string }) {
    return this.service.trigger(id, body.scheduledFor);
  }
}
