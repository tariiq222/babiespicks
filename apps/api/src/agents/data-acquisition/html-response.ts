export const MAX_HTML_RESPONSE_BYTES = 2 * 1024 * 1024;

const HTML_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml']);

/**
 * Validate and read an HTML response with a hard byte ceiling.
 *
 * Returns null for non-2xx responses, missing or non-HTML Content-Type,
 * declared oversized bodies, and streamed bodies that exceed maxBytes.
 */
export async function readBoundedHtmlResponse(
  response: Response,
  maxBytes = MAX_HTML_RESPONSE_BYTES,
): Promise<string | null> {
  if (!response.ok || !hasHtmlContentType(response.headers)) {
    return null;
  }

  const declaredLength = parseContentLength(response.headers.get('content-length'));
  if (declaredLength !== null && declaredLength > maxBytes) {
    return null;
  }

  if (!response.body) {
    return '';
  }

  return readStreamWithLimit(response.body, maxBytes, response.headers.get('content-type') ?? 'text/html');
}

function hasHtmlContentType(headers: Headers): boolean {
  const contentType = headers.get('content-type');
  if (!contentType) {
    return false;
  }

  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return HTML_CONTENT_TYPES.has(mediaType);
}

function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function readStreamWithLimit(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  contentType: string,
): Promise<string | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder(extractCharset(contentType)).decode(combined);
}

function extractCharset(contentType: string): string {
  const charset = contentType
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('charset='));

  return charset?.slice('charset='.length).trim() || 'utf-8';
}
