const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? '';

/**
 * Browser-safe admin fetch that routes all requests through the Next.js
 * proxy at /api/admin-proxy to avoid CORS / mixed-content issues.
 *
 * Accepts either an absolute backend URL (e.g. `http://localhost:3001/admin/stats`)
 * or a relative path (e.g. `/admin/stats`). Relative paths are recommended.
 */
export function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  let pathname: string;
  let finalUrl: string;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    // Strip the backend origin from absolute URLs so we re-build a same-origin
    // proxy path.  This handles both `http://localhost:3001` and production
    // origins without the caller needing to change.
    try {
      const u = new URL(url);
      pathname = u.pathname + u.search;
      finalUrl = `/api/admin-proxy${pathname}`;
    } catch {
      // Fallback: use as-is (will go to backend directly — caller error)
      pathname = url;
      finalUrl = url;
    }
  } else {
    pathname = url;
    finalUrl = `/api/admin-proxy${pathname}`;
  }

  const headers: Record<string, string> = {};

  // Preserve Content-Type unless the caller is sending FormData
  const isFormData =
    init?.body instanceof FormData ||
    (init?.body && typeof init.body === 'object' && Symbol.toStringTag in (init.body as object));

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (ADMIN_KEY) headers['x-admin-key'] = ADMIN_KEY;

  return fetch(finalUrl, {
    ...init,
    headers: {
      ...headers,
      ...init?.headers,
    },
  });
}
