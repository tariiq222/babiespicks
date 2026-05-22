import { NextRequest, NextResponse } from 'next/server';

import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from '@/shared/lib/admin-auth';

const BACKEND_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD'];
const ADMIN_PROXY_ROUTE_PREFIX = '/api/admin-proxy/';
const ENCODED_PATH_SEPARATOR_PATTERN = /(?:%2f|%5c|%252f|%255c)/i;
const ALLOWED_ADMIN_PROXY_PREFIXES = [
  'admin/product-drafts',
  'admin/approvals',
  'admin/ai-os',
  'admin/analytics',
  'admin/discovery',
  'admin/circuit-breakers',
  'admin/public-offer-drafts',
  'admin/content-drafts',
  'admin/offer-enrichments',
  'admin/trend-signals',
  'admin/scheduled-jobs',
  'admin/connectors',
  'admin/review-workspace',
  'admin/public-offers',
  'admin/scheduled-posts',
  'admin/affiliate-os',
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, 'GET', params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, 'POST', params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, 'PATCH', params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, 'PUT', params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, 'DELETE', params);
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, 'HEAD', params);
}

async function proxy(
  request: NextRequest,
  method: string,
  params: Promise<{ path: string[] }>,
) {
  const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!verifyAdminSessionToken(sessionToken)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { path } = await params;
  if (!isAllowedAdminProxyPath(path, request.nextUrl.pathname)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  if (!ADMIN_KEY) {
    return NextResponse.json({ message: 'Admin backend key is not configured' }, { status: 500 });
  }

  const search = request.nextUrl.search;
  const backendPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  const backendUrl = `${BACKEND_BASE}/${backendPath}${search}`;

  const headers: Record<string, string> = {};

  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const accept = request.headers.get('accept');
  if (accept) headers['Accept'] = accept;

  headers['x-admin-key'] = ADMIN_KEY;

  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await request.clone().arrayBuffer();
  }

  let res: Response;
  try {
    res = await fetch(backendUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      { message: 'Backend unavailable', detail: error.message },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  res.headers.forEach((value, key) => {
    if (
      key === 'content-type' ||
      key === 'content-length' ||
      key === 'content-encoding' ||
      key === 'transfer-encoding'
    ) {
      responseHeaders.set(key, value);
    }
  });

  const data = await res.arrayBuffer();

  return new Response(data, {
    status: res.status,
    headers: responseHeaders,
  });
}

function isAllowedAdminProxyPath(path: string[], pathname: string) {
  const encodedProxyPath = pathname.startsWith(ADMIN_PROXY_ROUTE_PREFIX)
    ? pathname.slice(ADMIN_PROXY_ROUTE_PREFIX.length)
    : '';

  if (!encodedProxyPath || ENCODED_PATH_SEPARATOR_PATTERN.test(encodedProxyPath)) {
    return false;
  }

  if (
    path.length === 0 ||
    path.some(
      (segment) =>
        !segment || segment === '..' || segment.includes('/') || segment.includes('\\'),
    )
  ) {
    return false;
  }

  const joinedPath = path.join('/');
  return ALLOWED_ADMIN_PROXY_PREFIXES.some(
    (prefix) => joinedPath === prefix || joinedPath.startsWith(`${prefix}/`),
  );
}
