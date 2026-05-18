import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArabClicksService } from '../networks/arabclicks.service';

describe('ArabClicksService', () => {
  let service: ArabClicksService;

  beforeEach(() => {
    process.env.ARABCLICKS_PUBLISHER_ID = 'pub123';
    process.env.ARABCLICKS_ADVERTISER_ID = 'adv456';
    service = new ArabClicksService();
  });

  afterEach(() => {
    delete process.env.ARABCLICKS_PUBLISHER_ID;
    delete process.env.ARABCLICKS_ADVERTISER_ID;
  });

  describe('generateDeepLink', () => {
    it('wraps a product URL with ArabClicks tracking params', () => {
      const productUrl = 'https://www.noon.com/sa-en/product/123';
      const result = service.generateDeepLink(productUrl);
      expect(result).toBe(
        `https://arabclicks.com/click?p=pub123&a=adv456&l=${encodeURIComponent(productUrl)}`,
      );
    });

    it('URL-encodes the product URL so query strings survive intact', () => {
      const productUrl = 'https://www.noon.com/sa-en/product?sku=abc&ref=xyz';
      const result = service.generateDeepLink(productUrl);
      expect(result).toContain(encodeURIComponent(productUrl));
      expect(result).not.toContain('?sku='); // raw query string should not appear unencoded in the deep link
    });

    it('uses fallback IDs when env vars are missing', () => {
      delete process.env.ARABCLICKS_PUBLISHER_ID;
      delete process.env.ARABCLICKS_ADVERTISER_ID;
      const fallbackService = new ArabClicksService();
      const result = fallbackService.generateDeepLink('https://noon.com/p/1');
      expect(result).toContain('p=PUBLISHER');
      expect(result).toContain('a=ADVERTISER');
    });
  });

  describe('isArabClicksStore', () => {
    it('returns true when affiliateNetwork is "ArabClicks"', () => {
      expect(service.isArabClicksStore({ affiliateNetwork: 'ArabClicks' })).toBe(true);
    });

    it('returns false when affiliateNetwork is another network', () => {
      expect(service.isArabClicksStore({ affiliateNetwork: 'Admitad' })).toBe(false);
    });

    it('returns false when affiliateNetwork is null', () => {
      expect(service.isArabClicksStore({ affiliateNetwork: null })).toBe(false);
    });
  });
});
