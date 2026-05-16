import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ProductsModule } from './features/products/products.module';
import { CoordinatorModule } from './agents/coordinator/coordinator.module';

@Module({
  imports: [
    DatabaseModule,
    ProductsModule,
    CoordinatorModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
