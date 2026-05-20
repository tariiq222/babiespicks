import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type {
  CreateManualTrendSignalInput,
  CreateTrendSignalInput,
  ListTrendSignalsQuery,
} from './dto/trend-intelligence.dto';

const TREND_SIGNAL_STATUS_NEW = 'NEW' as const;
const SAFE_CLICKABLE_URL_PROTOCOLS = new Set(['http:', 'https:']);

interface TrendSignalRecord {
  id: string;
  source?: string;
  sourceUrl?: string | null;
  canonicalUrl?: string | null;
  rawTitle?: string;
  normalizedTitle: string;
  sourceHash: string;
  discoveryReason: string;
  trendScore: number;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface AffiliateAiOsPrisma {
  trendSignal: {
    findMany(args: unknown): Promise<TrendSignalRecord[]>;
    findFirst(args: unknown): Promise<TrendSignalRecord | null>;
    findUnique(args: unknown): Promise<TrendSignalRecord | null>;
    create(args: unknown): Promise<TrendSignalRecord>;
  };
}

@Injectable()
export class TrendIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists admin-visible trend signals with bounded offset pagination. */
  async listSignals(query: ListTrendSignalsQuery = {}) {
    const db = this.prisma as unknown as AffiliateAiOsPrisma;

    return db.trendSignal.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: [{ trendScore: 'desc' }, { createdAt: 'desc' }],
      skip: this.normalizeOffset(query.offset),
      take: this.normalizeLimit(query.limit),
    });
  }

  /** Gets a single trend signal for manual review. */
  async getSignal(id: string) {
    const db = this.prisma as unknown as AffiliateAiOsPrisma;
    const signal = await db.trendSignal.findUnique({ where: { id } });

    if (!signal) {
      throw new NotFoundException(`TrendSignal ${id} was not found`);
    }

    return signal;
  }

  /** Creates a manual admin trend signal without creating or publishing a product draft. */
  async createManualSignal(input: CreateManualTrendSignalInput) {
    return this.createSignalFromSource({
      ...input,
      source: input.source?.trim() || 'manual',
    });
  }

  /**
   * Creates a normalized trend signal from an upstream discovery payload.
   * The method is idempotent: repeated or equivalent payloads return the
   * existing signal matched by canonical URL, normalized title, or source hash.
   */
  async createSignalFromSource(input: CreateTrendSignalInput) {
    const db = this.prisma as unknown as AffiliateAiOsPrisma;
    const source = this.requireText(input.source, 'source');
    const rawTitle = this.requireText(input.title, 'title');
    const discoveryReason = this.requireText(
      input.discoveryReason,
      'discoveryReason',
    );
    const trendScore = this.normalizeTrendScore(input.trendScore);
    const canonicalUrl = this.canonicalizeUrl(input.productUrl);
    const normalizedTitle = this.normalizeTitle(rawTitle);
    const sourceHash = this.computeSourceHash({
      source,
      productUrl: input.productUrl,
      title: rawTitle,
    });

    const dedupeConditions = [
      ...(canonicalUrl ? [{ canonicalUrl }] : []),
      { normalizedTitle },
      { sourceHash },
    ];

    const existingSignal = await db.trendSignal.findFirst({
      where: { OR: dedupeConditions },
    });

    if (existingSignal) {
      return existingSignal;
    }

    try {
      return await db.trendSignal.create({
        data: {
          source,
          sourceUrl: this.canonicalizeUrl(input.sourceUrl, 'sourceUrl'),
          canonicalUrl,
          rawTitle: rawTitle.trim(),
          normalizedTitle,
          sourceHash,
          discoveryReason,
          trendScore,
          demandSignal: input.demandSignal?.trim() || null,
          competitionSignal: input.competitionSignal?.trim() || null,
          seasonalitySignal: input.seasonalitySignal?.trim() || null,
          metadata: input.metadata,
          status: TREND_SIGNAL_STATUS_NEW,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }

      const racedSignal = await db.trendSignal.findFirst({
        where: { OR: dedupeConditions },
      });

      if (racedSignal) {
        return racedSignal;
      }

      throw error;
    }
  }

  /** Canonicalizes product URLs for deterministic deduplication. */
  canonicalizeUrl(value?: string, field = 'productUrl'): string | null {
    const trimmed = value?.trim();

    if (!trimmed) {
      return null;
    }

    try {
      const parsed = new URL(trimmed);

      if (!SAFE_CLICKABLE_URL_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
        throw new BadRequestException(`${field} must use http or https`);
      }

      parsed.hash = '';
      parsed.search = '';
      parsed.protocol = 'https:';
      parsed.hostname = parsed.hostname.toLowerCase();
      parsed.pathname = parsed.pathname.replace(/\/+/g, '/').toLowerCase();
      return parsed.toString();
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      return null;
    }
  }

  /** Trims titles, collapses whitespace, and lowercases ASCII Latin letters only. */
  normalizeTitle(value: string): string {
    return value
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  }

  /** Computes a stable SHA-256 hash from source identity inputs. */
  computeSourceHash(input: {
    source: string;
    productUrl?: string;
    title: string;
  }): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          source: input.source.trim(),
          productUrl: input.productUrl?.trim() ?? '',
          title: input.title.trim(),
        }),
      )
      .digest('hex');
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private requireText(value: string | undefined, field: string): string {
    const trimmed = value?.trim();

    if (!trimmed) {
      throw new BadRequestException(`${field} is required`);
    }

    return trimmed;
  }

  private normalizeTrendScore(value: number): number {
    const score = Number(value);

    if (!Number.isFinite(score)) {
      throw new BadRequestException('trendScore must be a finite number');
    }

    return Math.min(100, Math.max(0, score));
  }

  private normalizeLimit(value?: number | string): number {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(value ?? '50', 10);

    if (!Number.isFinite(parsed)) {
      return 50;
    }

    return Math.min(100, Math.max(1, parsed));
  }

  private normalizeOffset(value?: number | string): number {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(value ?? '0', 10);

    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return Math.min(10_000, Math.max(0, parsed));
  }
}
