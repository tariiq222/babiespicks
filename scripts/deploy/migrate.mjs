import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../../packages/db/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try { await db.$queryRawUnsafe('SELECT 1'); ready = true; break; }
  catch { await new Promise(resolve => setTimeout(resolve, 2000)); }
}
await db.$disconnect();
if (!ready) { console.error('Database readiness timed out'); process.exit(1); }
// Execute schema changes once. Never retry a failed migration blindly.
const result = spawnSync('pnpm', ['db:deploy'], { stdio: 'inherit', cwd: '/app' });
process.exit(result.status ?? 1);
