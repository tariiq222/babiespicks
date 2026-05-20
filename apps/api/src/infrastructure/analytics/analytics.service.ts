import { BadRequestException, Injectable } from '@nestjs/common';
import { RetentionClass } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { sanitizeAnalyticsMetadata } from './analytics-metadata';

const NORMALIZED_SESSION_HASH = /^sha256:[a-f0-9]{64}$/;

export interface RecordAnalyticsEventInput {
  eventType: string;
  sessionHash: string;
  source?: string;
  locale?: string;
  country?: string;
  productId?: string;
  contentPageId?: string;
  socialPostId?: string;
  metadata?: unknown;
  idempotencyKey?: string;
  occurredAt?: Date;
}

export interface CtrInput {
  productId?: string;
  contentPageId?: string;
  socialPostId?: string;
  source?: string;
  from: Date;
  to: Date;
}

export interface OptimizationRecommendationInput {
  from: Date;
  to: Date;
  minImpressions?: number;
  ctrThreshold?: number;
  source?: string;
}

/**
 * PII-minimized analytics service. It stores only sessionHash and sanitized
 * business metadata, computes aggregate CTR, and opens recommendations without
 * mutating publishable content.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Record an analytics event after dropping raw PII/session identifiers. */
  async recordEvent(input: RecordAnalyticsEventInput): Promise<unknown> {
    if (!input.sessionHash) {
      throw new BadRequestException('sessionHash is required');
    }

    const sessionHash = normalizeSessionHash(input.sessionHash);

    return this.prisma.analyticsEvent.create({
      data: {
        idempotencyKey: deriveIdempotencyKey(input, sessionHash),
        eventType: input.eventType,
        source: input.source,
        locale: input.locale,
        country: input.country,
        sessionHash,
        productId: input.productId,
        contentPageId: input.contentPageId,
        socialPostId: input.socialPostId,
        metadata: sanitizeAnalyticsMetadata(input.metadata) as never,
        metadataSchemaVersion: 1,
        retentionClass: RetentionClass.SHORT_LIVED,
        occurredAt: input.occurredAt,
      },
    });
  }

  /** Return CTR as affiliate clicks divided by social impressions. */
  async getCtr(input: CtrInput): Promise<{ impressions: number; clicks: number; ctr: number }> {
    const baseWhere = this.analyticsWhere(input);
    const [impressions, clicks] = await Promise.all([
      this.prisma.analyticsEvent.count({
        where: {
          ...baseWhere,
          eventType: 'social_impression',
        },
      }),
      this.prisma.analyticsEvent.count({
        where: {
          ...baseWhere,
          eventType: 'affiliate_click',
        },
      }),
    ]);

    return {
      impressions,
      clicks,
      ctr: impressions === 0 ? 0 : clicks / impressions,
    };
  }

  /**
   * Create OPEN optimization recommendations for low CTR social posts. This is
   * advisory only; it never publishes or edits SocialPost/ContentPage/Product.
   */
  async generateOptimizationRecommendations(input: OptimizationRecommendationInput): Promise<{ created: number }> {
    const minImpressions = input.minImpressions ?? 100;
    const ctrThreshold = input.ctrThreshold ?? 0.03;

    const groups = await this.prisma.analyticsEvent.groupBy({
      by: ['socialPostId'] as const,
      where: {
        eventType: 'social_impression',
        socialPostId: { not: null },
        ...(input.source ? { source: input.source } : {}),
        occurredAt: { gte: input.from, lte: input.to },
      },
      _count: { _all: true },
    } as never) as Array<{ socialPostId: string | null; _count: { _all: number } }>;

    let created = 0;
    for (const group of groups) {
      if (!group.socialPostId || group._count._all < minImpressions) {
        continue;
      }

      const ctr = await this.getCtr({
        socialPostId: group.socialPostId,
        source: input.source,
        from: input.from,
        to: input.to,
      });

      if (ctr.ctr >= ctrThreshold) {
        continue;
      }

      await this.prisma.optimizationRecommendation.create({
        data: {
          idempotencyKey: `low-ctr:${group.socialPostId}:${input.from.toISOString()}:${input.to.toISOString()}`,
          socialPostId: group.socialPostId,
          type: 'LOW_CTR',
          status: 'OPEN',
          recommendation: 'CTR is below target. Review copy, placement, timing, or call-to-action before approving a new draft.',
          rationale: `CTR ${(ctr.ctr * 100).toFixed(2)}% is below threshold ${(ctrThreshold * 100).toFixed(2)}%.`,
          priority: 2,
          impactScore: ctr.impressions,
          metadata: {
            impressions: ctr.impressions,
            clicks: ctr.clicks,
            ctr: ctr.ctr,
            threshold: ctrThreshold,
          } as never,
          retentionClass: RetentionClass.STANDARD,
        },
      });
      created++;
    }

    return { created };
  }

  private analyticsWhere(input: CtrInput): Record<string, unknown> {
    return {
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.contentPageId ? { contentPageId: input.contentPageId } : {}),
      ...(input.socialPostId ? { socialPostId: input.socialPostId } : {}),
      ...(input.source ? { source: input.source } : {}),
      occurredAt: { gte: input.from, lte: input.to },
    };
  }
}

/** Normalize raw session identifiers into sha256:<64hex> before persistence. */
function normalizeSessionHash(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('sha256:')) {
    return lower;
  }
  if (NORMALIZED_SESSION_HASH.test(lower)) {
    return lower;
  }

  return `sha256:${sha256(trimmed)}`;
}

function deriveIdempotencyKey(input: RecordAnalyticsEventInput, sessionHash: string): string | undefined {
  const rawKey = input.idempotencyKey?.trim();
  if (!rawKey) {
    return undefined;
  }

  return `analytics:${sha256([
    input.eventType,
    sessionHash,
    input.source ?? '',
    input.productId ?? '',
    input.contentPageId ?? '',
    input.socialPostId ?? '',
    rawKey,
  ].join(':'))}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
