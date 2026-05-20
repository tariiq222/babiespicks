import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionCookieValue,
  hasUsableAdminAuthConfig,
  isProductionLike,
  verifyAdminPassword,
} from '../../../lib/admin-session';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!hasUsableAdminAuthConfig()) {
    return NextResponse.json({ message: 'Admin login is not configured' }, { status: 503 });
  }

  const payload = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof payload?.password === 'string' ? payload.password : '';

  if (!password || !verifyAdminPassword(password)) {
    return NextResponse.json({ message: 'Invalid password' }, { status: 401 });
  }

  const cookieValue = createAdminSessionCookieValue();
  if (!cookieValue) {
    return NextResponse.json({ message: 'Admin login is not configured' }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProductionLike(),
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  return response;
}
