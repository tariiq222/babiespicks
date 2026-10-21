import { timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';

function publicPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 512 || /%2f|%5c/i.test(value)) return false;
  try { return /^\/(ar|en)(\/[\p{L}\p{N}\p{M}_-]+)*\/?$/u.test(decodeURIComponent(value)); } catch { return false; }
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return Response.json({ message: 'Revalidation not configured' }, { status: 503 });
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (Buffer.byteLength(token) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) return Response.json({ message: 'Unauthorized' }, { status: 401 });
  let body: { paths?: unknown; tags?: unknown };
  try { body = await request.json(); } catch { return Response.json({ message: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || (body.paths !== undefined && !Array.isArray(body.paths)) || (body.tags !== undefined && !Array.isArray(body.tags))) return Response.json({ message: 'Invalid request' }, { status: 400 });
  const paths = (body.paths ?? []) as unknown[];
  const tags = (body.tags ?? []) as unknown[];
  if (paths.length + tags.length === 0 || paths.length + tags.length > 100 || paths.some((p) => !publicPath(p)) || tags.some((t) => typeof t !== 'string' || !/^(products|content-pages|offers|coupons|stores)(:[a-zA-Z0-9_\-\u0600-\u06ff%]+)*$/.test(t))) return Response.json({ message: 'Invalid revalidation target' }, { status: 400 });
  // Immediate expiry is intentional for publication withdrawals. Public DB queries are uncached.
  for (const path of paths as string[]) revalidatePath(path);
  for (const tag of tags as string[]) revalidateTag(tag, { expire: 0 });
  return Response.json({ success: true, revalidated: paths, revalidatedTags: tags });
}
