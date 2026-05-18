import { Module } from '@nestjs/common';
import { CoordinatorService } from './coordinator.service';
import { DataAcquisitionModule } from '../data-acquisition/data-acquisition.module';
import { ReviewAnalyzerModule } from '../review-analyzer/review-analyzer.module';
import { VerdictEngineModule } from '../verdict-engine/verdict-engine.module';
import { ContentWriterModule } from '../content-writer/content-writer.module';
import { PublisherModule } from '../publisher/publisher.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { SEOPlannerModule } from '../seo-planner/seo-planner.module';
import { SEOAuditorModule } from '../seo-auditor/seo-auditor.module';
import { QualityGuardModule } from '../quality-guard/quality-guard.module';

@Module({
  imports: [
    DataAcquisitionModule,
    ReviewAnalyzerModule,
    VerdictEngineModule,
    ContentWriterModule,
    PublisherModule,
    DiscoveryModule,
    SEOPlannerModule,
    SEOAuditorModule,
    QualityGuardModule,
  ],
  providers: [CoordinatorService],
  exports: [CoordinatorService],
})
export class CoordinatorModule {}
