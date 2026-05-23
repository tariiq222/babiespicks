import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { DifyOrchestrationService } from './dify-orchestration.service';
import { DifyAuthGuard } from './dify-auth.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { MarketplaceSearchDto } from './dto/marketplace-search.dto';
import { ProcessProductDto } from './dto/process-product.dto';
import { ok } from './dto/dify-response';

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
}
