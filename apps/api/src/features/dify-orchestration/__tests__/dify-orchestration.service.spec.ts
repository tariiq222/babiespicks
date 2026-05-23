import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DifyOrchestrationService } from '../dify-orchestration.service';

describe('DifyOrchestrationService.searchMarketplace', () => {
  let service: DifyOrchestrationService;
  let prisma: { product: { findFirst: ReturnType<typeof vi.fn> } };
  let discovery: { findOnMarketplace: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = { product: { findFirst: vi.fn() } };
    discovery = { findOnMarketplace: vi.fn() };
    service = new DifyOrchestrationService(prisma as never, discovery as never, {} as never);
  });

  it('returns existing_product_id when product already in DB', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-existing',
      sourceUrl: 'https://noon.com/x',
      store: { slug: 'noon' },
    });

    const result = await service.searchMarketplace({ name: 'Stokke Tripp Trapp' });

    expect(result.available).toBe(true);
    expect(result.existing_product_id).toBe('prod-existing');
    expect(discovery.findOnMarketplace).not.toHaveBeenCalled();
  });

  it('queries marketplace when product not in DB', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    discovery.findOnMarketplace.mockResolvedValue({
      url: 'https://www.noon.com/saudi-en/abc/p',
      platform: 'noon',
      sku: 'abc',
    });

    const result = await service.searchMarketplace({ name: 'New Product' });

    expect(result.available).toBe(true);
    expect(result.platform).toBe('noon');
    expect(result.existing_product_id).toBeUndefined();
  });

  it('returns available=false when nothing found', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    discovery.findOnMarketplace.mockResolvedValue(null);

    const result = await service.searchMarketplace({ name: 'Nonexistent' });

    expect(result.available).toBe(false);
  });

  it('does not dedup on short ambiguous names', async () => {
    prisma.product.findFirst.mockResolvedValue(null); // first call returns null (no exact match)
    // second call (contains) should NOT fire because name is short
    discovery.findOnMarketplace.mockResolvedValue(null);

    const result = await service.searchMarketplace({ name: 'Bibs' });

    expect(prisma.product.findFirst).toHaveBeenCalledTimes(1); // only equals, not contains
    expect(result.available).toBe(false);
  });
});

describe('DifyOrchestrationService.processProduct', () => {
  let service: DifyOrchestrationService;
  let coordinator: { runProductPipeline: ReturnType<typeof vi.fn> };
  let prisma: {
    product: { findFirst: ReturnType<typeof vi.fn> };
    contentPage: { update: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    coordinator = { runProductPipeline: vi.fn() };
    prisma = {
      product: { findFirst: vi.fn() },
      contentPage: {
        update: vi.fn().mockResolvedValue(undefined),
        findFirst: vi.fn().mockResolvedValue({ id: 'cp-1' }),
      },
    };
    service = new DifyOrchestrationService(prisma as never, {} as never, coordinator as never);
  });

  it('runs the existing product pipeline and tags discovery metadata', async () => {
    coordinator.runProductPipeline.mockResolvedValue({
      productId: 'prod-1',
      productName: 'Stokke',
      steps: { acquisition: 'success', reviews: 'success', verdict: 'success', publish: 'success' },
      totalTimeMs: 12345,
    });

    const result = await service.processProduct({
      url: 'https://noon.com/x',
      platform: 'noon',
      trend_score: 8,
      discovery_reason: 'Mentioned in 3 viral threads',
      dify_run_id: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(coordinator.runProductPipeline).toHaveBeenCalledWith(
      'https://noon.com/x',
      'noon',
      undefined,
    );
    expect(prisma.contentPage.update).toHaveBeenCalled();
    const updateCall = prisma.contentPage.update.mock.calls[0][0];
    expect(updateCall.data.discoverySource).toBe('dify-workflow');
    expect(updateCall.data.trendScore).toBe(8);
    expect(updateCall.data.difyRunId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.product_id).toBe('prod-1');
    expect(result.status).toBe('PENDING_APPROVAL');
  });

  it('returns status FAILED if acquisition failed', async () => {
    coordinator.runProductPipeline.mockResolvedValue({
      productId: '',
      productName: '',
      steps: { acquisition: 'failed', reviews: 'skipped', verdict: 'failed', publish: 'failed' },
      totalTimeMs: 1000,
    });

    const result = await service.processProduct({ url: 'https://x.com/p', platform: 'noon' });

    expect(result.status).toBe('FAILED');
    expect(prisma.contentPage.update).not.toHaveBeenCalled();
  });
});

describe('DifyOrchestrationService.startRun', () => {
  it('creates a dify_runs row', async () => {
    const prisma = {
      product: { findFirst: vi.fn() },
      contentPage: { update: vi.fn(), findFirst: vi.fn() },
      difyRun: {
        create: vi.fn().mockResolvedValue({ id: 'run-1' }),
      },
    };
    const svc = new DifyOrchestrationService(prisma as never, {} as never, {} as never);
    const result = await svc.startRun({ triggered_by: 'manual', total_candidates: 5 });
    expect(prisma.difyRun.create).toHaveBeenCalledWith({
      data: { triggeredBy: 'manual', totalCandidates: 5 },
      select: { id: true },
    });
    expect(result.dify_run_id).toBe('run-1');
  });
});

describe('DifyOrchestrationService.listRuns', () => {
  it('maps Prisma rows to admin shape with computed status', async () => {
    const prisma = {
      product: { findFirst: vi.fn() },
      contentPage: { update: vi.fn(), findFirst: vi.fn() },
      difyRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'run-1',
            startedAt: new Date('2026-05-23T10:00:00Z'),
            finishedAt: new Date('2026-05-23T10:10:00Z'),
            triggeredBy: 'cron',
            totalCandidates: 5,
            succeeded: 4,
            failed: 1,
            error: null,
          },
          {
            id: 'run-2',
            startedAt: new Date('2026-05-23T11:00:00Z'),
            finishedAt: null,
            triggeredBy: 'manual',
            totalCandidates: 0,
            succeeded: 0,
            failed: 0,
            error: null,
          },
          {
            id: 'run-3',
            startedAt: new Date('2026-05-23T12:00:00Z'),
            finishedAt: new Date('2026-05-23T12:01:00Z'),
            triggeredBy: 'manual',
            totalCandidates: 3,
            succeeded: 0,
            failed: 3,
            error: { message: 'boom' },
          },
        ]),
      },
    };
    const svc = new DifyOrchestrationService(prisma as never, {} as never, {} as never);
    const result = await svc.listRuns(20);
    expect(prisma.difyRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20, orderBy: { startedAt: 'desc' } }),
    );
    expect(result[0].status).toBe('completed');
    expect(result[1].status).toBe('running');
    expect(result[2].status).toBe('failed');
    expect(result[0].started_at).toBe('2026-05-23T10:00:00.000Z');
    expect(result[1].finished_at).toBeNull();
  });

  it('clamps the limit to safe bounds', async () => {
    const prisma = {
      product: { findFirst: vi.fn() },
      contentPage: { update: vi.fn(), findFirst: vi.fn() },
      difyRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const svc = new DifyOrchestrationService(prisma as never, {} as never, {} as never);
    await svc.listRuns(9999);
    expect(prisma.difyRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    await svc.listRuns(0);
    expect(prisma.difyRun.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });
});

describe('DifyOrchestrationService.getRunProducts', () => {
  it('returns [] for unknown run', async () => {
    const prisma = {
      product: { findFirst: vi.fn(), findMany: vi.fn() },
      contentPage: { update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
      difyRun: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const svc = new DifyOrchestrationService(prisma as never, {} as never, {} as never);
    const result = await svc.getRunProducts('does-not-exist');
    expect(result).toEqual([]);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('returns products in the run window, hinting via linked content page', async () => {
    const start = new Date('2026-05-23T10:00:00Z');
    const finish = new Date('2026-05-23T10:30:00Z');
    const prisma = {
      product: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'prod-1',
            name: 'Stokke',
            slug: 'stokke',
            createdAt: new Date('2026-05-23T10:05:00Z'),
            dataSource: 'AGENT',
          },
        ]),
      },
      contentPage: {
        update: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'cp-1', trendScore: 8, discoverySource: 'dify-workflow', createdAt: start },
          ]),
      },
      difyRun: {
        findUnique: vi.fn().mockResolvedValue({ startedAt: start, finishedAt: finish }),
      },
    };
    const svc = new DifyOrchestrationService(prisma as never, {} as never, {} as never);
    const result = await svc.getRunProducts('run-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('prod-1');
    expect(result[0].source).toBe('dify-workflow');
    expect(result[0].trend_score).toBe(8);
    expect(result[0].content_page_id).toBe('cp-1');
  });
});

describe('DifyOrchestrationService.triggerWorkflow', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws when Dify env vars are missing', async () => {
    delete process.env.DIFY_BASE_URL;
    delete process.env.DIFY_WORKFLOW_API_KEY;
    delete process.env.DIFY_DISCOVERY_WORKFLOW_ID;
    const svc = new DifyOrchestrationService({} as never, {} as never, {} as never);
    await expect(svc.triggerWorkflow()).rejects.toThrow(/Dify env not configured/);
  });

  it('calls Dify and returns workflow_run_id', async () => {
    process.env.DIFY_BASE_URL = 'https://dify.example.com';
    process.env.DIFY_WORKFLOW_API_KEY = 'test-key';
    process.env.DIFY_DISCOVERY_WORKFLOW_ID = 'wf-123';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ workflow_run_id: 'wr-1', status: 'running' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const svc = new DifyOrchestrationService({} as never, {} as never, {} as never);
    const result = await svc.triggerWorkflow();
    expect(result.workflow_run_id).toBe('wr-1');
    expect(result.status).toBe('running');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://dify.example.com/v1/workflows/wf-123/run',
      expect.objectContaining({ method: 'POST' }),
    );
    fetchSpy.mockRestore();
  });

  it('throws on non-OK response', async () => {
    process.env.DIFY_BASE_URL = 'https://dify.example.com';
    process.env.DIFY_WORKFLOW_API_KEY = 'test-key';
    process.env.DIFY_DISCOVERY_WORKFLOW_ID = 'wf-123';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 500 }));
    const svc = new DifyOrchestrationService({} as never, {} as never, {} as never);
    await expect(svc.triggerWorkflow()).rejects.toThrow(/HTTP 500/);
    fetchSpy.mockRestore();
  });
});

describe('DifyOrchestrationService.finishRun', () => {
  it('updates run with counts and finished_at', async () => {
    const prisma = {
      product: { findFirst: vi.fn() },
      contentPage: { update: vi.fn(), findFirst: vi.fn() },
      difyRun: {
        update: vi.fn().mockResolvedValue({
          id: 'run-1',
          totalCandidates: 5,
          succeeded: 3,
          failed: 2,
          startedAt: new Date('2026-05-23T10:00:00Z'),
          finishedAt: new Date('2026-05-23T10:10:00Z'),
        }),
      },
    };
    const svc = new DifyOrchestrationService(prisma as never, {} as never, {} as never);
    const result = await svc.finishRun({
      dify_run_id: 'run-1',
      succeeded: 3,
      failed: 2,
    });
    expect(prisma.difyRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ succeeded: 3, failed: 2 }),
      }),
    );
    expect(result.succeeded).toBe(3);
    expect(result.finished_at).toBe('2026-05-23T10:10:00.000Z');
  });
});
