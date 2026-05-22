import { Injectable } from '@nestjs/common';
import {
  AMAZON_SEARCH_BASE_URL,
  AMAZON_SEARCH_FORMAT,
  AMAZON_SEARCH_API_KEY,
} from './constants';
import type { ProductSearchQuery, ProductSearchResult } from './types';

export interface AmazonSearchRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

@Injectable()
export class AmazonSearchProvider {
  /**
   * Builds a search request for the Amazon search proxy.
   * The actual API shape is not yet known; this builder is flexible
   * and can be extended once the real contract is documented.
   */
  buildSearchRequest(query: ProductSearchQuery): AmazonSearchRequest {
    const params: Record<string, string | number | boolean | undefined> = {
      q: query.keywords,
      format: AMAZON_SEARCH_FORMAT,
    };

    if (query.category) {
      params.category = query.category;
    }

    if (query.page && query.page > 1) {
      params.page = query.page;
    }

    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        params[`filter_${key}`] = Array.isArray(value) ? value.join(',') : value;
      }
    }

    const headers: Record<string, string> = {
      Accept:
        AMAZON_SEARCH_FORMAT === 'html'
          ? 'text/html'
          : 'application/json',
      'Content-Type': 'application/json',
    };

    if (AMAZON_SEARCH_API_KEY) {
      headers['X-API-Key'] = AMAZON_SEARCH_API_KEY;
    }

    return {
      url: AMAZON_SEARCH_BASE_URL,
      method: 'GET',
      headers,
      params,
    };
  }

  /**
   * Builds the complete URL with query parameters from the search request.
   */
  buildFullUrl(query: ProductSearchQuery): string {
    const request = this.buildSearchRequest(query);
    const url = new URL(request.url);
    if (!url.pathname.endsWith('/search')) {
      url.pathname = url.pathname.replace(/\/$/, '') + '/search';
    }
    if (request.params) {
      for (const [key, value] of Object.entries(request.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /**
   * Transforms raw API response into typed ProductSearchResult.
   *
   * Two response formats are supported:
   *
   * 1. Amazon Product API format (results have price/asin fields):
   *    { results: [{ id, title, price, asin, image, url, rating, reviewCount, ... }] }
   *
   * 2. SerrXNG web search format (results are web search hits, not product API):
   *    { query, number_of_results, results: [{ url, title, content, engine, thumbnail }] }
   *    SerrXNG results may contain Amazon product URLs (with ASIN in path like /dp/ASIN/)
   *    but do NOT have price, rating, reviewCount, or structured product metadata.
   *    For SerrXNG: id = ASIN from URL if present, else hash of URL.
   *
   * Does NOT perform any real network call.
   */
  transformResponse(
    raw: unknown,
    originalQuery: ProductSearchQuery,
  ): ProductSearchResult {
    const safeRaw = raw as Record<string, unknown> | null;
    const results = Array.isArray(safeRaw?.results)
      ? (safeRaw.results as Array<Record<string, unknown>>)
      : [];

    const firstResult = results[0] as Record<string, unknown> | undefined;
    const isSerrXNGFormat =
      firstResult && !('price' in firstResult) && !('asin' in firstResult);

    const totalResults =
      typeof safeRaw?.total === 'number'
        ? safeRaw.total
        : typeof safeRaw?.totalResults === 'number'
          ? safeRaw.totalResults
          : typeof safeRaw?.number_of_results === 'number'
            ? safeRaw.number_of_results
            : results.length;

    const page =
      typeof safeRaw?.page === 'number'
        ? safeRaw.page
        : typeof originalQuery.page === 'number'
          ? originalQuery.page
          : 1;

    const nextPageToken =
      typeof safeRaw?.nextPage === 'string'
        ? safeRaw.nextPage
        : typeof safeRaw?.nextPageToken === 'string' || safeRaw?.nextPageToken === null
          ? safeRaw.nextPageToken
          : null;

    if (isSerrXNGFormat) {
      return {
        query: originalQuery,
        provider: 'amazon',
        totalResults,
        page,
        nextPageToken,
        results: results.map((item) => {
          const url = typeof item.url === 'string' ? item.url : '';
          const asinMatch =
            url.match(/\/dp\/([A-Z0-9]{10})/i) ||
            url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
          const asin = asinMatch ? asinMatch[1] : null;
          const id = asin ?? Buffer.from(url).toString('base64').slice(0, 16);

          return {
            id,
            title: typeof item.title === 'string' ? item.title : 'Unknown Product',
            price: undefined,
            currency: 'SAR' as const,
            imageUrl:
              typeof item.thumbnail === 'string'
                ? item.thumbnail
                : undefined,
            url,
            rating: undefined,
            reviewCount: undefined,
            provider: 'amazon' as const,
          };
        }),
      };
    }

    return {
      query: originalQuery,
      provider: 'amazon',
      totalResults,
      page,
      nextPageToken,
      results: results.map((item, index) => ({
        id: String(item?.id ?? item?.asin ?? `amazon-${index}`),
        title: String(item?.title ?? item?.name ?? 'Unknown Product'),
        price:
          typeof item?.price === 'number'
            ? item.price
            : typeof item?.price === 'string'
              ? parseFloat(item.price)
              : undefined,
        currency: typeof item?.currency === 'string' ? item.currency : 'SAR',
        imageUrl: typeof item?.image === 'string' ? item.image : undefined,
        url:
          typeof item?.url === 'string'
            ? item.url
            : typeof item?.link === 'string'
              ? item.link
              : '',
        rating:
          typeof item?.rating === 'number'
            ? item.rating
            : typeof item?.rating === 'string'
              ? parseFloat(item.rating)
              : undefined,
        reviewCount:
          typeof item?.reviewCount === 'number'
            ? item.reviewCount
            : typeof item?.reviews === 'number'
              ? item.reviews
              : undefined,
        provider: 'amazon' as const,
      })),
    };
  }
}
