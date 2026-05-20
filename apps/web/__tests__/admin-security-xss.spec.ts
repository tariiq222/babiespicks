import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminFetch } from '../src/shared/lib/admin-fetch';

const repoRoot = process.cwd();
const webSrcRoot = path.join(repoRoot, 'apps/web/src');
const adminApprovalsPagePath = path.join(
  webSrcRoot,
  'app/[locale]/admin/approvals/page.tsx',
);
const adminFetchPath = path.join(webSrcRoot, 'shared/lib/admin-fetch.ts');
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

describe('admin approvals stored-XSS guardrails', () => {
  it('does not render approval body fields with dangerouslySetInnerHTML', () => {
    const source = readSource(adminApprovalsPagePath);

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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not read the admin root key from persistent localStorage', () => {
    const source = readSource(adminFetchPath);

    expect(/\b(?:window\.)?localStorage\b/.test(source)).toBe(false);
  });

  it('provides a short-lived credential path via sessionStorage or explicit call-site header', () => {
    const adminFetchSource = readSource(adminFetchPath);
    const adminUiSource = listSourceFiles(adminUiRoot).map(readSource).join('\n');

    const hasSessionStorageCredentialPath = /\b(?:window\.)?sessionStorage\b/.test(
      adminFetchSource,
    );
    const hasExplicitAdminKeyOption =
      /adminFetch\s*\([^)]*adminKey/.test(adminFetchSource) ||
      /AdminFetch(?:Init|Options)[\s\S]*adminKey/.test(adminFetchSource);
    const hasHeaderPassedFromAdminCallSite =
      /adminFetch\([\s\S]{0,700}?headers[\s\S]{0,700}?['"]x-admin-key['"]/.test(
        adminUiSource,
      );

    expect(
      hasSessionStorageCredentialPath ||
        hasExplicitAdminKeyOption ||
        hasHeaderPassedFromAdminCallSite,
    ).toBe(true);
  });

  it('never falls back to a persisted localStorage root key when no header is passed', async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstFetchCall = fetchMock.mock.calls[0];
    if (!firstFetchCall) throw new Error('Expected adminFetch to call fetch');

    const [, init] = firstFetchCall;
    const headers = new Headers(init?.headers);
    expect(headers.get('x-admin-key')).not.toBe('persisted-root-key');
  });
});
