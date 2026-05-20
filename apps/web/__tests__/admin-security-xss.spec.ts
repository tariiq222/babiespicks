import { scryptSync } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST as adminLoginPost } from '../src/app/api/admin-login/route';
import { GET as adminProxyGet } from '../src/app/api/admin-proxy/[...path]/route';
import { ADMIN_SESSION_COOKIE } from '../src/lib/admin-session';
import { adminFetch } from '../src/shared/lib/admin-fetch';

const repoRoot = process.cwd();
const webSrcRoot = path.join(repoRoot, 'apps/web/src');
const adminAffiliateOsPagePath = path.join(
  webSrcRoot,
  'app/[locale]/admin/affiliate-os/page.tsx',
);
const adminFetchPath = path.join(webSrcRoot, 'shared/lib/admin-fetch.ts');
const adminProxyPath = path.join(
  webSrcRoot,
  'app/api/admin-proxy/[...path]/route.ts',
);
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

function makeScryptHash(password: string) {
  const salt = Buffer.from('admin-test-salt');
  const hash = scryptSync(password, salt, 32);
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

function makeJsonRequest(url: string, body: unknown) {
  return new NextRequest(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function loginAndGetCookie(password = 'correct-password') {
  const response = await adminLoginPost(
    makeJsonRequest('http://localhost/api/admin-login', { password }),
  );
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('Expected admin login to set a cookie');
  return setCookie.split(';')[0];
}

function configureProductionAdminEnv() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('ADMIN_SESSION_SECRET', 'test-session-secret');
  vi.stubEnv('ADMIN_PASSWORD_HASH', makeScryptHash('correct-password'));
  vi.stubEnv('ADMIN_API_KEY', 'server-admin-key');
}

describe('admin Affiliate OS stored-XSS guardrails', () => {
  it('does not render approval body fields with dangerouslySetInnerHTML', () => {
    const source = readSource(adminAffiliateOsPagePath);

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

describe('admin root key storage guardrails', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not read admin credentials from browser storage', () => {
    const source = `${readSource(adminFetchPath)}\n${readSource(adminProxyPath)}\n${listSourceFiles(adminUiRoot)
      .map(readSource)
      .join('\n')}`;

    expect(/\b(?:window\.)?localStorage\b/.test(source)).toBe(false);
    expect(/\b(?:window\.)?sessionStorage\b/.test(source)).toBe(false);
    expect(/babiespicks_admin_key/.test(source)).toBe(false);
  });

  it('does not render an admin key prompt in Affiliate OS', () => {
    const source = readSource(adminAffiliateOsPagePath);

    expect(/adminKeyInput|affiliate-os-admin-key|adminUnlock|babiespicks_admin_key/.test(source)).toBe(false);
  });

  it('rejects a wrong admin password', async () => {
    configureProductionAdminEnv();

    const response = await adminLoginPost(
      makeJsonRequest('http://localhost/api/admin-login', { password: 'wrong-password' }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('sets an httpOnly session cookie for the correct admin password', async () => {
    configureProductionAdminEnv();

    const response = await adminLoginPost(
      makeJsonRequest('http://localhost/api/admin-login', { password: 'correct-password' }),
    );
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    expect(setCookie).toContain('Secure');
  });

  it('rejects admin proxy requests without a session cookie in production-like mode', async () => {
    configureProductionAdminEnv();

    const response = await adminProxyGet(
      new NextRequest('http://localhost/api/admin-proxy/admin/approvals'),
      { params: Promise.resolve({ path: ['admin', 'approvals'] }) },
    );

    expect(response.status).toBe(401);
  });

  it('rejects a stale session cookie when production admin auth config is missing', async () => {
    configureProductionAdminEnv();
    const cookie = await loginAndGetCookie();
    vi.stubEnv('ADMIN_PASSWORD_HASH', '');

    const response = await adminProxyGet(
      new NextRequest('http://localhost/api/admin-proxy/admin/approvals', {
        headers: { cookie },
      }),
      { params: Promise.resolve({ path: ['admin', 'approvals'] }) },
    );

    expect(response.status).toBe(401);
  });

  it('allows a valid session cookie and injects only the server-side admin key', async () => {
    configureProductionAdminEnv();
    const cookie = await loginAndGetCookie();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await adminProxyGet(
      new NextRequest('http://localhost/api/admin-proxy/admin/approvals', {
        headers: {
          cookie,
          'x-admin-key': 'browser-leak',
          authorization: 'Bearer browser-leak',
        },
      }),
      { params: Promise.resolve({ path: ['admin', 'approvals'] }) },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get('x-admin-key')).toBe('server-admin-key');
    expect(headers.get('authorization')).toBeNull();
  });

  it('strips browser admin key headers and relies on same-origin cookies', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

    vi.stubGlobal('fetch', fetchMock);

    await adminFetch('/admin/approvals', {
      headers: {
        'x-admin-key': 'browser-leak',
        Authorization: 'Bearer browser-leak',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstFetchCall = fetchMock.mock.calls[0];
    if (!firstFetchCall) throw new Error('Expected adminFetch to call fetch');

    const [url, init] = firstFetchCall;
    const headers = new Headers(init?.headers);
    expect(url).toBe('/api/admin-proxy/admin/approvals');
    expect(init?.credentials).toBe('same-origin');
    expect(headers.get('x-admin-key')).toBeNull();
    expect(headers.get('authorization')).toBeNull();
  });
});
