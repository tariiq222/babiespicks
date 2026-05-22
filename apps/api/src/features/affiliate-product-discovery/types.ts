import type { SupportedProvider } from './constants';

export interface AffiliateLink {
  url: string;
  provider: SupportedProvider;
  tag?: string;
}

export interface ProductSearchQuery {
  keywords: string;
  category?: string;
  page?: number;
  filters?: Record<string, string | string[]>;
}

export interface ProductSearchResult {
  query: ProductSearchQuery;
  provider: SupportedProvider;
  results: ProductResult[];
  totalResults?: number;
  page?: number;
  nextPageToken?: string | null;
}

export interface ProductResult {
  id: string;
  title: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  url: string;
  rating?: number;
  reviewCount?: number;
  provider: SupportedProvider;
}

export interface PlaceholderResult {
  provider: SupportedProvider;
  status: 'placeholder' | 'unsupported';
  reason: string;
  generatedUrl: null;
}

export type SearchProviderResponse = ProductSearchResult | PlaceholderResult;
