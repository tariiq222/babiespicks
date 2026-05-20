import * as cheerio from 'cheerio';
import { Logger } from '@nestjs/common';
import type { ReviewData } from '../../review-analyzer/review-analyzer.service';
import { getTestSafeFetchOptions, getUrlLogTarget, safeFetch } from '../../../infrastructure/safety/url-safety';
import { readBoundedHtmlResponse } from '../html-response';

const logger = new Logger('ReviewScraper');

export async function scrapeReviews(url: string, maxReviews = 20): Promise<ReviewData[]> {
  try {
    const response = await safeFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'ar,en;q=0.9',
      },
    }, getTestSafeFetchOptions());

    const html = await readBoundedHtmlResponse(response);
    if (!html) return [];
    const $ = cheerio.load(html);
    const reviews: ReviewData[] = [];

    // Amazon SA reviews
    if (url.includes('amazon.sa') || url.includes('amazon.com')) {
      $('[data-hook="review"]').each((i, el) => {
        if (i >= maxReviews) return false;
        const text = $(el).find('[data-hook="review-body"] span').text().trim();
        const ratingText = $(el).find('[data-hook="review-star-rating"] span').first().text();
        const ratingMatch = ratingText.match(/(\d+(\.\d+)?)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;
        const dateText = $(el).find('[data-hook="review-date"]').text().trim();
        if (text) {
          reviews.push({ text, rating, date: dateText, source: 'amazon' });
        }
      });
    }

    // Noon reviews
    if (url.includes('noon.com')) {
      $('[class*="review"], [data-qa*="review"]').each((i, el) => {
        if (i >= maxReviews) return false;
        const text = $(el).find('[class*="reviewText"], [class*="comment"], p').text().trim();
        const ratingEl = $(el).find('[class*="star"], [class*="rating"]');
        const ratingText = ratingEl.attr('aria-label') || ratingEl.text();
        const ratingMatch = ratingText?.match(/(\d+(\.\d+)?)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;
        if (text && text.length > 10) {
          reviews.push({ text, rating, source: 'noon' });
        }
      });
    }

    // Generic Schema.org reviews (runs for any site)
    if (reviews.length === 0) {
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html() || '');
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
            const reviewList =
              item.review ||
              (item['@graph'] as any[] | undefined)?.find((g: any) => g.review)?.review;
            if (Array.isArray(reviewList)) {
              for (const r of reviewList.slice(0, maxReviews)) {
                const text: string = r.reviewBody || r.description || '';
                if (text) {
                  reviews.push({
                    text,
                    rating: r.reviewRating?.ratingValue
                      ? parseFloat(r.reviewRating.ratingValue)
                      : undefined,
                    source: 'schema_org',
                  });
                }
              }
            }
          }
        } catch {
          // Ignore malformed JSON-LD blocks
        }
      });
    }

    logger.log(`Scraped ${reviews.length} reviews from origin ${getUrlLogTarget(url)}`);
    return reviews;
  } catch (error) {
    logger.warn(`Failed to scrape reviews from origin ${getUrlLogTarget(url)}: ${(error as Error).message}`);
    return [];
  }
}
