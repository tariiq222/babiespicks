import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { AffiliateDiscoveryService } from './services/affiliate-discovery.service';
import { TriggerDiscoveryDto } from './dto/affiliate-discovery.dto';
import { DiscoverySource } from './dto/affiliate-discovery.dto';

@Controller('admin/affiliate-discovery')
export class AffiliateDiscoveryController {
  constructor(private readonly service: AffiliateDiscoveryService) {}

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  async trigger(@Body() dto: TriggerDiscoveryDto) {
    const result = await this.service.triggerAndGetResults(dto.query, dto.source ?? DiscoverySource.Amazon);
    return result;
  }

  @Get('status/:runId')
  getStatus(@Param('runId') runId: string): { status: string } {
    return this.service.getRunStatus(runId);
  }

  @Get('results/:runId')
  getResults(@Param('runId') runId: string): { error?: string } {
    const results = this.service.getRunResults(runId);
    if (results === null) {
      return { error: 'Run not found' };
    }
    return results as { error?: string };
  }
}
