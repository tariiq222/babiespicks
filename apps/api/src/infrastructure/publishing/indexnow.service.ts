import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class IndexNowService {
  private readonly logger = new Logger(IndexNowService.name);

  private get key(): string | undefined {
    return process.env.INDEXNOW_KEY;
  }

  private get siteUrl(): string {
    return process.env.SITE_URL ?? 'https://babiespicks.com';
  }

  /**
   * Notify Bing via IndexNow protocol about updated URLs.
   */
  async notifyBing(urls: string[]): Promise<void> {
    if (!this.key) {
      this.logger.warn('INDEXNOW_KEY not set — skipping IndexNow Bing notification');
      return;
    }

    if (urls.length === 0) {
      return;
    }

    const host = new URL(this.siteUrl).hostname;

    try {
      const body = JSON.stringify({
        host,
        key: this.key,
        keyLocation: `${this.siteUrl}/${this.key}.txt`,
        urlList: urls,
      });

      const response = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body,
      });

      if (!response.ok) {
        this.logger.warn(`IndexNow Bing responded with ${response.status} for ${urls.length} URLs`);
      } else {
        this.logger.log(`IndexNow Bing notified — ${urls.length} URL(s)`);
      }
    } catch (error) {
      this.logger.error(`IndexNow Bing notification failed: ${(error as Error).message}`);
    }
  }

  /**
   * Notify all supported IndexNow search engines (Bing, Yandex share the same protocol).
   */
  async notifyAll(urls: string[]): Promise<void> {
    // Bing and Yandex both accept submissions at api.indexnow.org
    await this.notifyBing(urls);
  }
}
