import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ProductsModule } from './features/products/products.module';
import { DataAcquisitionModule } from './agents/data-acquisition/data-acquisition.module';
import { ReviewAnalyzerModule } from './agents/review-analyzer/review-analyzer.module';
import { VerdictEngineModule } from './agents/verdict-engine/verdict-engine.module';
import { ContentWriterModule } from './agents/content-writer/content-writer.module';

@Module({
  imports: [
    DatabaseModule,
    ProductsModule,
    DataAcquisitionModule,
    ReviewAnalyzerModule,
    VerdictEngineModule,
    ContentWriterModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
