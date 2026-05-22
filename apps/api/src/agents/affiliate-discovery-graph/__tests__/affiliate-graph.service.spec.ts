import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AffiliateGraphService } from '../affiliate-graph.service';
import type { AmazonSearchProvider } from '../../../features/affiliate-product-discovery/amazon-search.provider';
import type { AffiliateUrlService } from '../../../features/affiliate-product-discovery/affiliate-url.service';

describe('AffiliateGraphService', () => {
  let service: AffiliateGraphService;
  let amazonSearchProvider: {
    buildSearchRequest: ReturnType<typeof vi.fn>;
    transformResponse: ReturnType<typeof vi.fn>;
  };
  let affiliateUrlService: {
    isAmazonSaUrl: ReturnType<typeof vi.fn>;
    extractAmazonAsin: ReturnType<typeof vi.fn>;
    buildAmazonAffiliateUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    amazonSearchProvider = {
      buildSearchRequest: vi.fn(),
      transformResponse: vi.fn(),
    };

    affiliateUrlService = {
      isAmazonSaUrl: vi.fn(),
      extractAmazonAsin: vi.fn(),
      buildAmazonAffiliateUrl: vi.fn(),
    };

    service = new AffiliateGraphService(
      amazonSearchProvider as unknown as AmazonSearchProvider,
      affiliateUrlService as unknown as AffiliateUrlService,
    );
  });

  describe('skipped mode', () => {
    it('should return a clean skipped state when enabled=false', async () => {
      const input = {
        query: { keywords: 'baby stroller' },
        source: 'test-source',
        provider: 'amazon' as const,
        enabled: false,
      };

      const result = await service.run(input);

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Graph is disabled (shadow mode)');
      expect(result.searchResults).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.query.keywords).toBe('baby stroller');
      expect(result.provider).toBe('amazon');
    });

    it('should default to amazon provider when not specified', async () => {
      const input = {
        query: { keywords: 'baby bottle' },
        source: 'test-source',
        enabled: false,
      };

      const result = await service.run(input);

      expect(result.provider).toBe('amazon');
    });
  });

  describe('graph execution', () => {
    it('should build and execute the full graph successfully', async () => {
      const mockRequest = {
        url: 'https://search.example.com',
        method: 'GET' as const,
        headers: { Accept: 'application/json' },
        params: { q: 'baby stroller' },
      };

      const mockResults = [
        {
          id: 'B08N5WRWNW',
          title: 'Baby Stroller One',
          price: 129.99,
          currency: 'SAR',
          imageUrl: 'https://example.com/img1.jpg',
          url: 'https://www.amazon.sa/dp/B08N5WRWNW',
          rating: 4.5,
          reviewCount: 120,
          provider: 'amazon' as const,
        },
        {
          id: 'B08N5M7S6K',
          title: 'Baby Stroller Two',
          price: 89.5,
          currency: 'SAR',
          imageUrl: 'https://example.com/img2.jpg',
          url: 'https://www.amazon.sa/dp/B08N5M7S6K',
          rating: 4.2,
          reviewCount: 85,
          provider: 'amazon' as const,
        },
      ];

      amazonSearchProvider.buildSearchRequest.mockReturnValue(mockRequest);
      amazonSearchProvider.transformResponse.mockReturnValue({
        query: { keywords: 'baby stroller' },
        provider: 'amazon',
        results: mockResults,
        totalResults: 2,
        page: 1,
        nextPageToken: null,
      });
      affiliateUrlService.isAmazonSaUrl.mockReturnValue(true);
      affiliateUrlService.extractAmazonAsin.mockReturnValue('B08N5WRWNW');
      affiliateUrlService.buildAmazonAffiliateUrl.mockReturnValue(
        'https://www.amazon.sa/dp/B08N5WRWNW?tag=babiespicks-21',
      );

      const input = {
        query: { keywords: 'baby stroller' },
        source: 'test-source',
        provider: 'amazon' as const,
        enabled: true,
      };

      const result = await service.run(input);

      // Verify the full flow executed
      expect(amazonSearchProvider.buildSearchRequest).toHaveBeenCalledWith(input.query);
      expect(amazonSearchProvider.transformResponse).toHaveBeenCalled();
      expect(affiliateUrlService.isAmazonSaUrl).toHaveBeenCalled();
      expect(affiliateUrlService.extractAmazonAsin).toHaveBeenCalledWith(mockResults[0].url);
      expect(affiliateUrlService.buildAmazonAffiliateUrl).toHaveBeenCalledWith(mockResults[0].url);

      // Verify final state
      expect(result.skipped).toBe(false);
      expect(result.errors).toEqual([]);
      expect(result.searchResults).toHaveLength(2);
      expect(result.selectedAsin).toBe('B08N5WRWNW');
      expect(result.selectedUrl).toBe('https://www.amazon.sa/dp/B08N5WRWNW');
      expect(result.affiliateLink).toEqual({
        url: 'https://www.amazon.sa/dp/B08N5WRWNW?tag=babiespicks-21',
        provider: 'amazon',
        tag: 'babiespicks-21',
      });
      expect(result.searchMetadata).toBeDefined();
    });

    it('should capture errors in state when a node fails', async () => {
      amazonSearchProvider.buildSearchRequest.mockImplementation(() => {
        throw new Error('Search API unreachable');
      });

      const input = {
        query: { keywords: 'baby stroller' },
        source: 'test-source',
        provider: 'amazon' as const,
        enabled: true,
      };

      const result = await service.run(input);

      expect(result.errors).toContain('search: Search API unreachable');
      expect(result.skipped).toBe(false);
    });

    it('should handle empty Amazon.sa results gracefully', async () => {
      const mockRequest = {
        url: 'https://search.example.com',
        method: 'GET' as const,
        headers: { Accept: 'application/json' },
        params: { q: 'rare item' },
      };

      const mockResults = [
        {
          id: 'EXT-001',
          title: 'External Product',
          price: 99.99,
          currency: 'SAR',
          imageUrl: 'https://example.com/img.jpg',
          url: 'https://external-store.com/product',
          rating: 4.0,
          reviewCount: 10,
          provider: 'amazon' as const,
        },
      ];

      amazonSearchProvider.buildSearchRequest.mockReturnValue(mockRequest);
      amazonSearchProvider.transformResponse.mockReturnValue({
        query: { keywords: 'rare item' },
        provider: 'amazon',
        results: mockResults,
        totalResults: 1,
        page: 1,
        nextPageToken: null,
      });
      affiliateUrlService.isAmazonSaUrl.mockReturnValue(false);

      const input = {
        query: { keywords: 'rare item' },
        source: 'test-source',
        provider: 'amazon' as const,
        enabled: true,
      };

      const result = await service.run(input);

      expect(result.errors).toContain('filter: no Amazon.sa results found');
      expect(result.searchResults).toEqual([]);
    });
  });
});
