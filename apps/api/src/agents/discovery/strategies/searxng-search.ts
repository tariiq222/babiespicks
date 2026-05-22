import * as cheerio from 'cheerio';
import { Logger } from '@nestjs/common';

const logger = new Logger('SearXNG');

export interface SearxngCandidate {
  url: string;
  name: string;
  category?: string;
  thumbnail?: string;
  snippet?: string;
  source: 'searxng_baby' | 'searxng_competitor';
  score: number;
}

const ENGINE = process.env.SEARXNG_URL || 'https://search.ploy.jsa.sa';
const DP_PATTERN = /\/dp\/([A-Z0-9]{10})/i;

/**
 * Generic SearXNG HTML search. Returns deduplicated Amazon.sa product candidates.
 */
export async function searxngSearch(
  query: string,
  source: SearxngCandidate['source'] = 'searxng_baby',
  scoreBase = 5,
): Promise<SearxngCandidate[]> {
  const url = `${ENGINE.replace(/\/$/, '')}/search`;
  let html: string;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      body: new URLSearchParams({ q: query, language: 'all', safesearch: '0' }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      logger.warn(`SearXNG returned HTTP ${res.status} for "${query}"`);
      return [];
    }
    html = await res.text();
  } catch (err) {
    logger.warn(`SearXNG request failed for "${query}": ${(err as Error).message}`);
    return [];
  }

  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const candidates: SearxngCandidate[] = [];

  $('article.result').each((_, el) => {
    const $el = $(el);
    const href = $el.find('a.url_header').attr('href') || $el.find('h3 a').attr('href') || '';
    if (!href.includes('amazon.sa')) return;

    const match = href.match(DP_PATTERN);
    if (!match) return;
    const asin = match[1].toUpperCase();
    if (seen.has(asin)) return;
    seen.add(asin);

    const title = $el.find('h3 a').text().trim().replace(/\s+/g, ' ');
    if (!title || title.length < 8) return;
    const thumbnail = $el.find('img.thumbnail').attr('src') || undefined;
    const snippet = $el.find('p.content').text().trim().replace(/\s+/g, ' ') || undefined;

    candidates.push({
      url: `https://www.amazon.sa/dp/${asin}`,
      name: cleanProductTitle(title),
      thumbnail,
      snippet: snippet && snippet.length > 0 ? snippet : undefined,
      source,
      score: scoreBase,
    });
  });

  logger.log(`SearXNG "${query.slice(0, 50)}…" → ${candidates.length} candidates`);
  return candidates;
}

/**
 * Strategy: discover popular baby products on Amazon.sa via SearXNG.
 * Runs several baby-product queries and merges results.
 */
export async function findBabyProductsViaSearxng(maxPerQuery = 6): Promise<SearxngCandidate[]> {
  const queries = [
    'site:amazon.sa /dp/ baby stroller',
    'site:amazon.sa /dp/ baby car seat',
    'site:amazon.sa /dp/ baby diapers',
    'site:amazon.sa /dp/ baby bottle',
    'site:amazon.sa /dp/ baby monitor',
    'site:amazon.sa /dp/ baby crib',
    'site:amazon.sa /dp/ baby formula',
  ];

  const all: SearxngCandidate[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    const rows = await searxngSearch(q, 'searxng_baby', 6);
    for (const r of rows.slice(0, maxPerQuery)) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      all.push(r);
    }
  }
  return all;
}

function cleanProductTitle(raw: string): string {
  return raw
    .replace(/\s*:\s*Buy Online at Best Price in KSA.*$/i, '')
    .replace(/\s*Souq is now Amazon\.sa.*$/i, '')
    .replace(/[​-‏﻿]/g, '')
    .trim();
}
