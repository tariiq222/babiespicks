import { serve } from '@hono/node-server';
import { prisma } from '@babiespicks/db';
import { DomainError, executeTool, TOOL_DEFINITIONS } from '@babiespicks/domain';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

try {
  const config = loadConfig();
  const app = buildApp({
    config, toolDefinitions: TOOL_DEFINITIONS, executeTool,
    isDomainError: (error) => error instanceof DomainError,
    ready: async () => { await prisma.$queryRaw`SELECT 1`; },
  });
  const server = serve({fetch:app.fetch,port:config.PORT,hostname:'0.0.0.0'},()=>{
    console.info(JSON.stringify({event:'mcp_started',port:config.PORT,publishingEnabled:config.ENABLE_MCP_PUBLISH}));
  });
  let stopping = false;
  function shutdown() {
    if(stopping) return;
    stopping = true;
    const timeout = setTimeout(()=>{if ('closeAllConnections' in server) server.closeAllConnections();},10_000);
    timeout.unref();
    server.close(()=>{
      clearTimeout(timeout);
      prisma.$disconnect().then(()=>process.exit(0),()=>process.exit(1));
    });
  }
  process.on('SIGTERM',shutdown);
  process.on('SIGINT',shutdown);
} catch {
  // Never log config values, database URLs or passwords on startup failure.
  console.error(JSON.stringify({event:'mcp_startup_failed',message:'Check MCP configuration'}));
  process.exitCode=1;
}
