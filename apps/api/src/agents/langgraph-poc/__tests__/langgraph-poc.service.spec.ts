import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LangGraphPocService } from '../langgraph-poc.service';
import type { ReviewAnalyzerService, ReviewAnalysis } from '../../review-analyzer/review-analyzer.service';
import type { VerdictEngineService, VerdictResult } from '../../verdict-engine/verdict-engine.service';

describe('LangGraphPocService', () => {
  let service: LangGraphPocService;

  const mockAnalysis: ReviewAnalysis = {
    averageRating: 4.5,
    totalReviews: 10,
    sentimentScore: 0.8,
    prosAr: ['جيد'],
    prosEn: ['Good'],
    consAr: ['سيء'],
    consEn: ['Bad'],
    redFlags: [],
  };

  const mockVerdict: VerdictResult = {
    type: 'WORTH_IT',
    overallScore: 8.0,
    safetyScore: 9.0,
    qualityScore: 8.5,
    reviewsScore: 8.0,
    priceScore: 7.5,
    longTermScore: 7.0,
    reasoningAr: 'منتج ممتاز',
    reasoningEn: 'Excellent product',
  };

  const mockReviewAnalyzer = {
    analyzeReviews: vi.fn(),
  };

  const mockVerdictEngine = {
    generateVerdict: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LangGraphPocService(
      mockReviewAnalyzer as unknown as ReviewAnalyzerService,
      mockVerdictEngine as unknown as VerdictEngineService,
    );
  });

  describe('disabled mode', () => {
    it('returns skipped state when options.enabled is false', async () => {
      const result = await service.run(
        { productId: 'prod_1', reviews: [] },
        { enabled: false },
      );

      expect(result.skipped).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.productId).toBe('prod_1');
      expect(mockReviewAnalyzer.analyzeReviews).not.toHaveBeenCalled();
      expect(mockVerdictEngine.generateVerdict).not.toHaveBeenCalled();
    });

    it('returns skipped state when env var is not set and no options', async () => {
      const originalEnv = process.env.LANGGRAPH_POC_ENABLED;
      delete process.env.LANGGRAPH_POC_ENABLED;

      const result = await service.run({ productId: 'prod_1', reviews: [] });

      expect(result.skipped).toBe(true);
      expect(result.errors).toEqual([]);
      expect(mockReviewAnalyzer.analyzeReviews).not.toHaveBeenCalled();
      expect(mockVerdictEngine.generateVerdict).not.toHaveBeenCalled();

      if (originalEnv !== undefined) {
        process.env.LANGGRAPH_POC_ENABLED = originalEnv;
      }
    });
  });

  describe('success path', () => {
    it('runs reviewAnalyzer then verdictEngine and returns full state', async () => {
      mockReviewAnalyzer.analyzeReviews.mockResolvedValue(mockAnalysis);
      mockVerdictEngine.generateVerdict.mockResolvedValue(mockVerdict);

      const result = await service.run(
        { productId: 'prod_1', reviews: [{ text: 'great' }] },
        { enabled: true },
      );

      expect(result.skipped).toBe(false);
      expect(result.errors).toEqual([]);
      expect(result.analysis).toEqual(mockAnalysis);
      expect(result.verdict).toEqual(mockVerdict);
      expect(mockReviewAnalyzer.analyzeReviews).toHaveBeenCalledWith('prod_1', [{ text: 'great' }]);
      expect(mockVerdictEngine.generateVerdict).toHaveBeenCalledWith('prod_1');
    });

    it('uses env var when options not provided', async () => {
      process.env.LANGGRAPH_POC_ENABLED = 'true';
      mockReviewAnalyzer.analyzeReviews.mockResolvedValue(mockAnalysis);
      mockVerdictEngine.generateVerdict.mockResolvedValue(mockVerdict);

      const result = await service.run({ productId: 'prod_1', reviews: [] });

      expect(result.skipped).toBe(false);
      expect(result.analysis).toEqual(mockAnalysis);
      expect(result.verdict).toEqual(mockVerdict);

      delete process.env.LANGGRAPH_POC_ENABLED;
    });
  });

  describe('error path', () => {
    it('does not call verdictEngine when reviewAnalyzer fails', async () => {
      mockReviewAnalyzer.analyzeReviews.mockRejectedValue(new Error('AI timeout'));

      const result = await service.run(
        { productId: 'prod_1', reviews: [{ text: 'great' }] },
        { enabled: true },
      );

      expect(result.skipped).toBe(false);
      expect(result.analysis).toBeUndefined();
      expect(result.verdict).toBeUndefined();
      expect(result.errors).toContain('reviewAnalyzer: AI timeout');
      expect(mockReviewAnalyzer.analyzeReviews).toHaveBeenCalledTimes(1);
      expect(mockVerdictEngine.generateVerdict).not.toHaveBeenCalled();
    });

    it('captures error when verdictEngine fails but reviewAnalyzer succeeds', async () => {
      mockReviewAnalyzer.analyzeReviews.mockResolvedValue(mockAnalysis);
      mockVerdictEngine.generateVerdict.mockRejectedValue(new Error('DB error'));

      const result = await service.run(
        { productId: 'prod_1', reviews: [] },
        { enabled: true },
      );

      expect(result.skipped).toBe(false);
      expect(result.analysis).toEqual(mockAnalysis);
      expect(result.verdict).toBeUndefined();
      expect(result.errors).toContain('verdictEngine: DB error');
    });
  });
});
