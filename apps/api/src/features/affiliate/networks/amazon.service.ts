import { Injectable } from '@nestjs/common';

export interface AmazonStore {
  affiliateNetwork: string | null;
}

@Injectable()
export class AmazonAssociatesService {
  private readonly tag: string;

  constructor() {
    this.tag = process.env.AMAZON_ASSOCIATES_TAG || '';
  }

  /**
   * Appends the Amazon Associates tag to any Amazon product URL.
   * Works for both amazon.sa and amazon.com URLs.
   * If the URL already has a tag param it is replaced.
   */
  generateAffiliateUrl(productUrl: string): string {
    if (!this.tag || !productUrl) return productUrl;

    if (!this.isAmazonUrl(productUrl)) {
      return productUrl;
    }

    try {
      const url = new URL(productUrl);
      url.searchParams.set('tag', this.tag);
      return url.toString();
    } catch {
      // Malformed URL — return as-is
      return productUrl;
    }
  }

  /**
   * Returns true if the URL belongs to an Amazon domain.
   */
  isAmazonUrl(url: string): boolean {
    return url.includes('amazon.sa') || url.includes('amazon.com');
  }

  /**
   * Returns true if the store's affiliate network is Amazon Associates.
   */
  isAmazonStore(store: AmazonStore): boolean {
    return store.affiliateNetwork === 'Amazon Associates';
  }
}
