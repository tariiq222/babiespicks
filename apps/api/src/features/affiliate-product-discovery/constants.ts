export const AMAZON_SEARCH_BASE_URL =
  process.env.AFFILIATE_SEARCH_BASE_URL ?? 'https://search.ploy.jsa.sa';

export const AMAZON_SEARCH_FORMAT =
  process.env.AFFILIATE_SEARCH_FORMAT ?? 'json';

export const AMAZON_SEARCH_API_KEY =
  process.env.AFFILIATE_SEARCH_API_KEY ?? '';

export const AMAZON_ASSOCIATE_TAG = 'babiespicks-21';
export const AMAZON_SA_BASE = 'https://www.amazon.sa';

export type SupportedProvider = 'amazon' | 'noon';
