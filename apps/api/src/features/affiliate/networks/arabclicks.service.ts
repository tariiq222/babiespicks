import { Injectable } from '@nestjs/common';

export interface ArabClicksStore {
  affiliateNetwork: string | null;
}

@Injectable()
export class ArabClicksService {
  private readonly publisherId: string;
  private readonly advertiserId: string;

  constructor() {
    this.publisherId = process.env.ARABCLICKS_PUBLISHER_ID ?? 'PUBLISHER';
    this.advertiserId = process.env.ARABCLICKS_ADVERTISER_ID ?? 'ADVERTISER';
  }

  /**
   * Wraps a product URL in an ArabClicks deep link for attribution tracking.
   * Format: https://arabclicks.com/click?p=PUBLISHER_ID&a=ADVERTISER_ID&l=PRODUCT_URL
   */
  generateDeepLink(productUrl: string): string {
    const encoded = encodeURIComponent(productUrl);
    return `https://arabclicks.com/click?p=${this.publisherId}&a=${this.advertiserId}&l=${encoded}`;
  }

  /**
   * Returns true if the store's affiliate network is ArabClicks.
   */
  isArabClicksStore(store: ArabClicksStore): boolean {
    return store.affiliateNetwork === 'ArabClicks';
  }
}
