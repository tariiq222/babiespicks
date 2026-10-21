import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authenticate, verifyAccessToken } from './auth.js';
import { loadConfig } from './config.js';
const config = loadConfig({ MCP_PUBLIC_URL: 'https://mcp.babiespicks.test', MCP_OAUTH_SECRET: 's'.repeat(48), MCP_ADMIN_PASSWORD: 'owner-test-password', MCP_BEARER_TOKEN: 'edit'.repeat(12), ENABLE_MCP_PUBLISH: 'true' });
function signed(patch: Record<string, unknown> = {}, secret = config.MCP_OAUTH_SECRET!) {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ iss: config.MCP_PUBLIC_URL, aud: config.MCP_RESOURCE, sub: 'client-123', iat: now, exp: now + 3600, scope: 'mcp', canPublish: true, ...patch })).toString('base64url');
  return `v1.${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
describe('trusted identity', () => {
  it('requires a token, rejecting anonymous and unsigned or tampered claims', () => {
    expect(authenticate('', config)).toBeNull();
    expect(authenticate('Bearer invented', config)).toBeNull();
    expect(authenticate(`Bearer ${signed({}, 'other-secret')}`, config)).toBeNull();
  });
  it('always restricts the optional static token to editing', () => {
    expect(authenticate(`Bearer ${config.MCP_BEARER_TOKEN}`, config)).toEqual({ id: 'static:editor', canPublish: false });
  });
  it('enables publication only for a verified server grant and enabled switch', () => {
    expect(authenticate(`Bearer ${signed()}`, config)).toEqual({ id: 'oauth:client-123', canPublish: true });
    expect(authenticate(`Bearer ${signed({canPublish: false})}`, config)?.canPublish).toBe(false);
    expect(authenticate(`Bearer ${signed()}`, {...config, ENABLE_MCP_PUBLISH: false})?.canPublish).toBe(false);
  });
  it.each([{iss:'https://other.test'}, {aud:'https://other.test/mcp'}, {aud:config.MCP_PUBLIC_URL}, {sub:''}, {exp:'never'}, {exp:1}, {exp:null}, {exp:Infinity}, {iat:'now'}, {iat:Math.floor(Date.now()/1000)+3600}, {scope:'other'}, {canPublish:'true'}])('rejects malformed or foreign signed payload %j', (patch) => {
    expect(verifyAccessToken(signed(patch), config)).toBeNull();
  });
});
