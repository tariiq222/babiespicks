import type { PrismaClient } from '@babiespicks/db';
import type { resolvePurchaseTarget } from '@babiespicks/domain';

export function createPurchaseHandler(db: PrismaClient, resolve: typeof resolvePurchaseTarget) {
  return async (request: Request, input: { productId: string; storeId?: string }) => {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.productId) || (input.storeId && !/^[a-zA-Z0-9_-]{1,128}$/.test(input.storeId))) return new Response('Not found', { status: 404 });
    const target = await resolve(db, input);
    if (!target) return new Response('Purchase link unavailable', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    // Measure only an actual resolved destination. Analytics failure must not block purchase.
    try {
      const locale = new URL(request.url).searchParams.get('locale');
      await db.affiliateClick.create({ data: { productId: input.productId, storeId: target.storeId, userAgent: request.headers.get('user-agent')?.slice(0, 500), referrer: request.headers.get('referer')?.slice(0, 500), locale: locale === 'en' ? 'en' : 'ar' } });
    } catch { /* best effort analytics */ }
    return new Response(null, { status: 302, headers: { Location: target.url, 'Cache-Control': 'no-store' } });
  };
}
