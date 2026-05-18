import { Module } from '@nestjs/common';
import { IndexNowService } from './indexnow.service';
import { SitemapService } from './sitemap.service';
import { TwitterPublisherService } from './twitter-publisher.service';
import { GscIndexingService } from './gsc-indexing.service';

@Module({
  providers: [IndexNowService, SitemapService, TwitterPublisherService, GscIndexingService],
  exports: [IndexNowService, SitemapService, TwitterPublisherService, GscIndexingService],
})
export class PublishingModule {}
