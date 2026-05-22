import type { SupportedProvider } from '../../features/affiliate-product-discovery/constants';
import type {
  AffiliateLink,
  ProductSearchQuery,
  ProductResult,
} from '../../features/affiliate-product-discovery/types';

export interface AffiliateGraphState {
  query: ProductSearchQuery;
  source: string;
  searchResults: ProductResult[];
  selectedAsin?: string;
  selectedUrl?: string;
  affiliateLink?: AffiliateLink;
  errors: string[];
  skipped: boolean;
  skipReason?: string;
  provider: SupportedProvider;
  searchMetadata?: unknown;
}

export interface AffiliateGraphInput {
  query: ProductSearchQuery;
  source: string;
  provider?: SupportedProvider;
  enabled?: boolean;
}
