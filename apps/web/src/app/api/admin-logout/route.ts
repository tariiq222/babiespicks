import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, isProductionLike } from '../../../lib/admin-session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProductionLike(),
    maxAge: 0,
    path: '/',
  });
  return response;
}
