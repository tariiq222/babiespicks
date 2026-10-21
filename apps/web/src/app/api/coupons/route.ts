import { prisma } from '@babiespicks/db';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const storeSlug = params.get('storeSlug');
  if ((storeSlug && (storeSlug.length > 200 || !/^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u.test(storeSlug))) || (params.has('status') && params.get('status') !== 'ACTIVE') || Array.from(params.keys()).some((key) => !['storeSlug', 'status'].includes(key))) return Response.json({ message: 'Invalid request' }, { status: 400 });
  const now = new Date();
  const coupons = await prisma.coupon.findMany({ where: { status: 'ACTIVE', store: { isActive: true, ...(storeSlug ? { slug: storeSlug } : {}) }, AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validUntil: null }, { validUntil: { gte: now } }] }] }, include: { store: { select: { id: true, name: true, slug: true, logoUrl: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
  return Response.json(coupons.map((coupon) => ({ id: coupon.id, code: coupon.code, discountPercent: coupon.discountPercent, discountAmount: coupon.discountAmount === null ? null : Number(coupon.discountAmount), description: coupon.description, status: coupon.status, validUntil: coupon.validUntil, verified: coupon.verified, store: coupon.store })), { headers: { 'Cache-Control': 'no-store' } });
}
