import { NextResponse } from 'next/server';

import {
  ADMIN_SESSION_COOKIE_NAME,
  getAdminSessionClearCookieOptions,
} from '@/shared/lib/admin-auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, '', getAdminSessionClearCookieOptions());
  return response;
}
