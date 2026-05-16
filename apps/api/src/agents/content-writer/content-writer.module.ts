import { Module } from '@nestjs/common';
import { ContentWriterService } from './content-writer.service';

@Module({
  providers: [ContentWriterService],
  exports: [ContentWriterService],
})
export class ContentWriterModule {}
