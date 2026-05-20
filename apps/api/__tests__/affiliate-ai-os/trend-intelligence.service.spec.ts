import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrendIntelligenceService } from '../../src/features/affiliate-ai-os/trend-intelligence.service';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';

describe('TrendIntelligenceService', () => {
  const mockPrisma = {
    trendSignal: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('creates a TrendSignal with discoveryReason and trendScore from a source item', async () => {
    const service = new TrendIntelligenceService(
      mockPrisma as unknown as PrismaService,
    );
    const createdSignal = {
      id: 'signal_1',
      source: 'tiktok',
      sourceUrl: 'https://www.tiktok.com/@mom/video/123',
      canonicalUrl: 'https://www.noon.com/saudi-en/foldable-stroller/p/',
      rawTitle: '  عربة أطفال خفيفة قابلة للطي  ',
      normalizedTitle: 'عربة أطفال خفيفة قابلة للطي',
      sourceHash: 'hash_123',
      discoveryReason: 'High mention velocity from Saudi parenting creators',
      trendScore: 87,
      status: 'NEW',
    };

    mockPrisma.trendSignal.findFirst.mockResolvedValue(null);
    mockPrisma.trendSignal.create.mockResolvedValue(createdSignal);

    const result = await service.createSignalFromSource({
      source: 'tiktok',
      sourceUrl: 'https://www.tiktok.com/@mom/video/123',
      productUrl:
        'https://www.noon.com/saudi-en/foldable-stroller/p/?utm_source=tiktok&utm_campaign=viral',
      title: '  عربة أطفال خفيفة قابلة للطي  ',
      discoveryReason: 'High mention velocity from Saudi parenting creators',
      trendScore: 87,
      metadata: { mentions: 42, locale: 'ar-SA' },
    });

    expect(mockPrisma.trendSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          discoveryReason: 'High mention velocity from Saudi parenting creators',
          trendScore: 87,
          canonicalUrl: 'https://www.noon.com/saudi-en/foldable-stroller/p/',
          normalizedTitle: 'عربة أطفال خفيفة قابلة للطي',
          sourceHash: expect.any(String),
          status: 'NEW',
        }),
      }),
    );
    expect(result).toEqual(createdSignal);
  });

  it('deduplicates TrendSignal creation by canonicalUrl, normalizedTitle, and sourceHash', async () => {
    const service = new TrendIntelligenceService(
      mockPrisma as unknown as PrismaService,
    );
    const existingSignal = {
      id: 'signal_existing',
      canonicalUrl: 'https://www.amazon.sa/dp/B0STROLLER',
      normalizedTitle: 'portable stroller',
      sourceHash: 'existing_hash',
      discoveryReason: 'Already discovered from marketplace trend feed',
      trendScore: 75,
      status: 'NEW',
    };

    mockPrisma.trendSignal.findFirst.mockResolvedValue(existingSignal);

    const result = await service.createSignalFromSource({
      source: 'amazon',
      sourceUrl: 'https://affiliate-feed.example/items/1',
      productUrl: 'https://www.amazon.sa/dp/B0STROLLER?tag=babiespicks-21',
      title: 'Portable Stroller',
      discoveryReason: 'Duplicate from second feed',
      trendScore: 81,
    });

    expect(mockPrisma.trendSignal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ canonicalUrl: expect.any(String) }),
            expect.objectContaining({ normalizedTitle: 'portable stroller' }),
            expect.objectContaining({ sourceHash: expect.any(String) }),
          ]),
        }),
      }),
    );
    expect(mockPrisma.trendSignal.create).not.toHaveBeenCalled();
    expect(result).toEqual(existingSignal);
  });

  it('is idempotent for repeated source payloads and returns the original TrendSignal', async () => {
    const service = new TrendIntelligenceService(
      mockPrisma as unknown as PrismaService,
    );
    const existingSignal = {
      id: 'signal_original',
      canonicalUrl: 'https://www.noon.com/saudi-en/baby-monitor/p/',
      normalizedTitle: 'جهاز مراقبة الطفل',
      sourceHash: 'stable_hash',
      discoveryReason: 'Initial social spike',
      trendScore: 92,
      status: 'NEW',
    };

    mockPrisma.trendSignal.findFirst.mockResolvedValue(existingSignal);

    const result = await service.createSignalFromSource({
      source: 'instagram',
      sourceUrl: 'https://instagram.com/reel/abc',
      productUrl: 'https://www.noon.com/saudi-en/baby-monitor/p/?utm_medium=social',
      title: 'جهاز مراقبة الطفل',
      discoveryReason: 'Repeated webhook delivery',
      trendScore: 92,
      idempotencyKey: 'trend-webhook-abc',
    });

    expect(mockPrisma.trendSignal.create).not.toHaveBeenCalled();
    expect(result.id).toBe('signal_original');
    expect(result.discoveryReason).toBe('Initial social spike');
    expect(result.trendScore).toBe(92);
  });

  it('returns the existing TrendSignal when a concurrent create hits P2002', async () => {
    const service = new TrendIntelligenceService(
      mockPrisma as unknown as PrismaService,
    );
    const racedSignal = {
      id: 'signal_race',
      canonicalUrl: 'https://www.noon.com/saudi-en/bottle-warmer/p/',
      normalizedTitle: 'bottle warmer',
      sourceHash: 'race_hash',
      discoveryReason: 'Created by a concurrent discovery worker',
      trendScore: 80,
      status: 'NEW',
    };

    mockPrisma.trendSignal.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(racedSignal);
    mockPrisma.trendSignal.create.mockRejectedValue({ code: 'P2002' });

    const result = await service.createSignalFromSource({
      source: 'noon-feed',
      productUrl: 'https://www.noon.com/saudi-en/bottle-warmer/p/?utm=feed',
      title: 'Bottle Warmer',
      discoveryReason: 'Race duplicate',
      trendScore: 80,
    });

    expect(mockPrisma.trendSignal.findFirst).toHaveBeenCalledTimes(2);
    expect(result).toEqual(racedSignal);
  });
});
