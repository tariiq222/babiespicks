import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminFetch } from '../src/shared/lib/admin-fetch';

const repoRoot = process.cwd();
const webSrcRoot = path.join(repoRoot, 'apps/web/src');
const adminDifyFlowPagePath = path.join(
  webSrcRoot,
  'app/[locale]/admin/dify-flow/page.tsx',
);
const adminFetchPath = path.join(webSrcRoot, 'shared/lib/admin-fetch.ts');
const adminAuthPath = path.join(webSrcRoot, 'shared/lib/admin-auth.ts');
const adminProxyPath = path.join(webSrcRoot, 'app/api/admin-proxy/[...path]/route.ts');
const adminUiRoot = path.join(webSrcRoot, 'app/[locale]/admin');

function readSource(filePath: string) {
  return readFileSync(filePath, 'utf8');
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) return listSourceFiles(fullPath);
    if (/\.(tsx?|jsx?)$/.test(entry)) return [fullPath];
    return [];
  });
}

describe('admin Dify Flow stored-XSS guardrails', () => {
  it('does not render approval body fields with dangerouslySetInnerHTML', () => {
    const source = readSource(adminDifyFlowPagePath);

    expect(/\bdangerouslySetInnerHTML\b/.test(source)).toBe(false);
  });

  it('limits dangerous HTML insertion outside admin approvals to JSON-LD scripts only', () => {
    const dangerousHtmlSites = listSourceFiles(webSrcRoot).flatMap((filePath) => {
      const source = readSource(filePath);
      const lines = source.split('\n');

      return lines.flatMap((line, index) => {
        if (!line.includes('dangerouslySetInnerHTML')) return [];

        const context = lines
          .slice(Math.max(0, index - 4), Math.min(lines.length, index + 5))
          .join('\n');
        const relativePath = path.relative(repoRoot, filePath);
        const isJsonLdScript =
          /<script\b[\s\S]*type=["']application\/ld\+json["']/m.test(context) &&
          /JSON\.stringify\(/.test(context);
        const isSharedJsonLdComponent =
          relativePath === 'apps/web/src/shared/components/json-ld.tsx' &&
          /type=["']application\/ld\+json["']/.test(context) &&
          /JSON\.stringify\(/.test(context);

        if (isJsonLdScript || isSharedJsonLdComponent) return [];

        return [`${relativePath}:${index + 1}`];
      });
    });

    expect(dangerousHtmlSites).toEqual([]);
  });
});

describe('admin root key and proxy auth guardrails', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not read the admin root key from browser storage', () => {
    const source = readSource(adminFetchPath);

    expect(/\b(?:window\.)?localStorage\b/.test(source)).toBe(false);
    expect(/\b(?:window\.)?sessionStorage\b/.test(source)).toBe(false);
    expect(/babiespicks_admin_key/.test(source)).toBe(false);
  });

  it('does not send x-admin-key from admin browser code', () => {
    const adminFetchSource = readSource(adminFetchPath);
    const adminUiSource = listSourceFiles(adminUiRoot).map(readSource).join('\n');

    expect(/['"]x-admin-key['"]/.test(adminFetchSource)).toBe(false);
    expect(/adminFetch\([\s\S]{0,700}?headers[\s\S]{0,700}?['"]x-admin-key['"]/.test(adminUiSource)).toBe(false);
  });

  it('never reads browser storage or sends root key headers when no header is passed', async () => {
    const localStorageGet = vi.fn(() => 'persisted-root-key');
    const sessionStorageGet = vi.fn(() => 'short-lived-admin-key');
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 }),
    );

    vi.stubGlobal('window', {
      localStorage: { getItem: localStorageGet },
      sessionStorage: { getItem: sessionStorageGet },
    });
    vi.stubGlobal('fetch', fetchMock);

    await adminFetch('/admin/approvals');

    expect(localStorageGet).not.toHaveBeenCalled();
    expect(sessionStorageGet).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstFetchCall = fetchMock.mock.calls[0];
    if (!firstFetchCall) throw new Error('Expected adminFetch to call fetch');

    const [, init] = firstFetchCall;
    const headers = new Headers(init?.headers);
    expect(headers.has('x-admin-key')).toBe(false);
    expect(init?.credentials).toBe('same-origin');
  });

  it('gates the admin proxy with the signed admin session cookie helper', () => {
    const adminAuthSource = readSource(adminAuthPath);
    const adminProxySource = readSource(adminProxyPath);

    expect(adminAuthSource).toContain('ADMIN_SESSION_COOKIE_NAME');
    expect(adminAuthSource).toContain('timingSafeEqual');
    expect(adminProxySource).toContain('verifyAdminSessionToken');
    expect(adminProxySource).toContain('request.cookies.get(ADMIN_SESSION_COOKIE_NAME)');
    expect(/request\.headers\.get\(['"]x-admin-key['"]\)/.test(adminProxySource)).toBe(false);
    expect(/parseBearerToken/.test(adminProxySource)).toBe(false);
  });

  it('does not fall back to public admin keys for admin auth secrets', () => {
    const adminAuthSource = readSource(adminAuthPath);

    expect(adminAuthSource).not.toContain('NEXT_PUBLIC_ADMIN_API_KEY');
    expect(/ADMIN_AUTH_SECRET\s*\|\|\s*process\.env\.ADMIN_API_KEY/.test(adminAuthSource)).toBe(false);
  });

  it('requires ADMIN_AUTH_SECRET for production session signing', () => {
    const adminAuthSource = readSource(adminAuthPath);

    expect(adminAuthSource).toContain('process.env.ADMIN_AUTH_SECRET');
    expect(adminAuthSource).toContain("process.env.NODE_ENV === 'production'");
    expect(/if \(isProduction\(\)\) return null;/.test(adminAuthSource)).toBe(true);
  });

  it('rate limits admin login failures by username and IP buckets', () => {
    const adminAuthSource = readSource(adminAuthPath);

    expect(adminAuthSource).toContain('normalizeAdminLoginUsername');
    expect(adminAuthSource).toContain('normalizeAdminLoginClientIp');
    expect(adminAuthSource).toContain('`username:${normalizeAdminLoginUsername(username)}`');
    expect(adminAuthSource).toContain('`ip:${normalizeAdminLoginClientIp(clientIp)}`');
    expect(adminAuthSource).toContain('getRateLimitKeys(clientIp, username)');
    expect(adminAuthSource).not.toContain('`${clientIp || \'unknown\'}:${username.trim().toLowerCase()}`');
  });

  it('keeps admin login IP extraction conservative because forwarded headers are spoofable', () => {
    const adminLoginRouteSource = readSource(
      path.join(webSrcRoot, 'app/api/admin-auth/login/route.ts'),
    );

    expect(adminLoginRouteSource).toContain('parseSingleClientIp');
    expect(adminLoginRouteSource).toContain('x-forwarded-for');
    expect(adminLoginRouteSource).toContain('x-real-ip');
    expect(adminLoginRouteSource).toContain("trimmed.includes(',')");
    expect(adminLoginRouteSource).toContain('isIP(trimmed)');
    expect(adminLoginRouteSource).toContain("|| 'unknown'");
  });

  it('limits admin proxy forwarding to explicit safe admin prefixes', () => {
    const adminProxySource = readSource(adminProxyPath);

    expect(adminProxySource).toContain('ALLOWED_ADMIN_PROXY_PREFIXES');
    expect(adminProxySource).toContain('admin/product-drafts');
    expect(adminProxySource).toContain('admin/approvals');
    expect(adminProxySource).toContain('admin/ai-os');
    expect(adminProxySource).toContain('admin/analytics');
    expect(adminProxySource).toContain('admin/circuit-breakers');
    expect(adminProxySource).toContain('ENCODED_PATH_SEPARATOR_PATTERN');
    expect(adminProxySource).toContain("segment === '..'");
    expect(adminProxySource).toContain('isAllowedAdminProxyPath');
  });
});
