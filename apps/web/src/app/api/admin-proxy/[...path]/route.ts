import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  hasUsableAdminAuthConfig,
  verifyAdminSessionCookie,
} from '../../../../lib/admin-session';

const BACKEND_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD'];

export const runtime = 'nodejs';

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
  if (!ALLOWED_METHODS.includes(method) || !isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { path } = await params;
  const search = request.nextUrl.search;
  const backendUrl = `${BACKEND_BASE}/${path.join('/')}${search}`;

  const headers: Record<string, string> = {};

  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const accept = request.headers.get('accept');
  if (accept) headers['Accept'] = accept;

  headers['x-admin-key'] = adminKey;

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

function isAuthorizedAdminRequest(request: NextRequest) {
  if (!hasUsableAdminAuthConfig()) return false;

  return verifyAdminSessionCookie(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}
