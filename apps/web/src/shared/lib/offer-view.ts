/**
 * Client-side projection helpers (Task 8): pick the display quote from the
 * Task 7 OfferSelectionView without re-deciding anything. The engine already
 * ordered quotes and groups; this only reads them and separates the legacy SAR
 * fallback (which never receives a comparison or delivery claim).
 */

import type { CatalogPageItem, OfferQuoteView, OfferSelectionView } from './api';
import type { DeliveryCountry, DisplayCurrency } from '@babiespicks/domain/international';

/** The first quote of the best comparison group, or the first quote overall. */
export function bestQuote(selection: OfferSelectionView | null | undefined): OfferQuoteView | null {
  if (!selection) return null;
  const bestId = selection.bestByGroup && Object.keys(selection.bestByGroup).length
    ? Object.values(selection.bestByGroup)[0]
    : null;
  if (bestId) {
    const best = selection.quotes.find(quote => quote.offerId === bestId);
    if (best) return best;
  }
  return selection.quotes[0] ?? null;
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
