import { Module } from '@nestjs/common';
import { QualityGuardService } from './quality-guard.service';

@Module({
  providers: [QualityGuardService],
  exports: [QualityGuardService],
})
export class QualityGuardModule {}
