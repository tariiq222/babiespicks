import { beforeEach, describe, expect, it, vi } from 'vitest';

type SchedulerServiceCtor = new (...args: any[]) => {
  ensureDefaultJobs: () => Promise<unknown>;
  executeDueJobs: (input: { now: Date; workerId: string }) => Promise<any>;
  triggerManual: (input: { key: string; actorId: string; input?: Record<string, unknown> }) => Promise<any>;
  publishScheduledSocialPosts: (input: { now: Date; workerId?: string }) => Promise<any>;
};

async function loadSchedulerService(): Promise<SchedulerServiceCtor> {
  const modulePath = new URL('../../src/features/cron/scheduler.service.ts', import.meta.url).href;
  const mod = await import(modulePath);
  expect(mod.SchedulerService).toBeTypeOf('function');
  return mod.SchedulerService as SchedulerServiceCtor;
}

function createPrismaMock() {
  const prisma = {
    scheduledJob: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    scheduledJobRun: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    aiRun: {
      create: vi.fn(),
      update: vi.fn(),
    },
    socialPost: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    approvalAuditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };

  return prisma;
}

describe('SchedulerService contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates default ScheduledJob rows using timezone Asia/Riyadh', async () => {
    const SchedulerService = await loadSchedulerService();
    const prisma = createPrismaMock();
    const handlers = { publishScheduledSocialPosts: vi.fn() };
    const service = new SchedulerService(prisma, handlers);

    await service.ensureDefaultJobs();

    expect(prisma.scheduledJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ timezone: 'Asia/Riyadh' }),
        update: expect.objectContaining({ timezone: 'Asia/Riyadh' }),
      }),
    );
  });

  it('uses ScheduledJob lock acquisition to prevent duplicate due-job execution', async () => {
    const SchedulerService = await loadSchedulerService();
    const prisma = createPrismaMock();
    const dueAt = new Date('2026-05-20T06:00:00.000Z');
    prisma.scheduledJob.findMany.mockResolvedValue([
      {
        id: 'job_social_publish',
        key: 'social-publish',
        handler: 'publishScheduledSocialPosts',
        status: 'ACTIVE',
        nextRunAt: dueAt,
        lockedUntil: new Date('2026-05-20T06:05:00.000Z'),
      },
    ]);
    prisma.scheduledJob.updateMany.mockResolvedValue({ count: 0 });
    const handlers = { publishScheduledSocialPosts: vi.fn() };
    const service = new SchedulerService(prisma, handlers);

    const result = await service.executeDueJobs({ now: dueAt, workerId: 'worker-a' });

    expect(prisma.scheduledJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'job_social_publish',
          OR: expect.any(Array),
        }),
        data: expect.objectContaining({
          lockKey: expect.any(String),
          lockedBy: 'worker-a',
          lockedUntil: expect.any(Date),
        }),
      }),
    );
    expect(handlers.publishScheduledSocialPosts).not.toHaveBeenCalled();
    expect(prisma.scheduledJobRun.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ executed: 0, skippedLocked: 1 });
  });

  it('manual trigger records both AiRun and ScheduledJobRun before invoking the handler', async () => {
    const SchedulerService = await loadSchedulerService();
    const prisma = createPrismaMock();
    prisma.scheduledJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job_social_publish',
      key: 'social-publish',
      handler: 'publishScheduledSocialPosts',
      timezone: 'Asia/Riyadh',
    });
    prisma.aiRun.create.mockResolvedValue({ id: 'airun_manual_1' });
    prisma.scheduledJobRun.create.mockResolvedValue({ id: 'jobrun_manual_1' });
    const handlers = { publishScheduledSocialPosts: vi.fn().mockResolvedValue({ published: 0 }) };
    const service = new SchedulerService(prisma, handlers);

    await service.triggerManual({
      key: 'social-publish',
      actorId: 'admin-api-key',
      input: { dryRun: false },
    });

    expect(prisma.aiRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'MANUAL',
        name: 'manual:social-publish',
        source: 'admin-api-key',
        input: expect.objectContaining({ dryRun: false }),
      }),
    });
    expect(prisma.scheduledJobRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scheduledJobId: 'job_social_publish',
        aiRunId: 'airun_manual_1',
        status: 'RUNNING',
        idempotencyKey: expect.stringMatching(/^manual:social-publish:/),
      }),
    });
    expect(handlers.publishScheduledSocialPosts).toHaveBeenCalledTimes(1);
  });

  it('scheduled social publishing skips/rejects scheduled posts that do not carry approval', async () => {
    const SchedulerService = await loadSchedulerService();
    const prisma = createPrismaMock();
    const now = new Date('2026-05-20T09:00:00.000Z');
    prisma.socialPost.findMany.mockResolvedValue([
      {
        id: 'post_scheduled_without_approval',
        status: 'SCHEDULED',
        platform: 'twitter',
        content: [{ text: 'should not publish' }],
        scheduledAt: new Date('2026-05-20T08:45:00.000Z'),
        metadata: {},
      },
    ]);
    const publishers = {
      twitter: { postThread: vi.fn() },
      telegram: { postMessage: vi.fn() },
    };
    const service = new SchedulerService(prisma, {}, publishers.twitter, publishers.telegram);

    const result = await service.publishScheduledSocialPosts({ now, workerId: 'scheduler-1' });

    expect(publishers.twitter.postThread).not.toHaveBeenCalled();
    expect(publishers.telegram.postMessage).not.toHaveBeenCalled();
    expect(prisma.socialPost.update).toHaveBeenCalledWith({
      where: { id: 'post_scheduled_without_approval' },
      data: expect.objectContaining({
        status: expect.stringMatching(/REJECTED|PENDING_APPROVAL/),
        metadata: expect.objectContaining({ skippedReason: expect.stringMatching(/approved/i) }),
      }),
    });
    expect(result).toMatchObject({ published: 0, skippedUnapproved: 1 });
  });
});
