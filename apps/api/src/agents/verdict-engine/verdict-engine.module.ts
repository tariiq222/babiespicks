import { Module } from '@nestjs/common';
import { VerdictEngineService } from './verdict-engine.service';

@Module({
  providers: [VerdictEngineService],
  exports: [VerdictEngineService],
})
export class VerdictEngineModule {}
