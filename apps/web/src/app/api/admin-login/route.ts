import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionCookieValue,
  getAdminSessionCookieOptions,
  verifyAdminPassword,
} from '../../../lib/admin-session';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const password = body && typeof body === 'object' && 'password' in body
    ? (body as { password?: unknown }).password
    : undefined;

  const passwordResult = verifyAdminPassword(password);
  if (!passwordResult.ok) {
    return NextResponse.json(
      { ok: false },
      { status: passwordResult.reason === 'misconfigured' ? 503 : 401 },
    );
  }

  const sessionCookieValue = createAdminSessionCookieValue();
  if (!sessionCookieValue) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    ADMIN_SESSION_COOKIE_NAME,
    sessionCookieValue,
    getAdminSessionCookieOptions(),
  );

  return response;
}
