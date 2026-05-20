import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import {
  CreateManualTrendSignalBodyDto,
  ListTrendSignalsQueryDto,
} from './dto/trend-intelligence.dto';
import { TrendIntelligenceService } from './trend-intelligence.service';

@Controller('admin/trend-signals')
@UseGuards(AdminApiKeyGuard)
export class TrendSignalsController {
  constructor(private readonly trends: TrendIntelligenceService) {}

  /** GET /admin/trend-signals — bounded admin review list for Phase 1. */
  @Get()
  async list(@Query() query: ListTrendSignalsQueryDto): Promise<unknown> {
    return this.trends.listSignals(query);
  }

  /** GET /admin/trend-signals/:id — inspect a single signal before drafting. */
  @Get(':id')
  async get(@Param('id') id: string): Promise<unknown> {
    return this.trends.getSignal(id);
  }

  /** POST /admin/trend-signals — manual signal intake; never publishes. */
  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateManualTrendSignalBodyDto): Promise<unknown> {
    return this.trends.createManualSignal(body);
  }
}
