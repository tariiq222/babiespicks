import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

/**
 * Targeted cache revalidation endpoint.
 * Called by the admin backend after destructive operations (e.g. data reset)
 * to purge stale Next.js Data Cache entries.
 *
 * Security: requires a shared bearer secret (REVALIDATE_SECRET).
 * In production, the endpoint fails closed if the secret is not configured.
 */

// Known safe path patterns (normalized — no trailing slash)
const ALLOWED_PATH_PATTERNS = ['/ar', '/en', '/ar/categories', '/en/categories'];

// Known safe cache tag prefixes
const ALLOWED_TAG_PREFIXES = ['products', 'content-pages'];

export async function POST(request: NextRequest) {
  // --- Shared-secret authentication ---
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    // Production: secret not configured — fail closed, never accept unauthenticated requests
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ message: 'Revalidation not configured' }, { status: 503 });
    }
    // Dev without secret: allow only localhost to avoid accidental exposure
    const host = request.headers.get('host') ?? '';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
    if (!isLocalhost) {
      return NextResponse.json({ message: 'Revalidation not configured' }, { status: 503 });
    }
    // Dev localhost without secret: permit but log a warning
    console.warn('[revalidate] WARNING: REVALIDATE_SECRET is not set — allowlisting localhost only');
  } else {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Missing authorization' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length);
    if (token !== secret) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const { paths, tags } = body as { paths?: string[]; tags?: string[] };

    if ((!paths || paths.length === 0) && (!tags || tags.length === 0)) {
      return NextResponse.json(
        { message: 'paths or tags array is required' },
        { status: 400 },
      );
    }

    const revalidated: string[] = [];
    const revalidatedTags: string[] = [];

    // --- Path-based revalidation ---
    if (paths && paths.length > 0) {
      for (const path of paths) {
        if (typeof path !== 'string') continue;
        const normalized = path.replace(/\/$/, ''); // strip trailing slash
        // Only allow known locale roots and category pages
        if (!ALLOWED_PATH_PATTERNS.includes(normalized)) continue;

        try {
          revalidatePath(normalized);
          revalidated.push(normalized);
        } catch {
          // log but don't fail the whole batch
        }
      }
    }

    // --- Tag-based revalidation (more reliable for data caches) ---
    if (tags && tags.length > 0) {
      for (const tag of tags) {
        if (typeof tag !== 'string') continue;
        // Only allow known safe tag prefixes to prevent abuse
        if (!ALLOWED_TAG_PREFIXES.some((p) => tag === p || tag.startsWith(p + ':'))) continue;

        try {
          // TypeScript requires a second arg in Next 16's types, but the runtime
          // accepts a single string. The type-safe cast silences the error.
          (revalidateTag as (tag: string, type?: 'page' | 'layout') => void)(tag);
          revalidatedTags.push(tag);
        } catch {
          // log but don't fail the whole batch
        }
      }
    }

    return NextResponse.json({
      success: true,
      revalidated,
      revalidatedTags,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ message: error }, { status: 500 });
  }
}