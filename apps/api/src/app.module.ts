import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { DatabaseModule } from './infrastructure/database/database.module';
import { CacheModule } from './infrastructure/cache/cache.module';
import { ProductsModule } from './features/products/products.module';
import { CategoriesModule } from './features/categories/categories.module';
import { AffiliateModule } from './features/affiliate/affiliate.module';
import { SearchModule } from './features/search/search.module';
import { CoordinatorModule } from './agents/coordinator/coordinator.module';
import { CronModule } from './features/cron/cron.module';
import { NewsletterModule } from './features/newsletter/newsletter.module';
import { AdminModule } from './features/admin/admin.module';
import { CouponsModule } from './features/coupons/coupons.module';
import { ImagesModule } from './infrastructure/images/images.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 3 },
      { name: 'medium', ttl: 60000, limit: 100 },
      { name: 'long', ttl: 3600000, limit: 1000 },
    ]),
    DatabaseModule,
    CacheModule,
    ProductsModule,
    CategoriesModule,
    AffiliateModule,
    SearchModule,
    CronModule,
    NewsletterModule,
    AdminModule,
    CouponsModule,
    ImagesModule,
    CoordinatorModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
