import 'server-only';

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_SESSION_COOKIE_NAME = 'babiespicks_admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_RATE_LIMIT_MAX_FAILURES = 8;

const adminLoginFailures = new Map<string, { count: number; resetAt: number }>();

type AdminSessionPayload = {
  v: 1;
  exp: number;
};

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function getSigningSecret() {
  if (process.env.ADMIN_AUTH_SECRET) return process.env.ADMIN_AUTH_SECRET;

  if (isProduction()) return null;

  return (
    process.env.ADMIN_LOGIN_PASSWORD ||
    process.env.ADMIN_API_KEY ||
    'babiespicks-local-admin-auth-secret'
  );
}

function getExpectedAdminPassword() {
  const explicitPassword = process.env.ADMIN_LOGIN_PASSWORD || process.env.ADMIN_PASSWORD;
  if (explicitPassword) return explicitPassword;

  if (isProduction()) return null;

  return process.env.ADMIN_API_KEY || null;
}

function normalizeAdminLoginUsername(username: string) {
  return username.trim().toLowerCase() || 'unknown';
}

function normalizeAdminLoginClientIp(clientIp: string) {
  return clientIp.trim() || 'unknown';
}

function getRateLimitKeys(clientIp: string, username: string) {
  return [
    `username:${normalizeAdminLoginUsername(username)}`,
    `ip:${normalizeAdminLoginClientIp(clientIp)}`,
  ];
}

function getActiveFailureRecord(key: string) {
  const record = adminLoginFailures.get(key);
  if (!record) return null;

  if (record.resetAt <= Date.now()) {
    adminLoginFailures.delete(key);
    return null;
  }

  return record;
}

export function getAdminLoginRateLimitStatus(clientIp: string, username: string) {
  const limitedRecords = getRateLimitKeys(clientIp, username)
    .map(getActiveFailureRecord)
    .filter((record): record is { count: number; resetAt: number } =>
      Boolean(record && record.count >= ADMIN_LOGIN_RATE_LIMIT_MAX_FAILURES),
    );

  if (limitedRecords.length === 0) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const resetAt = Math.max(...limitedRecords.map((record) => record.resetAt));

  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
}

export function recordFailedAdminLogin(clientIp: string, username: string) {
  getRateLimitKeys(clientIp, username).forEach((key) => {
    const existing = getActiveFailureRecord(key);
    const record = existing || {
      count: 0,
      resetAt: Date.now() + ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
    };

    record.count += 1;
    adminLoginFailures.set(key, record);
  });

  return getAdminLoginRateLimitStatus(clientIp, username);
}

export function resetAdminLoginRateLimit(clientIp: string, username: string) {
  getRateLimitKeys(clientIp, username).forEach((key) => adminLoginFailures.delete(key));
}

function timingSafeStringEqual(actual: string, expected: string) {
  const actualHash = createHash('sha256').update(actual).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function validateAdminCredentials(username: string, password: string) {
  const expectedUsername = process.env.ADMIN_LOGIN_USERNAME || 'admin';
  const expectedPassword = getExpectedAdminPassword();

  if (!expectedPassword) return false;

  return (
    timingSafeStringEqual(username.trim(), expectedUsername) &&
    timingSafeStringEqual(password, expectedPassword)
  );
}

export function createAdminSessionToken() {
  const secret = getSigningSecret();
  if (!secret) return null;

  const payload: AdminSessionPayload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  const secret = getSigningSecret();
  if (!secret || !token) return false;

  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra) return false;

  const expectedSignature = sign(encodedPayload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedSignatureBuffer.length) return false;
  if (!timingSafeEqual(signatureBuffer, expectedSignatureBuffer)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<AdminSessionPayload>;
    return payload.v === 1 && typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function hasValidAdminSession() {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

export function getAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isProduction(),
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

export function getAdminSessionClearCookieOptions() {
  return {
    ...getAdminSessionCookieOptions(),
    maxAge: 0,
  };
}
