import { beforeEach, describe, expect, it, vi } from 'vitest';

type AnalyticsServiceCtor = new (...args: any[]) => {
  recordEvent: (input: Record<string, unknown>) => Promise<any>;
  getCtr: (input: Record<string, unknown>) => Promise<any>;
  generateOptimizationRecommendations: (input: Record<string, unknown>) => Promise<any>;
};

async function loadAnalyticsService(): Promise<AnalyticsServiceCtor> {
  const modulePath = new URL('../../src/infrastructure/analytics/analytics.service.ts', import.meta.url).href;
  const mod = await import(modulePath);
  expect(mod.AnalyticsService).toBeTypeOf('function');
  return mod.AnalyticsService as AnalyticsServiceCtor;
}

function createPrismaMock() {
  const prisma = {
    analyticsEvent: {
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    optimizationRecommendation: {
      create: vi.fn(),
      upsert: vi.fn(),
    },
    socialPost: {
      update: vi.fn(),
    },
    contentPage: {
      update: vi.fn(),
    },
    product: {
      update: vi.fn(),
    },
  };

  return prisma;
}

describe('AnalyticsService contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('recordEvent sanitizes metadata and persists only sessionHash, never raw PII/session identifiers', async () => {
    const AnalyticsService = await loadAnalyticsService();
    const prisma = createPrismaMock();
    prisma.analyticsEvent.create.mockResolvedValue({ id: 'event_1' });
    const service = new AnalyticsService(prisma);

    await service.recordEvent({
      eventType: 'social_impression',
      source: 'twitter',
      sessionHash: 'sha256:session-hash-only',
      rawSessionId: 'raw-session-id-should-drop',
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0 should drop',
      email: 'parent@example.com',
      phone: '+966555555555',
      socialPostId: 'social_1',
      metadata: {
        campaign: 'summer-car-seat',
        channel: 'twitter',
        placement: 'hero',
        email: 'parent@example.com',
        phoneNumber: '+966555555555',
        sessionId: 'raw-session-id-should-drop',
        ip: '203.0.113.10',
        referrer: 'https://example.com/private',
        nested: { email: 'nested@example.com' },
      },
      idempotencyKey: 'analytics:social_1:impression:sha256:session-hash-only',
    });

    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'social_impression',
        source: 'twitter',
        sessionHash: 'sha256:session-hash-only',
        socialPostId: 'social_1',
        metadata: {
          campaign: 'summer-car-seat',
          channel: 'twitter',
          placement: 'hero',
        },
        metadataSchemaVersion: 1,
        retentionClass: 'SHORT_LIVED',
      }),
    });

    const serializedWrite = JSON.stringify(prisma.analyticsEvent.create.mock.calls);
    expect(serializedWrite).not.toContain('parent@example.com');
    expect(serializedWrite).not.toContain('+966555555555');
    expect(serializedWrite).not.toContain('raw-session-id-should-drop');
    expect(serializedWrite).not.toContain('203.0.113.10');
    expect(serializedWrite).not.toContain('Mozilla/5.0 should drop');
  });

  it('getCtr calculates clicks divided by impressions for the requested entity/time window', async () => {
    const AnalyticsService = await loadAnalyticsService();
    const prisma = createPrismaMock();
    prisma.analyticsEvent.count
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(12);
    const service = new AnalyticsService(prisma);
    const from = new Date('2026-05-01T00:00:00.000Z');
    const to = new Date('2026-05-20T23:59:59.999Z');

    const result = await service.getCtr({
      socialPostId: 'social_1',
      source: 'twitter',
      from,
      to,
    });

    expect(prisma.analyticsEvent.count).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({
        eventType: 'social_impression',
        socialPostId: 'social_1',
        source: 'twitter',
        occurredAt: { gte: from, lte: to },
      }),
    });
    expect(prisma.analyticsEvent.count).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        eventType: 'affiliate_click',
        socialPostId: 'social_1',
        source: 'twitter',
        occurredAt: { gte: from, lte: to },
      }),
    });
    expect(result).toMatchObject({ impressions: 100, clicks: 12, ctr: 0.12 });
  });

  it('generateOptimizationRecommendations creates OPEN recommendations and never auto-publishes changes', async () => {
    const AnalyticsService = await loadAnalyticsService();
    const prisma = createPrismaMock();
    prisma.analyticsEvent.groupBy.mockResolvedValue([
      {
        socialPostId: 'social_low_ctr',
        _count: { _all: 250 },
      },
    ]);
    prisma.analyticsEvent.count
      .mockResolvedValueOnce(250)
      .mockResolvedValueOnce(4);
    prisma.optimizationRecommendation.create.mockResolvedValue({
      id: 'rec_1',
      status: 'OPEN',
      socialPostId: 'social_low_ctr',
    });
    const service = new AnalyticsService(prisma);

    const result = await service.generateOptimizationRecommendations({
      from: new Date('2026-05-01T00:00:00.000Z'),
      to: new Date('2026-05-20T23:59:59.999Z'),
      minImpressions: 100,
      ctrThreshold: 0.03,
    });

    expect(prisma.optimizationRecommendation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        socialPostId: 'social_low_ctr',
        type: 'LOW_CTR',
        status: 'OPEN',
        recommendation: expect.stringMatching(/CTR|click/i),
        metadata: expect.objectContaining({ impressions: 250, clicks: 4, ctr: 0.016 }),
      }),
    });
    expect(prisma.socialPost.update).not.toHaveBeenCalled();
    expect(prisma.contentPage.update).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: 1 });
  });
});
