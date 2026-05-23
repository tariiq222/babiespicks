import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminAwareThrottlerGuard } from './infrastructure/throttler/admin-aware-throttler.guard';
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
import { SafetyModule } from './infrastructure/safety/safety.module';
import { FeatureFlagsModule } from './infrastructure/feature-flags/feature-flags.module';
import { HealthModule } from './features/health/health.module';
import { ContentModule } from './features/content/content.module';
import { SettingsModule } from './features/settings/settings.module';
import { StoresModule } from './features/stores/stores.module';
import { AuthModule } from './features/auth/auth.module';
import { CircuitBreakerModule } from './infrastructure/circuit-breaker/circuit-breaker.module';
import { NotificationsModule } from './infrastructure/notifications/notifications.module';
import { SocialModule } from './agents/social/social.module';
import { AiOsModule } from './features/ai-os/ai-os.module';
import { AffiliateAiOsModule } from './features/affiliate-ai-os/affiliate-ai-os.module';
import { AnalyticsModule } from './infrastructure/analytics/analytics.module';
import { DifyOrchestrationModule } from './features/dify-orchestration/dify-orchestration.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 30 },
      { name: 'medium', ttl: 60000, limit: 300 },
      { name: 'long', ttl: 3600000, limit: 5000 },
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
    SafetyModule,
    FeatureFlagsModule,
    CoordinatorModule,
    HealthModule,
    ContentModule,
    SettingsModule,
    StoresModule,
    AuthModule,
    CircuitBreakerModule,
    NotificationsModule,
    SocialModule,
    AiOsModule,
    AffiliateAiOsModule,
    AnalyticsModule,
    DifyOrchestrationModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: AdminAwareThrottlerGuard },
  ],
})
export class AppModule {}
