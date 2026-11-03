/** Candidate markets, not source activation or evidence of item-level delivery. */
export type MarketplaceCode = 'SA' | 'US';
export interface MarketplaceDefinition {
  readonly code: MarketplaceCode;
  readonly domain: string;
  readonly domains: readonly string[];
  readonly nameAr: string;
  readonly nameEn: string;
  readonly currencies: readonly string[];
}
const MARKETPLACES: readonly MarketplaceDefinition[] = Object.freeze([
  Object.freeze({ code: 'SA', domain: 'amazon.sa', domains: Object.freeze(['amazon.sa', 'www.amazon.sa']), nameAr: 'أمازون السعودية', nameEn: 'Amazon Saudi Arabia', currencies: Object.freeze(['SAR']) }),
  Object.freeze({ code: 'US', domain: 'amazon.com', domains: Object.freeze(['amazon.com', 'www.amazon.com']), nameAr: 'أمازون أمريكا', nameEn: 'Amazon United States', currencies: Object.freeze(['USD']) }),
]);
export const SUPPORTED_MARKETPLACE_CODES: readonly MarketplaceCode[] = Object.freeze(['SA', 'US']);
export const APPROVED_CURRENCIES: readonly string[] = Object.freeze([...new Set(MARKETPLACES.flatMap(m => m.currencies))]);
export function getMarketplace(code: string): MarketplaceDefinition | undefined {
  return MARKETPLACES.find(m => m.code === code);
}
/** Exact allowlist, including only explicitly registered www aliases. No suffix matching. */
export function resolveMarketplaceFromDomain(hostname: string): MarketplaceCode | undefined {
  return MARKETPLACES.find(m => m.domains.includes(hostname.toLowerCase()))?.code;
}
export function isApprovedMarketplaceDomain(hostname: string): boolean {
  return resolveMarketplaceFromDomain(hostname) !== undefined;
}
export function isCurrencyApprovedForMarketplace(currency: string, marketplaceCode: string): boolean {
  return getMarketplace(marketplaceCode)?.currencies.includes(currency) ?? false;
}
export function isMarketplaceUrl(value: string, marketplaceCode: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && resolveMarketplaceFromDomain(url.hostname) === marketplaceCode;
  } catch { return false; }
}
