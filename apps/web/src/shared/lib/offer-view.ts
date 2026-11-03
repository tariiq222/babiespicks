/**
 * Client-side projection helpers (Task 8): pick the display quote from the
 * Task 7 OfferSelectionView without re-deciding anything. The engine already
 * ordered quotes and groups; this only reads them and separates the legacy SAR
 * fallback (which never receives a comparison or delivery claim).
 */

import type { CatalogPageItem, OfferQuoteView, OfferSelectionView } from './api';
import type { DeliveryCountry, DisplayCurrency } from '@babiespicks/domain/international';

/** Prefer a numeric server-approved quote in engine order; metadata is a last resort. */
export function bestQuote(selection: OfferSelectionView | null | undefined): OfferQuoteView | null {
  if (!selection) return null;
  const rows = offerQuoteRows(selection);
  return rows.find(quote => quote.price !== null) ?? rows[0] ?? null;
}

/** Pending delivery is a display state, never permission to invent a quote or link. */
export function offerQuoteRows(selection: OfferSelectionView | null | undefined): OfferQuoteView[] {
  const seen = new Set<string>();
  return [...(selection?.quotes ?? []), ...(selection?.pendingDelivery ?? [])].filter(quote => {
    if (quote.audience !== 'PUBLIC' || seen.has(quote.observationId)) return false;
    seen.add(quote.observationId); return true;
  });
}

export const quoteNeedsDeliveryCheck = (quote: OfferQuoteView): boolean => quote.delivery.state !== 'OBSERVED_AVAILABLE';

/** Only render a server-resolved route, never construct one from ids on the client. */
export function purchasePathForQuote(quote: OfferQuoteView): string | null {
  const path = quote.purchasePath;
  if (!path || !/^\/go\/offer\/[A-Za-z0-9_-]{1,128}\?/.test(path)) return null;
  return path;
}

/** The display price for a catalog row: the engine quote, else the legacy price. */
export function cardPriceView(item: CatalogPageItem): { quote: OfferQuoteView | null; legacy: CatalogPageItem['legacyPrice'] } {
  const quote = bestQuote(item.offers);
  return { quote, legacy: quote ? null : item.legacyPrice };
}

/** Whether any quote still needs delivery verification for the chosen destination. */
export function hasPendingDelivery(selection: OfferSelectionView | null | undefined): boolean {
  return !!selection && selection.pendingDelivery.length > 0;
}

/** Context param helpers shared by links that must clear stale offer state. */
export function contextParams(shipTo: DeliveryCountry | null, currency: DisplayCurrency | null): Record<string, string> {
  return {
    shipTo: shipTo ?? '',
    currency: currency ?? '',
  };
}
