import { Injectable } from '@nestjs/common';
import { AmazonSearchProvider } from './amazon-search.provider';
import { AffiliateUrlService } from './affiliate-url.service';
import { NoonPlaceholderProvider } from './noon-placeholder.provider';
import type { AffiliateLink, ProductSearchQuery, ProductSearchResult } from './types';

export interface AffiliateDiscoveryResult {
  query: string;
  source: string;
  searchResults: ProductSearchResult[];
  selectedAsin?: string;
  selectedUrl?: string;
  affiliateLink?: AffiliateLink;
  errors: string[];
  skipped: boolean;
  skipReason?: string;
  provider: string;
  searchMetadata?: {
    engine: string;
    queryTime: number;
    resultCount: number;
  };
}

@Injectable()
export class AffiliateProductDiscoveryFlow {
  constructor(
    private readonly amazonSearchProvider: AmazonSearchProvider,
    private readonly affiliateUrlService: AffiliateUrlService,
    private readonly noonProvider: NoonPlaceholderProvider,
  ) {}

  async run(query: string, source: string): Promise<AffiliateDiscoveryResult> {
    const errors: string[] = [];
    const startTime = Date.now();

    if (process.env.AFFILIATE_SHADOW_MODE === 'true') {
      return {
        query,
        source,
        searchResults: [],
        skipped: true,
        skipReason: 'Shadow mode enabled',
        errors: ['AFFILIATE_SHADOW_MODE is true — skipping HTTP call'],
        provider: 'amazon',
        searchMetadata: {
          engine: 'amazon',
          queryTime: Date.now() - startTime,
          resultCount: 0,
        },
      };
    }

    try {
      const searchQuery: ProductSearchQuery = { keywords: query };
      const request = this.amazonSearchProvider.buildSearchRequest(searchQuery);

      const fullUrl = this.amazonSearchProvider.buildFullUrl(searchQuery);

      const response = await fetch(fullUrl, {
        headers: request.headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        errors.push(`HTTP ${response.status}: ${response.statusText}`);
        return {
          query,
          source,
          searchResults: [],
          skipped: true,
          skipReason: 'Search failed',
          errors,
          provider: 'amazon',
          searchMetadata: {
            engine: 'amazon',
            queryTime: Date.now() - startTime,
            resultCount: 0,
          },
        };
      }

      const json = await response.json() as Record<string, unknown>;
      const searchResult = this.amazonSearchProvider.transformResponse(json, searchQuery);

      if (!searchResult.results.length) {
        return {
          query,
          source,
          searchResults: [searchResult],
          skipped: false,
          errors: [],
          provider: 'amazon',
          searchMetadata: {
            engine: 'amazon',
            queryTime: Date.now() - startTime,
            resultCount: 0,
          },
        };
      }

      const firstResult = searchResult.results[0];
      const resultUrl = firstResult.url;
      const asin = this.affiliateUrlService.extractAmazonAsin(resultUrl);
      const affiliateUrl = asin
        ? this.affiliateUrlService.buildAmazonAffiliateUrl(resultUrl)
        : null;

      return {
        query,
        source,
        searchResults: [searchResult],
        selectedAsin: asin ?? undefined,
        selectedUrl: resultUrl,
        affiliateLink: affiliateUrl
          ? { url: affiliateUrl, provider: 'amazon', tag: 'babiespicks-21' }
          : undefined,
        errors: [],
        skipped: false,
        provider: 'amazon',
        searchMetadata: {
          engine: 'amazon',
          queryTime: Date.now() - startTime,
          resultCount: searchResult.results.length,
        },
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        query,
        source,
        searchResults: [],
        skipped: true,
        skipReason: 'Search failed',
        errors,
        provider: 'amazon',
        searchMetadata: {
          engine: 'amazon',
          queryTime: Date.now() - startTime,
          resultCount: 0,
        },
      };
    }
  }
}
