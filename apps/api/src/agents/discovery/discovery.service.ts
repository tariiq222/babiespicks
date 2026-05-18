import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { scrapeAmazonBestsellers } from './strategies/amazon-bestsellers';
import { findTrendingProducts } from './strategies/google-trends';
import { findCompetitorGaps } from './strategies/competitor-scan';

export interface DiscoveryCandidate {
  url: string;
  name: string;
  price?: number;
  rating?: number;
  category?: string;
  source: 'amazon_bestseller' | 'trending' | 'competitor_gap';
  score: number;
  trendReason?: string;
  competitorReason?: string;
}

export interface DiscoveryResult {
  discovered: number;
  newCandidates: number;
  candidates: DiscoveryCandidate[];
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run all discovery strategies, deduplicate, filter against DB, score and return top N.
   */
  async discoverProducts(maxProducts = 10): Promise<DiscoveryResult> {
    this.logger.log('=== Discovery Agent START ===');

    // Run all 3 strategies in parallel — failures are isolated
    const [bestsellersResult, trendingResult, gapsResult] = await Promise.allSettled([
      scrapeAmazonBestsellers(),
      findTrendingProducts(),
      findCompetitorGaps(),
    ]);

    let candidates: DiscoveryCandidate[] = [];

    if (bestsellersResult.status === 'fulfilled') {
      candidates.push(...bestsellersResult.value);
      this.logger.log(`Bestsellers: ${bestsellersResult.value.length} found`);
    } else {
      this.logger.warn(`Bestsellers strategy failed: ${String(bestsellersResult.reason)}`);
    }

    if (trendingResult.status === 'fulfilled') {
      candidates.push(...trendingResult.value);
      this.logger.log(`Trending: ${trendingResult.value.length} found`);
    } else {
      this.logger.warn(`Trending strategy failed: ${String(trendingResult.reason)}`);
    }

    if (gapsResult.status === 'fulfilled') {
      candidates.push(...gapsResult.value);
      this.logger.log(`Competitor gaps: ${gapsResult.value.length} found`);
    } else {
      this.logger.warn(`Competitor gap strategy failed: ${String(gapsResult.reason)}`);
    }

    const totalDiscovered = candidates.length;
    this.logger.log(`Total discovered across all strategies: ${totalDiscovered}`);

    // Deduplicate by normalised URL (strip query/fragment)
    const seenUrls = new Set<string>();
    candidates = candidates.filter((c) => {
      const key = this.normaliseUrl(c.url);
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    });
    this.logger.log(`After dedup: ${candidates.length} candidates`);

    // Filter out products already in the DB
    const existingUrls = await this.prisma.product.findMany({
      where: { sourceUrl: { not: null } },
      select: { sourceUrl: true },
    });
    const existingSet = new Set(
      existingUrls.map((p) => this.normaliseUrl(p.sourceUrl ?? '')),
    );

    candidates = candidates.filter((c) => !existingSet.has(this.normaliseUrl(c.url)));
    this.logger.log(`After DB filter: ${candidates.length} new candidates`);

    // Score every candidate
    candidates = candidates.map((c) => ({ ...c, score: this.scoreCandidate(c) }));

    // Sort descending by score, take top N
    candidates.sort((a, b) => b.score - a.score);
    candidates = candidates.slice(0, maxProducts);

    // Persist a discovery job record
    try {
      await this.prisma.agentJob.create({
        data: {
          agentName: 'discovery',
          status: 'COMPLETED',
          input: { strategies: ['amazon_bestsellers', 'trending', 'competitor_gaps'] },
          output: {
            totalDiscovered,
            newCandidates: candidates.length,
            candidates: candidates.map((c) => ({
              name: c.name,
              url: c.url,
              score: c.score,
              source: c.source,
            })),
          },
          tokensUsed: 0,
          costUsd: 0,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to persist discovery job: ${(error as Error).message}`);
    }

    this.logger.log(
      `=== Discovery Agent DONE: ${totalDiscovered} found → ${candidates.length} new candidates ===`,
    );

    return { discovered: totalDiscovered, newCandidates: candidates.length, candidates };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private normaliseUrl(url: string): string {
    return url.replace(/[?#].*$/, '').toLowerCase().trim();
  }

  private scoreCandidate(c: DiscoveryCandidate): number {
    let score = 0;

    // Source bonus
    if (c.source === 'amazon_bestseller') score += 3;
    else if (c.source === 'trending') score += 2;
    else if (c.source === 'competitor_gap') score += 1;

    // Rating bonus
    if (c.rating !== undefined) {
      if (c.rating >= 4.5) score += 2;
      else if (c.rating >= 4.0) score += 1;
    }

    // High-value category bonus
    const highValueKeywords = [
      'formula', 'diapers', 'carseats', 'car seat', 'carseat',
      'stroller', 'monitor', 'حليب', 'حفاضات', 'كرسي سيارة',
    ];
    const categoryLower = (c.category ?? '').toLowerCase();
    const nameLower = c.name.toLowerCase();
    if (highValueKeywords.some((kw) => categoryLower.includes(kw) || nameLower.includes(kw))) {
      score += 2;
    }

    // Price bonus (higher price = more affiliate revenue potential)
    if (c.price !== undefined) {
      if (c.price > 200) score += 2;
      else if (c.price > 100) score += 1;
    }

    return score;
  }
}
