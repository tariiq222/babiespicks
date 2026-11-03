import { prisma } from '@babiespicks/db';
import { publicCouponView, projectCouponScope, type CouponReadContext } from '../../../../src/server/public-queries';
export const dynamic = 'force-dynamic';
const EXPIRED_VISIBLE_MS = 30 * 24 * 60 * 60 * 1000;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const storeSlug = params.get('storeSlug');
  const shipTo = params.get('shipTo');
  if ((storeSlug && (storeSlug.length > 200 || !/^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u.test(storeSlug))) || (shipTo !== null && shipTo !== 'SA' && shipTo !== 'US') || (params.has('status') && params.get('status') !== 'ACTIVE') || Array.from(params.keys()).some((key) => !['storeSlug', 'status', 'shipTo'].includes(key))) return Response.json({ message: 'Invalid request' }, { status: 400 });
  const now = new Date();
  const activeOnly = params.get('status') === 'ACTIVE';
  const expiredSince = new Date(now.getTime() - EXPIRED_VISIBLE_MS);
  const current = { status: 'ACTIVE' as const, OR: [{ validUntil: null }, { validUntil: { gte: now } }] };
  const recentlyExpired = { status: { in: ['ACTIVE', 'EXPIRED'] as ('ACTIVE' | 'EXPIRED')[] }, validUntil: { gte: expiredSince, lt: now } };
  const coupons = await prisma.coupon.findMany({ where: { store: { isActive: true, ...(storeSlug ? { slug: storeSlug } : {}) }, AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, activeOnly ? current : { OR: [current, recentlyExpired] }] }, include: { store: { select: { id: true, name: true, slug: true, logoUrl: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
  // Structural: the additive coupon columns arrive with the migration, so this reader
  // treats them as optional and falls back to the legacy end column.
  const isExpired = (coupon: { validUntil: Date | null; couponValidUntil?: Date | null; status: string }) => coupon.status !== 'ACTIVE' || (!!coupon.couponValidUntil && coupon.couponValidUntil < now) || (!!coupon.validUntil && coupon.validUntil < now);
  // A coupon is shown for one destination at a time. Without a chosen destination the code
  // stays hidden, so a shared link cannot reveal a US/USD coupon to a visitor in Saudi Arabia.
  const context: CouponReadContext = { audience: 'PUBLIC', eligibleCountries: shipTo ? [shipTo] : [], now };
  // An ended coupon keeps its card as a record, but never its code and never a "verified" badge.
  return Response.json([...coupons].sort((a, b) => Number(isExpired(a)) - Number(isExpired(b))).map((coupon) => {
    const ended = isExpired(coupon);
    const scope = projectCouponScope(coupon);
    const view = publicCouponView(coupon, now, context);
    return {
      id: coupon.id, code: ended ? null : view?.code ?? null, expired: ended,
      discountPercent: scope.percent,
      // The currency belongs to the amount. A legacy amount with no currency is not relabelled.
      discountAmount: scope.discount?.kind === 'AMOUNT' ? Number(scope.discount.money.amount) : null,
      discountCurrency: scope.discount?.kind === 'AMOUNT' ? scope.discount.money.currency : null,
      minimumSpend: scope.minimumSpend?.currency ? { amount: scope.minimumSpend.amount, currency: scope.minimumSpend.currency } : null,
      validUntil: scope.validUntil?.utc ?? null,
      description: coupon.description, status: coupon.status,
      verified: ended ? false : view?.verified ?? false,
      visibility: view?.visibility ?? 'REVIEW_REQUIRED',
      audience: scope.audience, eligibleCountries: scope.eligibleCountries, store: coupon.store,
    };
  }), { headers: { 'Cache-Control': 'no-store' } });
}
