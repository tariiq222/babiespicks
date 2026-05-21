import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export const ADMIN_SESSION_COOKIE_NAME = 'babiespicks_admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type PasswordVerificationResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'misconfigured' };

function isProductionLike() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET?.trim() || '';
}

export function hasAdminSessionSecret() {
  return getSessionSecret().length > 0;
}

export function hasAdminPasswordVerifier() {
  if (process.env.ADMIN_PASSWORD_HASH?.trim()) return true;
  if (isProductionLike()) return false;

  return Boolean(process.env.ADMIN_PASSWORD);
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function timingSafeStringEqual(left: string, right: string) {
  const leftDigest = createHmac('sha256', 'admin-session-compare').update(left).digest();
  const rightDigest = createHmac('sha256', 'admin-session-compare').update(right).digest();

  return timingSafeEqual(leftDigest, rightDigest) && left.length === right.length;
}

export function createAdminSessionCookieValue() {
  const secret = getSessionSecret();
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      iat: now,
      exp: now + ADMIN_SESSION_MAX_AGE_SECONDS,
      nonce: randomBytes(16).toString('base64url'),
    }),
  );

  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAdminSessionCookieValue(value: string | undefined | null) {
  const secret = getSessionSecret();
  if (!secret || !value) return false;

  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra !== undefined) return false;

  const expectedSignature = sign(payload, secret);
  if (!timingSafeStringEqual(signature, expectedSignature)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };

    return typeof decoded.exp === 'number' && decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password: unknown): PasswordVerificationResult {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, reason: 'invalid' };
  }

  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (passwordHash) {
    return verifyScryptPassword(password, passwordHash)
      ? { ok: true }
      : { ok: false, reason: 'invalid' };
  }

  if (isProductionLike()) {
    return { ok: false, reason: 'misconfigured' };
  }

  const localPassword = process.env.ADMIN_PASSWORD;
  if (!localPassword) {
    return { ok: false, reason: 'misconfigured' };
  }

  return timingSafeStringEqual(password, localPassword)
    ? { ok: true }
    : { ok: false, reason: 'invalid' };
}

function verifyScryptPassword(password: string, passwordHash: string) {
  const [scheme, saltBase64url, hashBase64url, extra] = passwordHash.split(':');
  if (scheme !== 'scrypt' || !saltBase64url || !hashBase64url || extra !== undefined) {
    return false;
  }

  try {
    const salt = Buffer.from(saltBase64url, 'base64url');
    const expectedHash = Buffer.from(hashBase64url, 'base64url');
    if (expectedHash.length === 0) return false;

    const actualHash = scryptSync(password, salt, expectedHash.length);
    return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

export function getAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProductionLike(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

export function clearAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProductionLike(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}
