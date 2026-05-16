import { Module } from '@nestjs/common';
import { ReviewAnalyzerService } from './review-analyzer.service';

@Module({
  providers: [ReviewAnalyzerService],
  exports: [ReviewAnalyzerService],
})
export class ReviewAnalyzerModule {}
