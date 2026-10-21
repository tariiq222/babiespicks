import { build } from 'esbuild';
await build({
  entryPoints: ['src/index.ts'], outdir: 'dist', bundle: true,
  platform: 'node', target: 'node22', format: 'esm', sourcemap: true,
  // Workspace packages are bundled so Node never executes TypeScript sources.
  // Prisma retains its generated native engine in the runtime image.
  external: ['@prisma/client', '@prisma/client/*', '@hono/node-server', '@modelcontextprotocol/server', 'hono', 'hono/*', 'zod'],
});
