import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ProductsModule } from './features/products/products.module';
import { AffiliateModule } from './features/affiliate/affiliate.module';
import { SearchModule } from './features/search/search.module';
import { CoordinatorModule } from './agents/coordinator/coordinator.module';
import { CronModule } from './features/cron/cron.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 3 },
      { name: 'medium', ttl: 60000, limit: 100 },
      { name: 'long', ttl: 3600000, limit: 1000 },
    ]),
    DatabaseModule,
    ProductsModule,
    AffiliateModule,
    SearchModule,
    CronModule,
    CoordinatorModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
