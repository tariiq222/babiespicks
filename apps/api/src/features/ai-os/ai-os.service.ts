import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ListRunsDto, CreateRunDto } from './dto/ai-os.dto';
import { AiRunStatus, AiRunType, AiEventType } from '@prisma/client';

@Injectable()
export class AiOsService {
  private readonly logger = new Logger(AiOsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Overview combining new AiRun data and legacy AgentJob counts.
   * Provides a unified dashboard view of all AI activity.
   */
  async getOverview() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel
    const [totalRuns, runStatusCounts, recentAgg, legacyJobCounts, queueStats] =
      await Promise.all([
        this.prisma.aiRun.count(),
        this.prisma.aiRun.groupBy({ by: ['status'], _count: true }),
        this.prisma.aiRun.aggregate({
          _sum: { tokensUsed: true, costUsd: true },
          where: { createdAt: { gte: sevenDaysAgo } },
        }),
        this.getLegacyAgentJobCounts(),
        this.getQueueStats(),
      ]);

    const runsCompleted =
      runStatusCounts.find((s) => s.status === 'COMPLETED')?._count ?? 0;
    const runsFailed = runStatusCounts.find((s) => s.status === 'FAILED')?._count ?? 0;
    const runsRunning = runStatusCounts.find((s) => s.status === 'RUNNING')?._count ?? 0;
    const runsPending = runStatusCounts.find((s) => s.status === 'PENDING')?._count ?? 0;

    const totalLegacyJobs = legacyJobCounts.reduce((sum, s) => sum + s._count, 0);
    const legacyCompleted =
      legacyJobCounts.find((s) => s.status === 'COMPLETED')?._count ?? 0;

    return {
      aiOs: {
        totalRuns,
        runsCompleted,
        runsFailed,
        runsRunning,
        runsPending,
        totalTokens: Number(recentAgg._sum.tokensUsed ?? 0),
        totalCostUsd: Number(recentAgg._sum.costUsd ?? 0),
      },
      legacy: {
        totalJobs: totalLegacyJobs,
        completedJobs: legacyCompleted,
      },
      combined: {
        totalRuns: totalRuns + totalLegacyJobs,
        completedRuns: runsCompleted + legacyCompleted,
      },
      queue: queueStats,
    };
  }

  /**
   * Returns best-effort counts from the legacy AgentJob table.
   * Legacy aggregation is non-critical for the AI OS overview, so failures here
   * intentionally degrade to zero counts while core AiRun queries still fail normally.
   */
  private async getLegacyAgentJobCounts(): Promise<Array<{ status: string; _count: number }>> {
    try {
      const counts = await this.prisma.agentJob.groupBy({
        by: ['status'] as const,
        _count: true,
      });
      return counts.map((count) => ({ status: count.status, _count: count._count }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[AiOsService] legacy agentJob.groupBy failed: ${message}. Returning zero legacy counts.`,
      );
      return [];
    }
  }

  /**
   * Returns queue statistics from the active queue implementation.
   * Honest about which backend is in use (in-process vs bullmq).
   */
  async getQueueStats() {
    try {
      const { getQueueService } = await import(
        '../../infrastructure/queue/queue.service'
      );
      const queue = getQueueService();
      return queue.getStats();
    } catch {
      return {
        pending: 0,
        active: 0,
        failed: 0,
        implementation: 'in-process' as const,
      };
    }
  }

  /**
   * List AI OS runs with cursor-based pagination and optional filters.
   */
  async listRuns(dto: ListRunsDto) {
    const { limit = 20, cursor, type, status } = dto;

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const runs = await this.prisma.aiRun.findMany({
      take: limit,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      where,
      include: {
        _count: { select: { steps: true, artifacts: true, events: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const nextCursor = runs.length === limit ? runs[runs.length - 1].id : null;

    return { data: runs, nextCursor };
  }

  /**
   * Get a single run with full detail: steps, artifacts, events, approvals.
   */
  async getRun(id: string) {
    const run = await this.prisma.aiRun.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { createdAt: 'asc' } },
        artifacts: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        approvals: { orderBy: { createdAt: 'asc' } },
        costLogs: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!run) throw new NotFoundException(`AiRun ${id} not found`);
    return run;
  }

  /**
   * Create a manual run record in PENDING state.
   * This is the foundation for Phase 1 — no execution yet.
   */
  async createRun(dto: CreateRunDto) {
    let parsedInput: any = undefined;
    if (typeof dto.input === 'string' && dto.input.trim()) {
      try {
        parsedInput = JSON.parse(dto.input);
      } catch {
        throw new BadRequestException('input must be valid JSON');
      }
    } else if (dto.input !== undefined) {
      parsedInput = dto.input;
    }

    return this.prisma.aiRun.create({
      data: {
        name: dto.name,
        type: dto.type as AiRunType,
        status: AiRunStatus.PENDING,
        input: parsedInput,
      },
    });
  }

  /**
   * Cancel a run — status-only, no actual execution interruption yet.
   * Only PENDING or RUNNING runs can be cancelled.
   */
  async cancelRun(id: string) {
    const run = await this.prisma.aiRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException(`AiRun ${id} not found`);

    if (run.status !== 'PENDING' && run.status !== 'RUNNING') {
      throw new BadRequestException(
        `Cannot cancel run in status ${run.status}. Only PENDING or RUNNING runs can be cancelled.`,
      );
    }

    return this.prisma.aiRun.update({
      where: { id },
      data: {
        status: AiRunStatus.CANCELLED,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Enqueue a PENDING run for worker processing.
   *
   * Guard: only PENDING runs can be enqueued.
   * Guard: RUNNING/COMPLETED/FAILED/CANCELLED runs are rejected.
   *
   * Emits a QUEUED event for observability.
   * The worker picks it up on its next poll cycle.
   */
  async enqueueRun(id: string): Promise<void> {
    const run = await this.prisma.aiRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException(`AiRun ${id} not found`);

    if (run.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot enqueue run in status ${run.status}. Only PENDING runs can be enqueued.`,
      );
    }

    // Import here to avoid circular dependency at module level
    const { getQueueService } = await import('../../infrastructure/queue/queue.service');
    const queue = getQueueService();

    if (!queue.isAvailable()) {
      throw new BadRequestException(
        'Queue backend is unavailable. Check REDIS_URL configuration.',
      );
    }

    await queue.enqueue(id);

    // Emit QUEUED event for observability (schema has new QUEUED event type)
    await this.prisma.aiEvent.create({
      data: {
        aiRunId: id,
        type: AiEventType.QUEUED,
        message: 'Run enqueued for processing',
      },
    });

    this.logger.log(`[AiOsService] Enqueued run ${id}`);
  }

  // ==================== LEGACY ADAPTER (Phase 3) ====================
  // These methods wrap legacy execution paths with AI OS tracking.
  // They are designed to NEVER fail the legacy execution — all DB
  // operations are wrapped in try/catch and degrade gracefully.

  /**
   * Start a legacy run record. Returns the run id string, or null if tracking failed.
   * Never throws — logs warning and returns null on any error.
   */
  async startLegacyRun(params: {
    type: AiRunType;
    name: string;
    source?: string;
    input?: Record<string, any>;
  }): Promise<string | null> {
    try {
      const run = await this.prisma.aiRun.create({
        data: {
          name: params.name,
          type: params.type,
          status: AiRunStatus.RUNNING,
          input: params.input as any ?? undefined,
          startedAt: new Date(),
        },
      });
      this.logger.log(`[legacy-adapter] Started AiRun ${run.id} (${params.type}): ${params.name}`);
      return run.id;
    } catch (error) {
      this.logger.warn(`[legacy-adapter] startLegacyRun failed: ${(error as Error).message}. Continuing without tracking.`);
      return null;
    }
  }

  /**
   * Mark a legacy run as COMPLETED. Safe to call even if startLegacyRun returned null.
   */
  async completeLegacyRun(
    runId: string | null,
    output: Record<string, any> | undefined,
  ): Promise<void> {
    if (!runId) return;
    try {
      await this.prisma.aiRun.update({
        where: { id: runId },
        data: {
          status: AiRunStatus.COMPLETED,
          output: output as any ?? undefined,
          completedAt: new Date(),
        },
      });
      this.logger.log(`[legacy-adapter] Completed AiRun ${runId}`);
    } catch (error) {
      this.logger.warn(`[legacy-adapter] completeLegacyRun(${runId}) failed: ${(error as Error).message}`);
    }
  }

  /**
   * Mark a legacy run as FAILED. Safe to call even if startLegacyRun returned null.
   */
  async failLegacyRun(runId: string | null, errorMessage: string): Promise<void> {
    if (!runId) return;
    try {
      await this.prisma.aiRun.update({
        where: { id: runId },
        data: {
          status: AiRunStatus.FAILED,
          error: errorMessage,
          completedAt: new Date(),
        },
      });
      this.logger.warn(`[legacy-adapter] Failed AiRun ${runId}: ${errorMessage}`);
    } catch (error) {
      this.logger.warn(`[legacy-adapter] failLegacyRun(${runId}) failed: ${(error as Error).message}`);
    }
  }

  /**
   * Add an event to a legacy run. Safe to call even if startLegacyRun returned null.
   */
  async addLegacyEvent(
    runId: string | null,
    type: AiEventType,
    message: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    if (!runId) return;
    try {
      await this.prisma.aiEvent.create({
        data: {
          aiRunId: runId,
          type,
          message,
          metadata: metadata as any ?? undefined,
        },
      });
    } catch (error) {
      // Silent — event tracking failure should never bubble
      this.logger.debug(`[legacy-adapter] addLegacyEvent failed: ${(error as Error).message}`);
    }
  }

  /**
   * Add a step to a legacy run. Returns step id string or null.
   */
  async addLegacyStep(
    runId: string | null,
    stepName: string,
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' = 'RUNNING',
    input?: Record<string, any>,
  ): Promise<{ id: string } | null> {
    if (!runId) return null;
    try {
      const step = await this.prisma.aiRunStep.create({
        data: {
          aiRunId: runId,
          stepName,
          status: status as any,
          input: input as any ?? undefined,
          startedAt: status === 'RUNNING' ? new Date() : undefined,
          completedAt: status === 'COMPLETED' || status === 'FAILED' || status === 'SKIPPED' ? new Date() : undefined,
        },
      });
      return { id: step.id };
    } catch (error) {
      this.logger.warn(`[legacy-adapter] addLegacyStep failed: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Update a step status. Safe if step was never created.
   */
  async updateLegacyStep(
    stepId: string | null,
    status: 'COMPLETED' | 'FAILED' | 'SKIPPED',
    output?: Record<string, any>,
    error?: string,
  ): Promise<void> {
    if (!stepId) return;
    try {
      await this.prisma.aiRunStep.update({
        where: { id: stepId },
        data: {
          status: status as any,
          output: output as any ?? undefined,
          error: error ?? undefined,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(`[legacy-adapter] updateLegacyStep failed: ${(error as Error).message}`);
    }
  }
}
