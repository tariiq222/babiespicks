import { lookup } from 'node:dns/promises';
import { request as httpRequest, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

export type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type DnsResolver = (hostname: string) => Promise<ResolvedAddress[]>;
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type SafeFetchOptions = {
  dnsResolver?: DnsResolver;
  fetchImpl?: FetchLike;
  maxRedirects?: number;
};

type SafeResolvedUrl = {
  url: URL;
  pinnedAddress?: ResolvedAddress;
};

const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/**
 * Returns true only for externally fetchable HTTP(S) URLs.
 * Blocks localhost, private, link-local, unspecified, and loopback address ranges.
 * DNS-backed validation is handled by ensureSafeHttpUrl immediately before fetches.
 */
export function isSafeHttpUrl(rawUrl: string): boolean {
  const parsed = parseSafeHttpUrl(rawUrl);
  return !!parsed;
}

/**
 * Keeps legacy unit tests mockable without weakening production: callers can
 * spread this into safeFetch options so Vitest's stubbed global fetch is used
 * only under NODE_ENV=test. Production calls still use IP-pinned sockets.
 */
export function getTestSafeFetchOptions(): Pick<SafeFetchOptions, 'fetchImpl'> {
  return process.env.NODE_ENV === 'test' ? { fetchImpl: fetch } : {};
}

/**
 * Validate a URL and resolve hostnames before network access to reduce SSRF risk.
 */
export async function ensureSafeHttpUrl(
  rawUrl: string | URL,
  options: Pick<SafeFetchOptions, 'dnsResolver'> = {},
): Promise<URL> {
  const parsed = parseSafeHttpUrl(rawUrl.toString());
  if (!parsed) {
    throw new UnsafeUrlError('URL is not safe for outbound fetch');
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (isIP(hostname) !== 0) {
    return parsed;
  }

  const resolver = options.dnsResolver ?? defaultDnsResolver;
  const addresses = await resolver(hostname);
  if (addresses.length === 0) {
    throw new UnsafeUrlError('URL hostname did not resolve');
  }

  for (const record of addresses) {
    if (isUnsafeIpAddress(record.address)) {
      throw new UnsafeUrlError('URL hostname resolved to a blocked network address');
    }
  }

  return parsed;
}

/**
 * Fetch a URL after DNS-backed safety validation and bounded manual redirects.
 * Production requests pin the socket to the validated IP address while preserving
 * the original Host header and HTTPS SNI name, closing the DNS rebinding TOCTOU
 * gap between validation and connection. Tests may pass fetchImpl to keep network
 * behavior mockable; that path still validates every URL and redirect hop first.
 */
export async function safeFetch(
  rawUrl: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentResolvedUrl = await resolveSafeHttpUrl(rawUrl, options);
  let currentInit = init;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const response = options.fetchImpl
      ? await options.fetchImpl(currentResolvedUrl.url, {
          ...currentInit,
          redirect: 'manual',
        })
      : await pinnedHttpFetch(currentResolvedUrl, currentInit);

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      return response;
    }

    if (redirectCount === maxRedirects) {
      throw new UnsafeUrlError('URL exceeded maximum redirect hops');
    }

    const nextUrl = new URL(location, currentResolvedUrl.url);
    currentResolvedUrl = await resolveSafeHttpUrl(nextUrl, options);
    currentInit = rewriteRedirectInit(currentInit, response.status);
  }

  throw new UnsafeUrlError('URL exceeded maximum redirect hops');
}

/**
 * Redacted URL label for logs. Includes protocol, host, and port only.
 */
export function getUrlLogTarget(rawUrl: string | URL): string {
  try {
    const parsed = new URL(rawUrl.toString());
    return parsed.origin;
  } catch {
    return '[invalid-url]';
  }
}

async function defaultDnsResolver(hostname: string): Promise<ResolvedAddress[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({
    address: record.address,
    family: record.family as 4 | 6,
  }));
}

async function resolveSafeHttpUrl(
  rawUrl: string | URL,
  options: Pick<SafeFetchOptions, 'dnsResolver'> = {},
): Promise<SafeResolvedUrl> {
  const parsed = parseSafeHttpUrl(rawUrl.toString());
  if (!parsed) {
    throw new UnsafeUrlError('URL is not safe for outbound fetch');
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (isIP(hostname) !== 0) {
    return { url: parsed, pinnedAddress: { address: hostname, family: isIP(hostname) as 4 | 6 } };
  }

  const resolver = options.dnsResolver ?? defaultDnsResolver;
  const addresses = await resolver(hostname);
  if (addresses.length === 0) {
    throw new UnsafeUrlError('URL hostname did not resolve');
  }

  for (const record of addresses) {
    if (isUnsafeIpAddress(record.address)) {
      throw new UnsafeUrlError('URL hostname resolved to a blocked network address');
    }
  }

  return { url: parsed, pinnedAddress: addresses[0] };
}

function pinnedHttpFetch(resolvedUrl: SafeResolvedUrl, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const requestUrl = resolvedUrl.url;
    const pinnedAddress = resolvedUrl.pinnedAddress;
    if (!pinnedAddress) {
      reject(new UnsafeUrlError('URL hostname did not resolve'));
      return;
    }

    const headers = headersInitToRecord(init.headers);
    headers.host ??= getHostHeader(requestUrl);

    const requestOptions: RequestOptions & { servername?: string } = {
      protocol: requestUrl.protocol,
      hostname: pinnedAddress.address,
      family: pinnedAddress.family,
      port: requestUrl.port || (requestUrl.protocol === 'https:' ? 443 : 80),
      method: init.method ?? 'GET',
      path: `${requestUrl.pathname}${requestUrl.search}`,
      headers,
      signal: init.signal ?? undefined,
    };

    if (requestUrl.protocol === 'https:') {
      requestOptions.servername = normalizeHostname(requestUrl.hostname);
    }

    const requestFactory = requestUrl.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = requestFactory(requestOptions, (message) => {
      const responseHeaders = new Headers();
      const rawHeaders = message.rawHeaders ?? [];

      for (let index = 0; index < rawHeaders.length; index += 2) {
        responseHeaders.append(rawHeaders[index], rawHeaders[index + 1]);
      }

      if (rawHeaders.length === 0) {
        for (const [name, value] of Object.entries(message.headers)) {
          if (Array.isArray(value)) {
            for (const entry of value) {
              responseHeaders.append(name, entry);
            }
          } else if (value !== undefined) {
            responseHeaders.append(name, value);
          }
        }
      }

      resolve(
        new Response(Readable.toWeb(message) as ReadableStream<Uint8Array>, {
          status: message.statusCode ?? 0,
          statusText: message.statusMessage,
          headers: responseHeaders,
        }),
      );
    });

    request.on('error', reject);

    if (init.body) {
      writeRequestBody(request, init.body).then(
        () => request.end(),
        (error: unknown) => {
          request.destroy(error instanceof Error ? error : new Error(String(error)));
          reject(error);
        },
      );
      return;
    }

    request.end();
  });
}

function headersInitToRecord(headersInit: HeadersInit | undefined): Record<string, string> {
  const headers = new Headers(headersInit);
  const result: Record<string, string> = {};

  headers.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

function getHostHeader(url: URL): string {
  return url.port ? `${url.hostname}:${url.port}` : url.hostname;
}

async function writeRequestBody(
  request: ReturnType<typeof httpRequest>,
  body: Exclude<RequestInit['body'], undefined | null>,
): Promise<void> {
  if (typeof body === 'string' || body instanceof Uint8Array || Buffer.isBuffer(body)) {
    request.write(body);
    return;
  }

  if (body instanceof ArrayBuffer) {
    request.write(Buffer.from(body));
    return;
  }

  if (body instanceof URLSearchParams) {
    request.write(body.toString());
    return;
  }

  if (body instanceof Blob) {
    request.write(Buffer.from(await body.arrayBuffer()));
    return;
  }

  if (body instanceof ReadableStream) {
    for await (const chunk of Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>)) {
      request.write(chunk);
    }
    return;
  }

  request.write(String(body));
}

function parseSafeHttpUrl(rawUrl: string): URL | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== 'http:' && protocol !== 'https:') {
      return null;
    }

    const hostname = normalizeHostname(parsed.hostname);
    if (!hostname || isLocalhost(hostname) || isUnsafeIpAddress(hostname)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '');
}

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost');
}

function isUnsafeIpAddress(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return isUnsafeIpv4Address(normalized) || isUnsafeIpv6Address(normalized);
}

function isUnsafeIpv4Address(hostname: string): boolean {
  const octets = parseIpv4Octets(hostname);
  if (!octets) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function parseIpv4Octets(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return octets as [number, number, number, number];
}

function isUnsafeIpv6Address(hostname: string): boolean {
  if (!hostname.includes(':')) {
    return false;
  }

  const hextets = parseIpv6Hextets(hostname);
  if (!hextets) {
    return false;
  }

  const isUnspecified = hextets.every((hextet) => hextet === 0);
  const isLoopback = hextets.slice(0, 7).every((hextet) => hextet === 0) && hextets[7] === 1;
  const isUniqueLocal = (hextets[0] & 0xfe00) === 0xfc00;
  const isLinkLocal = (hextets[0] & 0xffc0) === 0xfe80;

  return isUnspecified || isLoopback || isUniqueLocal || isLinkLocal || isUnsafeIpv4MappedAddress(hextets);
}

function isUnsafeIpv4MappedAddress(hextets: number[]): boolean {
  const isMapped = hextets.slice(0, 5).every((hextet) => hextet === 0) && hextets[5] === 0xffff;
  if (!isMapped) {
    return false;
  }

  const ipv4 = [
    hextets[6] >> 8,
    hextets[6] & 0xff,
    hextets[7] >> 8,
    hextets[7] & 0xff,
  ].join('.');

  return isUnsafeIpv4Address(ipv4);
}

function parseIpv6Hextets(hostname: string): number[] | null {
  const normalized = hostname.toLowerCase();
  if ((normalized.match(/::/g) ?? []).length > 1) {
    return null;
  }

  const sections = normalized.split('::');
  const left = parseIpv6Section(sections[0]);
  const right = parseIpv6Section(sections[1] ?? '');
  if (!left || !right) {
    return null;
  }

  if (sections.length === 1) {
    return left.length === 8 ? left : null;
  }

  const missingCount = 8 - left.length - right.length;
  if (missingCount < 0) {
    return null;
  }

  return [...left, ...Array.from({ length: missingCount }, () => 0), ...right];
}

function parseIpv6Section(section: string): number[] | null {
  if (!section) {
    return [];
  }

  const parts = section.split(':');
  const hextets: number[] = [];

  for (const part of parts) {
    if (part.includes('.')) {
      const ipv4Octets = parseIpv4Octets(part);
      if (!ipv4Octets) {
        return null;
      }
      hextets.push((ipv4Octets[0] << 8) | ipv4Octets[1], (ipv4Octets[2] << 8) | ipv4Octets[3]);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/i.test(part)) {
      return null;
    }

    hextets.push(Number.parseInt(part, 16));
  }

  return hextets;
}

function rewriteRedirectInit(init: RequestInit, status: number): RequestInit {
  const method = init.method?.toUpperCase();
  if (status !== 303 && !((status === 301 || status === 302) && method === 'POST')) {
    return init;
  }

  const { body: _body, ...rest } = init;
  return {
    ...rest,
    method: 'GET',
  };
}
