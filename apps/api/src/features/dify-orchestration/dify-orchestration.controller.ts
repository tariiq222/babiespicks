import { Controller, Get } from '@nestjs/common';
import { DifyOrchestrationService } from './dify-orchestration.service';

@Controller('agents/dify')
export class DifyOrchestrationController {
  constructor(private readonly service: DifyOrchestrationService) {}

  @Get('health')
  health() {
    return { ok: true };
  }
}
