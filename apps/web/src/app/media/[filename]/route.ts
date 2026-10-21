import { open, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { constants } from 'node:fs';
import { publicMediaType } from '@/server/public-media';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  const type = publicMediaType(filename);
  if (!type || !process.env.MEDIA_ROOT) return new Response('Not found', { status: 404 });
  try {
    const root = await realpath(process.env.MEDIA_ROOT);
    const path = resolve(root, filename);
    if (!path.startsWith(`${root}${sep}`)) return new Response('Not found', { status: 404 });
    // Never follow a symlink even when an operator accidentally places one in the volume.
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 10 * 1024 * 1024) return new Response('Not found', { status: 404 });
      return new Response(new Uint8Array(await file.readFile()), { headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'public, max-age=31536000, immutable' } });
    } finally { await file.close(); }
  } catch { return new Response('Not found', { status: 404 }); }
}
