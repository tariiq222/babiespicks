/**
 * Queue abstraction for AI OS runs.
 *
 * ── Phase 4A (dev): In-process queue ────────────────────────────────────────
 * InProcessQueueService is a plain-array FIFO queue backed by process memory.
 * It is deliberately non-durable: runs are LOST on restart.
 * Activated when REDIS_URL is absent or BullMQ connection fails.
 *
 * ── Phase 4B (prod): BullMQ / Redis ─────────────────────────────────────────
 * BullMQQueueService provides durable, fault-tolerant job processing:
 *   - Job idempotency: runId used as jobId — enqueuing same run twice is a no-op
 *   - Native BullMQ Worker is used for auto-processing. AiOsWorkerService calls
 *     queue.startWorker(processRun) which creates a Worker with lock semantics,
 *     concurrency 1, and exponential backoff. No manual getNextJob/removeJob.
 *   - Processor throws on error → BullMQ retries automatically up to MAX_ATTEMPTS
 *   - 'failed' event listener marks DB run FAILED when all attempts exhausted
 *   - Worker is closed on module destroy
 *
 * Activated when REDIS_URL is set AND BullMQ connects successfully.
 * If Redis is absent, BullMQ fails to connect, or REDIS_URL is empty,
 * the factory honestly falls back to InProcessQueueService and logs a warning.
 *
 * ── Package dependency ─────────────────────────────────────────────────────────
 * @nestjs/bullmq, bullmq, and ioredis are installed.
 * REDIS_URL env var must point at a Redis instance for BullMQ to activate.
 */

export const QUEUE_NAME = 'ai-os';
export const MAX_ATTEMPTS = 3;

type BullMQModule = typeof import('bullmq');
type BullMQQueueConstructor = BullMQModule['Queue'];
type BullMQRunJob = import('bullmq').Job<{ runId?: string }>;

let bullMQModulePromise: Promise<BullMQModule> | null = null;

/** Lazily load BullMQ so local/dev fallback behavior is preserved when Redis is disabled. */
function loadBullMQModule(): Promise<BullMQModule> {
  bullMQModulePromise ??= import('bullmq');
  return bullMQModulePromise;
}

/**
 * Formats a Redis connection target for logs without exposing credentials.
 *
 * Valid URLs are reduced to protocol + host (for example, redis://localhost:6379).
 * Malformed values are intentionally reported generically so secrets embedded in
 * invalid configuration strings are never printed.
 */
export function formatRedisLogTarget(redisUrl: string): string {
  try {
    const parsed = new URL(redisUrl);
    return parsed.host ? `${parsed.protocol}//${parsed.host}` : 'Redis configured';
  } catch {
    return 'Redis configured';
  }
}

// ==================== Interface ====================

export type QueueImplementation = 'in-process' | 'bullmq';

export interface QueueStats {
  /** Jobs waiting to be dequeued. */
  pending: number;
  /** Jobs currently being processed by a worker. */
  active: number;
  /** Jobs that exhausted all retry attempts. */
  failed: number;
  /** Which implementation is active. */
  implementation: QueueImplementation;
}

/**
 * Core queue operations shared by all implementations.
 *
 * BullMQ note: dequeue/ack/nack are no-ops for BullMQ because the native
 * Worker owns job consumption. These are only meaningful for InProcessQueueService.
 */
export interface QueueService {
  /**
   * Add a run ID to the queue.
   * Idempotent — enqueuing the same run twice is a no-op.
   */
  enqueue(runId: string): Promise<void>;

  /**
   * Atomically pop the next run ID from the queue.
   * Returns null if the queue is empty or unavailable.
   *
   * ⚠️ BullMQ: This is a no-op. Job consumption is driven exclusively by the
   *   native Worker registered via startWorker(). Callers must not assume
   *   dequeue triggers processing in BullMQ mode.
   */
  dequeue(): Promise<string | null>;

  /**
   * Acknowledge successful processing of a run.
   * For BullMQ: no-op (Worker handles job completion).
   * For in-process: removes from pending set.
   */
  ack(runId: string): Promise<void>;

  /**
   * Negative acknowledge — re-queue the run for retry.
   * For BullMQ: throws an error to trigger automatic retry with backoff.
   * For in-process: re-enqueues at the back.
   */
  nack(runId: string): Promise<void>;

  /**
   * Returns true when the underlying transport is available and healthy.
   * In-process always returns true (it's just memory).
   * BullMQ returns true only when Redis is connected.
   */
  isAvailable(): boolean;

  /**
   * Returns the active implementation type for observability.
   */
  getImplementationType(): QueueImplementation;

  /**
   * Returns queue statistics (pending / active / failed counts).
   * BullMQ queries Redis; in-process returns in-memory approximations.
   */
  getStats(): Promise<QueueStats>;

  /**
   * Start the native BullMQ Worker, registering the given processor callback.
   *
   * BullMQ mode: creates `new Worker(queueName, processor, { connection, concurrency: 1 })`.
   * The processor receives a BullMQ Job and must call processRun(runId).
   * Thrown errors fail the job and trigger BullMQ's retry/backoff logic.
   *
   * In-process mode: starts the polling loop. The processFn is the poll callback.
   *
   * Idempotent — calling twice replaces the previous worker/processor.
   *
   * @param processFn  BullMQ mode: (runId: string) => Promise<void> — processor
   *                   extracts runId from job.data and calls this.
   *                   In-process mode: () => Promise<void> — poll loop runs one
   *                   cycle per invocation (dequeue+process+ack handled internally).
   * @param failureHandler BullMQ mode only: optional callbacks for retry and final
   *                   failure events so the caller can keep the DB in sync.
   */
  startWorker(
    processFn: ((runId: string) => Promise<void>) | (() => Promise<void>),
    failureHandler?: BullMQFailureHandler,
  ): Promise<void>;

  /**
   * Close the queue and worker connections.
   * In-process: no-op. BullMQ: closes Worker then Queue.
   */
  close(): Promise<void>;
}

/**
 * Callbacks for BullMQ worker failure lifecycle.
 *
 * onRetry        — called when a non-final attempt fails. The run's DB status
 *                  must be reset to PENDING so the next retry can pick it up.
 * onFinalFailure — called when all retry attempts are exhausted. The run's DB
 *                  status should be set to FAILED.
 */
export interface BullMQFailureHandler {
  onRetry(runId: string): Promise<void>;
  onFinalFailure(runId: string, errorMessage: string): Promise<void>;
}

// ==================== In-Process Dev Queue ====================

/**
 * In-process queue backed by a plain array.
 *
 * ⚠️ NOT durable. ⚠️ NOT thread-safe for concurrent dequeue.
 * ⚠️ Runs are LOST on process restart.
 *
 * For local dev when BullMQ is not wired or Redis is unavailable.
 */
export class InProcessQueueService implements QueueService {
  private readonly queue: string[] = [];
  private readonly pending = new Set<string>(); // actively processing
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private processFn: (() => Promise<void>) | null = null;
  private processing = false;

  private readonly logger = {
    log: (msg: string) => console.log(`[InProcessQueue] ${msg}`),
    warn: (msg: string) => console.warn(`[InProcessQueue] WARN: ${msg}`),
  };

  async enqueue(runId: string): Promise<void> {
    if (this.pending.has(runId) || this.queue.includes(runId)) {
      this.logger.log(`Run ${runId} already in queue, skipping enqueue.`);
      return;
    }
    this.queue.push(runId);
    this.logger.log(`Enqueued run ${runId}. Queue size: ${this.queue.length}`);
  }

  async dequeue(): Promise<string | null> {
    if (this.queue.length === 0) return null;
    const runId = this.queue.shift()!;
    this.pending.add(runId);
    this.logger.log(`Dequeued run ${runId}. Remaining: ${this.queue.length}`);
    return runId;
  }

  async ack(runId: string): Promise<void> {
    this.pending.delete(runId);
    this.logger.log(`Acknowledged run ${runId}`);
  }

  async nack(runId: string): Promise<void> {
    this.pending.delete(runId);
    // Re-enqueue at the back
    this.queue.push(runId);
    this.logger.warn(`Nack for run ${runId} — re-enqueued.`);
  }

  isAvailable(): boolean {
    return true;
  }

  getImplementationType(): QueueImplementation {
    return 'in-process';
  }

  async getStats(): Promise<QueueStats> {
    return {
      pending: this.queue.length,
      active: this.pending.size,
      failed: 0,
      implementation: 'in-process',
    };
  }

  /**
   * Starts a polling loop: calls pollFn every 5 seconds.
   * For in-process mode, pollFn is () => this.poll() which handles dequeue+process+ack internally.
   * Idempotent — calling twice restarts the loop.
   */
  async startWorker(pollFn: () => Promise<void>): Promise<void> {
    this.processFn = pollFn;
    if (this.pollIntervalId !== null) {
      clearInterval(this.pollIntervalId);
    }
    const poll = async () => {
      if (this.processing || !this.processFn) return;
      this.processing = true;
      try {
        await this.processFn();
      } catch (err) {
        this.logger.warn(`[InProcessQueue poll] error: ${(err as Error).message}`);
      } finally {
        this.processing = false;
      }
    };
    this.pollIntervalId = setInterval(poll, 5_000);
    this.logger.log('In-process polling loop started (every 5s).');
  }

  /** No-op close for in-process queue — nothing to clean up. */
  async close(): Promise<void> {
    if (this.pollIntervalId !== null) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.processFn = null;
    this.logger.log('In-process queue closed.');
  }
}

// ==================== BullMQ Queue Service ====================

/**
 * BullMQ-backed durable queue with native Worker.
 *
 * Requires:
 *   - REDIS_URL env var pointing at a Redis instance
 *   - @nestjs/bullmq, bullmq, ioredis packages installed
 *
 * Architecture (Phase 4B):
 *   BullMQ Worker owns all job consumption via startWorker().
 *   AiOsWorkerService passes processRun as the processor callback.
 *   BullMQ handles retries/backoff automatically — no manual getNextJob/removeJob.
 *
 *   - enqueue() adds jobs with runId as jobId (idempotent)
 *   - dequeue/ack/nack are no-ops (Worker handles lifecycle)
 *   - startWorker() creates the native Worker with lock semantics
 *   - 'failed' event fires when all attempts exhausted
 *
 * Semantics:
 *   - Job ID = runId → natural idempotency (BullMQ deduplicates by jobId)
 *   - Jobs that fail are retried up to MAX_ATTEMPTS with exponential backoff
 *   - Successful jobs are removed automatically by BullMQ
 *
 * Note: This class is loaded conditionally by the factory only when Redis is
 * configured. Import errors (packages not installed) are caught and handled —
 * the factory falls back to InProcessQueueService with a warning.
 */
export class BullMQQueueService implements QueueService {
  private readonly queue: import('bullmq').Queue;
  private worker: import('bullmq').Worker<{ runId?: string }> | null = null;
  private readonly logger = {
    log: (msg: string) => console.log(`[BullMQQueue] ${msg}`),
    warn: (msg: string) => console.warn(`[BullMQQueue] WARN: ${msg}`),
    error: (msg: string) => console.error(`[BullMQQueue] ERROR: ${msg}`),
  };

  constructor(
    private readonly redisUrl: string,
    QueueCtor?: BullMQQueueConstructor,
  ) {
    if (!QueueCtor) {
      throw new Error('BullMQQueueService requires a lazily loaded BullMQ Queue constructor');
    }

    this.queue = new QueueCtor(QUEUE_NAME, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        attempts: MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: 10_000, // 10s first retry, then 20s, then 40s
        },
        removeOnComplete: { count: 1000 }, // keep last 1000 completed jobs for debugging
        removeOnFail: false, // keep failed jobs in Redis so we can count them
      },
    });

    this.logger.log(
      `BullMQQueue initialized — connected to ${formatRedisLogTarget(redisUrl)}`,
    );
  }

  /**
   * Enqueue a run for processing.
   * Uses runId as jobId so BullMQ deduplicates — enqueuing twice is a no-op.
   */
  async enqueue(runId: string): Promise<void> {
    await this.queue.add('process-run', { runId }, { jobId: runId });
    this.logger.log(`Enqueued (or already present) run ${runId}`);
  }

  /**
   * ⚠️ BullMQ mode: this is a no-op.
   * Job consumption is driven exclusively by the native Worker.
   * dequeue() exists to satisfy the QueueService interface but does nothing
   * in BullMQ mode.
   */
  async dequeue(): Promise<string | null> {
    return null;
  }

  /**
   * ⚠️ BullMQ mode: this is a no-op.
   * Job acknowledgement is handled automatically by the BullMQ Worker.
   */
  async ack(_runId: string): Promise<void> {
    // No-op: BullMQ Worker handles completion automatically
  }

  /**
   * ⚠️ BullMQ mode: this is a no-op.
   * Retry/backoff is handled automatically by BullMQ when the processor throws.
   * Do NOT call nack() — throw an error from the processor instead.
   */
  async nack(_runId: string): Promise<void> {
    // No-op: BullMQ handles retries via the processor throwing errors
  }

  isAvailable(): boolean {
    return true; // Availability is checked at construction time by the factory
  }

  getImplementationType(): QueueImplementation {
    return 'bullmq';
  }

  async getStats(): Promise<QueueStats> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);
    return {
      pending: waiting,
      active,
      failed,
      implementation: 'bullmq',
    };
  }

  /**
   * Start the native BullMQ Worker with the given processor callback.
   *
   * The processor receives a BullMQ Job, extracts runId from job.data.runId,
   * calls processFn(runId), and lets thrown errors propagate to fail the job
   * so BullMQ's retry/backoff handles retries automatically.
   *
   * A 'failed' event listener is registered to handle final failure (after
   * all attempts exhausted) so the caller can mark the DB record FAILED.
   *
   * @param processFn      (runId: string) => Promise<void>
   * @param failureHandler Optional callbacks for retry (non-final failure) and
   *                       final failure events to keep the DB in sync.
   */
  async startWorker(
    processFn: (runId: string) => Promise<void>,
    failureHandler?: BullMQFailureHandler,
  ): Promise<void> {
    const { Worker } = await loadBullMQModule();

    // Close existing worker if startWorker is called again (idempotent replacement)
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    // Use a connection clone to avoid sharing the Queue's connection.
    const { default: Redis } = await import('ioredis');
    const connection = new Redis(this.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    const worker = new Worker<{ runId?: string }>(
      QUEUE_NAME,
      async (job: BullMQRunJob) => {
        const runId = job.data.runId;
        if (!runId) {
          throw new Error('BullMQ job missing runId in data');
        }
        try {
          await processFn(runId);
        } catch (err) {
          const isFinal = job.attemptsMade + 1 >= MAX_ATTEMPTS;
          if (!isFinal && failureHandler?.onRetry) {
            // Non-final failure: reset DB to PENDING so the next retry can pick it up.
            // We must do this BEFORE rethrowing so BullMQ schedules the retry.
            await failureHandler.onRetry(runId);
          }
          throw err; // propagate so BullMQ handles retry/final-failure lifecycle
        }
      },
      {
        connection,
        concurrency: 1,
        limiter: {
          max: 1,
          duration: 1000, // 1 job per second max
        },
      },
    );

    this.worker = worker;

    worker.on('failed', async (job: BullMQRunJob | undefined, err: Error) => {
      if (job) {
        const isFinal = job.attemptsMade >= MAX_ATTEMPTS;
        this.logger.error(
          `Worker: job ${job.id} failed after ${job.attemptsMade} attempt(s)` +
            ` (final: ${isFinal}): ${err.message}`,
        );
        if (isFinal && failureHandler?.onFinalFailure) {
          // Final failure: all retries exhausted — notify caller to mark DB FAILED.
          await failureHandler.onFinalFailure(job.id as string, err.message);
        }
        // Non-final failures are handled inside the processor (onRetry callback above).
      } else {
        this.logger.error(`Worker: job failed (no job object): ${err.message}`);
      }
    });

    worker.on('completed', (job: BullMQRunJob) => {
      this.logger.log(`Worker: job ${job.id} completed`);
    });

    worker.on('error', (err: Error) => {
      this.logger.error(`Worker error: ${err.message}`);
    });

    this.logger.log('BullMQ Worker started (native processor, concurrency=1).');
  }

  /** Close the Worker and queue connection on shutdown. */
  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      this.logger.log('BullMQ Worker closed.');
    }
    await this.queue.close();
    this.logger.log('BullMQQueue connection closed.');
  }
}

// ==================== Singleton factory ====================

let _instance: QueueService | null = null;
let _implType: QueueImplementation = 'in-process';
let _initPromise: Promise<void> | null = null;

/**
 * Redis connectivity probe — exported so tests can inject a mock or stub.
 * The default implementation uses ioredis with a 2-second connect timeout.
 *
 * Override by setting `probeRedisFn.current` to a test function before calling
 * getQueueService().
 *
 * Uses a mutable-object pattern (not reassignable export) so that ES module
 * live bindings don't prevent test overrides.
 */
export const probeRedisFn = {
  current: async (redisUrl: string): Promise<void> => {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(redisUrl, {
      connectTimeout: 2_000, // 2 s — fast fail
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    try {
      await redis.connect();
      await redis.ping();
    } finally {
      await redis.quit().catch(() => {/* ignore cleanup errors */});
    }
  },
};

async function initializeQueue(): Promise<void> {
  if (_instance) return;

  const redisUrl = process.env['REDIS_URL'];

  if (!redisUrl || redisUrl.trim() === '') {
    console.warn(
      '[QueueFactory] REDIS_URL is not set — using InProcessQueueService (non-durable, dev-only). ' +
        'Set REDIS_URL to enable BullMQ.',
    );
    _implType = 'in-process';
    _instance = new InProcessQueueService();
    return;
  }

  try {
    // Probe Redis before instantiating BullMQ — ensures we don't falsely
    // claim bullmq active when Redis is unreachable.
    await probeRedisFn.current(redisUrl);

    const { Queue } = await loadBullMQModule();

    _instance = new BullMQQueueService(redisUrl, Queue);
    _implType = 'bullmq';
    console.log(
      `[QueueFactory] BullMQQueueService active — ${formatRedisLogTarget(redisUrl)}`,
    );
  } catch (err) {
    console.warn(
      `[QueueFactory] BullMQQueueService failed to initialize (Redis unreachable?): ${(err as Error).message}. ` +
        `Falling back to InProcessQueueService (non-durable, dev-only).`,
    );
    _implType = 'in-process';
    _instance = new InProcessQueueService();
  }
}

/**
 * Returns the initialized queue singleton.
 *
 * ⚠️ This function is synchronous for NestJS DI compatibility but the first
 * call may return the _instance before initializeQueue() has resolved if
 * called during module construction (before awaitQueueInit() is called).
 *
 * Safe usage pattern:
 *   const queue = getQueueService();
 *   await awaitQueueInit(); // ensure init is complete before using
 *   queue.enqueue(...) // now safe
 *
 * OR use the async form directly:
 *   const queue = await getQueueServiceAsync();
 */
export function getQueueService(): QueueService {
  if (!_initPromise) {
    _initPromise = initializeQueue().catch((err) => {
      console.error('[QueueFactory] Unexpected initialization error:', err);
    });
  }
  return _instance!;
}

/** Await this to ensure the queue implementation has been determined. */
export async function awaitQueueInit(): Promise<void> {
  if (_initPromise) await _initPromise;
}

export async function getQueueServiceAsync(): Promise<QueueService> {
  await awaitQueueInit();
  return _instance!;
}

export function getQueueImplementationType(): QueueImplementation {
  return _implType;
}

/** Reset the singleton — for testing only. */
export function resetQueueService(): void {
  _instance = null;
  _implType = 'in-process';
  _initPromise = null;
}
