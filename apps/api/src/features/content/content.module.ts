import { Module } from '@nestjs/common';
import { ArticlePipelineService } from './article-pipeline.service';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  controllers: [ContentController],
  providers: [ContentService, ArticlePipelineService],
  exports: [ContentService, ArticlePipelineService],
})
export class ContentModule {}
