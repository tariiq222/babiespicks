import * as cheerio from 'cheerio';
import { Logger } from '@nestjs/common';
import { chat } from '../../../infrastructure/openrouter';

const logger = new Logger('CompetitorScan');

export interface CompetitorGapCandidate {
  url: string;
  name: string;
  category?: string;
  source: 'competitor_gap';
  score: number;
  competitorReason?: string;
}

interface GapSuggestion {
  productName: string;
  brand?: string;
  category: string;
  whyImportant: string;
  amazonSearchQuery: string;
}

async function fetchFirstAmazonResult(query: string): Promise<string | null> {
  const encoded = encodeURIComponent(query);
  const searchUrl = `https://www.amazon.sa/s?k=${encoded}`;

  try {
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar-SA,ar;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    let productUrl: string | null = null;
    $('a.a-link-normal[href*="/dp/"], [data-asin] a[href*="/dp/"]').each((_, el) => {
      if (productUrl) return false;
      const href = $(el).attr('href') ?? '';
      const dpMatch = href.match(/\/dp\/([A-Z0-9]{10})/);
      if (dpMatch) {
        productUrl = `https://www.amazon.sa/dp/${dpMatch[1]}`;
      }
    });

    return productUrl;
  } catch (error) {
    logger.warn(`Search failed for "${query}": ${(error as Error).message}`);
    return null;
  }
}

export async function findCompetitorGaps(): Promise<CompetitorGapCandidate[]> {
  logger.log('Identifying competitor gap products via AI...');

  const { content } = await chat({
    model: 'google/gemini-2.5-flash',
    temperature: 0.3,
    maxTokens: 2000,
    jsonMode: true,
    messages: [
      {
        role: 'system',
        content:
          'You are a competitive analyst for a Saudi baby product review site. Return valid JSON only. No markdown.',
      },
      {
        role: 'user',
        content: `List 15 baby products that are commonly reviewed on Saudi/Gulf baby retail sites 
(like mumzworld.com, firstcry.sa, babyshop.com, noon.com) but might be missing from a newer review platform.

For each product provide:
- productName: string
- brand: string (optional)
- category: string (formula | diapers | carseats | bottles | toys | care | strollers | monitors | other)
- whyImportant: string (1 sentence — why parents look for reviews of this)
- amazonSearchQuery: string (English search query for Amazon SA)

Focus on: top-rated products parents research before buying, safety-critical categories, 
premium brands, and products with lots of user questions.

Return a JSON object: { "products": [...] }`,
      },
    ],
  });

  let suggestions: GapSuggestion[] = [];
  try {
    const parsed = JSON.parse(content) as { products?: GapSuggestion[] };
    suggestions = parsed.products ?? [];
  } catch (error) {
    logger.warn(`Failed to parse AI competitor gap response: ${(error as Error).message}`);
    return [];
  }

  logger.log(`AI suggested ${suggestions.length} competitor gap products`);

  const candidates: CompetitorGapCandidate[] = [];

  for (const s of suggestions) {
    if (!s.amazonSearchQuery) continue;

    logger.log(`Searching Amazon SA for: ${s.amazonSearchQuery}`);
    const productUrl = await fetchFirstAmazonResult(s.amazonSearchQuery);

    if (productUrl) {
      candidates.push({
        url: productUrl,
        name: s.brand ? `${s.brand} ${s.productName}` : s.productName,
        category: s.category,
        source: 'competitor_gap',
        score: 0,
        competitorReason: s.whyImportant,
      });
    }

    // Polite rate-limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  logger.log(`Competitor gap strategy: ${candidates.length} Amazon URLs resolved`);
  return candidates;
}
