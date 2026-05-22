import { Injectable } from '@nestjs/common';
import { AMAZON_ASSOCIATE_TAG, AMAZON_SA_BASE } from './constants';

@Injectable()
export class AffiliateUrlService {
  /**
   * Checks whether a URL belongs to Amazon.sa domain.
   */
  isAmazonSaUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      return hostname === 'amazon.sa' || hostname === 'www.amazon.sa';
    } catch {
      return false;
    }
  }

  /**
   * Extracts ASIN from various Amazon URL formats.
   * Supported patterns:
   * - /dp/ASIN
   * - /gp/product/ASIN
   * - /product/ASIN
   * - ?asin=ASIN
   */
  extractAmazonAsin(url: string): string | null {
    if (!this.isAmazonSaUrl(url)) {
      return null;
    }

    try {
      const parsed = new URL(url);
      const pathMatch =
        parsed.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
        parsed.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
        parsed.pathname.match(/\/product\/([A-Z0-9]{10})/i);

      if (pathMatch) {
        return pathMatch[1].toUpperCase();
      }

      const asinParam = parsed.searchParams.get('asin');
      if (asinParam && /^[A-Z0-9]{10}$/i.test(asinParam)) {
        return asinParam.toUpperCase();
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Builds a clean Amazon affiliate URL from an ASIN.
   * Rejects non-Amazon.sa URLs.
   */
  buildAmazonAffiliateUrl(sourceUrl: string): string | null {
    if (!this.isAmazonSaUrl(sourceUrl)) {
      return null;
    }

    const asin = this.extractAmazonAsin(sourceUrl);
    if (!asin) {
      return null;
    }

    const affiliateUrl = new URL(`${AMAZON_SA_BASE}/dp/${asin}`);
    affiliateUrl.searchParams.set('tag', AMAZON_ASSOCIATE_TAG);

    return affiliateUrl.toString();
  }
}
