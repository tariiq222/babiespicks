import * as cheerio from 'cheerio';
import { chat, type CostInfo } from '../../../infrastructure/openrouter';
import type { SchemaOrgProduct } from './schema-org';

export interface AIExtractionResult {
  success: boolean;
  data: SchemaOrgProduct | null;
  confidence: number;
  source: 'ai_extraction';
  cost: CostInfo | null;
}

/**
 * Extract product data using AI (GLM-4.5-Air) from raw HTML
 * Layer 2 of the DataAcquisition cascade - fallback when Schema.org fails
 */
export async function extractWithAI(html: string, url: string): Promise<AIExtractionResult> {
  // Extract image URLs from raw HTML before cleaning
  const imageUrls = extractImageUrls(html, url);

  // Clean HTML: remove scripts, styles, comments, keep text structure
  const cleaned = cleanHtml(html);

  // Truncate to ~8000 tokens worth of text
  const truncated = cleaned.substring(0, 12000);

  // Append image URLs to help AI identify the main product image
  const contentWithImages = truncated + '\n\n[IMAGE_URLS]:\n' + imageUrls.join('\n');

  try {
    const result = await chat({
      model: 'google/gemini-2.5-flash',
      jsonMode: true,
      maxTokens: 1000,
      messages: [
        {
          role: 'system',
          content: `You extract product data from HTML content. Return ONLY valid JSON with these fields:
{
  "name": "product name",
  "brand": "brand name or null",
  "description": "short description or null",
  "image": "main image URL or null",
  "price": number or null,
  "originalPrice": number or null (if on sale),
  "currency": "SAR" or "USD" etc,
  "rating": number 1-5 or null,
  "reviewCount": number or null
}
If you cannot find a field, set it to null. Extract from the text, not from code.`,
        },
        {
          role: 'user',
          content: `Extract product data from this page (${url}):\n\n${contentWithImages}`,
        },
      ],
    });

    const parsed = JSON.parse(result.content);

    const product: SchemaOrgProduct = {
      name: parsed.name || undefined,
      brand: parsed.brand || undefined,
      description: parsed.description || undefined,
      image: parsed.image || undefined,
      url,
      price: parsed.price ? parseFloat(parsed.price) : undefined,
      originalPrice: parsed.originalPrice ? parseFloat(parsed.originalPrice) : undefined,
      currency: normalizeCurrency(parsed.currency),
      rating: parsed.rating ? parseFloat(parsed.rating) : undefined,
      reviewCount: parsed.reviewCount ? parseInt(parsed.reviewCount) : undefined,
    };

    const confidence = calculateConfidence(product);

    return {
      success: !!product.name,
      data: product.name ? product : null,
      confidence: confidence * 0.8, // AI extraction gets 80% max confidence
      source: 'ai_extraction',
      cost: result.cost,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      confidence: 0,
      source: 'ai_extraction',
      cost: null,
    };
  }
}

function cleanHtml(html: string): string {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, noscript, svg, iframe, nav, footer, header').remove();
  $('[style*="display:none"], [style*="display: none"], .hidden').remove();

  // Get text with some structure
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return text;
}

function extractImageUrls(html: string, url: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];

  // 1. Open Graph image
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) urls.push(ogImage);

  // 2. Twitter image
  const twitterImage = $('meta[name="twitter:image"]').attr('content');
  if (twitterImage) urls.push(twitterImage);

  // 3. Product images from known patterns
  const productPatterns = [
    'images-na.ssl-images-amazon.com',
    'm.media-amazon.com',
    'f.nooncdn.com',
  ];

  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    if (src && productPatterns.some((p) => src.includes(p)) && !urls.includes(src)) {
      urls.push(src);
    }
  });

  // 4. Large images
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    const width = parseInt($(el).attr('width') || '0', 10);
    const height = parseInt($(el).attr('height') || '0', 10);
    if (src && (width > 200 || height > 200) && !urls.includes(src)) {
      urls.push(src);
    }
  });

  return urls.slice(0, 10); // Limit to 10 URLs
}

function calculateConfidence(product: SchemaOrgProduct): number {
  let score = 0;
  const fields = ['name', 'brand', 'description', 'image', 'price', 'currency'];
  for (const field of fields) {
    if (product[field as keyof SchemaOrgProduct]) score++;
  }
  return Math.min(score / fields.length, 1);
}

function normalizeCurrency(currency: string | null | undefined): string {
  if (!currency) return 'SAR';
  const upper = currency.toUpperCase();
  if (upper.includes('SAR') || upper.includes('ريال') || upper.includes('Riyal')) return 'SAR';
  if (upper.includes('USD') || upper.includes('Dollar')) return 'USD';
  if (upper.includes('EUR') || upper.includes('Euro')) return 'EUR';
  return upper;
}
