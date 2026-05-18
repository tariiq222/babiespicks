// Shared types between frontend and backend
// Source of truth for all domain types used across apps/web and apps/api

// ---------------------------------------------------------------------------
// Primitives / Enums
// ---------------------------------------------------------------------------

export type Locale = 'ar' | 'en';

export type VerdictType = 'WORTH_IT' | 'WORTH_IT_WITH' | 'WAIT' | 'NOT_WORTH_IT';

export type CouponStatus = 'ACTIVE' | 'EXPIRED' | 'NEEDS_REVIEW';

/** @deprecated Use PipelineJobStatus instead — kept for backwards-compat */
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type PipelineJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type ContentPageType = 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE';

export type DiscountType = 'PERCENTAGE' | 'FIXED';

// ---------------------------------------------------------------------------
// Domain interfaces
// ---------------------------------------------------------------------------

export interface ProductTranslation {
  locale: string;
  name: string;
  description: string | null;
  slug: string;
}

export interface ProductVerdict {
  type: VerdictType;
  overallScore: number;
  safetyScore: number;
  qualityScore: number;
  reviewsScore: number;
  priceScore: number;
  longTermScore: number;
  reasoningAr: string;
  reasoningEn: string;
  conditionsAr: readonly string[] | null;
  conditionsEn: readonly string[] | null;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  isActive?: boolean;
}

export interface ProductPrice {
  price: number;
  originalPrice: number | null;
  currency: string;
  storeId: string;
  store: Pick<Store, 'id' | 'name' | 'slug'> | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
}

export interface ProductSpec {
  key: string;
  value: string;
  locale: string;
}

export interface ReviewSummary {
  averageRating: number;
  totalReviews: number;
  prosAr: readonly string[] | null;
  prosEn: readonly string[] | null;
  consAr: readonly string[] | null;
  consEn: readonly string[] | null;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  imageUrl: string | null;
  isActive: boolean;
  translations: ProductTranslation[];
  verdict: ProductVerdict | null;
  prices: ProductPrice[];
  category: Pick<Category, 'name' | 'slug'> | null;
  specs: ProductSpec[];
  reviewSummary: ReviewSummary | null;
}

export interface ContentPage {
  id: string;
  type: ContentPageType;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  categorySlug: string | null;
  locale: string;
  publishedAt: string | null;
}

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  discountType: DiscountType;
  discountValue: number;
  store: Store;
  status: CouponStatus;
  validUntil?: string | null;
}

// ---------------------------------------------------------------------------
// API response wrappers
// ---------------------------------------------------------------------------

export interface SearchResult {
  data: Product[];
  total: number;
  nextCursor: string | null;
}

export interface ApiResponse<T> {
  data: T;
  total?: number;
  nextCursor?: string | null;
}
