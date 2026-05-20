import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'babiespicks_admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

interface AdminSessionPayload {
  v: 1;
  iat: number;
  exp: number;
}

export function isProductionLike() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

export function hasUsableAdminAuthConfig() {
  const hasSecret = Boolean(process.env.ADMIN_SESSION_SECRET);
  const hasHash = Boolean(process.env.ADMIN_PASSWORD_HASH);
  const hasDevPassword = !isProductionLike() && Boolean(process.env.ADMIN_PASSWORD);

  return hasSecret && (hasHash || hasDevPassword);
}

export function createAdminSessionCookieValue(now = Date.now()) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !hasUsableAdminAuthConfig()) return null;

  const issuedAt = Math.floor(now / 1000);
  const payload: AdminSessionPayload = {
    v: 1,
    iat: issuedAt,
    exp: issuedAt + ADMIN_SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionCookie(cookieValue: string | undefined | null, now = Date.now()) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!cookieValue || !secret || !hasUsableAdminAuthConfig()) return false;

  const [encodedPayload, signature, extra] = cookieValue.split('.');
  if (!encodedPayload || !signature || extra) return false;

  const expectedSignature = sign(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) return false;

  let payload: AdminSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AdminSessionPayload;
  } catch {
    return false;
  }

  const nowSeconds = Math.floor(now / 1000);
  return payload.v === 1 && Number.isFinite(payload.exp) && payload.exp > nowSeconds;
}

export function verifyAdminPassword(password: string) {
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (passwordHash) return verifyScryptPassword(password, passwordHash);

  if (isProductionLike()) return false;

  const devPassword = process.env.ADMIN_PASSWORD;
  if (!devPassword) return false;

  return safeEqual(hashForCompare(password), hashForCompare(devPassword));
}

function verifyScryptPassword(password: string, encodedHash: string) {
  const [scheme, saltBase64Url, hashBase64Url, extra] = encodedHash.split(':');
  if (scheme !== 'scrypt' || !saltBase64Url || !hashBase64Url || extra) return false;

  let salt: Buffer;
  let expectedHash: Buffer;
  try {
    salt = Buffer.from(saltBase64Url, 'base64url');
    expectedHash = Buffer.from(hashBase64Url, 'base64url');
  } catch {
    return false;
  }

  if (salt.length === 0 || expectedHash.length === 0) return false;

  const actualHash = scryptSync(password, salt, expectedHash.length);
  return timingSafeEqual(actualHash, expectedHash);
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function hashForCompare(value: string) {
  return createHmac('sha256', 'admin-password-compare').update(value).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}
