import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from './config.js';
export interface Actor { id: string; canPublish: boolean }
export interface AccessTokenPayload { iss: string; aud: string; sub: string; iat: number; exp: number; scope: 'mcp'; canPublish: boolean }
export const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export function constantTimeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
/** Adapted from Tariq content MCP; strict issuer, audience and finite timestamps are mandatory. */
export function signAccessToken(payload: AccessTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `v1.${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function verifyAccessToken(token: string, config: AppConfig): AccessTokenPayload | null {
  if (!config.MCP_OAUTH_SECRET || token.length > 8192) return null;
  const match = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const [, body, mac] = match;
  const expected = createHmac('sha256', config.MCP_OAUTH_SECRET).update(body).digest('base64url');
  if (!constantTimeEqual(mac, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AccessTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload !== 'object' || payload.iss !== config.MCP_PUBLIC_URL || payload.aud !== config.MCP_RESOURCE || payload.scope !== 'mcp') return null;
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128 || typeof payload.canPublish !== 'boolean') return null;
    if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat < 0 || payload.iat > now + 60 || payload.exp <= now || payload.exp <= payload.iat || payload.exp - payload.iat > ACCESS_TOKEN_TTL_SECONDS) return null;
    return payload;
  } catch { return null; }
}
export function authenticate(authorization: string, config: AppConfig): Actor | null {
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match || match[1].length > 8192) return null;
  const token = match[1];
  if (config.MCP_BEARER_TOKEN && constantTimeEqual(token, config.MCP_BEARER_TOKEN)) return {id:'static:editor', canPublish:false};
  const payload = verifyAccessToken(token, config);
  return payload ? {id:`oauth:${payload.sub}`, canPublish:config.ENABLE_MCP_PUBLISH && payload.canPublish === true} : null;
}
