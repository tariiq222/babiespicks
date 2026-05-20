import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AiOsService } from '../ai-os.service';
import { AiOsWorkerService } from '../ai-os-worker.service';
import {
  InProcessQueueService,
  resetQueueService,
} from '../../../infrastructure/queue/queue.service';
import { AiRunStatus, AiStepStatus, AiEventType } from '@prisma/client';
import {
  PipelineResult,
  ContentPipelineResult,
  DiscoveryPipelineResult,
} from '../../../agents/coordinator/coordinator.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockPrismaService() {
  const runs = new Map<string, any>();
  const steps = new Map<string, any[]>();
  const events: any[] = [];
  const artifacts: any[] = [];
  const stepCounter = { value: 0 };

  const service = {
    aiRun: {
      create: vi.fn(async ({ data }: any) => {
        const id = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const run = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        runs.set(id, run);
        return run;
      }),
      findUnique: vi.fn(async ({ where }: any) => runs.get(where.id) ?? null),
      findMany: vi.fn(async () => Array.from(runs.values())),
      update: vi.fn(async ({ where, data }: any) => {
        const run = runs.get(where.id);
        if (!run) return null;
        const updated = { ...run, ...data, updatedAt: new Date() };
        runs.set(where.id, updated);
        return updated;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        // Conditional update: only succeeds if current status matches filter.
        // Supports: { id, status } filter + data patch.
        const run = runs.get(where.id);
        if (!run || (where.status !== undefined && run.status !== where.status)) {
          return { count: 0 };
        }
        const updated = { ...run, ...data, updatedAt: new Date() };
        runs.set(where.id, updated);
        return { count: 1 };
      }),
      count: vi.fn(async () => runs.size),
    },
    aiRunStep: {
      create: vi.fn(async ({ data }: any) => {
        const id = `step-${stepCounter.value++}`;
        const step = {
          id,
          ...data,
          createdAt: new Date(),
          startedAt: data.startedAt ?? null,
          completedAt: data.completedAt ?? null,
        };
        const runId = data.aiRunId;
        if (!steps.has(runId)) steps.set(runId, []);
        steps.get(runId)!.push(step);
        return step;
      }),
      createMany: vi.fn(async ({ data }: any) => {
        const runId = data[0].aiRunId;
        steps.set(runId, data.map((d: any, i: number) => ({
          id: `step-${stepCounter.value++}`,
          ...d,
          createdAt: new Date(),
        })));
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        const runSteps = steps.get(where.aiRunId) ?? [];
        return runSteps.find((s) => s.stepName === where.stepName) ?? null;
      }),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }: any) => {
        // find by step id across all runs
        for (const stepsArr of steps.values()) {
          const idx = stepsArr.findIndex((s) => s.id === where.id);
          if (idx !== -1) {
            stepsArr[idx] = { ...stepsArr[idx], ...data };
            return stepsArr[idx];
          }
        }
        return null;
      }),
      count: vi.fn(async ({ where }: any) => {
        return (steps.get(where.aiRunId) ?? []).length;
      }),
    },
    aiEvent: {
      create: vi.fn(async ({ data }: any) => {
        const event = { id: `evt-${events.length}`, ...data, createdAt: new Date() };
        events.push(event);
        return event;
      }),
      findMany: vi.fn(async () => events.filter((e) => e.aiRunId)),
    },
    aiArtifact: {
      create: vi.fn(async ({ data }: any) => {
        const artifact = { id: `art-${artifacts.length}`, ...data, createdAt: new Date() };
        artifacts.push(artifact);
        return artifact;
      }),
    },
    contentPage: {
      findUnique: vi.fn(async ({ where }: any) => null),
    },
    aiApproval: { findMany: vi.fn(async () => []) },
    aiCostLog: { findMany: vi.fn(async () => []) },
    agentJob: { groupBy: vi.fn(async () => []) },
  };

  return { service, runs, steps, events, artifacts, stepCounter };
}

function mockCoordinatorService(overrides?: {
  runProductPipeline?: (url: string, storeSlug?: string, reviews?: any) => Promise<PipelineResult>;
  runDiscoveryPipeline?: (maxProducts?: number, source?: 'amazon' | 'noon' | 'all') => Promise<DiscoveryPipelineResult>;
  runContentPipeline?: (
    type: string,
    topic: string,
    slug?: string,
    productIds?: string[],
    categoryId?: string,
  ) => Promise<ContentPipelineResult>;
}) {
  const defaultPipelineResult: PipelineResult = {
    productId: 'prod_123',
    productName: 'Test Product',
    steps: {
      acquisition: 'success',
      reviews: 'success',
      verdict: 'success',
      publish: 'success',
    },
    totalTimeMs: 1500,
  };

  const defaultContentResult: ContentPipelineResult = {
    page: { id: 'page_123', title: 'Test Page' } as any,
    seoBrief: { primaryKeyword: 'test', secondaryKeywords: [] } as any,
    seoAudit: { passed: true, overallScore: 85, scoreAr: 84, scoreEn: 86 } as any,
    qualityCheck: { passed: true, score: 90 } as any,
    status: 'PENDING_APPROVAL',
  };

  const defaultDiscoveryResult: DiscoveryPipelineResult = {
    discovered: 3,
    total: 2,
    succeeded: 2,
    failed: 0,
    results: [
      { url: 'https://www.amazon.sa/dp/one', name: 'Amazon Baby Product', success: true },
      { url: 'https://www.noon.com/saudi-en/two/p', name: 'Noon Baby Product', success: true },
    ],
  };

  return {
    runProductPipeline: vi.fn(
      overrides?.runProductPipeline ?? (async () => defaultPipelineResult),
    ),
    runContentPipeline: vi.fn(
      overrides?.runContentPipeline ?? (async () => defaultContentResult),
    ),
    runDiscoveryPipeline: vi.fn(
      overrides?.runDiscoveryPipeline ?? (async () => defaultDiscoveryResult),
    ),
  };
}

interface SocialPipelineResult {
  contentPageId: string;
  postsCreated: number;
  posts: Array<{
    id: string;
    locale: 'ar' | 'en';
    platform: string;
    format: string;
    status: string;
    tweetCount: number;
    hashtagCount: number;
    complianceScore: number | null;
  }>;
  totalTimeMs: number;
}

function mockSocialCoordinatorService(overrides?: {
  runSocialPipeline?: (contentPageId: string, platforms?: string[]) => Promise<SocialPipelineResult>;
}) {
  const defaultResult: SocialPipelineResult = {
    contentPageId: 'page_123',
    postsCreated: 4,
    posts: [
      { id: 'post_1', locale: 'ar', platform: 'twitter', format: 'thread_ar', status: 'PENDING_APPROVAL', tweetCount: 5, hashtagCount: 3, complianceScore: 88 },
      { id: 'post_2', locale: 'ar', platform: 'twitter', format: 'single_ar', status: 'PENDING_APPROVAL', tweetCount: 1, hashtagCount: 3, complianceScore: 88 },
      { id: 'post_3', locale: 'en', platform: 'twitter', format: 'thread_en', status: 'PENDING_APPROVAL', tweetCount: 4, hashtagCount: 2, complianceScore: 88 },
      { id: 'post_4', locale: 'en', platform: 'twitter', format: 'single_en', status: 'PENDING_APPROVAL', tweetCount: 1, hashtagCount: 2, complianceScore: 88 },
    ],
    totalTimeMs: 3200,
  };

  return {
    runSocialPipeline: vi.fn(
      overrides?.runSocialPipeline ?? (async () => defaultResult),
    ),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AiOsService — enqueue', () => {
  let service: AiOsService;
  let mockDb: ReturnType<typeof mockPrismaService>;

  beforeEach(() => {
    resetQueueService();
    mockDb = mockPrismaService();
    service = new AiOsService(mockDb.service as any);
  });

  it('enqueues a PENDING run and emits QUEUED event', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Test Run', type: 'MANUAL', status: AiRunStatus.PENDING },
    });

    await service.enqueueRun(run.id);

    expect(mockDb.service.aiEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiRunId: run.id,
          type: AiEventType.QUEUED,
          message: 'Run enqueued for processing',
        }),
      }),
    );
  });

  it('rejects enqueue for a RUNNING run', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Test Run', type: 'MANUAL', status: AiRunStatus.RUNNING },
    });

    await expect(service.enqueueRun(run.id)).rejects.toThrow(
      'Only PENDING runs can be enqueued',
    );
  });

  it('rejects enqueue for a COMPLETED run', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Test Run', type: 'MANUAL', status: AiRunStatus.COMPLETED },
    });

    await expect(service.enqueueRun(run.id)).rejects.toThrow(
      'Only PENDING runs can be enqueued',
    );
  });

  it('rejects enqueue for a CANCELLED run', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Test Run', type: 'MANUAL', status: AiRunStatus.CANCELLED },
    });

    await expect(service.enqueueRun(run.id)).rejects.toThrow(
      'Only PENDING runs can be enqueued',
    );
  });

  it('throws NotFoundException for unknown run id', async () => {
    await expect(service.enqueueRun('nonexistent')).rejects.toThrow('not found');
  });
});

describe('AiOsWorkerService — placeholder processing (non-product types)', () => {
  let worker: AiOsWorkerService;
  let service: AiOsService;
  let mockDb: ReturnType<typeof mockPrismaService>;
  let mockCoordinator: ReturnType<typeof mockCoordinatorService>;
  let mockSocialCoordinator: ReturnType<typeof mockSocialCoordinatorService>;

  beforeEach(() => {
    resetQueueService();
    mockDb = mockPrismaService();
    mockCoordinator = mockCoordinatorService();
    mockSocialCoordinator = mockSocialCoordinatorService();
    service = new AiOsService(mockDb.service as any);
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);
  });

  it('processes a PENDING run through all placeholder steps to COMPLETED', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Test Run', type: 'MANUAL', status: AiRunStatus.PENDING },
    });

    // Enqueue
    await service.enqueueRun(run.id);

    // Process via worker
    await worker.pollOnce();

    // Run should be COMPLETED
    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);
    expect(updatedRun.completedAt).toBeTruthy();
    expect(updatedRun.startedAt).toBeTruthy();

    // Steps should exist and all be COMPLETED
    const runSteps = mockDb.steps.get(run.id) ?? [];
    expect(runSteps.length).toBe(6); // data_acquisition, review_analysis, verdict_generation, content_writer, quality_guard, publisher

    for (const step of runSteps) {
      expect(step.status).toBe(AiStepStatus.COMPLETED);
    }
  });

  it('does not execute a CANCELLED run', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Cancelled Run', type: 'MANUAL', status: AiRunStatus.CANCELLED },
    });

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.CANCELLED);
  });

  it('emits STARTED and COMPLETED events during processing', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Test Run', type: 'MANUAL', status: AiRunStatus.PENDING },
    });

    await service.enqueueRun(run.id);
    await worker.pollOnce();

    const eventTypes = mockDb.events.map((e) => e.type);
    expect(eventTypes).toContain(AiEventType.QUEUED);
    expect(eventTypes).toContain(AiEventType.STARTED);
    expect(eventTypes).toContain(AiEventType.COMPLETED);
  });

  it('skips runs with non-PENDING status in the queue', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Already Running', type: 'MANUAL', status: AiRunStatus.RUNNING },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.RUNNING); // unchanged
  });
});

describe('AiOsWorkerService — PRODUCT_PIPELINE real execution', () => {
  let worker: AiOsWorkerService;
  let mockDb: ReturnType<typeof mockPrismaService>;
  let mockCoordinator: ReturnType<typeof mockCoordinatorService>;
  let mockSocialCoordinator: ReturnType<typeof mockSocialCoordinatorService>;

  beforeEach(() => {
    resetQueueService();
    mockDb = mockPrismaService();
    mockCoordinator = mockCoordinatorService();
    mockSocialCoordinator = mockSocialCoordinatorService();
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);
  });

  it('calls CoordinatorService.runProductPipeline when run type is PRODUCT_PIPELINE with valid url', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Product Run',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { url: 'https://example.com/product/1', storeSlug: 'amazon' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    expect(mockCoordinator.runProductPipeline).toHaveBeenCalledWith(
      'https://example.com/product/1',
      'amazon',
      undefined,
    );
  });

  it('marks run COMPLETED with artifact on successful pipeline execution', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Product Run',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { url: 'https://example.com/product/1' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);
    expect(updatedRun.completedAt).toBeTruthy();

    // Artifact should be created with pipeline result
    expect(mockDb.service.aiArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiRunId: run.id,
          name: 'product_pipeline_result',
          type: 'JSON',
        }),
      }),
    );
  });

  it('creates a single product_pipeline step (not 6 placeholder steps)', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Product Run',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { url: 'https://example.com/product/1' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const runSteps = mockDb.steps.get(run.id) ?? [];
    expect(runSteps.length).toBe(1);
    expect(runSteps[0].stepName).toBe('product_pipeline');
    expect(runSteps[0].status).toBe(AiStepStatus.COMPLETED);
    expect(runSteps[0].output).toMatchObject({
      productId: 'prod_123',
      productName: 'Test Product',
    });
  });

  it('marks run FAILED with ERROR event when input.url is missing', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Bad Product Run',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { storeSlug: 'amazon' }, // url is intentionally missing
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('missing required input.url');

    // Coordinator should NOT have been called
    expect(mockCoordinator.runProductPipeline).not.toHaveBeenCalled();
  });

  it('marks run FAILED when input is entirely null', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Null Input Run',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: null,
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('missing required input.url');
    expect(mockCoordinator.runProductPipeline).not.toHaveBeenCalled();
  });

  it('marks run FAILED when input.url is whitespace-only (blank after trim)', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Blank URL Run',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { url: '   \n\t  ', storeSlug: 'amazon' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('missing required input.url');
    expect(mockCoordinator.runProductPipeline).not.toHaveBeenCalled();
  });

  it('marks run FAILED (not COMPLETED) when acquisition step failed in pipeline result', async () => {
    mockCoordinator = mockCoordinatorService({
      runProductPipeline: async (): Promise<PipelineResult> => ({
        productId: '',
        productName: '',
        steps: { acquisition: 'failed', reviews: 'skipped', verdict: 'failed', publish: 'failed' },
        totalTimeMs: 500,
      }),
    });
    // Need to re-construct worker with new mock
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Failing Product Run',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { url: 'https://example.com/product/1' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED); // hard failure — run itself fails
    expect(updatedRun.error).toContain('acquisition');

    const runSteps = mockDb.steps.get(run.id) ?? [];
    expect(runSteps.length).toBe(1);
    expect(runSteps[0].stepName).toBe('product_pipeline');
    expect(runSteps[0].status).toBe(AiStepStatus.FAILED);

    // Artifact should NOT be created on hard failure
    expect(mockDb.service.aiArtifact.create).not.toHaveBeenCalled();
  });

  it('marks run FAILED when acquisition succeeds but productId is missing (empty string)', async () => {
    mockCoordinator = mockCoordinatorService({
      runProductPipeline: async (): Promise<PipelineResult> => ({
        productId: '',
        productName: 'No Product Found',
        steps: { acquisition: 'success', reviews: 'skipped', verdict: 'failed', publish: 'failed' },
        totalTimeMs: 300,
      }),
    });
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'No ProductId Run',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { url: 'https://example.com/not-a-product' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('no productId');

    const runSteps = mockDb.steps.get(run.id) ?? [];
    expect(runSteps.length).toBe(1);
    expect(runSteps[0].status).toBe(AiStepStatus.FAILED);

    // No artifact when productId is missing
    expect(mockDb.service.aiArtifact.create).not.toHaveBeenCalled();
  });

  it('coordinator failure propagates to retry / failure path', async () => {
    const coordinatorError = new Error('Circuit breaker open');
    mockCoordinator = mockCoordinatorService({
      runProductPipeline: vi.fn(async () => {
        throw coordinatorError;
      }),
    });
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Coordinating Failure Run',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { url: 'https://example.com/product/1' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    // In in-process mode, processRun throws → caught in poll() → markRunFailed
    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    // poll() catches processRun errors and calls markRunFailed
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('Circuit breaker open');
  });

  it('marks run COMPLETED (not FAILED) when acquisition succeeds but later stages fail with productId present', async () => {
    mockCoordinator = mockCoordinatorService({
      runProductPipeline: async (): Promise<PipelineResult> => ({
        productId: 'prod_partial',
        productName: 'Partial Product',
        steps: { acquisition: 'success', reviews: 'failed', verdict: 'failed', publish: 'failed' },
        totalTimeMs: 800,
      }),
    });
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Partial Pipeline Run',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { url: 'https://example.com/product/partial' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    // Partial pipeline with productId → run COMPLETED (not FAILED)
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);

    const runSteps = mockDb.steps.get(run.id) ?? [];
    expect(runSteps.length).toBe(1);
    expect(runSteps[0].status).toBe(AiStepStatus.COMPLETED);

    // Artifact SHOULD be created for partial pipeline
    expect(mockDb.service.aiArtifact.create).toHaveBeenCalled();

    // An ERROR event should be emitted (not WARNING or INFO)
    const errorEvents = mockDb.events.filter(
      (e: any) => e.type === AiEventType.ERROR && e.aiRunId === run.id,
    );
    expect(errorEvents.length).toBeGreaterThan(0);
  });

  it('emits WARNING event before calling coordinator (idempotency notice)', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Product Run',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { url: 'https://example.com/product/1' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const warningEvents = mockDb.events.filter(
      (e: any) => e.type === AiEventType.WARNING && e.message.includes('idempotent'),
    );
    expect(warningEvents.length).toBeGreaterThan(0);
  });

  it('non-product and non-content types still use placeholder and do NOT call coordinator', async () => {
    mockCoordinator = mockCoordinatorService();
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Manual Run',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);

    // Should have 6 placeholder steps
    const runSteps = mockDb.steps.get(run.id) ?? [];
    expect(runSteps.length).toBe(6);

    // Coordinator should NOT have been called
    expect(mockCoordinator.runProductPipeline).not.toHaveBeenCalled();
    expect(mockCoordinator.runContentPipeline).not.toHaveBeenCalled();
  });
});

describe('AiOsWorkerService — DISCOVERY real execution', () => {
  let worker: AiOsWorkerService;
  let mockDb: ReturnType<typeof mockPrismaService>;
  let mockCoordinator: ReturnType<typeof mockCoordinatorService>;
  let mockSocialCoordinator: ReturnType<typeof mockSocialCoordinatorService>;

  beforeEach(() => {
    resetQueueService();
    mockDb = mockPrismaService();
    mockCoordinator = mockCoordinatorService();
    mockSocialCoordinator = mockSocialCoordinatorService();
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);
  });

  async function enqueueAndPoll(runId: string) {
    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(runId);
    await worker.pollOnce();
  }

  it('calls CoordinatorService.runDiscoveryPipeline for DISCOVERY runs with source and maxProducts', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Amazon Discovery',
        type: 'DISCOVERY',
        status: AiRunStatus.PENDING,
        input: { source: 'amazon', maxProducts: 12 },
      },
    });

    await enqueueAndPoll(run.id);

    expect(mockCoordinator.runDiscoveryPipeline).toHaveBeenCalledWith(12, 'amazon');

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);

    const runSteps = mockDb.steps.get(run.id) ?? [];
    expect(runSteps.length).toBe(1);
    expect(runSteps[0].stepName).toBe('discovery_pipeline');
    expect(runSteps[0].status).toBe(AiStepStatus.COMPLETED);

    expect(mockDb.service.aiArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiRunId: run.id,
          name: 'discovery_pipeline_result',
          type: 'JSON',
        }),
      }),
    );
  });

  it('defaults DISCOVERY source to all and maxProducts to 10', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Default Discovery',
        type: 'DISCOVERY',
        status: AiRunStatus.PENDING,
        input: {},
      },
    });

    await enqueueAndPoll(run.id);

    expect(mockCoordinator.runDiscoveryPipeline).toHaveBeenCalledWith(10, 'all');
  });

  it('clamps DISCOVERY maxProducts to the safe 1-50 range', async () => {
    const highRun = await mockDb.service.aiRun.create({
      data: {
        name: 'High Discovery',
        type: 'DISCOVERY',
        status: AiRunStatus.PENDING,
        input: { source: 'noon', maxProducts: 500 },
      },
    });

    await enqueueAndPoll(highRun.id);

    const lowRun = await mockDb.service.aiRun.create({
      data: {
        name: 'Low Discovery',
        type: 'DISCOVERY',
        status: AiRunStatus.PENDING,
        input: { source: 'amazon', maxProducts: -10 },
      },
    });

    await enqueueAndPoll(lowRun.id);

    expect(mockCoordinator.runDiscoveryPipeline).toHaveBeenNthCalledWith(1, 50, 'noon');
    expect(mockCoordinator.runDiscoveryPipeline).toHaveBeenNthCalledWith(2, 1, 'amazon');
  });

  it('marks DISCOVERY run FAILED for invalid source and does not call coordinator', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Bad Discovery',
        type: 'DISCOVERY',
        status: AiRunStatus.PENDING,
        input: { source: 'target', maxProducts: 5 },
      },
    });

    await enqueueAndPoll(run.id);

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('invalid input.source');
    expect(mockCoordinator.runDiscoveryPipeline).not.toHaveBeenCalled();
  });

  it('marks DISCOVERY run FAILED when coordinator throws', async () => {
    mockCoordinator = mockCoordinatorService({
      runDiscoveryPipeline: vi.fn(async () => {
        throw new Error('Discovery provider unavailable');
      }),
    });
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Provider Failure',
        type: 'DISCOVERY',
        status: AiRunStatus.PENDING,
        input: { source: 'all', maxProducts: 10 },
      },
    });

    await enqueueAndPoll(run.id);

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('Discovery provider unavailable');

    const runSteps = mockDb.steps.get(run.id) ?? [];
    expect(runSteps.length).toBe(1);
    expect(runSteps[0].stepName).toBe('discovery_pipeline');
    expect(runSteps[0].status).toBe(AiStepStatus.FAILED);
  });
});

describe('AiOsWorkerService — CONTENT_PIPELINE real execution', () => {
  let worker: AiOsWorkerService;
  let mockDb: ReturnType<typeof mockPrismaService>;
  let mockCoordinator: ReturnType<typeof mockCoordinatorService>;
  let mockSocialCoordinator: ReturnType<typeof mockSocialCoordinatorService>;

  beforeEach(() => {
    resetQueueService();
    mockDb = mockPrismaService();
    mockCoordinator = mockCoordinatorService();
    mockSocialCoordinator = mockSocialCoordinatorService();
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);
  });

  it('calls CoordinatorService.runContentPipeline with correct inputs', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Content Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: {
          type: 'BEST_LIST',
          topic: 'أفضل منتجات الأطفال',
          slug: 'best-baby-products',
          productIds: ['p1', 'p2'],
          categoryId: 'cat_1',
        },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    expect(mockCoordinator.runContentPipeline).toHaveBeenCalledWith(
      'BEST_LIST',
      'أفضل منتجات الأطفال',
      'best-baby-products',
      ['p1', 'p2'],
      'cat_1',
    );
  });

  it('marks run COMPLETED with artifact and content_pipeline step on success', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Content Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'BEST_LIST', topic: 'أفضل منتجات الأطفال' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);
    expect(updatedRun.completedAt).toBeTruthy();

    // Should have 1 content_pipeline step
    const runSteps = mockDb.steps.get(run.id) ?? [];
    expect(runSteps.length).toBe(1);
    expect(runSteps[0].stepName).toBe('content_pipeline');
    expect(runSteps[0].status).toBe(AiStepStatus.COMPLETED);

    // Artifact should be created
    expect(mockDb.service.aiArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiRunId: run.id,
          name: 'content_pipeline_result',
          type: 'JSON',
        }),
      }),
    );
  });

  it('marks run FAILED with ERROR event when input.type is missing', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Bad Content Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { topic: 'أفضل منتجات الأطفال' }, // type is missing
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('missing required input.type');

    // Coordinator should NOT have been called
    expect(mockCoordinator.runContentPipeline).not.toHaveBeenCalled();
  });

  it('marks run FAILED with ERROR event when input.type is blank', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Blank Type Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: '   ', topic: 'أفضل منتجات الأطفال' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('missing required input.type');
    expect(mockCoordinator.runContentPipeline).not.toHaveBeenCalled();
  });

  it('marks run FAILED with ERROR event when input.topic is missing', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Missing Topic Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'BEST_LIST' }, // topic is missing
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('missing required input.topic');
    expect(mockCoordinator.runContentPipeline).not.toHaveBeenCalled();
  });

  it('marks run FAILED when coordinator throws', async () => {
    mockCoordinator = mockCoordinatorService({
      runContentPipeline: vi.fn(async () => {
        throw new Error('Circuit breaker open');
      }),
    });
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Content Fail Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'BEST_LIST', topic: 'Test' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    // In in-process mode, processRun throws → caught in poll() → markRunFailed
    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('Circuit breaker open');
  });

  it('marks run FAILED when coordinator returns no pageId (hard failure)', async () => {
    mockCoordinator = mockCoordinatorService({
      runContentPipeline: vi.fn(async () => ({
        page: null,
        seoBrief: {} as any,
        seoAudit: null,
        qualityCheck: null,
        status: 'FAILED',
      })),
    });
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'No Page Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'BEST_LIST', topic: 'Test' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('no pageId');

    const runSteps = mockDb.steps.get(run.id) ?? [];
    expect(runSteps.length).toBe(1);
    expect(runSteps[0].status).toBe(AiStepStatus.FAILED);

    // No artifact when pageId is missing
    expect(mockDb.service.aiArtifact.create).not.toHaveBeenCalled();
  });

  it('marks run COMPLETED with WARNING when content produced but quality check fails', async () => {
    mockCoordinator = mockCoordinatorService({
      runContentPipeline: vi.fn(async () => ({
        page: { id: 'page_fail_q' } as any,
        seoBrief: { primaryKeyword: 'test', secondaryKeywords: [] } as any,
        seoAudit: { passed: true, overallScore: 80, scoreAr: 79, scoreEn: 81 } as any,
        qualityCheck: { passed: false, score: 45 },
        status: 'QUALITY_CHECK',
      })),
    });
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Quality Fail Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'BEST_LIST', topic: 'Test' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);

    // Should have emitted a WARNING event
    const warningEvents = mockDb.events.filter(
      (e: any) => e.type === AiEventType.WARNING && e.aiRunId === run.id,
    );
    expect(warningEvents.length).toBeGreaterThan(0);

    // Artifact should be created (content was produced)
    expect(mockDb.service.aiArtifact.create).toHaveBeenCalled();
  });

  it('marks run FAILED when input.type is not one of BEST_LIST, PRODUCT_REVIEW, BUYING_GUIDE', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Invalid Type Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'INVALID_TYPE', topic: 'Test Topic' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('INVALID_TYPE');
    expect(updatedRun.error).toContain('must be one of');

    // Coordinator should NOT have been called
    expect(mockCoordinator.runContentPipeline).not.toHaveBeenCalled();
  });

  it('marks run FAILED when input.type is whitespace-only (still invalid after trim)', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Whitespace Type Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: '   ', topic: 'Test Topic' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('missing required input.type');
  });

  it('marks run FAILED when productIds is not an array', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Bad ProductIds Type',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'BEST_LIST', topic: 'Test', productIds: 'not-an-array' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('productIds must be an array of non-empty strings');
    expect(mockCoordinator.runContentPipeline).not.toHaveBeenCalled();
  });

  it('marks run FAILED when productIds contains empty strings', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Empty String in ProductIds',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'BEST_LIST', topic: 'Test', productIds: ['prod_1', '', '  ', 'prod_3'] },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('productIds must be an array of non-empty strings');
    expect(mockCoordinator.runContentPipeline).not.toHaveBeenCalled();
  });

  it('passes valid non-empty productIds to coordinator', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Valid ProductIds Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'BEST_LIST', topic: 'Test', productIds: ['  prod_1  ', 'prod_2'] },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    // coordinator should have been called with trimmed, non-empty ids
    expect(mockCoordinator.runContentPipeline).toHaveBeenCalledWith(
      'BEST_LIST',
      'Test',
      expect.any(String),
      ['prod_1', 'prod_2'],
      undefined,
    );
  });

  it('omitted slug is generated from topic+type and passed to coordinator', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'No Slug Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'BUYING_GUIDE', topic: 'أفضل منتجات الأطفال' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    // coordinator should have been called with a generated slug (non-empty string)
    const call = mockCoordinator.runContentPipeline.mock.calls[0];
    expect(call[0]).toBe('BUYING_GUIDE');
    expect(call[1]).toBe('أفضل منتجات الأطفال');
    expect(typeof call[2]).toBe('string');
    expect((call[2] as string).length).toBeGreaterThan(0);
  });

  it('blank slug is replaced with generated slug from topic+type', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Blank Slug Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'PRODUCT_REVIEW', topic: 'Test Product', slug: '   ' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const call = mockCoordinator.runContentPipeline.mock.calls[0];
    expect(typeof call[2]).toBe('string');
    expect((call[2] as string).length).toBeGreaterThan(0);
  });

  it('generateSlug is deterministic: same Arabic topic + type yields identical slug on repeated runs', async () => {
    // Access the private generateSlug method for unit testing
    const generateSlug = (worker as any).generateSlug.bind(worker);

    const topic = 'أفضل منتجات الأطفال';
    const type = 'BUYING_GUIDE';

    const slug1 = generateSlug(topic, type);
    const slug2 = generateSlug(topic, type);
    const slug3 = generateSlug(topic, type);

    // Must be non-empty
    expect(slug1.length).toBeGreaterThan(0);
    // Must be deterministic across calls
    expect(slug2).toBe(slug1);
    expect(slug3).toBe(slug1);
    // Must start with type prefix (since Arabic topic strips to empty)
    expect(slug1).toMatch(/^buying_guide-/);
  });

  it('duplicate slug causes run to FAIL with clear message without calling coordinator', async () => {
    // Override findUnique to return an existing page for 'existing-slug'
    (mockDb.service as any).contentPage.findUnique = vi.fn(async ({ where }: any) => {
      if (where.slug === 'existing-slug') return { id: 'page_existing', slug: 'existing-slug' };
      return null;
    });

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Duplicate Slug Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'BEST_LIST', topic: 'Test', slug: 'existing-slug' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('already exists');
    expect(updatedRun.error).toContain('existing-slug');

    // Coordinator should NOT have been called
    expect(mockCoordinator.runContentPipeline).not.toHaveBeenCalled();

    // An ERROR event should have been added
    const errorEvents = mockDb.events.filter(
      (e: any) => e.type === AiEventType.ERROR && e.aiRunId === run.id,
    );
    expect(errorEvents.length).toBeGreaterThan(0);
  });

  it('does NOT call runProductPipeline for CONTENT_PIPELINE runs', async () => {
    mockCoordinator = mockCoordinatorService();
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Content Run',
        type: 'CONTENT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { type: 'BEST_LIST', topic: 'Test' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    expect(mockCoordinator.runProductPipeline).not.toHaveBeenCalled();
  });
});

describe('InProcessQueueService', () => {
  beforeEach(() => resetQueueService());

  it('enqueues and dequeues run IDs in FIFO order', async () => {
    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService() as InProcessQueueService;

    await queue.enqueue('run-1');
    await queue.enqueue('run-2');
    await queue.enqueue('run-3');

    expect(await queue.dequeue()).toBe('run-1');
    expect(await queue.dequeue()).toBe('run-2');
    expect(await queue.dequeue()).toBe('run-3');
    expect(await queue.dequeue()).toBeNull();
  });

  it('idempotent enqueue — same run ID twice is a no-op', async () => {
    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService() as InProcessQueueService;

    await queue.enqueue('run-1');
    await queue.enqueue('run-1');

    expect(await queue.dequeue()).toBe('run-1');
    expect(await queue.dequeue()).toBeNull(); // only one entry
  });

  it('ack removes run from pending set', async () => {
    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService() as InProcessQueueService;

    await queue.enqueue('run-1');
    expect(await queue.dequeue()).toBe('run-1');

    await queue.ack('run-1');
    // no error
  });

  it('nack re-enqueues at the back', async () => {
    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService() as InProcessQueueService;

    await queue.enqueue('run-1');
    await queue.enqueue('run-2');
    expect(await queue.dequeue()).toBe('run-1'); // run-1 is now pending

    await queue.nack('run-1'); // re-enqueue run-1 at back

    expect(await queue.dequeue()).toBe('run-2');
    expect(await queue.dequeue()).toBe('run-1');
  });

  it('isAvailable always returns true for in-process queue', async () => {
    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService() as InProcessQueueService;
    expect(queue.isAvailable()).toBe(true);
  });
});

describe('AiOsWorkerService — SOCIAL_PIPELINE real execution', () => {
  let worker: AiOsWorkerService;
  let mockDb: ReturnType<typeof mockPrismaService>;
  let mockCoordinator: ReturnType<typeof mockCoordinatorService>;
  let mockSocialCoordinator: ReturnType<typeof mockSocialCoordinatorService>;

  beforeEach(() => {
    resetQueueService();
    mockDb = mockPrismaService();
    mockCoordinator = mockCoordinatorService();
    mockSocialCoordinator = mockSocialCoordinatorService();
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);
  });

  it('calls socialCoordinator.runSocialPipeline when MANUAL run has action=social_pipeline with valid contentPageId', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Social Run',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'social_pipeline', contentPageId: 'page_123' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    expect(mockSocialCoordinator.runSocialPipeline).toHaveBeenCalledWith('page_123', ['twitter']);
  });

  it('marks run FAILED with ERROR event when contentPageId is missing', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Social Run Missing Id',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'social_pipeline' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('contentPageId');

    const errorEvent = mockDb.events.find(
      (e: any) => e.aiRunId === run.id && e.type === AiEventType.ERROR,
    );
    expect(errorEvent).toBeTruthy();
    expect(mockSocialCoordinator.runSocialPipeline).not.toHaveBeenCalled();
  });

  it('marks run FAILED with ERROR event when contentPageId is blank string', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Social Run Blank Id',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'social_pipeline', contentPageId: '   ' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('contentPageId');
  });

  it('marks run FAILED with ERROR event when platforms array contains unsupported value', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Social Run Bad Platform',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'social_pipeline', contentPageId: 'page_123', platforms: ['facebook'] },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('unsupported platform');

    const errorEvent = mockDb.events.find(
      (e: any) => e.aiRunId === run.id && e.type === AiEventType.ERROR,
    );
    expect(errorEvent).toBeTruthy();
    expect(errorEvent.message).toContain('facebook');
    expect(mockSocialCoordinator.runSocialPipeline).not.toHaveBeenCalled();
  });

  it('marks run FAILED with ERROR event when platforms is not an array', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Social Run Bad Platforms Type',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'social_pipeline', contentPageId: 'page_123', platforms: 'twitter' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('platforms must be an array');
  });

  it('emits ERROR event when unsupported platform is requested', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Social Run With Unsupported Platform',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'social_pipeline', contentPageId: 'page_123', platforms: ['twitter', 'instagram'] },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const errorEvent = mockDb.events.find(
      (e: any) => e.aiRunId === run.id && e.type === AiEventType.ERROR,
    );
    expect(errorEvent).toBeTruthy();
    expect(errorEvent.message).toContain('instagram');
    expect(errorEvent.message).toContain('unsupported');

    // Should NOT call coordinator when validation fails
    expect(mockSocialCoordinator.runSocialPipeline).not.toHaveBeenCalled();
  });

  it('creates social_pipeline step and social_pipeline_result artifact on success', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Social Run Success',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'social_pipeline', contentPageId: 'page_123' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);

    // Step created
    const steps = mockDb.steps.get(run.id) ?? [];
    expect(steps.length).toBe(1);
    expect(steps[0].stepName).toBe('social_pipeline');
    expect(steps[0].status).toBe(AiStepStatus.COMPLETED);

    // Artifact created
    expect(mockDb.service.aiArtifact.create).toHaveBeenCalled();
    const artifactCall = mockDb.service.aiArtifact.create.mock.calls.find(
      (call: any) => call[0]?.data?.name === 'social_pipeline_result',
    );
    expect(artifactCall).toBeTruthy();
    const artifactData = artifactCall![0].data as any;
    expect(artifactData.content).toBeTruthy();
    const parsed = JSON.parse(artifactData.content);
    expect(parsed.postsCreated).toBe(4);
  });

  it('creates posts for both twitter and telegram when both platforms are requested', async () => {
    mockSocialCoordinator = mockSocialCoordinatorService({
      runSocialPipeline: vi.fn(async () => ({
        contentPageId: 'page_123',
        postsCreated: 4,
        posts: [
          { id: 'post_tw_ar', locale: 'ar' as const, platform: 'twitter', format: 'thread_ar', status: 'PENDING_APPROVAL', tweetCount: 5, hashtagCount: 3, complianceScore: 88 },
          { id: 'post_tw_en', locale: 'en' as const, platform: 'twitter', format: 'single_en', status: 'PENDING_APPROVAL', tweetCount: 1, hashtagCount: 2, complianceScore: 88 },
          { id: 'post_tg_ar', locale: 'ar' as const, platform: 'telegram', format: 'telegram_ar', status: 'PENDING_APPROVAL', tweetCount: 1, hashtagCount: 3, complianceScore: 88 },
          { id: 'post_tg_en', locale: 'en' as const, platform: 'telegram', format: 'telegram_en', status: 'PENDING_APPROVAL', tweetCount: 1, hashtagCount: 2, complianceScore: 88 },
        ],
        totalTimeMs: 3500,
      })),
    });
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Social Run Both Platforms',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'social_pipeline', contentPageId: 'page_123', platforms: ['twitter', 'telegram'] },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    expect(mockSocialCoordinator.runSocialPipeline).toHaveBeenCalledWith('page_123', ['twitter', 'telegram']);

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);

    const steps = mockDb.steps.get(run.id) ?? [];
    expect(steps.length).toBe(1);
    expect(steps[0].stepName).toBe('social_pipeline');
    expect(steps[0].status).toBe(AiStepStatus.COMPLETED);

    const artifactCall = mockDb.service.aiArtifact.create.mock.calls.find(
      (call: any) => call[0]?.data?.name === 'social_pipeline_result',
    );
    expect(artifactCall).toBeTruthy();
    const artifactData = artifactCall![0].data as any;
    const parsed = JSON.parse(artifactData.content);
    expect(parsed.postsCreated).toBe(4);
    expect(parsed.posts.some((p: any) => p.platform === 'twitter')).toBe(true);
    expect(parsed.posts.some((p: any) => p.platform === 'telegram')).toBe(true);
    expect(parsed.posts.filter((p: any) => p.platform === 'twitter').length).toBe(2);
    expect(parsed.posts.filter((p: any) => p.platform === 'telegram').length).toBe(2);
  });

  it('marks run FAILED when no posts are created (hard failure)', async () => {
    mockSocialCoordinator = mockSocialCoordinatorService({
      runSocialPipeline: vi.fn(async () => ({
        contentPageId: 'page_123',
        postsCreated: 0,
        posts: [],
        totalTimeMs: 100,
      })),
    });
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Social Run No Posts',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'social_pipeline', contentPageId: 'page_123' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('no posts');

    const steps = mockDb.steps.get(run.id) ?? [];
    expect(steps[0].status).toBe(AiStepStatus.FAILED);
  });

  it('propagates error when socialCoordinator.runSocialPipeline throws', async () => {
    mockSocialCoordinator = mockSocialCoordinatorService({
      runSocialPipeline: vi.fn(async () => {
        throw new Error('Social coordinator error');
      }),
    });
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Social Run Throws',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'social_pipeline', contentPageId: 'page_123' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    // In in-process mode, processRun throws → caught in poll() → markRunFailed
    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('Social coordinator error');
  });

  it('uses twitter only when platforms omitted (defaults to twitter)', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Social Run Default Platform',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'social_pipeline', contentPageId: 'page_xyz' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    expect(mockSocialCoordinator.runSocialPipeline).toHaveBeenCalledWith('page_xyz', ['twitter']);
    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);
  });

  it(' MANUAL run without social_pipeline action still uses placeholder', async () => {
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Manual Non-Social Run',
        type: 'MANUAL',
        status: AiRunStatus.PENDING,
        input: { action: 'some_other_action' },
      },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    expect(mockSocialCoordinator.runSocialPipeline).not.toHaveBeenCalled();
    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);

    // Should have all placeholder steps
    const steps = mockDb.steps.get(run.id) ?? [];
    expect(steps.length).toBe(6); // data_acquisition, review_analysis, verdict_generation, content_writer, quality_guard, publisher
  });
});

describe('Cancellation guard integration', () => {
  let worker: AiOsWorkerService;
  let service: AiOsService;
  let mockDb: ReturnType<typeof mockPrismaService>;
  let mockCoordinator: ReturnType<typeof mockCoordinatorService>;
  let mockSocialCoordinator: ReturnType<typeof mockSocialCoordinatorService>;

  beforeEach(() => {
    resetQueueService();
    mockDb = mockPrismaService();
    mockCoordinator = mockCoordinatorService();
    mockSocialCoordinator = mockSocialCoordinatorService();
    service = new AiOsService(mockDb.service as any);
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);
  });

  it('worker skips a CANCELLED run even if it was somehow enqueued', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Will Cancel', type: 'MANUAL', status: AiRunStatus.PENDING },
    });
    await service.enqueueRun(run.id);

    // Cancel it after enqueuing but before worker picks it up
    await service.cancelRun(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.CANCELLED);
    expect(updatedRun.startedAt ?? null).toBeNull();
  });

  it('PRODUCT_PIPELINE run also respects cancellation guard before coordinator call', async () => {
    // Set up a run that will be checked as not-cancelled (just below threshold)
    const run = await mockDb.service.aiRun.create({
      data: {
        name: 'Product Will Cancel',
        type: 'PRODUCT_PIPELINE',
        status: AiRunStatus.PENDING,
        input: { url: 'https://example.com/product/1' },
      },
    });
    await service.enqueueRun(run.id);
    await service.cancelRun(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.CANCELLED);
    expect(mockCoordinator.runProductPipeline).not.toHaveBeenCalled();
  });
});

describe('Conditional PENDING→RUNNING transition (race safety)', () => {
  let worker: AiOsWorkerService;
  let mockDb: ReturnType<typeof mockPrismaService>;
  let mockCoordinator: ReturnType<typeof mockCoordinatorService>;
  let mockSocialCoordinator: ReturnType<typeof mockSocialCoordinatorService>;

  beforeEach(() => {
    resetQueueService();
    mockDb = mockPrismaService();
    mockCoordinator = mockCoordinatorService();
    mockSocialCoordinator = mockSocialCoordinatorService();
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);
  });

  it('skips run when PENDING→RUNNING update returns count=0 (already cancelled)', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Cancelled Run', type: 'MANUAL', status: AiRunStatus.CANCELLED },
    });

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.CANCELLED);
    expect(updatedRun.startedAt ?? null).toBeNull();
  });

  it('marks run COMPLETED via conditional updateMany when status is still RUNNING', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Test Run', type: 'MANUAL', status: AiRunStatus.PENDING },
    });
    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);
    expect(updatedRun.completedAt).toBeTruthy();
  });
});

describe('processRun error handling', () => {
  let worker: AiOsWorkerService;
  let mockDb: ReturnType<typeof mockPrismaService>;

  beforeEach(() => {
    resetQueueService();
    mockDb = mockPrismaService();
    const mockCoordinator = mockCoordinatorService();
    const mockSocialCoordinator = mockSocialCoordinatorService();
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);
  });

  it('marks run FAILED when processRun throws', async () => {
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Fail Run', type: 'MANUAL', status: AiRunStatus.PENDING },
    });

    // Override updateMany to throw on PENDING→RUNNING transition, then
    // succeed on the subsequent markRunFailed call.
    let callCount = 0;
    mockDb.service.aiRun.updateMany.mockImplementation(
      async ({ where, data }: any) => {
        callCount++;
        if (callCount === 1) {
          // First call: PENDING→RUNNING in processRun — throw
          throw new Error('Connection lost');
        }
        // Second call: RUNNING→FAILED in markRunFailed — succeed
        const currentRun = mockDb.runs.get(where.id);
        if (!currentRun) return { count: 0 };
        mockDb.runs.set(where.id, { ...currentRun, ...data, updatedAt: new Date() });
        return { count: 1 };
      },
    );

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    const queue = getQueueService();
    await queue.enqueue(run.id);

    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.FAILED);
    expect(updatedRun.error).toContain('Connection lost');
  });
});

describe('BullMQ retry / final failure DB semantics', () => {
  let worker: AiOsWorkerService;
  let mockDb: ReturnType<typeof mockPrismaService>;
  let mockCoordinator: ReturnType<typeof mockCoordinatorService>;
  let mockSocialCoordinator: ReturnType<typeof mockSocialCoordinatorService>;

  beforeEach(() => {
    resetQueueService();
    mockDb = mockPrismaService();
    mockCoordinator = mockCoordinatorService();
    mockSocialCoordinator = mockSocialCoordinatorService();
    worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);
  });

  describe('resetRunForRetry — non-final failure', () => {
    it('resets a RUNNING run back to PENDING and clears startedAt', async () => {
      const run = await mockDb.service.aiRun.create({
        data: { name: 'Retry Test', type: 'MANUAL', status: AiRunStatus.RUNNING },
      });

      await worker['resetRunForRetry'](run.id);

      const updatedRun = mockDb.runs.get(run.id);
      expect(updatedRun.status).toBe(AiRunStatus.PENDING);
      expect(updatedRun.startedAt).toBeNull();
    });

    it('is a no-op when run is not RUNNING (e.g. cancelled)', async () => {
      const run = await mockDb.service.aiRun.create({
        data: { name: 'Cancelled Run', type: 'MANUAL', status: AiRunStatus.CANCELLED },
      });

      await worker['resetRunForRetry'](run.id);

      const updatedRun = mockDb.runs.get(run.id);
      expect(updatedRun.status).toBe(AiRunStatus.CANCELLED);
    });

    it('emits INFO event when resetting to PENDING', async () => {
      const run = await mockDb.service.aiRun.create({
        data: { name: 'Retry Event Test', type: 'MANUAL', status: AiRunStatus.RUNNING },
      });

      await worker['resetRunForRetry'](run.id);

      const retryEvent = mockDb.events.find(
        (e: any) => e.aiRunId === run.id && e.type === AiEventType.INFO,
      );
      expect(retryEvent).toBeTruthy();
      expect(retryEvent.message.toLowerCase()).toContain('retry');
    });
  });

  describe('markRunFailed — final failure', () => {
    it('marks a RUNNING run as FAILED with error message', async () => {
      const run = await mockDb.service.aiRun.create({
        data: { name: 'Final Failure Test', type: 'MANUAL', status: AiRunStatus.RUNNING },
      });

      await worker['markRunFailed'](run.id, 'All retries exhausted');

      const updatedRun = mockDb.runs.get(run.id);
      expect(updatedRun.status).toBe(AiRunStatus.FAILED);
      expect(updatedRun.error).toBe('All retries exhausted');
      expect(updatedRun.completedAt).toBeTruthy();
    });

    it('emits ERROR event when marking run FAILED', async () => {
      const run = await mockDb.service.aiRun.create({
        data: { name: 'Error Event Test', type: 'MANUAL', status: AiRunStatus.RUNNING },
      });

      await worker['markRunFailed'](run.id, 'Connection lost');

      const errorEvent = mockDb.events.find(
        (e: any) => e.aiRunId === run.id && e.type === AiEventType.ERROR,
      );
      expect(errorEvent).toBeTruthy();
      expect(errorEvent.message).toContain('Connection lost');
    });

    it('is a no-op when run is not RUNNING (already completed/cancelled)', async () => {
      const run = await mockDb.service.aiRun.create({
        data: { name: 'Already Done', type: 'MANUAL', status: AiRunStatus.COMPLETED },
      });

      await worker['markRunFailed'](run.id, 'Should not overwrite');

      const updatedRun = mockDb.runs.get(run.id);
      expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);
      expect(updatedRun.error ?? null).toBeNull();
    });
  });

  describe('retry is not a false success — non-final failure leaves run re-processable', () => {
    it('after resetRunForRetry, processRun can pick up the run and complete it', async () => {
      const run = await mockDb.service.aiRun.create({
        data: { name: 'Will Retry Then Succeed', type: 'MANUAL', status: AiRunStatus.RUNNING },
      });

      await worker['resetRunForRetry'](run.id);

      const afterReset = mockDb.runs.get(run.id);
      expect(afterReset.status).toBe(AiRunStatus.PENDING);

      await worker.processRun(run.id);

      const finalRun = mockDb.runs.get(run.id);
      expect(finalRun.status).toBe(AiRunStatus.COMPLETED);
    });

    it('resetRunForRetry is a no-op for a COMPLETED run (already succeeded)', async () => {
      const run = await mockDb.service.aiRun.create({
        data: { name: 'Already Completed', type: 'MANUAL', status: AiRunStatus.COMPLETED },
      });

      await worker['resetRunForRetry'](run.id);

      const updatedRun = mockDb.runs.get(run.id);
      expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);
    });
  });
});

describe('Singleton race — AiOsWorkerService queue capture', () => {
  it('worker uses correct queue singleton after onModuleInit re-assignment', async () => {
    resetQueueService();

    const { getQueueService } = await import('../../../infrastructure/queue/queue.service');
    void getQueueService(); // start init, don't await

    const mockDb = mockPrismaService();
    const mockCoordinator = mockCoordinatorService();
    const mockSocialCoordinator = mockSocialCoordinatorService();
    const worker = new AiOsWorkerService(mockDb.service as any, mockCoordinator as any, mockSocialCoordinator as any);

    await worker.onModuleInit();

    const queue = getQueueService();
    const run = await mockDb.service.aiRun.create({
      data: { name: 'Race Test', type: 'MANUAL', status: AiRunStatus.PENDING },
    });

    await queue.enqueue(run.id);
    await worker.pollOnce();

    const updatedRun = mockDb.runs.get(run.id);
    expect(updatedRun.status).toBe(AiRunStatus.COMPLETED);
  });
});
