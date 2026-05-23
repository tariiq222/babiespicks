import { Controller, Get, UseGuards } from '@nestjs/common';
import { DifyOrchestrationService } from './dify-orchestration.service';
import { DifyAuthGuard } from './dify-auth.guard';

@Controller('agents/dify')
export class DifyOrchestrationController {
  constructor(private readonly service: DifyOrchestrationService) {}

  @Get('health')
  health() {
    return { ok: true };
  }
}

@Controller('agents/dify')
@UseGuards(DifyAuthGuard)
export class DifyOrchestrationGuardedController {
  constructor(private readonly service: DifyOrchestrationService) {}
}
