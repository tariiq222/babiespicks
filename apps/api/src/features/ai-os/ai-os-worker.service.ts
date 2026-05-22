/**
 * AI OS Worker — real AI OS pipeline execution + placeholder step processor.
 *
 * PRODUCT_PIPELINE, CONTENT_PIPELINE, DISCOVERY, and social MANUAL runs execute
 * real coordinator workflows. Future-only run types continue using safe placeholders.
 *
 * Architecture:
 *   - OnModuleInit awaits queue init, then branches on implementation:
 *       • BullMQ mode: calls queue.startWorker(processRun) to register the native
 *         BullMQ Worker processor. BullMQ handles retries/backoff automatically.
 *         A 'failed' event listener marks the DB run FAILED when attempts exhausted.
 *       • In-process mode: starts a polling loop (every 5 seconds).
 *   - The worker self-throttles: if a run is already RUNNING, it skips (no parallel).
 *   - OnModuleDestroy stops the poll loop / closes the Worker / closes the queue.
 *
 * ⚠️ Singleton race fix: queue is NOT captured in the constructor — that would
 * capture the throwaway InProcessQueueService created before _initPromise settles.
 * Instead it is assigned after awaitQueueInit() in onModuleInit().
 *
 * Retry safety:
 *   - resetRunForRetry resets RUNNING → PENDING so BullMQ can retry.
 *   - CoordinatorService is idempotent for duplicate URLs (upsert on product data).
 *   - A WARNING event is emitted before every product pipeline call to flag
 *     idempotency assumption — if retry fires the same URL again, the log is clear.
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  getQueueService,
  QueueService,
  awaitQueueInit,
  BullMQFailureHandler,
} from '../../infrastructure/queue/queue.service';
import { AiRunStatus, AiStepStatus, AiEventType } from '@prisma/client';
import {
  CoordinatorService,
  PipelineResult,
  type ContentPipelineResult,
  type DiscoveryPipelineResult,
} from '../../agents/coordinator/coordinator.service';
import { SocialCoordinatorService, type SocialPipelineResult } from '../../agents/social/social-coordinator.service';
import { getUrlLogTarget } from '../../infrastructure/safety/url-safety';

const WORKER_POLL_INTERVAL_MS = 5_000;

const PLACEHOLDER_STEP_NAMES = [
  'data_acquisition',
  'review_analysis',
  'verdict_generation',
  'content_writer',
  'quality_guard',
  'publisher',
] as const;

@Injectable()
export class AiOsWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiOsWorkerService.name);
  private queue!: QueueService; // Assigned in onModuleInit after awaitQueueInit()
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinator: CoordinatorService,
    private readonly socialCoordinator: SocialCoordinatorService,
  ) {
    // Safe to call here because in tests getQueueService() is called before
    // AiOsWorkerService is constructed (via the queue service tests' module import),
    // so _initPromise is already underway or settled and _instance is set.
    // The singleton race is fixed: getQueueService() returns _instance! which is
    // already the correct singleton by the time Nest constructs this service.
    this.queue = getQueueService();
  }

  async onModuleInit() {
    // Re-assign after init to ensure we hold the final singleton reference.
    // This is a no-op in production (singleton already correct) but defends
    // against any test or DI ordering edge case where the constructor captured
    // the wrong instance.
    await awaitQueueInit();
    this.queue = getQueueService();

    const impl = this.queue.getImplementationType();
    this.logger.log(
      `[Worker] Starting AI OS worker. Queue: ${impl} (available: ${this.queue.isAvailable()})`,
    );

    if (impl === 'bullmq') {
      // ── BullMQ mode: register native Worker processor ─────────────────────
      // processRun is bound so 'this' is correct inside the async processor.
      // Thrown errors propagate to fail the BullMQ job → retries handled by BullMQ.
      // Failure callbacks keep the DB in sync:
      //   • onRetry       — non-final failure: reset RUNNING → PENDING so next retry works.
      //   • onFinalFailure — all retries exhausted: mark RUNNING → FAILED.
      const failureHandler: BullMQFailureHandler = {
        onRetry: this.resetRunForRetry.bind(this),
        onFinalFailure: this.markRunFailed.bind(this),
      };
      await (this.queue as any).startWorker(this.processRun.bind(this), failureHandler);
      this.logger.log('[Worker] BullMQ Worker processor registered.');
    } else {
      // ── In-process mode: start polling loop via startWorker ─────────────────
      // startWorker starts the 5-second poll loop internally.
      await this.queue.startWorker(this.poll.bind(this));
      this.logger.log(`[Worker] In-process polling loop started (every ${WORKER_POLL_INTERVAL_MS}ms).`);
    }
  }

  async onModuleDestroy() {
    // Clear the poll interval for in-process mode.
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Close the queue connection (closes Worker for BullMQ, no-op for in-process).
    if (this.queue && typeof this.queue.close === 'function') {
      await this.queue.close();
    }
    this.logger.log('[Worker] Stopped.');
  }

  // ==================== Public: manual trigger for testing ====================

  /** Trigger one poll cycle — used by tests (in-process mode only). */
  async pollOnce(): Promise<void> {
    return this.poll();
  }

  // ==================== Core poll logic (in-process only) ====================

  private async poll(): Promise<void> {
    const impl = this.queue.getImplementationType();
    if (impl === 'bullmq') {
      // Should not be called in BullMQ mode — Worker drives consumption
      this.logger.warn('[Worker] poll() called in BullMQ mode — ignoring.');
      return;
    }

    const runId = await this.queue.dequeue();
    if (!runId) return;

    try {
      await this.processRun(runId);
    } catch (err) {
      this.logger.error(`[Worker] processRun(${runId}) failed: ${(err as Error).message}`);
      // Mark the run FAILED so it doesn't stay in RUNNING forever
      await this.markRunFailed(runId, (err as Error).message);
    } finally {
      // Always ack — the run is no longer in the queue's "pending" set.
      // If we never called processRun (e.g. run not found), ack here too.
      await this.queue.ack(runId);
    }
  }

  /**
   * Process a single run.
   *
   * Dispatches to the appropriate handler:
   *   • PRODUCT_PIPELINE → real CoordinatorService pipeline
   *   • all other types  → safe placeholder steps
   *
   * BullMQ mode: called by the Worker processor. Thrown errors propagate to
   * fail the job so BullMQ retries automatically. Non-final failures trigger
   * the onRetry callback (resetting DB to PENDING) before rethrowing so the
   * next retry can pick up the run. Final failure (all retries exhausted) is
   * handled by the 'failed' event listener which calls onFinalFailure to mark
   * the DB RUNNING → FAILED.
   *
   * In-process mode: called by the poll loop. Errors are caught in poll().
   */
  async processRun(runId: string): Promise<void> {
    // ── Guards (re-verified after dequeue) ───────────────────────────────────

    const run = await this.prisma.aiRun.findUnique({ where: { id: runId } });
    if (!run) {
      this.logger.warn(`[Worker] Run ${runId} not found, skipping.`);
      return; // queue.ack is in processLoop finally block
    }

    // Guard: only process PENDING runs (queue-eligible state)
    if (run.status !== 'PENDING') {
      this.logger.warn(
        `[Worker] Run ${runId} has status ${run.status}, expected PENDING. Skipping.`,
      );
      return;
    }

    // ── PENDING → RUNNING (conditional — race-safe) ───────────────────────────
    //
    // We use updateMany with a status filter so this is a no-op if another
    // process already changed the status (e.g. cancellation happened between
    // the findUnique above and this update). If count === 0, the run is no
    // longer PENDING and must not be processed.
    const started = await this.prisma.aiRun.updateMany({
      where: { id: runId, status: AiRunStatus.PENDING },
      data: { status: AiRunStatus.RUNNING, startedAt: new Date() },
    });

    if (started.count === 0) {
      // Run was PENDING when dequeued but is no longer — skip safely.
      this.logger.log(
        `[Worker] Run ${runId} is no longer PENDING (likely cancelled), skipping.`,
      );
      return;
    }

    this.logger.log(`[Worker] Processing run ${runId} (type: ${run.type})`);

    await this.addEvent(runId, AiEventType.STARTED, `Run started — ${run.type}`);

    // ── Branch: real execution vs placeholder ───────────────────────────────
    if (run.type === 'PRODUCT_PIPELINE') {
      await this.processProductPipeline(runId, run.input as Record<string, any> | null);
    } else if (run.type === 'CONTENT_PIPELINE') {
      await this.processContentPipeline(runId, run.input as Record<string, any> | null);
    } else if (run.type === 'DISCOVERY') {
      await this.processDiscoveryPipeline(runId, run.input as Record<string, any> | null);
    } else if (run.type === 'MANUAL') {
      const input = run.input as Record<string, any> | null;
      if (input?.action === 'social_pipeline') {
        await this.processSocialPipeline(runId, input);
      } else {
        await this.processPlaceholder(runId);
      }
    } else {
      await this.processPlaceholder(runId);
    }

    // Note: RUNNING → COMPLETED/FAILED is handled inside each branch.
    // If neither branch was reached (should not happen), the run would stay RUNNING.
    // The final ack/finally in poll() handles cleanup regardless.
  }

  // ==================== DISCOVERY handler ====================

  private static readonly VALID_DISCOVERY_SOURCES = ['amazon', 'noon', 'all'] as const;
  private static readonly DEFAULT_DISCOVERY_MAX_PRODUCTS = 10;
  private static readonly MIN_DISCOVERY_MAX_PRODUCTS = 1;
  private static readonly MAX_DISCOVERY_MAX_PRODUCTS = 50;

  /**
   * Execute Amazon/Noon product discovery via CoordinatorService.
   *
   * Input contract:
   *   - `input.source` (string, optional): amazon | noon | all. Defaults to all.
   *   - `input.maxProducts` (number|string, optional): defaults to 10 and is
   *     clamped to the safe worker range 1..50.
   *
   * On invalid source/maxProducts → marks run FAILED without calling the coordinator.
   * On coordinator failure → records a failed `discovery_pipeline` step and FAILED run.
   * On success → creates a single `discovery_pipeline` step and
   *   `discovery_pipeline_result` artifact with a defensive summary of the result.
   */
  private async processDiscoveryPipeline(
    runId: string,
    input: Record<string, any> | null,
  ): Promise<void> {
    const rawSource = input?.source;
    const source = typeof rawSource === 'string' && rawSource.trim()
      ? rawSource.trim().toLowerCase()
      : 'all';

    if (!AiOsWorkerService.VALID_DISCOVERY_SOURCES.includes(source as any)) {
      const msg = `DISCOVERY run invalid input.source="${String(rawSource)}"; must be one of ${AiOsWorkerService.VALID_DISCOVERY_SOURCES.join(', ')}`;
      this.logger.warn(`[Worker] ${msg}`);
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    }

    const parsedMaxProducts = this.normalizeDiscoveryMaxProducts(input?.maxProducts);
    if (parsedMaxProducts.error) {
      this.logger.warn(`[Worker] ${parsedMaxProducts.error}`);
      await this.markRunFailed(runId, parsedMaxProducts.error);
      await this.addEvent(runId, AiEventType.ERROR, parsedMaxProducts.error);
      return;
    }

    const maxProducts = parsedMaxProducts.value;

    const step = await this.prisma.aiRunStep.create({
      data: {
        aiRunId: runId,
        stepName: 'discovery_pipeline',
        status: AiStepStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    await this.addEvent(
      runId,
      AiEventType.INFO,
      `Discovery pipeline started: source=${source}, maxProducts=${maxProducts}`,
    );

    let pipelineResult: DiscoveryPipelineResult;
    try {
      this.logger.log(
        `[Worker] Calling CoordinatorService.runDiscoveryPipeline for run ${runId}: source=${source}, maxProducts=${maxProducts}`,
      );
      pipelineResult = await this.coordinator.runDiscoveryPipeline(
        maxProducts,
        source as 'amazon' | 'noon' | 'all',
      );
    } catch (err) {
      const msg = `Discovery pipeline threw: ${(err as Error).message}`;
      this.logger.error(`[Worker] ${msg}`);
      await this.prisma.aiRunStep.update({
        where: { id: step.id },
        data: {
          status: AiStepStatus.FAILED,
          completedAt: new Date(),
          error: msg,
          output: { source, maxProducts } as any,
        },
      });
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    }

    const summary = this.summarizeDiscoveryResult(pipelineResult);
    const hardFailure = summary.discovered === null && summary.total === null;

    await this.prisma.aiRunStep.update({
      where: { id: step.id },
      data: {
        status: hardFailure ? AiStepStatus.FAILED : AiStepStatus.COMPLETED,
        completedAt: new Date(),
        output: {
          source,
          maxProducts,
          ...summary,
        } as any,
      },
    });

    if (hardFailure) {
      const msg = 'Discovery pipeline returned an empty or unrecognized result';
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    }

    try {
      await this.prisma.aiArtifact.create({
        data: {
          aiRunId: runId,
          type: 'JSON' as any,
          name: 'discovery_pipeline_result',
          content: JSON.stringify(pipelineResult),
          metadata: {
            source,
            maxProducts,
            ...summary,
            completedAt: new Date().toISOString(),
          } as any,
        },
      });
    } catch (artifactErr) {
      this.logger.warn(
        `[Worker] Failed to create discovery artifact for run ${runId}: ${(artifactErr as Error).message}`,
      );
    }

    const completed = await this.prisma.aiRun.updateMany({
      where: { id: runId, status: AiRunStatus.RUNNING },
      data: {
        status: AiRunStatus.COMPLETED,
        completedAt: new Date(),
        output: { source, maxProducts, ...summary } as any,
      },
    });

    if (completed.count === 0) {
      this.logger.log(
        `[Worker] Run ${runId} is no longer RUNNING after discovery pipeline — skipping COMPLETED update ` +
          '(likely CANCELLED or already FAILED by a concurrent handler).',
      );
      return;
    }

    await this.addEvent(
      runId,
      summary.failed && summary.failed > 0 ? AiEventType.WARNING : AiEventType.COMPLETED,
      summary.failed && summary.failed > 0
        ? `Discovery pipeline completed with ${summary.failed} failed product(s): ${summary.succeeded ?? 0}/${summary.total ?? 0} succeeded`
        : `Discovery pipeline completed: ${summary.succeeded ?? 0}/${summary.total ?? 0} product(s) processed from ${source}`,
    );
    this.logger.log(`[Worker] Run ${runId} marked COMPLETED (discovery pipeline).`);
  }

  /** Normalize discovery maxProducts to the supported worker range. */
  private normalizeDiscoveryMaxProducts(value: unknown): { value: number; error?: undefined } | { value?: undefined; error: string } {
    if (value === undefined || value === null || value === '') {
      return { value: AiOsWorkerService.DEFAULT_DISCOVERY_MAX_PRODUCTS };
    }

    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return { error: 'DISCOVERY run: input.maxProducts must be a finite number if provided' };
    }

    const integer = Math.floor(numeric);
    const clamped = Math.min(
      AiOsWorkerService.MAX_DISCOVERY_MAX_PRODUCTS,
      Math.max(AiOsWorkerService.MIN_DISCOVERY_MAX_PRODUCTS, integer),
    );
    return { value: clamped };
  }

  /** Extract a stable summary even if CoordinatorService evolves its return shape. */
  private summarizeDiscoveryResult(result: DiscoveryPipelineResult | null | undefined): {
    discovered: number | null;
    total: number | null;
    succeeded: number | null;
    failed: number | null;
    processed: number | null;
  } {
    const data = (result ?? {}) as Partial<DiscoveryPipelineResult>;
    const results = Array.isArray(data.results) ? data.results : [];
    const succeededFromResults = results.filter((item) => item?.success === true).length;
    const failedFromResults = results.filter((item) => item?.success === false).length;

    return {
      discovered: typeof data.discovered === 'number' ? data.discovered : null,
      total: typeof data.total === 'number' ? data.total : results.length || null,
      succeeded: typeof data.succeeded === 'number' ? data.succeeded : succeededFromResults,
      failed: typeof data.failed === 'number' ? data.failed : failedFromResults,
      processed: results.length || null,
    };
  }

  // ==================== PRODUCT PIPELINE handler ====================

  /**
   * Execute the real product pipeline via CoordinatorService.
   *
   * Input contract:
   *   - `input.url` (string, required): product URL to scrape and process.
   *   - `input.storeSlug` (string, optional): store identifier.
   *   - `input.reviews` (ReviewData[], optional): pre-scraped reviews.
   *
   * On missing URL → marks run FAILED immediately with a clear ERROR event.
   * On coordinator failure → propagates error so BullMQ retry handler can
   *   reset the run to PENDING for a clean retry.
   * On success → creates a single `product_pipeline` step and an artifact
   *   containing the pipeline result summary.
   */
  private async processProductPipeline(
    runId: string,
    input: Record<string, any> | null,
  ): Promise<void> {
    // ── Validate required input ──────────────────────────────────────────────
    const rawUrl = input?.url as string | undefined;
    const url = rawUrl?.trim() ?? '';
    if (!url) {
      const msg = 'PRODUCT_PIPELINE run missing required input.url';
      this.logger.warn(`[Worker] ${msg}`);
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    }

    const storeSlug = input?.storeSlug as string | undefined;
    const reviews = input?.reviews as any;

    // ── Idempotency warning (retry safety) ─────────────────────────────────
    // CoordinatorService is idempotent for duplicate URLs (upserts product data),
    // but emit a warning so operators can detect repeated retry storms.
    const urlLogTarget = getUrlLogTarget(url);
    await this.addEvent(runId, AiEventType.WARNING, [
      `Executing product pipeline for URL origin: ${urlLogTarget}`,
      'Note: coordinator is idempotent for duplicate URLs — retrying is safe.',
    ].join(' '));

    // ── Execute real pipeline ─────────────────────────────────────────────────
    let pipelineResult: PipelineResult;
    try {
      this.logger.log(`[Worker] Calling CoordinatorService.runProductPipeline for run ${runId}`);
      pipelineResult = await this.coordinator.runProductPipeline(url, storeSlug, reviews);
      this.logger.log(
        `[Worker] Pipeline completed for run ${runId}: productId=${pipelineResult.productId}, ` +
        `steps=${JSON.stringify(pipelineResult.steps)}, timeMs=${pipelineResult.totalTimeMs}`,
      );
    } catch (err) {
      const msg = `Product pipeline threw: ${(err as Error).message}`;
      this.logger.error(`[Worker] ${msg}`);
      // Rethrow so BullMQ failure handler (resetRunForRetry / markRunFailed) fires.
      // Do NOT mark FAILED here — let the caller's error path handle it.
      throw err;
    }

    // ── Create the product_pipeline step ─────────────────────────────────────
    const step = await this.prisma.aiRunStep.create({
      data: {
        aiRunId: runId,
        stepName: 'product_pipeline',
        status: AiStepStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    // ── Determine step outcome from pipeline result ───────────────────────────
    // The pipeline returns partial success (some steps may have failed).
    // Rule:
    //   • acquisition failed OR productId missing → run FAILED, step FAILED, no artifact.
    //   • acquisition succeeded AND productId exists but later stages failed →
    //     run COMPLETED with ERROR event (partial pipeline), artifact created.
    const acquisitionOk = pipelineResult.steps.acquisition === 'success';
    const productIdExists = Boolean(pipelineResult.productId);
    const hardFailure = !acquisitionOk || !productIdExists;

    await this.prisma.aiRunStep.update({
      where: { id: step.id },
      data: {
        status: hardFailure ? AiStepStatus.FAILED : AiStepStatus.COMPLETED,
        completedAt: new Date(),
        output: {
          productId: pipelineResult.productId ?? null,
          productName: pipelineResult.productName ?? null,
          steps: pipelineResult.steps,
          totalTimeMs: pipelineResult.totalTimeMs,
        } as any,
      },
    });

    if (hardFailure) {
      // ── Hard failure: acquisition failed or no productId → FAILED ───────────
      await this.markRunFailed(
        runId,
        acquisitionOk
          ? `Product pipeline produced no productId (product may not exist at URL)`
          : `Product pipeline acquisition failed: ${pipelineResult.steps.acquisition}`,
      );
      await this.addEvent(
        runId,
        AiEventType.ERROR,
        acquisitionOk
          ? `Product pipeline: no productId returned for URL`
          : `Product pipeline acquisition failed: ${pipelineResult.steps.acquisition}`,
      );
      this.logger.warn(
        `[Worker] Run ${runId} marked FAILED — acquisition=${pipelineResult.steps.acquisition}, productId=${pipelineResult.productId ?? 'null'}`,
      );
      return;
    }

    // ── Create artifact with full pipeline result (partial pipeline is OK) ───
    try {
      await this.prisma.aiArtifact.create({
        data: {
          aiRunId: runId,
          type: 'JSON' as any,
          name: 'product_pipeline_result',
          content: JSON.stringify(pipelineResult),
          metadata: {
            productId: pipelineResult.productId,
            productName: pipelineResult.productName,
            steps: pipelineResult.steps,
            totalTimeMs: pipelineResult.totalTimeMs,
            completedAt: new Date().toISOString(),
          } as any,
        },
      });
    } catch (artifactErr) {
      // Non-fatal — log and continue
      this.logger.warn(
        `[Worker] Failed to create artifact for run ${runId}: ${(artifactErr as Error).message}`,
      );
    }

    // ── Run → COMPLETED (conditional — race-safe) ───────────────────────────
    const completed = await this.prisma.aiRun.updateMany({
      where: { id: runId, status: AiRunStatus.RUNNING },
      data: { status: AiRunStatus.COMPLETED, completedAt: new Date() },
    });

    if (completed.count === 0) {
      this.logger.log(
        `[Worker] Run ${runId} is no longer RUNNING after pipeline — skipping COMPLETED update ` +
          '(likely CANCELLED or already FAILED by a concurrent handler).',
      );
      return;
    }

    const laterStageFailed = Object.entries(pipelineResult.steps).some(
      ([k, v]) => k !== 'acquisition' && v !== 'success',
    );

    await this.addEvent(
      runId,
      laterStageFailed ? AiEventType.ERROR : AiEventType.COMPLETED,
      laterStageFailed
        ? `Product pipeline completed with errors: ${JSON.stringify(pipelineResult.steps)}`
        : `Product pipeline completed: ${pipelineResult.productName} (${pipelineResult.productId})`,
    );
    this.logger.log(`[Worker] Run ${runId} marked COMPLETED (product pipeline).`);
  }

  // ==================== CONTENT PIPELINE handler ====================

  private static readonly VALID_CONTENT_TYPES = ['BEST_LIST', 'PRODUCT_REVIEW', 'BUYING_GUIDE'] as const;

  /**
   * Generate a deterministic ASCII-safe slug from topic + type.
   * Falls back to a short hash suffix derived from type + normalized topic
   * when the base is empty or too short — no Math.random().
   * Returns a slug that is guaranteed non-empty.
   */
  private generateSlug(topic: string, type: string): string {
    const base = topic
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60);
    const safe = base.replace(/^-+|-+$/g, '');
    if (safe.length > 4) {
      return safe;
    }
    // Too short/empty: derive a deterministic suffix from type + topic
    // Using a simple non-crypto hash so this works in all environments.
    const input = `${type}\0${topic}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // keep as 32-bit integer
    }
    const suffix = Math.abs(hash).toString(36).slice(0, 6);
    return `${type.toLowerCase()}-${suffix}`;
  }

  /**
   * Execute the real content pipeline via CoordinatorService.
   *
   * Input contract:
   *   - `input.type` (string, required): BEST_LIST | PRODUCT_REVIEW | BUYING_GUIDE
   *   - `input.topic` (string, required): human-readable topic/title for the content
   *   - `input.slug` (string, optional): URL slug for the content page
   *   - `input.productIds` (string[], optional): related product IDs (array of non-empty strings)
   *   - `input.categoryId` (string, optional): category ID
   *
   * Validation order:
   *   1. type must be one of VALID_CONTENT_TYPES (FAILS before coordinator)
   *   2. topic must be non-empty (FAILS before coordinator)
   *   3. productIds elements must be non-empty strings (FAILS before coordinator)
   *   4. slug: if omitted/blank, generated deterministically from topic/type
   *   5. slug duplicate: if ContentPage with same slug exists, FAIL gracefully
   *
   * On any validation failure → marks run FAILED immediately with a clear ERROR event.
   * On coordinator failure → propagates error so BullMQ retry handler can
   *   reset the run to PENDING for a clean retry.
   * On success → creates a single `content_pipeline` step and an artifact
   *   containing the pipeline result summary. Run is COMPLETED even if
   *   quality/publish stages had warnings — only a missing pageId is a hard failure.
   */
  private async processContentPipeline(
    runId: string,
    input: Record<string, any> | null,
  ): Promise<void> {
    // ── Validate required input ──────────────────────────────────────────────
    const rawType = input?.type as string | undefined;
    const rawTopic = input?.topic as string | undefined;
    const type = rawType?.trim() ?? '';
    const topic = rawTopic?.trim() ?? '';

    if (!type) {
      const msg = 'CONTENT_PIPELINE run missing required input.type';
      this.logger.warn(`[Worker] ${msg}`);
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    }

    if (!AiOsWorkerService.VALID_CONTENT_TYPES.includes(type as any)) {
      const msg = `CONTENT_PIPELINE run invalid input.type="${type}"; must be one of ${AiOsWorkerService.VALID_CONTENT_TYPES.join(', ')}`;
      this.logger.warn(`[Worker] ${msg}`);
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    }

    if (!topic) {
      const msg = 'CONTENT_PIPELINE run missing required input.topic';
      this.logger.warn(`[Worker] ${msg}`);
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    }

    // ── Validate productIds shape ─────────────────────────────────────────────
    const rawProductIds = input?.productIds as unknown;
    if (
      rawProductIds !== undefined &&
      rawProductIds !== null &&
      (!Array.isArray(rawProductIds) ||
        (rawProductIds as any[]).some((v) => typeof v !== 'string' || !(v as string).trim()))
    ) {
      const msg = 'CONTENT_PIPELINE run: productIds must be an array of non-empty strings if provided';
      this.logger.warn(`[Worker] ${msg}`);
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    }

    const productIds = ((input?.productIds as string[] | undefined) ?? []).map((s) => s.trim()).filter(Boolean);
    const categoryId = (input?.categoryId as string | undefined)?.trim() || undefined;

    // ── Slug: generate if omitted/blank ──────────────────────────────────────
    const rawSlug = (input?.slug as string | undefined)?.trim();
    const slug = rawSlug?.length ? rawSlug : this.generateSlug(topic, type);

    // ── Idempotency: check for existing ContentPage with same slug ───────────
    const existingPage = await this.prisma.contentPage.findUnique({ where: { slug } });
    if (existingPage) {
      const msg = `CONTENT_PIPELINE run blocked: ContentPage with slug="${slug}" already exists (id=${existingPage.id}). Duplicate slug rejected for idempotency safety.`;
      this.logger.warn(`[Worker] ${msg}`);
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    }

    // ── Execute real pipeline ─────────────────────────────────────────────────
    let pipelineResult: ContentPipelineResult;
    try {
      this.logger.log(
        `[Worker] Calling CoordinatorService.runContentPipeline for run ${runId}: type=${type}, topic=${topic}, slug=${slug}`,
      );
      pipelineResult = await this.coordinator.runContentPipeline(
        type as 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE',
        topic,
        slug,
        productIds,
        categoryId,
      );
      this.logger.log(
        `[Worker] Content pipeline completed for run ${runId}: pageId=${pipelineResult.page?.id}, status=${pipelineResult.status}`,
      );
    } catch (err) {
      const msg = `Content pipeline threw: ${(err as Error).message}`;
      this.logger.error(`[Worker] ${msg}`);
      // Rethrow so BullMQ failure handler (resetRunForRetry / markRunFailed) fires.
      throw err;
    }

    // ── Create the content_pipeline step ─────────────────────────────────────
    const step = await this.prisma.aiRunStep.create({
      data: {
        aiRunId: runId,
        stepName: 'content_pipeline',
        status: AiStepStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    // ── Determine step outcome ────────────────────────────────────────────────
    // Hard failure: coordinator returned no page (threw or pageId missing).
    // Soft failure: content produced but quality/publish stages signalled issues —
    // run COMPLETED with ERROR event (not FAILED).
    const pageId = pipelineResult.page?.id;
    const hardFailure = !pageId;

    await this.prisma.aiRunStep.update({
      where: { id: step.id },
      data: {
        status: hardFailure ? AiStepStatus.FAILED : AiStepStatus.COMPLETED,
        completedAt: new Date(),
        output: {
          pageId: pageId ?? null,
          status: pipelineResult.status ?? null,
          seoScore: pipelineResult.seoAudit?.overallScore ?? null,
          qualityScore: pipelineResult.qualityCheck?.score ?? null,
        } as any,
      },
    });

    if (hardFailure) {
      // ── Hard failure: no page produced → FAILED ─────────────────────────────
      await this.markRunFailed(runId, 'Content pipeline produced no pageId');
      await this.addEvent(runId, AiEventType.ERROR, 'Content pipeline: no pageId returned');
      this.logger.warn(`[Worker] Run ${runId} marked FAILED — no pageId from content pipeline`);
      return;
    }

    // ── Create artifact with full pipeline result ────────────────────────────
    try {
      await this.prisma.aiArtifact.create({
        data: {
          aiRunId: runId,
          type: 'JSON' as any,
          name: 'content_pipeline_result',
          content: JSON.stringify(pipelineResult),
          metadata: {
            pageId,
            status: pipelineResult.status,
            seoScore: pipelineResult.seoAudit?.overallScore ?? null,
            qualityScore: pipelineResult.qualityCheck?.score ?? null,
            completedAt: new Date().toISOString(),
          } as any,
        },
      });
    } catch (artifactErr) {
      // Non-fatal — log and continue
      this.logger.warn(
        `[Worker] Failed to create artifact for run ${runId}: ${(artifactErr as Error).message}`,
      );
    }

    // ── Run → COMPLETED (conditional — race-safe) ───────────────────────────
    const completed = await this.prisma.aiRun.updateMany({
      where: { id: runId, status: AiRunStatus.RUNNING },
      data: { status: AiRunStatus.COMPLETED, completedAt: new Date() },
    });

    if (completed.count === 0) {
      this.logger.log(
        `[Worker] Run ${runId} is no longer RUNNING after pipeline — skipping COMPLETED update ` +
          '(likely CANCELLED or already FAILED by a concurrent handler).',
      );
      return;
    }

    const hasWarnings =
      pipelineResult.qualityCheck?.passed === false ||
      (pipelineResult.seoAudit && !pipelineResult.seoAudit.passed);

    await this.addEvent(
      runId,
      hasWarnings ? AiEventType.WARNING : AiEventType.COMPLETED,
      hasWarnings
        ? `Content pipeline completed with warnings: quality passed=${pipelineResult.qualityCheck?.passed}, seo passed=${pipelineResult.seoAudit?.passed}`
        : `Content pipeline completed: page ${pageId} (${topic})`,
    );
    this.logger.log(`[Worker] Run ${runId} marked COMPLETED (content pipeline).`);
  }

  // ==================== SOCIAL PIPELINE handler ====================

  private static readonly SUPPORTED_SOCIAL_PLATFORMS = ['twitter', 'telegram'] as const;
  private static readonly SUPPORTED_PLATFORM_VALUES = [...AiOsWorkerService.SUPPORTED_SOCIAL_PLATFORMS] as string[];

  /**
   * Execute the real social pipeline via SocialCoordinatorService.
   *
   * Input contract:
   *   - `input.contentPageId` (string, required): the ContentPage to generate social posts for
   *   - `input.platforms` (string[], optional): array of platform names ('twitter', 'telegram');
   *       if omitted, defaults to 'twitter' only.
   *       Both 'twitter' and 'telegram' are fully implemented in SocialCoordinatorService.
   *
   * Validation:
   *   - contentPageId must be a non-empty string → FAILED with ERROR event
   *   - platforms array, if provided, must contain only supported values ('twitter', 'telegram')
   *     Unsupported platform values → FAILED with ERROR event
   *
   * Semantics:
   *   - No posts created → FAILED
   *   - Posts created (pending approval or draft) → COMPLETED
   */
  private async processSocialPipeline(
    runId: string,
    input: Record<string, any> | null,
  ): Promise<void> {
    // ── Validate contentPageId ───────────────────────────────────────────────
    const contentPageId = (input?.contentPageId as string | undefined)?.trim() ?? '';
    if (!contentPageId) {
      const msg = 'MANUAL/social_pipeline run missing required input.contentPageId';
      this.logger.warn(`[Worker] ${msg}`);
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    }

    // ── Validate platforms array ──────────────────────────────────────────────
    const rawPlatforms = input?.platforms;
    let platforms: string[];

    if (rawPlatforms === undefined || rawPlatforms === null) {
      platforms = ['twitter'];
    } else if (
      !Array.isArray(rawPlatforms) ||
      (rawPlatforms as unknown[]).some((v) => typeof v !== 'string')
    ) {
      const msg = 'MANUAL/social_pipeline run: input.platforms must be an array of strings if provided';
      this.logger.warn(`[Worker] ${msg}`);
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    } else {
      platforms = (rawPlatforms as string[]).map((p) => p.trim().toLowerCase()).filter(Boolean);
      const unsupported = platforms.filter(
        (p) => !AiOsWorkerService.SUPPORTED_PLATFORM_VALUES.includes(p),
      );
      if (unsupported.length > 0) {
        const msg = `MANUAL/social_pipeline run: unsupported platform(s): ${unsupported.join(', ')}. Supported: ${AiOsWorkerService.SUPPORTED_PLATFORM_VALUES.join(', ')}`;
        this.logger.warn(`[Worker] ${msg}`);
        await this.markRunFailed(runId, msg);
        await this.addEvent(runId, AiEventType.ERROR, msg);
        return;
      }
    }

    // ── Platform validation note ──────────────────────────────────────────────
    // platforms array is already validated above (only 'twitter' and 'telegram' pass validation)

    // ── After filtering unsupported platforms: must have ≥1 ──
    if (platforms.length === 0) {
      const msg =
        'MANUAL/social_pipeline run: no supported platforms selected. Please select Twitter and/or Telegram.';
      this.logger.warn(`[Worker] ${msg}`);
      await this.markRunFailed(runId, msg);
      await this.addEvent(runId, AiEventType.ERROR, msg);
      return;
    }

    // ── Execute real social pipeline ──────────────────────────────────────────
    let pipelineResult: SocialPipelineResult;
    try {
      this.logger.log(
        `[Worker] Calling SocialCoordinatorService.runSocialPipeline for run ${runId}: contentPageId=${contentPageId}, platforms=${platforms.join(',')}`,
      );
      pipelineResult = await this.socialCoordinator.runSocialPipeline(contentPageId, platforms);
      this.logger.log(
        `[Worker] Social pipeline completed for run ${runId}: postsCreated=${pipelineResult.postsCreated}, timeMs=${pipelineResult.totalTimeMs}`,
      );
    } catch (err) {
      const msg = `Social pipeline threw: ${(err as Error).message}`;
      this.logger.error(`[Worker] ${msg}`);
      // Rethrow so BullMQ failure handler can reset run to PENDING for retry.
      throw err;
    }

    // ── Create the social_pipeline step ──────────────────────────────────────
    const step = await this.prisma.aiRunStep.create({
      data: {
        aiRunId: runId,
        stepName: 'social_pipeline',
        status: AiStepStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    // ── Determine step outcome ───────────────────────────────────────────────
    // No posts created is a hard failure.
    const hardFailure = pipelineResult.postsCreated === 0;

    await this.prisma.aiRunStep.update({
      where: { id: step.id },
      data: {
        status: hardFailure ? AiStepStatus.FAILED : AiStepStatus.COMPLETED,
        completedAt: new Date(),
        output: {
          contentPageId,
          platforms,
          postsCreated: pipelineResult.postsCreated,
          posts: pipelineResult.posts,
          totalTimeMs: pipelineResult.totalTimeMs,
        } as any,
      },
    });

    if (hardFailure) {
      await this.markRunFailed(runId, 'Social pipeline produced no posts');
      await this.addEvent(runId, AiEventType.ERROR, 'Social pipeline: no posts were created');
      this.logger.warn(`[Worker] Run ${runId} marked FAILED — no posts created`);
      return;
    }

    // ── Create artifact ──────────────────────────────────────────────────────
    try {
      await this.prisma.aiArtifact.create({
        data: {
          aiRunId: runId,
          type: 'JSON' as any,
          name: 'social_pipeline_result',
          content: JSON.stringify(pipelineResult),
          metadata: {
            contentPageId,
            postsCreated: pipelineResult.postsCreated,
            posts: pipelineResult.posts,
            totalTimeMs: pipelineResult.totalTimeMs,
            completedAt: new Date().toISOString(),
          } as any,
        },
      });
    } catch (artifactErr) {
      this.logger.warn(
        `[Worker] Failed to create artifact for run ${runId}: ${(artifactErr as Error).message}`,
      );
    }

    // ── Run → COMPLETED (conditional — race-safe) ───────────────────────────
    const completed = await this.prisma.aiRun.updateMany({
      where: { id: runId, status: AiRunStatus.RUNNING },
      data: { status: AiRunStatus.COMPLETED, completedAt: new Date() },
    });

    if (completed.count === 0) {
      this.logger.log(
        `[Worker] Run ${runId} is no longer RUNNING after social pipeline — skipping COMPLETED update ` +
          '(likely CANCELLED or already FAILED by a concurrent handler).',
      );
      return;
    }

    const anyPending = pipelineResult.posts.some((p) => p.status === 'PENDING_APPROVAL');
    await this.addEvent(
      runId,
      anyPending ? AiEventType.COMPLETED : AiEventType.INFO,
      anyPending
        ? `Social pipeline completed: ${pipelineResult.postsCreated} post(s) pending approval`
        : `Social pipeline completed: ${pipelineResult.postsCreated} post(s) created`,
    );
    this.logger.log(`[Worker] Run ${runId} marked COMPLETED (social pipeline).`);
  }

  // ==================== Placeholder handler (non-product types) ====================

  /**
   * Process a non-product run through all placeholder steps.
   * Called for: CONTENT_PIPELINE, DISCOVERY, CONTENT_SPRINT, MANUAL, and
   * any future type not yet migrated to a real handler.
   */
  private async processPlaceholder(runId: string): Promise<void> {
    // Ensure steps exist
    await this.ensureStepsPlaceholder(runId);

    // Placeholder: mark each step COMPLETED in sequence
    for (const stepName of PLACEHOLDER_STEP_NAMES) {
      // Re-check cancellation before each step
      if (await this.isCancelled(runId)) {
        this.logger.log(`[Worker] Run ${runId} cancelled mid-execution.`);
        return;
      }

      await this.advancePlaceholderStep(runId, stepName);
    }

    // ── RUNNING → COMPLETED (conditional — race-safe) ────────────────────────
    //
    // Use updateMany so we do NOT overwrite CANCELLED or FAILED if a cancellation
    // arrived between the per-step checks and this call.
    const completed = await this.prisma.aiRun.updateMany({
      where: { id: runId, status: AiRunStatus.RUNNING },
      data: { status: AiRunStatus.COMPLETED, completedAt: new Date() },
    });

    if (completed.count === 0) {
      // Run is no longer RUNNING — a cancellation or failure took precedence.
      // Do NOT overwrite. Log and leave the run in its current state.
      this.logger.log(
        `[Worker] Run ${runId} is no longer RUNNING — skipping COMPLETED update ` +
          '(likely CANCELLED or FAILED).',
      );
      return;
    }

    await this.addEvent(runId, AiEventType.COMPLETED, 'Run completed — placeholder worker');
    this.logger.log(`[Worker] Run ${runId} marked COMPLETED (placeholder).`);
  }

  // ==================== Placeholder step helpers ====================

  /**
   * Create initial steps for a placeholder run if none exist.
   * Each step is created in PENDING state.
   */
  private async ensureStepsPlaceholder(runId: string): Promise<void> {
    const existing = await this.prisma.aiRunStep.count({ where: { aiRunId: runId } });
    if (existing > 0) return;

    await this.prisma.aiRunStep.createMany({
      data: PLACEHOLDER_STEP_NAMES.map((name) => ({
        aiRunId: runId,
        stepName: name,
        status: AiStepStatus.PENDING,
      })),
    });

    this.logger.log(`[Worker] Created ${PLACEHOLDER_STEP_NAMES.length} placeholder steps for run ${runId}.`);
  }

  /**
   * Advance a named placeholder step: PENDING → RUNNING → COMPLETED (with event).
   * Skips steps that are already past PENDING.
   */
  private async advancePlaceholderStep(runId: string, stepName: string): Promise<void> {
    const step = await this.prisma.aiRunStep.findFirst({
      where: { aiRunId: runId, stepName },
    });

    if (!step) {
      this.logger.warn(`[Worker] Step ${stepName} not found for run ${runId}`);
      return;
    }

    if (step.status !== 'PENDING') {
      this.logger.log(`[Worker] Step ${stepName} already ${step.status}, skipping.`);
      return;
    }

    // PENDING → RUNNING
    await this.prisma.aiRunStep.update({
      where: { id: step.id },
      data: { status: AiStepStatus.RUNNING, startedAt: new Date() },
    });

    await this.addEvent(runId, AiEventType.INFO, `Step started: ${stepName}`);

    // Simulate work (REMOVE when step is migrated to a real handler)
    await sleep(200);

    // RUNNING → COMPLETED
    await this.prisma.aiRunStep.update({
      where: { id: step.id },
      data: {
        status: AiStepStatus.COMPLETED,
        completedAt: new Date(),
        output: { placeholder: true, step: stepName } as any,
      },
    });

    await this.addEvent(runId, AiEventType.INFO, `Step completed: ${stepName}`);
    this.logger.log(`[Worker] Step ${stepName} COMPLETED for run ${runId}.`);
  }

  // ==================== Guards ====================

  private async isCancelled(runId: string): Promise<boolean> {
    const run = await this.prisma.aiRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    return run?.status === 'CANCELLED';
  }

  /**
   * Reset a RUNNING run back to PENDING so the next BullMQ retry can pick it up.
   * Called by the BullMQ failure handler on non-final failures.
   *
   * Uses updateMany with RUNNING filter so this is a no-op if the run was
   * already cancelled or completed between the failure and this call.
   */
  private async resetRunForRetry(runId: string): Promise<void> {
    try {
      const updated = await this.prisma.aiRun.updateMany({
        where: { id: runId, status: AiRunStatus.RUNNING },
        data: {
          status: AiRunStatus.PENDING,
          startedAt: null,
        },
      });
      if (updated.count > 0) {
        await this.addEvent(runId, AiEventType.INFO, `Retrying run after failure — reset to PENDING`);
        this.logger.warn(`[Worker] Run ${runId} reset to PENDING for retry.`);
      }
    } catch (err) {
      this.logger.error(
        `[Worker] resetRunForRetry(${runId}) also failed: ${(err as Error).message}`,
      );
    }
  }

  private async markRunFailed(runId: string, errorMessage: string): Promise<void> {
    try {
      await this.prisma.aiRun.updateMany({
        where: { id: runId, status: AiRunStatus.RUNNING },
        data: {
          status: AiRunStatus.FAILED,
          error: errorMessage,
          completedAt: new Date(),
        },
      });
      await this.addEvent(runId, AiEventType.ERROR, `Run failed: ${errorMessage}`);
      this.logger.warn(`[Worker] Run ${runId} marked FAILED: ${errorMessage}`);
    } catch (err) {
      this.logger.error(
        `[Worker] markRunFailed(${runId}) also failed: ${(err as Error).message}`,
      );
    }
  }

  // ==================== Event helper ====================

  private async addEvent(
    runId: string,
    type: AiEventType,
    message: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.aiEvent.create({
        data: {
          aiRunId: runId,
          type,
          message,
          metadata: metadata as any ?? undefined,
        },
      });
    } catch (err) {
      this.logger.warn(`[Worker] Failed to add event for run ${runId}: ${(err as Error).message}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
