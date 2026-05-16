import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ProductsModule } from './features/products/products.module';
import { AuthModule } from './features/auth/auth.module';

@Module({
  imports: [DatabaseModule, ProductsModule, AuthModule],
  controllers: [AppController],
})
export class AppModule {}
