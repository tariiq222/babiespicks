import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ProductsModule } from './features/products/products.module';
// TODO: Re-enable after fixing better-auth ESM compatibility with NestJS
// import { AuthModule } from './features/auth/auth.module';

@Module({
  imports: [DatabaseModule, ProductsModule],
  controllers: [AppController],
})
export class AppModule {}
