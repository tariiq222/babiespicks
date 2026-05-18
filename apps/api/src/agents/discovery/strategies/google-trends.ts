import * as cheerio from 'cheerio';
import { Logger } from '@nestjs/common';
import { chat } from '../../../infrastructure/openrouter';

const logger = new Logger('GoogleTrends');

export interface TrendingCandidate {
  url: string;
  name: string;
  category?: string;
  source: 'trending';
  score: number;
  trendReason?: string;
}

interface TrendingSuggestion {
  productName: string;
  brand?: string;
  whyTrending: string;
  searchVolume: 'high' | 'medium' | 'low';
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

    // Find first product result with /dp/ link
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

export async function findTrendingProducts(): Promise<TrendingCandidate[]> {
  logger.log('Generating trending product suggestions via AI...');

  const { content } = await chat({
    model: 'google/gemini-2.5-flash',
    temperature: 0.3,
    maxTokens: 2000,
    jsonMode: true,
    messages: [
      {
        role: 'system',
        content:
          'You are a Saudi baby product market analyst. Return valid JSON only. No markdown.',
      },
      {
        role: 'user',
        content: `List 20 baby products that are currently trending or in high demand in Saudi Arabia.
For each product provide:
- productName: string
- brand: string (optional)
- whyTrending: string (1 sentence)
- searchVolume: "high" | "medium" | "low"
- amazonSearchQuery: string (English search query for Amazon SA)

Focus on: safety-critical products (car seats, monitors), high-spend categories (formula, diapers), 
popular international brands available in Saudi Arabia, and seasonal items.

Return a JSON object: { "products": [...] }`,
      },
    ],
  });

  let suggestions: TrendingSuggestion[] = [];
  try {
    const parsed = JSON.parse(content) as { products?: TrendingSuggestion[] };
    suggestions = parsed.products ?? [];
  } catch (error) {
    logger.warn(`Failed to parse AI trending response: ${(error as Error).message}`);
    return [];
  }

  logger.log(`AI suggested ${suggestions.length} trending products`);

  const candidates: TrendingCandidate[] = [];

  for (const s of suggestions) {
    if (!s.amazonSearchQuery) continue;

    logger.log(`Searching Amazon SA for: ${s.amazonSearchQuery}`);
    const productUrl = await fetchFirstAmazonResult(s.amazonSearchQuery);

    if (productUrl) {
      candidates.push({
        url: productUrl,
        name: s.brand ? `${s.brand} ${s.productName}` : s.productName,
        source: 'trending',
        score: 0,
        trendReason: s.whyTrending,
      });
    }

    // Polite rate-limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  logger.log(`Trending strategy: ${candidates.length} Amazon URLs resolved`);
  return candidates;
}
