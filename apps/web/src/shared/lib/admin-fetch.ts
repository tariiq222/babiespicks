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

  const headers = new Headers(init?.headers);

  // Preserve Content-Type unless the caller is sending FormData
  const isFormData =
    (typeof FormData !== 'undefined' && init?.body instanceof FormData) ||
    (init?.body &&
      typeof init.body === 'object' &&
      Symbol.toStringTag in (init.body as object));

  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  headers.delete('x-admin-key');
  headers.delete('authorization');

  return fetch(finalUrl, {
    ...init,
    headers,
    credentials: init?.credentials ?? 'same-origin',
  });
}
