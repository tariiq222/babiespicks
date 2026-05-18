import { Module } from '@nestjs/common';
import { CoordinatorService } from './coordinator.service';
import { DataAcquisitionModule } from '../data-acquisition/data-acquisition.module';
import { ReviewAnalyzerModule } from '../review-analyzer/review-analyzer.module';
import { VerdictEngineModule } from '../verdict-engine/verdict-engine.module';
import { ContentWriterModule } from '../content-writer/content-writer.module';
import { PublisherModule } from '../publisher/publisher.module';
import { DiscoveryModule } from '../discovery/discovery.module';

@Module({
  imports: [
    DataAcquisitionModule,
    ReviewAnalyzerModule,
    VerdictEngineModule,
    ContentWriterModule,
    PublisherModule,
    DiscoveryModule,
  ],
  providers: [CoordinatorService],
  exports: [CoordinatorService],
})
export class CoordinatorModule {}
