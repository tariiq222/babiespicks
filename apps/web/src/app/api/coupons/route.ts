import { prisma } from '@babiespicks/db';
export const dynamic = 'force-dynamic';
const EXPIRED_VISIBLE_MS = 30 * 24 * 60 * 60 * 1000;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const storeSlug = params.get('storeSlug');
  if ((storeSlug && (storeSlug.length > 200 || !/^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u.test(storeSlug))) || (params.has('status') && params.get('status') !== 'ACTIVE') || Array.from(params.keys()).some((key) => !['storeSlug', 'status'].includes(key))) return Response.json({ message: 'Invalid request' }, { status: 400 });
  const now = new Date();
  const activeOnly = params.get('status') === 'ACTIVE';
  const expiredSince = new Date(now.getTime() - EXPIRED_VISIBLE_MS);
  const current = { status: 'ACTIVE' as const, OR: [{ validUntil: null }, { validUntil: { gte: now } }] };
  const recentlyExpired = { status: { in: ['ACTIVE', 'EXPIRED'] as ('ACTIVE' | 'EXPIRED')[] }, validUntil: { gte: expiredSince, lt: now } };
  const coupons = await prisma.coupon.findMany({ where: { store: { isActive: true, ...(storeSlug ? { slug: storeSlug } : {}) }, AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, activeOnly ? current : { OR: [current, recentlyExpired] }] }, include: { store: { select: { id: true, name: true, slug: true, logoUrl: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
  const isExpired = (coupon: { validUntil: Date | null }) => !!coupon.validUntil && coupon.validUntil < now;
  // An ended coupon keeps its card as a record, but never its code.
  return Response.json([...coupons].sort((a, b) => Number(isExpired(a)) - Number(isExpired(b))).map((coupon) => ({ id: coupon.id, code: isExpired(coupon) ? null : coupon.code, expired: isExpired(coupon), discountPercent: coupon.discountPercent, discountAmount: coupon.discountAmount === null ? null : Number(coupon.discountAmount), description: coupon.description, status: coupon.status, validUntil: coupon.validUntil, verified: coupon.verified, store: coupon.store })), { headers: { 'Cache-Control': 'no-store' } });
}
