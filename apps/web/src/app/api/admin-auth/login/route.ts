import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';

import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionToken,
  getAdminLoginRateLimitStatus,
  getAdminSessionCookieOptions,
  recordFailedAdminLogin,
  resetAdminLoginRateLimit,
  validateAdminCredentials,
} from '@/shared/lib/admin-auth';

export async function POST(request: NextRequest) {
  const credentials = await readCredentials(request);
  const clientIp = getClientIp(request);
  const rateLimitStatus = getAdminLoginRateLimitStatus(clientIp, credentials.username);

  if (rateLimitStatus.limited) {
    return NextResponse.json(
      { message: 'Too many login attempts' },
      { status: 429, headers: { 'Retry-After': String(rateLimitStatus.retryAfterSeconds) } },
    );
  }

  if (!validateAdminCredentials(credentials.username, credentials.password)) {
    const failedStatus = recordFailedAdminLogin(clientIp, credentials.username);
    if (failedStatus.limited) {
      return NextResponse.json(
        { message: 'Too many login attempts' },
        { status: 429, headers: { 'Retry-After': String(failedStatus.retryAfterSeconds) } },
      );
    }

    return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
  }

  const token = createAdminSessionToken();
  if (!token) {
    return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
  }

  resetAdminLoginRateLimit(clientIp, credentials.username);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, token, getAdminSessionCookieOptions());
  return response;
}

function getClientIp(request: NextRequest) {
  // IP headers are only a secondary signal because clients can spoof them unless
  // every upstream proxy strips inbound values. Keep parsing strict and fall
  // back to the username bucket when no single valid proxy-provided IP exists.
  const realIp = parseSingleClientIp(request.headers.get('x-real-ip'));
  if (realIp) return realIp;

  return parseSingleClientIp(request.headers.get('x-forwarded-for')) || 'unknown';
}

function parseSingleClientIp(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(',')) return null;

  return isIP(trimmed) ? trimmed : null;
}

async function readCredentials(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    return {
      username: typeof body.username === 'string' ? body.username : '',
      password: typeof body.password === 'string' ? body.password : '',
    };
  }

  const formData = await request.formData().catch(() => null);
  return {
    username: String(formData?.get('username') || ''),
    password: String(formData?.get('password') || ''),
  };
}
