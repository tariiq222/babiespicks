import { Injectable } from '@nestjs/common';

@Injectable()
export class NoonAffiliateService {
  private readonly affiliateCode = process.env.NOON_AFFILIATE_CODE || '';

  generateAffiliateUrl(productUrl: string): string {
    if (!this.affiliateCode || !productUrl) return productUrl;

    // Only handle Noon URLs
    if (!this.isNoonUrl(productUrl)) return productUrl;

    // Build deep link: s.noon.com/{code}?url={encoded_product_url}
    const baseUrl = `https://s.noon.com/${this.affiliateCode}`;
    return `${baseUrl}?url=${encodeURIComponent(productUrl)}`;
  }

  isNoonUrl(url: string): boolean {
    return url.includes('noon.com');
  }

  isNoonStore(store: { affiliateNetwork?: string | null; slug?: string }): boolean {
    return store.affiliateNetwork === 'Noon' || store.slug === 'noon';
  }
}
