import { Logger } from '@nestjs/common';
import { chat, parseJsonResponse } from '../../../infrastructure/openrouter';

const logger = new Logger('SmartScorer');

export interface SmartScore {
  searchVolume: number;    // 0-3
  competition: number;     // 0-3 (lower competition = higher score)
  revenuePotential: number; // 0-3
  seasonality: number;     // 0-2
  safetyRisk: number;      // 0 or -5 (penalty for unsafe products)
  totalScore: number;
  reasoning: string;
}

interface CandidateInput {
  name: string;
  price?: number;
  category?: string;
  source: string;
}

interface RawScore {
  index: number;
  searchVolume: number;
  competition: number;
  revenuePotential: number;
  seasonality: number;
  safetyRisk: number;
  reasoning: string;
}

/**
 * Use Gemini Flash to evaluate each candidate on 5 criteria.
 * Returns a Map from product name → SmartScore.
 * Falls back gracefully: returns empty Map on any failure.
 */
export async function smartScoreCandidates(
  candidates: CandidateInput[],
): Promise<Map<string, SmartScore>> {
  if (candidates.length === 0) return new Map();

  const productList = candidates
    .map(
      (c, i) =>
        `${i + 1}. "${c.name}" (${c.category ?? 'unknown'}, ${c.price ? c.price + ' SAR' : 'price unknown'}, source: ${c.source})`,
    )
    .join('\n');

  try {
    const result = await chat({
      model: 'google/gemini-2.5-flash',
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 2000,
      messages: [
        {
          role: 'system',
          content: `You are a Saudi baby product market analyst. Score each product candidate for a review website.

For each product, evaluate:
1. searchVolume (0-3): How many Saudi parents search for this monthly? 3=thousands, 2=hundreds, 1=tens, 0=very few
2. competition (0-3): How few Arabic review sites cover this? 3=no Arabic reviews exist, 2=1-2 sites, 1=3-5 sites, 0=many sites
3. revenuePotential (0-3): Price × typical affiliate commission rate. 3=high (>50 SAR commission), 2=medium (20-50), 1=low (5-20), 0=very low
4. seasonality (0-2): Is this product in demand RIGHT NOW (May 2026, summer approaching, post-Eid)? 2=high demand now, 1=moderate, 0=off-season
5. safetyRisk (0 or -5): Is this product known for safety recalls or concerns? 0=safe, -5=known safety issues

Return a JSON array (no wrapper object): [{"index": 1, "searchVolume": 2, "competition": 3, "revenuePotential": 2, "seasonality": 1, "safetyRisk": 0, "reasoning": "brief reason"}, ...]`,
        },
        {
          role: 'user',
          content: `Score these ${candidates.length} baby product candidates for the Saudi market:\n\n${productList}`,
        },
      ],
    });

    // The model returns JSON — parse it
    let parsed: unknown;
    try {
      parsed = parseJsonResponse(result.content);
    } catch {
      logger.warn(`Smart scorer: invalid JSON response — falling back`);
      return new Map();
    }

    // Accept both top-level array and wrapped { scores: [...] }
    const scores: RawScore[] = Array.isArray(parsed)
      ? (parsed as RawScore[])
      : Array.isArray((parsed as Record<string, unknown>).scores)
        ? ((parsed as Record<string, unknown>).scores as RawScore[])
        : [];

    const scoreMap = new Map<string, SmartScore>();

    for (const s of scores) {
      const idx = s.index - 1;
      if (idx < 0 || idx >= candidates.length) continue;

      const total =
        (s.searchVolume ?? 0) +
        (s.competition ?? 0) +
        (s.revenuePotential ?? 0) +
        (s.seasonality ?? 0) +
        (s.safetyRisk ?? 0);

      scoreMap.set(candidates[idx].name, {
        searchVolume: s.searchVolume ?? 0,
        competition: s.competition ?? 0,
        revenuePotential: s.revenuePotential ?? 0,
        seasonality: s.seasonality ?? 0,
        safetyRisk: s.safetyRisk ?? 0,
        totalScore: total,
        reasoning: s.reasoning ?? '',
      });
    }

    logger.log(`Smart scored ${scoreMap.size}/${candidates.length} candidates`);
    return scoreMap;
  } catch (error) {
    logger.warn(
      `Smart scoring failed: ${(error as Error).message}. Falling back to basic scoring.`,
    );
    return new Map();
  }
}
