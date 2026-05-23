import * as cheerio from 'cheerio';
import { Logger } from '@nestjs/common';

const logger = new Logger('NoonBestsellers');

export interface NoonCandidate {
  url: string;
  name: string;
  price?: number;
  rating?: number;
  category: string;
  source: 'noon_bestseller';
  score: number;
}

const NOON_BABY_PAGES: Array<{ url: string; category: string }> = [
  { url: 'https://www.noon.com/saudi-en/baby/', category: 'baby' },
  { url: 'https://www.noon.com/saudi-en/baby/feeding-essentials/', category: 'feeding' },
  { url: 'https://www.noon.com/saudi-en/baby/baby-care/diapers/', category: 'diapers' },
  { url: 'https://www.noon.com/saudi-en/baby/baby-travel-gear/', category: 'strollers' },
];

async function fetchNoonPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      logger.warn(`HTTP ${response.status} for ${url}`);
      return null;
    }
    return response.text();
  } catch (error) {
    logger.warn(`Fetch failed for ${url}: ${(error as Error).message}`);
    return null;
  }
}

function parseNoonProducts(html: string, category: string): NoonCandidate[] {
  const $ = cheerio.load(html);
  const candidates: NoonCandidate[] = [];
  const seenUrls = new Set<string>();

  // Noon product links contain /p/ pattern
  $('a[href*="/p/"]').each((i, el) => {
    if (candidates.length >= 15) return false;

    const href = $(el).attr('href') ?? '';
    const fullUrl = href.startsWith('http') ? href : `https://www.noon.com${href}`;

    // Normalise: strip query/fragment
    const cleanUrl = fullUrl.replace(/[?#].*$/, '');

    // Skip if already collected or not a product detail URL
    if (seenUrls.has(cleanUrl) || !cleanUrl.match(/\/p\/[A-Z0-9]+/i)) return;
    seenUrls.add(cleanUrl);

    // Try to get product name from link text or nearby elements
    const $card = $(el).closest('[class*="product"], [class*="card"], [class*="item"]');
    const name =
      $card.find('[class*="name"], [class*="title"]').first().text().trim() ||
      $(el).find('[class*="name"], [class*="title"], span').first().text().trim() ||
      $(el).attr('title') ||
      $(el).text().trim();

    if (!name || name.length < 3) return;

    // Try to get price
    const priceText = $card.find('[class*="price"], [class*="amount"]').first().text().trim();
    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
    const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : undefined;

    // Try to get rating
    const ratingText = $card.find('[class*="rating"], [class*="star"]').first().text().trim();
    const ratingMatch = ratingText.match(/([\d.]+)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

    candidates.push({
      url: cleanUrl,
      name: name.substring(0, 200),
      price: price && !isNaN(price) ? price : undefined,
      rating: rating && !isNaN(rating) && rating <= 5 ? rating : undefined,
      category,
      source: 'noon_bestseller',
      score: 0,
    });
  });

  return candidates;
}

/**
 * Search Noon SA by product name and return the first product detail link.
 * Returns null when no `/p/` link is parseable from the search results.
 *
 * Used by DiscoveryService.findOnMarketplace as the primary lookup
 * for the Dify orchestration "search marketplace" workflow.
 */
export async function searchNoonByName(
  query: string,
  _category?: string,
): Promise<{ url: string; sku: string | null } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const searchUrl = `https://www.noon.com/saudi-en/search/?q=${encodeURIComponent(trimmed)}`;
  logger.log(`Noon search: ${searchUrl}`);

  const html = await fetchNoonPage(searchUrl);
  if (!html) return null;

  const $ = cheerio.load(html);
  let foundHref: string | null = null;

  $('a[href*="/p/"]').each((_, el) => {
    if (foundHref) return false;
    const href = $(el).attr('href') ?? '';
    const fullUrl = href.startsWith('http') ? href : `https://www.noon.com${href}`;
    const cleanUrl = fullUrl.replace(/[?#].*$/, '');
    if (cleanUrl.match(/\/p\/[A-Z0-9]+/i)) {
      foundHref = cleanUrl;
      return false;
    }
  });

  if (!foundHref) return null;
  const url: string = foundHref;
  const skuMatch = url.match(/\/p\/([A-Z0-9]+)/i);
  const sku = skuMatch ? skuMatch[1] : null;
  return { url, sku };
}

export async function scrapeNoonBestsellers(): Promise<NoonCandidate[]> {
  logger.log('Scraping Noon SA baby product pages...');
  const all: NoonCandidate[] = [];

  for (const page of NOON_BABY_PAGES) {
    logger.log(`Fetching: ${page.url}`);
    const html = await fetchNoonPage(page.url);
    if (!html) {
      logger.warn(`Skipping ${page.category} — failed to fetch`);
      // Polite delay even on failure
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    const candidates = parseNoonProducts(html, page.category);
    logger.log(`  ${page.category}: ${candidates.length} products found`);
    all.push(...candidates);

    // Polite delay between pages
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Deduplicate across pages by URL
  const seen = new Set<string>();
  const unique = all.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  logger.log(`Noon bestsellers total: ${unique.length} unique candidates`);
  return unique;
}
