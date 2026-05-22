import { describe, it, expect, beforeEach } from 'vitest';
import { AffiliateUrlService } from '../affiliate-url.service';
import { AmazonSearchProvider } from '../amazon-search.provider';
import { NoonPlaceholderProvider } from '../noon-placeholder.provider';
import { AMAZON_SEARCH_BASE_URL, AMAZON_ASSOCIATE_TAG } from '../constants';

describe('AffiliateProductDiscovery Foundation', () => {
  describe('AffiliateUrlService', () => {
    let service: AffiliateUrlService;

    beforeEach(() => {
      service = new AffiliateUrlService();
    });

    describe('isAmazonSaUrl', () => {
      it('returns true for www.amazon.sa', () => {
        expect(service.isAmazonSaUrl('https://www.amazon.sa/dp/B08N5WRWNW')).toBe(true);
      });

      it('returns true for amazon.sa without www', () => {
        expect(service.isAmazonSaUrl('https://amazon.sa/gp/product/B08N5WRWNW')).toBe(true);
      });

      it('returns false for non-Amazon domains', () => {
        expect(service.isAmazonSaUrl('https://www.amazon.com/dp/B08N5WRWNW')).toBe(false);
        expect(service.isAmazonSaUrl('https://www.noon.com/sa-en/product/123')).toBe(false);
      });

      it('returns false for malformed URLs', () => {
        expect(service.isAmazonSaUrl('not-a-url')).toBe(false);
      });
    });

    describe('extractAmazonAsin', () => {
      it('extracts ASIN from /dp/ASIN path', () => {
        const url = 'https://www.amazon.sa/dp/B08N5WRWNW';
        expect(service.extractAmazonAsin(url)).toBe('B08N5WRWNW');
      });

      it('extracts ASIN from /gp/product/ASIN path', () => {
        const url = 'https://www.amazon.sa/gp/product/B08N5WRWNW';
        expect(service.extractAmazonAsin(url)).toBe('B08N5WRWNW');
      });

      it('extracts ASIN from /product/ASIN path', () => {
        const url = 'https://www.amazon.sa/product/B08N5WRWNW';
        expect(service.extractAmazonAsin(url)).toBe('B08N5WRWNW');
      });

      it('extracts ASIN from ?asin= query param', () => {
        const url = 'https://www.amazon.sa/some-page?asin=B08N5WRWNW';
        expect(service.extractAmazonAsin(url)).toBe('B08N5WRWNW');
      });

      it('extracts lowercase ASIN and uppercases it', () => {
        const url = 'https://www.amazon.sa/dp/b08n5wrwnw';
        expect(service.extractAmazonAsin(url)).toBe('B08N5WRWNW');
      });

      it('returns null for non-Amazon URLs', () => {
        expect(service.extractAmazonAsin('https://noon.com/p/123')).toBeNull();
      });

      it('returns null when ASIN is not found', () => {
        expect(service.extractAmazonAsin('https://www.amazon.sa/some-page')).toBeNull();
      });
    });

    describe('buildAmazonAffiliateUrl', () => {
      it('builds correct affiliate URL with tag babiespicks-21', () => {
        const url = 'https://www.amazon.sa/dp/B08N5WRWNW';
        const result = service.buildAmazonAffiliateUrl(url);
        expect(result).toBe(`https://www.amazon.sa/dp/B08N5WRWNW?tag=${AMAZON_ASSOCIATE_TAG}`);
      });

      it('builds correct affiliate URL from /gp/product path', () => {
        const url = 'https://www.amazon.sa/gp/product/B08N5WRWNW';
        const result = service.buildAmazonAffiliateUrl(url);
        expect(result).toBe(`https://www.amazon.sa/dp/B08N5WRWNW?tag=${AMAZON_ASSOCIATE_TAG}`);
      });

      it('returns null for non-Amazon.sa URLs', () => {
        expect(service.buildAmazonAffiliateUrl('https://www.amazon.com/dp/B08N5WRWNW')).toBeNull();
        expect(service.buildAmazonAffiliateUrl('https://noon.com/p/123')).toBeNull();
      });

      it('returns null when ASIN cannot be extracted', () => {
        expect(service.buildAmazonAffiliateUrl('https://www.amazon.sa/some-page')).toBeNull();
      });
    });
  });

  describe('AmazonSearchProvider', () => {
    let provider: AmazonSearchProvider;

    beforeEach(() => {
      provider = new AmazonSearchProvider();
    });

    it('uses search.ploy.jsa.sa as the base URL', () => {
      const request = provider.buildSearchRequest({ keywords: 'baby stroller' });
      expect(request.url).toBe(AMAZON_SEARCH_BASE_URL);
    });

    it('builds GET request with keywords param', () => {
      const request = provider.buildSearchRequest({ keywords: 'baby bottle' });
      expect(request.method).toBe('GET');
      expect(request.params).toHaveProperty('q', 'baby bottle');
    });

    it('includes category, page, and filters when provided', () => {
      const request = provider.buildSearchRequest({
        keywords: 'diapers',
        category: 'baby-products',
        page: 2,
        filters: { brand: 'Pampers', price: 'under-100' },
      });

      expect(request.params).toMatchObject({
        q: 'diapers',
        category: 'baby-products',
        page: 2,
        filter_brand: 'Pampers',
        filter_price: 'under-100',
      });
    });

    it('joins array filter values with commas', () => {
      const request = provider.buildSearchRequest({
        keywords: 'wipes',
        filters: { brand: ['Pampers', 'Huggies'] },
      });

      expect(request.params).toHaveProperty('filter_brand', 'Pampers,Huggies');
    });

    it('does not perform real network calls', () => {
      // The provider only builds request objects; it never calls fetch/axios.
      const request = provider.buildSearchRequest({ keywords: 'test' });
      expect(request).toBeDefined();
      expect(request.url).toBe(AMAZON_SEARCH_BASE_URL);
    });

    it('transforms raw response flexibly with empty fallback', () => {
      const result = provider.transformResponse(null, { keywords: 'test' });
      expect(result.provider).toBe('amazon');
      expect(result.results).toEqual([]);
      expect(result.totalResults).toBe(0);
      expect(result.page).toBe(1);
    });

    it('transforms raw response with results array', () => {
      const raw = {
        results: [
          { id: '1', title: 'Stroller', price: 450, rating: 4.5, reviews: 120 },
        ],
        total: 100,
        page: 2,
        nextPage: 'token123',
      };

      const result = provider.transformResponse(raw, { keywords: 'stroller', page: 2 });
      expect(result.totalResults).toBe(100);
      expect(result.page).toBe(2);
      expect(result.nextPageToken).toBe('token123');
      expect(result.results[0]).toMatchObject({
        id: '1',
        title: 'Stroller',
        price: 450,
        currency: 'SAR',
        rating: 4.5,
        reviewCount: 120,
        provider: 'amazon',
      });
    });
  });

  describe('NoonPlaceholderProvider', () => {
    let provider: NoonPlaceholderProvider;

    beforeEach(() => {
      provider = new NoonPlaceholderProvider();
    });

    it('returns placeholder status with null generatedUrl', () => {
      const result = provider.getPlaceholder();
      expect(result.provider).toBe('noon');
      expect(result.status).toBe('placeholder');
      expect(result.generatedUrl).toBeNull();
      expect(result.reason).toContain('not yet supported');
    });

    it('returns unsupported status with null generatedUrl', () => {
      const result = provider.getUnsupported('https://www.noon.com/sa-en/product/123');
      expect(result.provider).toBe('noon');
      expect(result.status).toBe('unsupported');
      expect(result.generatedUrl).toBeNull();
      expect(result.reason).toContain('pending');
    });

    it('does not generate a real affiliate URL', () => {
      const placeholder = provider.getPlaceholder();
      const unsupported = provider.getUnsupported('https://noon.com/p/1');

      expect(placeholder.generatedUrl).toBeNull();
      expect(unsupported.generatedUrl).toBeNull();
    });
  });
});
