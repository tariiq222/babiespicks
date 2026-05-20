import { Module } from '@nestjs/common';
import { IndexNowService } from './indexnow.service';
import { SitemapService } from './sitemap.service';
import { TwitterPublisherService } from './twitter-publisher.service';
import { TelegramPublisherService } from './telegram-publisher.service';
import { GscIndexingService } from './gsc-indexing.service';

@Module({
  providers: [IndexNowService, SitemapService, TwitterPublisherService, TelegramPublisherService, GscIndexingService],
  exports: [IndexNowService, SitemapService, TwitterPublisherService, TelegramPublisherService, GscIndexingService],
})
export class PublishingModule {}
