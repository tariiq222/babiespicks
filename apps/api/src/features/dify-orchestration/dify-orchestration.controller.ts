import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { DifyOrchestrationService } from './dify-orchestration.service';
import { DifyAuthGuard } from './dify-auth.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { MarketplaceSearchDto } from './dto/marketplace-search.dto';
import { ProcessProductDto } from './dto/process-product.dto';
import { RunStartDto, RunFinishDto } from './dto/run-lifecycle.dto';
import { ok } from './dto/dify-response';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';

@Controller('agents/dify')
export class DifyOrchestrationController {
  constructor(private readonly service: DifyOrchestrationService) {}

  // health is intentionally unauthenticated (used as Dify pre-flight probe).
  @Get('health')
  health() {
    return { ok: true };
  }
}

@Controller('agents/dify')
@UseGuards(DifyAuthGuard)
@UseInterceptors(IdempotencyInterceptor)
export class DifyOrchestrationGuardedController {
  constructor(private readonly service: DifyOrchestrationService) {}

  @Post('marketplace-search')
  async marketplaceSearch(@Body() dto: MarketplaceSearchDto) {
    return ok(await this.service.searchMarketplace(dto));
  }

  @Post('process-product')
  async processProduct(@Body() dto: ProcessProductDto) {
    return ok(await this.service.processProduct(dto));
  }

  @Post('run-start')
  async runStart(@Body() dto: RunStartDto) {
    return ok(await this.service.startRun(dto));
  }

  @Post('run-finish')
  async runFinish(@Body() dto: RunFinishDto) {
    return ok(await this.service.finishRun(dto));
  }
}

/**
 * Admin-facing Dify endpoints. Guarded by the same AdminApiKeyGuard the rest
 * of the admin surface uses (matched via the admin-proxy in apps/web).
 *
 * Endpoints intentionally NOT under @UseInterceptors(IdempotencyInterceptor)
 * because they are user-driven UI actions, not Dify workflow callbacks.
 */
@Controller('admin/dify')
@UseGuards(AdminApiKeyGuard)
export class DifyOrchestrationAdminController {
  constructor(private readonly service: DifyOrchestrationService) {}

  @Get('runs')
  async listRuns(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 20;
    return this.service.listRuns(Number.isFinite(parsed) ? parsed : 20);
  }

  @Get('runs/:id/products')
  async runProducts(@Param('id') id: string) {
    return this.service.getRunProducts(id);
  }

  @Post('trigger')
  @HttpCode(202)
  async trigger() {
    try {
      return await this.service.triggerWorkflow();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'trigger failed';
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }
}
