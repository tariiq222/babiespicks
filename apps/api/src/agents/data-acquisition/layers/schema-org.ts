import * as cheerio from 'cheerio';

export interface SchemaOrgProduct {
  name?: string;
  brand?: string;
  description?: string;
  image?: string;
  sku?: string;
  url?: string;
  price?: number;
  originalPrice?: number;
  currency?: string;
  availability?: string;
  rating?: number;
  reviewCount?: number;
  specs?: Record<string, string>;
}

export interface ExtractionResult {
  success: boolean;
  data: SchemaOrgProduct | null;
  confidence: number; // 0-1
  source: 'schema_org';
  rawSchemas: any[];
}

/**
 * Extract product data from Schema.org JSON-LD markup
 * Layer 1 of the DataAcquisition cascade
 */
export async function extractFromSchemaOrg(html: string, url: string): Promise<ExtractionResult> {
  const $ = cheerio.load(html);
  const schemas: any[] = [];

  // Find all JSON-LD scripts
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '');
      if (Array.isArray(json)) {
        schemas.push(...json);
      } else if (json['@graph']) {
        schemas.push(...json['@graph']);
      } else {
        schemas.push(json);
      }
    } catch {}
  });

  // Find Product schemas
  const productSchemas = schemas.filter(
    (s) => s['@type'] === 'Product' || (Array.isArray(s['@type']) && s['@type'].includes('Product')),
  );

  if (productSchemas.length === 0) {
    return { success: false, data: null, confidence: 0, source: 'schema_org', rawSchemas: schemas };
  }

  const schema = productSchemas[0];
  const offer = extractOffer(schema);

  const product: SchemaOrgProduct = {
    name: schema.name || undefined,
    brand: extractBrand(schema),
    description: schema.description || undefined,
    image: extractImage(schema) || extractImageFallback($),
    sku: schema.sku || schema.mpn || undefined,
    url: url,
    price: offer.price,
    originalPrice: offer.originalPrice,
    currency: offer.currency || 'SAR',
    availability: offer.availability,
    rating: extractRating(schema),
    reviewCount: extractReviewCount(schema),
  };

  const confidence = calculateConfidence(product);

  return {
    success: true,
    data: product,
    confidence,
    source: 'schema_org',
    rawSchemas: productSchemas,
  };
}

function extractBrand(schema: any): string | undefined {
  if (!schema.brand) return undefined;
  if (typeof schema.brand === 'string') return schema.brand;
  return schema.brand.name || undefined;
}

function extractImage(schema: any): string | undefined {
  if (!schema.image) return undefined;
  if (typeof schema.image === 'string') return schema.image;
  if (Array.isArray(schema.image)) return schema.image[0];
  return schema.image.url || schema.image.contentUrl || undefined;
}

function extractImageFallback($: cheerio.CheerioAPI): string | undefined {
  // 1. Open Graph image
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) return ogImage;

  // 2. Twitter image
  const twitterImage = $('meta[name="twitter:image"]').attr('content');
  if (twitterImage) return twitterImage;

  // 3. Known product image patterns (Amazon SA, Noon)
  const productPatterns = [
    'images-na.ssl-images-amazon.com',
    'm.media-amazon.com',
    'f.nooncdn.com',
  ];

  let productImg: string | undefined;
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    if (src && productPatterns.some((p) => src.includes(p))) {
      productImg = src;
      return false;
    }
  });
  if (productImg) return productImg;

  // 4. Any large image (>200px)
  let largeImg: string | undefined;
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    const width = parseInt($(el).attr('width') || '0', 10);
    const height = parseInt($(el).attr('height') || '0', 10);
    if (src && (width > 200 || height > 200)) {
      largeImg = src;
      return false;
    }
  });

  return largeImg;
}

function extractOffer(schema: any): {
  price?: number;
  originalPrice?: number;
  currency?: string;
  availability?: string;
} {
  const offers = schema.offers;
  if (!offers) return {};

  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (offer['@type'] === 'AggregateOffer') {
    return {
      price: parseFloat(offer.lowPrice) || undefined,
      currency: offer.priceCurrency,
      availability: offer.availability,
    };
  }

  return {
    price: parseFloat(offer.price) || undefined,
    currency: offer.priceCurrency,
    availability: offer.availability,
  };
}

function extractRating(schema: any): number | undefined {
  const rating = schema.aggregateRating;
  if (!rating) return undefined;
  return parseFloat(rating.ratingValue) || undefined;
}

function extractReviewCount(schema: any): number | undefined {
  const rating = schema.aggregateRating;
  if (!rating) return undefined;
  return parseInt(rating.reviewCount || rating.ratingCount) || undefined;
}

function calculateConfidence(product: SchemaOrgProduct): number {
  let score = 0;
  const fields = ['name', 'brand', 'description', 'image', 'price', 'currency'];
  for (const field of fields) {
    if (product[field as keyof SchemaOrgProduct]) score++;
  }
  if (product.rating) score += 0.5;
  if (product.reviewCount) score += 0.5;
  return Math.min(score / fields.length, 1);
}

/**
 * Fetch a URL and extract Schema.org data
 */
export async function fetchAndExtract(url: string): Promise<ExtractionResult> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BabiesPicks/1.0; +https://babiespicks.com)',
      'Accept': 'text/html',
      'Accept-Language': 'ar,en;q=0.9',
    },
  });

  if (!response.ok) {
    return { success: false, data: null, confidence: 0, source: 'schema_org', rawSchemas: [] };
  }

  const html = await response.text();
  return extractFromSchemaOrg(html, url);
}
