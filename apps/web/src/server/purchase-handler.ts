import type { PrismaClient } from '@babiespicks/db';
import type { resolvePurchaseTarget, resolveOfferTarget } from '@babiespicks/domain';

/** Valid single-segment ids: cuid, backfill stable ids and similar. */
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
/** The purchase path's own destination is the only redirect target: no free returnUrl. */
const safeLocale = (request: Request) => new URL(request.url).searchParams.get('locale') === 'en' ? 'en' : 'ar';

export function createPurchaseHandler(db: PrismaClient, resolve: typeof resolvePurchaseTarget) {
  return async (request: Request, input: { productId: string; storeId?: string }) => {
    if (!idPattern.test(input.productId) || (input.storeId && !idPattern.test(input.storeId))) return new Response('Not found', { status: 404 });
    const target = await resolve(db, input);
    if (!target) return new Response('Purchase link unavailable', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    // Measure only an actual resolved destination. Analytics failure must not block purchase.
    try {
      await db.affiliateClick.create({ data: { productId: input.productId, storeId: target.storeId, userAgent: request.headers.get('user-agent')?.slice(0, 500), referrer: request.headers.get('referer')?.slice(0, 500), locale: safeLocale(request) } });
    } catch { /* best effort analytics */ }
    return new Response(null, { status: 302, headers: { Location: target.url, 'Cache-Control': 'no-store' } });
  };
}

/**
 * International offer route: one exact observation, one explicit destination. An expired,
 * superseded or mismatched observation answers with a JSON explanation payload (the UI
 * renders its own product-options page from it) — it never substitutes another
 * marketplace or another version. Click counting stays best effort and non-blocking,
 * and a counted click is never a confirmed commission.
 */
export function createOfferPurchaseHandler(db: PrismaClient, resolve: typeof resolveOfferTarget) {
  return async (request: Request, input: { offerId: string }) => {
    const url = new URL(request.url);
    const observationId = url.searchParams.get('observationId') ?? '';
    const shipToParam = url.searchParams.get('shipTo');
    const explanation = (payload: Record<string, unknown>, status = 410) => new Response(JSON.stringify({ status: 'offerUnavailable', ...payload }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    if (!idPattern.test(input.offerId) || !idPattern.test(observationId)) return explanation({ reason: 'INVALID_TARGET' }, 404);
    if (shipToParam !== 'SA' && shipToParam !== 'US') return explanation({ reason: 'DESTINATION_REQUIRED' }, 400);
    const target = await resolve(db, { offerId: input.offerId, observationId, shipTo: shipToParam });
    if (!target) {
      return explanation({ reason: 'OBSERVATION_EXPIRED', offerId: input.offerId, observationId, shipTo: shipToParam, optionsPath: `/ar/products` });
    }
    try {
      await db.affiliateClick.create({ data: { productId: target.offerId, storeId: target.listingId, userAgent: request.headers.get('user-agent')?.slice(0, 500), referrer: request.headers.get('referer')?.slice(0, 500), locale: safeLocale(request), country: target.marketplaceCode } });
    } catch { /* best effort analytics */ }
    return new Response(null, { status: 302, headers: { Location: target.url, 'Cache-Control': 'no-store' } });
  };
}
