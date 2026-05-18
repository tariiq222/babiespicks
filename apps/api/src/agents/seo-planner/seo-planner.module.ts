import { Module } from '@nestjs/common';
import { SEOPlannerService } from './seo-planner.service';

@Module({
  providers: [SEOPlannerService],
  exports: [SEOPlannerService],
})
export class SEOPlannerModule {}
