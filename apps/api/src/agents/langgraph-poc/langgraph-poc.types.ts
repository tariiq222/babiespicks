import type { ReviewData, ReviewAnalysis } from '../review-analyzer/review-analyzer.service';
import type { VerdictResult } from '../verdict-engine/verdict-engine.service';

export interface PocInput {
  productId: string;
  reviews: ReviewData[];
}

export interface PocOptions {
  enabled?: boolean;
}

export interface PocState {
  productId: string;
  reviews: ReviewData[];
  analysis?: ReviewAnalysis;
  verdict?: VerdictResult;
  errors: string[];
  skipped: boolean;
}
