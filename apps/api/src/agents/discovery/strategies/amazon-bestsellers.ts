import * as cheerio from 'cheerio';
import { Logger } from '@nestjs/common';

const logger = new Logger('AmazonBestsellers');

export interface BestsellerCandidate {
  url: string;
  name: string;
  price?: number;
  rating?: number;
  category: string;
  rank: number;
  source: 'amazon_bestseller';
  score: number;
}

const BESTSELLER_PAGES: Array<{ url: string; category: string }> = [
  { url: 'https://www.amazon.sa/gp/bestsellers/baby', category: 'baby' },
  { url: 'https://www.amazon.sa/gp/bestsellers/baby/16404428031', category: 'feeding' },
  { url: 'https://www.amazon.sa/gp/bestsellers/baby/16404429031', category: 'diapering' },
  { url: 'https://www.amazon.sa/gp/bestsellers/baby/16404430031', category: 'safety' },
];

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar-SA,ar;q=0.9,en;q=0.8',
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

function parseBestsellers(html: string, category: string): BestsellerCandidate[] {
  const $ = cheerio.load(html);
  const candidates: BestsellerCandidate[] = [];

  // Amazon bestseller grid items — multiple possible selectors
  const itemSelectors = [
    '.zg-grid-general-faceout',
    '[data-component-type="s-search-result"]',
    '.zg-item-immersion',
    '.p13n-sc-uncoverable-faceout',
  ];

  let $items = $();
  for (const sel of itemSelectors) {
    const found = $(sel);
    if (found.length > 0) {
      $items = found;
      break;
    }
  }

  if ($items.length === 0) {
    // Fallback: find any /dp/ product links
    $('a[href*="/dp/"]').each((i, el) => {
      if (i >= 50) return false;
      const href = $(el).attr('href') ?? '';
      const dpMatch = href.match(/\/dp\/([A-Z0-9]{10})/);
      if (!dpMatch) return;
      const asin = dpMatch[1];
      const productUrl = `https://www.amazon.sa/dp/${asin}`;
      const name = $(el).text().trim().slice(0, 120);
      if (name.length < 5) return;
      candidates.push({
        url: productUrl,
        name,
        category,
        rank: i + 1,
        source: 'amazon_bestseller',
        score: 0,
      });
    });
    return candidates.slice(0, 20);
  }

  $items.each((i, el) => {
    if (i >= 50) return false;

    // Extract product URL (look for /dp/ ASIN link)
    let productUrl = '';
    $(el)
      .find('a[href*="/dp/"]')
      .each((_, a) => {
        const href = $(a).attr('href') ?? '';
        const dpMatch = href.match(/\/dp\/([A-Z0-9]{10})/);
        if (dpMatch && !productUrl) {
          productUrl = `https://www.amazon.sa/dp/${dpMatch[1]}`;
        }
      });

    if (!productUrl) return;

    // Extract name
    const nameEl = $(el).find(
      '.p13n-sc-truncated, .a-size-small.a-link-child, [class*="product-title"], .a-size-base, a[class*="a-text-normal"]',
    );
    const name = nameEl.first().text().trim().slice(0, 150) || `Product ${i + 1}`;

    // Extract price
    let price: number | undefined;
    const priceText = $(el)
      .find('.p13n-sc-price, .a-price .a-offscreen, [class*="price"]')
      .first()
      .text()
      .trim();
    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
    if (priceMatch) {
      price = parseFloat(priceMatch[0].replace(/,/g, ''));
      if (isNaN(price)) price = undefined;
    }

    // Extract rating
    let rating: number | undefined;
    const ratingText = $(el)
      .find('.a-icon-alt, [aria-label*="stars"], [aria-label*="نجوم"]')
      .first()
      .attr('aria-label') ??
      $(el).find('.a-icon-alt').first().text();
    const ratingMatch = ratingText?.match(/(\d+\.?\d*)/);
    if (ratingMatch) {
      rating = parseFloat(ratingMatch[1]);
      if (isNaN(rating) || rating > 5) rating = undefined;
    }

    candidates.push({
      url: productUrl,
      name,
      price,
      rating,
      category,
      rank: i + 1,
      source: 'amazon_bestseller',
      score: 0,
    });
  });

  return candidates;
}

/**
 * Search Amazon SA by product name and return the first /dp/ ASIN match.
 * Returns null when no ASIN link is parseable from the search results.
 *
 * Used by DiscoveryService.findOnMarketplace as the fallback lookup
 * after Noon misses.
 */
export async function searchAmazonByName(
  query: string,
  _category?: string,
): Promise<{ url: string; sku: string | null } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const searchUrl = `https://www.amazon.sa/s?k=${encodeURIComponent(trimmed)}`;
  logger.log(`Amazon search: ${searchUrl}`);

  const html = await fetchPage(searchUrl);
  if (!html) return null;

  const $ = cheerio.load(html);
  let asin: string | null = null;

  $('a[href*="/dp/"]').each((_, el) => {
    if (asin) return false;
    const href = $(el).attr('href') ?? '';
    const m = href.match(/\/dp\/([A-Z0-9]{10})/);
    if (m) {
      asin = m[1];
      return false;
    }
  });

  if (!asin) return null;
  return { url: `https://www.amazon.sa/dp/${asin}`, sku: asin };
}

export async function scrapeAmazonBestsellers(): Promise<BestsellerCandidate[]> {
  logger.log('Scraping Amazon SA bestseller pages...');
  const all: BestsellerCandidate[] = [];

  for (const page of BESTSELLER_PAGES) {
    logger.log(`Fetching: ${page.url}`);
    const html = await fetchPage(page.url);
    if (!html) {
      logger.warn(`Skipping ${page.category} — failed to fetch`);
      continue;
    }

    const candidates = parseBestsellers(html, page.category);
    logger.log(`  ${page.category}: ${candidates.length} products found`);
    all.push(...candidates);

    // Polite rate-limit between pages
    await new Promise((r) => setTimeout(r, 2000));
  }

  logger.log(`Amazon bestsellers total: ${all.length} candidates`);
  return all;
}
