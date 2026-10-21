import type { PrismaClient } from '@babiespicks/db';

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new Error('Body too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createNewsletterHandler(db: PrismaClient) {
  let windowStarted = Date.now(); let requests = 0;
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const allowedOrigin = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin : new URL(request.url).origin;
    if (origin && origin !== allowedOrigin) return Response.json({ message: 'Forbidden' }, { status: 403 });
    if (Date.now() - windowStarted > 60_000) { requests = 0; windowStarted = Date.now(); }
    if (++requests > 120) return Response.json({ message: 'Please try again later' }, { status: 429, headers: { 'Retry-After': '60' } });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ message: 'Invalid request' }, { status: 400 });
    let body: Record<string, unknown>;
    try {
      const value = await readBody(request);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid body');
      body = value as Record<string, unknown>;
    } catch { return Response.json({ message: 'Invalid request' }, { status: 400 }); }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (Object.keys(body).some((key) => !['email', 'name', 'locale'].includes(key)) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (body.locale !== undefined && body.locale !== 'ar' && body.locale !== 'en') || (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 100))) return Response.json({ message: 'Invalid request' }, { status: 400 });
    try {
      await db.newsletterSubscriber.upsert({ where: { email }, create: { email, name: typeof body.name === 'string' ? body.name.trim() : null, locale: body.locale === 'en' ? 'en' : 'ar' }, update: {} });
      return Response.json({ success: true, message: 'subscribed' }, { headers: { 'Cache-Control': 'no-store' } });
    } catch { return Response.json({ message: 'Subscription unavailable' }, { status: 503 }); }
  };
}
