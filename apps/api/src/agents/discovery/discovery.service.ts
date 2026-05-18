import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { scrapeAmazonBestsellers } from './strategies/amazon-bestsellers';
import { findTrendingProducts } from './strategies/google-trends';
import { findCompetitorGaps } from './strategies/competitor-scan';
import { scrapeNoonBestsellers } from './strategies/noon-bestsellers';
import { smartScoreCandidates } from './scoring/smart-scorer';

export type DiscoverySource = 'amazon' | 'noon' | 'all';

export interface DiscoveryCandidate {
  url: string;
  name: string;
  price?: number;
  rating?: number;
  category?: string;
  source: 'amazon_bestseller' | 'trending' | 'competitor_gap' | 'noon_bestseller';
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
   * Run discovery strategies based on source, deduplicate, filter against DB,
   * score with AI (with fallback to heuristic), and return top N.
   */
  async discoverProducts(maxProducts = 10, source: DiscoverySource = 'all'): Promise<DiscoveryResult> {
    this.logger.log(`=== Discovery Agent START (source: ${source}) ===`);

    const strategyPromises: Promise<DiscoveryCandidate[]>[] = [];
    const strategyNames: string[] = [];

    // Amazon strategies
    if (source === 'amazon' || source === 'all') {
      strategyPromises.push(scrapeAmazonBestsellers());
      strategyPromises.push(findTrendingProducts());
      strategyPromises.push(findCompetitorGaps());
      strategyNames.push('amazon_bestsellers', 'trending', 'competitor_gaps');
    }

    // Noon strategies
    if (source === 'noon' || source === 'all') {
      strategyPromises.push(scrapeNoonBestsellers());
      strategyNames.push('noon_bestsellers');
    }

    // Run all selected strategies in parallel — failures are isolated
    const settledResults = await Promise.allSettled(strategyPromises);

    let candidates: DiscoveryCandidate[] = [];

    for (let i = 0; i < settledResults.length; i++) {
      const result = settledResults[i];
      const name = strategyNames[i] ?? `strategy_${i}`;
      if (result.status === 'fulfilled') {
        candidates.push(...(result.value as DiscoveryCandidate[]));
        this.logger.log(`${name}: ${result.value.length} found`);
      } else {
        this.logger.warn(`${name} strategy failed: ${String(result.reason)}`);
      }
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

    // AI smart scoring — enriches scores; falls back to heuristic if unavailable
    this.logger.log('Running AI smart scoring...');
    const aiScores = await smartScoreCandidates(
      candidates.map((c) => ({
        name: c.name,
        price: c.price,
        category: c.category,
        source: c.source,
      })),
    );

    // Apply scores: use AI score if available, else fall back to heuristic
    candidates = candidates.map((c) => {
      const aiScore = aiScores.get(c.name);
      return {
        ...c,
        score: aiScore ? aiScore.totalScore : this.scoreCandidate(c),
      };
    });

    // Sort descending by score, take top N
    candidates.sort((a, b) => b.score - a.score);
    candidates = candidates.slice(0, maxProducts);

    // Persist a discovery job record
    try {
      await this.prisma.agentJob.create({
        data: {
          agentName: 'discovery',
          status: 'COMPLETED',
          input: {
            source,
            strategies: strategyNames,
            aiScoringEnabled: aiScores.size > 0,
          },
          output: {
            totalDiscovered,
            newCandidates: candidates.length,
            aiScoredCount: aiScores.size,
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
      `=== Discovery Agent DONE: ${totalDiscovered} found → ${candidates.length} new candidates (source: ${source}) ===`,
    );

    return { discovered: totalDiscovered, newCandidates: candidates.length, candidates };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private normaliseUrl(url: string): string {
    return url.replace(/[?#].*$/, '').toLowerCase().trim();
  }

  /** Heuristic fallback scorer used when AI scoring is unavailable */
  private scoreCandidate(c: DiscoveryCandidate): number {
    let score = 0;

    // Source bonus
    if (c.source === 'amazon_bestseller') score += 3;
    else if (c.source === 'noon_bestseller') score += 3;
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
