import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TelegramService } from '../notifications/telegram.service';

export interface CircuitBreakerConfig {
  costCapUsd: number;       // Daily cost cap in USD (default: 5)
  failStreakLimit: number;  // Consecutive failures before trip (default: 3)
  rateLimitPerHour: number; // Max pipeline runs per hour (default: 20)
}

export class CircuitBreakerTrippedException extends Error {
  constructor(
    public readonly breakerName: string,
    public readonly reason: string,
  ) {
    super(`Circuit breaker "${breakerName}" tripped: ${reason}`);
    this.name = 'CircuitBreakerTrippedException';
  }
}

@Injectable()
export class CircuitBreakerService implements OnModuleInit {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private config: CircuitBreakerConfig = {
    costCapUsd: 5,
    failStreakLimit: 3,
    rateLimitPerHour: 20,
  };

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly telegram: TelegramService,
  ) {}

  async onModuleInit() {
    await this.seedBreakers();
  }

  private async seedBreakers(): Promise<void> {
    const breakers = ['cost-cap', 'fail-streak', 'rate-limit'];
    for (const name of breakers) {
      await this.prisma.circuitBreakerState.upsert({
        where: { name },
        create: { name },
        update: {},
      });
    }
    this.logger.log(`Seeded ${breakers.length} circuit breakers`);
  }

  /**
   * Check all breakers before running a pipeline.
   * Throws CircuitBreakerTrippedException if any breaker is tripped.
   */
  async checkAll(): Promise<void> {
    await this.checkCostCap();
    await this.checkFailStreak();
    await this.checkRateLimit();
  }

  /**
   * Check daily cost cap. Auto-resets on a new calendar day.
   */
  async checkCostCap(): Promise<void> {
    const breaker = await this.prisma.circuitBreakerState.findUnique({
      where: { name: 'cost-cap' },
    });

    if (breaker?.isTripped) {
      const lastTripped = breaker.lastTrippedAt;
      if (lastTripped) {
        const now = new Date();
        const isNewDay = now.toDateString() !== lastTripped.toDateString();
        if (isNewDay) {
          await this.resetBreaker('cost-cap');
          this.logger.log('Cost cap breaker auto-reset (new day)');
          return;
        }
      }
      throw new CircuitBreakerTrippedException(
        'cost-cap',
        `Daily cost cap of $${this.config.costCapUsd} exceeded`,
      );
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCost = await this.prisma.agentJob.aggregate({
      where: {
        createdAt: { gte: todayStart },
        status: 'COMPLETED',
      },
      _sum: { costUsd: true },
    });

    const totalCost = Number(todayCost._sum.costUsd ?? 0);
    if (totalCost >= this.config.costCapUsd) {
      await this.tripBreaker('cost-cap', { totalCost, cap: this.config.costCapUsd });
      throw new CircuitBreakerTrippedException(
        'cost-cap',
        `Daily cost $${totalCost.toFixed(2)} exceeded cap of $${this.config.costCapUsd}`,
      );
    }
  }

  /**
   * Check consecutive failure streak across key pipeline agents.
   */
  async checkFailStreak(): Promise<void> {
    const breaker = await this.prisma.circuitBreakerState.findUnique({
      where: { name: 'fail-streak' },
    });

    if (breaker?.isTripped) {
      throw new CircuitBreakerTrippedException(
        'fail-streak',
        `${this.config.failStreakLimit} consecutive failures detected`,
      );
    }

    const recentJobs = await this.prisma.agentJob.findMany({
      where: {
        agentName: { in: ['content-writer', 'quality-guard', 'seo-auditor'] },
      },
      orderBy: { createdAt: 'desc' },
      take: this.config.failStreakLimit,
      select: { status: true },
    });

    const allFailed =
      recentJobs.length >= this.config.failStreakLimit &&
      recentJobs.every((j) => j.status === 'FAILED');

    if (allFailed) {
      await this.tripBreaker('fail-streak', {
        consecutiveFailures: this.config.failStreakLimit,
      });
      throw new CircuitBreakerTrippedException(
        'fail-streak',
        `${this.config.failStreakLimit} consecutive pipeline failures`,
      );
    }
  }

  /**
   * Check rate limit (pipeline runs per hour). Auto-resets after 1 hour.
   */
  async checkRateLimit(): Promise<void> {
    const breaker = await this.prisma.circuitBreakerState.findUnique({
      where: { name: 'rate-limit' },
    });

    if (breaker?.isTripped) {
      if (breaker.lastTrippedAt) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (breaker.lastTrippedAt < hourAgo) {
          await this.resetBreaker('rate-limit');
          this.logger.log('Rate limit breaker auto-reset (1 hour passed)');
          return;
        }
      }
      throw new CircuitBreakerTrippedException(
        'rate-limit',
        `Rate limit of ${this.config.rateLimitPerHour}/hour exceeded`,
      );
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await this.prisma.agentJob.count({
      where: {
        agentName: 'coordinator',
        createdAt: { gte: hourAgo },
      },
    });

    if (recentCount >= this.config.rateLimitPerHour) {
      await this.tripBreaker('rate-limit', {
        count: recentCount,
        limit: this.config.rateLimitPerHour,
      });
      throw new CircuitBreakerTrippedException(
        'rate-limit',
        `${recentCount} pipeline runs in last hour (limit: ${this.config.rateLimitPerHour})`,
      );
    }
  }

  /**
   * Record a pipeline failure for explicit tracking.
   * Note: fail-streak detection reads AgentJob records with FAILED status.
   */
  async recordFailure(agentName: string, error: string): Promise<void> {
    this.logger.warn(`Recording failure for ${agentName}: ${error}`);
  }

  /**
   * Trip a breaker and log metadata.
   */
  async tripBreaker(name: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.prisma.circuitBreakerState.update({
      where: { name },
      data: {
        isTripped: true,
        tripCount: { increment: 1 },
        lastTrippedAt: new Date(),
        metadata: metadata as object,
      },
    });
    this.logger.error(`🔴 Circuit breaker TRIPPED: ${name} — ${JSON.stringify(metadata)}`);

    // Notify via Telegram (graceful — TelegramService may not be available)
    if (this.telegram) {
      this.telegram.notifyCircuitBreaker(name, JSON.stringify(metadata)).catch((err: Error) => {
        this.logger.warn(`Telegram notification failed for circuit breaker trip: ${err.message}`);
      });
    }
  }

  /**
   * Reset a breaker back to healthy state.
   */
  async resetBreaker(name: string): Promise<void> {
    await this.prisma.circuitBreakerState.update({
      where: { name },
      data: {
        isTripped: false,
        resetAt: new Date(),
      },
    });
    this.logger.log(`🟢 Circuit breaker RESET: ${name}`);
  }

  /**
   * Get status of all breakers.
   */
  async getStatus(): Promise<
    Array<{
      name: string;
      isTripped: boolean;
      tripCount: number;
      lastTrippedAt: Date | null;
      resetAt: Date | null;
    }>
  > {
    return this.prisma.circuitBreakerState.findMany({
      select: {
        name: true,
        isTripped: true,
        tripCount: true,
        lastTrippedAt: true,
        resetAt: true,
      },
    });
  }

  /**
   * Update config at runtime (e.g. from an admin endpoint).
   */
  updateConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log(`Config updated: ${JSON.stringify(this.config)}`);
  }
}
