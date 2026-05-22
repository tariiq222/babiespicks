import { Module } from '@nestjs/common';
import { LangGraphPocService } from './langgraph-poc.service';
import { ReviewAnalyzerModule } from '../review-analyzer/review-analyzer.module';
import { VerdictEngineModule } from '../verdict-engine/verdict-engine.module';

@Module({
  imports: [ReviewAnalyzerModule, VerdictEngineModule],
  providers: [LangGraphPocService],
  exports: [LangGraphPocService],
})
export class LangGraphPocModule {}
