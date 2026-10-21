import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { boundedBody } from './body-limit.js';
import { authenticate, type Actor } from './auth.js';
import type { AppConfig } from './config.js';
import { createOAuthRoutes } from './oauth.js';
import { createMcpHttpHandler } from './server.js';
import { triggerRevalidation } from './revalidate.js';
import type { ToolDependencies } from './registry.js';
export interface AppDependencies extends Omit<ToolDependencies,'revalidate'> {
  config:AppConfig;
  ready:()=>Promise<void>;
  revalidate?:ToolDependencies['revalidate'];
}
export function buildApp(deps:AppDependencies){
  const {config}=deps;
  const app=new Hono<{Variables:{actor:Actor;requestId:string}}>();
  app.use('*',async(c,next)=>{
    c.set('requestId',randomUUID());
    c.header('X-Content-Type-Options','nosniff');
    await next();
  });
  app.route('/',createOAuthRoutes(config));
  app.get('/health',c=>c.json({status:'ok',name:'babiespicks-mcp'}));
  app.get('/ready',async c=>{
    try{await deps.ready();return c.json({status:'ready'});}catch{return c.json({status:'not-ready',code:'DB_UNAVAILABLE'},503);}
  });
  app.use('/mcp',async(c,next)=>{
    c.header('Cache-Control','no-store');
    const actor=authenticate(c.req.header('authorization')??'',config);
    if(!actor){
      c.header('WWW-Authenticate',`Bearer realm="babiespicks-mcp", resource_metadata="${config.MCP_PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`);
      return c.json({code:'MCP_UNAUTHORIZED',message:'Unauthorized'},401);
    }
    const origin=c.req.header('origin');
    if(origin && ![config.MCP_PUBLIC_URL,'https://chatgpt.com','https://chat.openai.com'].includes(origin)) return c.json({code:'INVALID_ORIGIN',message:'Forbidden'},403);
    if(c.req.method==='POST' && c.req.header('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json') return c.json({code:'INVALID_INPUT',message:'Content-Type must be application/json'},415);
    c.set('actor',actor);
    await next();
  });
  app.use('/mcp',boundedBody(2*1024*1024,c=>c.json({code:'INVALID_INPUT',message:'Request body too large'},413)));
  app.all('/mcp',async c=>{
    const actor=c.get('actor');
    const handler=createMcpHttpHandler({...deps,revalidate:deps.revalidate??(()=>triggerRevalidation(config))},actor,c.get('requestId'));
    return handler.fetch(c.req.raw,{authInfo:{token:c.req.header('authorization')!.slice(7),clientId:actor.id,scopes:['mcp']}});
  });
  app.notFound(c=>c.json({code:'NOT_FOUND',message:'Not found'},404));
  app.onError((_error,c)=>c.json({code:'INTERNAL_ERROR',message:'Internal error'},500));
  return app;
}
