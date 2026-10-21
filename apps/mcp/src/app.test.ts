import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { signAccessToken } from './auth.js';
const config=loadConfig({MCP_PUBLIC_URL:'https://mcp.babiespicks.test',MCP_OAUTH_SECRET:'s'.repeat(48),MCP_ADMIN_PASSWORD:'owner-test-password',MCP_BEARER_TOKEN:'edit'.repeat(12),ENABLE_MCP_PUBLISH:'true'});
class TestDomainError extends Error {constructor(public code:string,message:string){super(message);}}
const defs=[
  {name:'bp_list_products',description:'List products',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'bp_update_product',description:'Update product',inputSchema:{type:'object',properties:{id:{type:'string'},expectedVersion:{type:'integer'},canPublish:{type:'boolean'},actor:{type:'object'}},required:['id','expectedVersion']}},
  {name:'bp_set_status',description:'Set status',inputSchema:{type:'object',properties:{id:{type:'string'},expectedVersion:{type:'integer'},confirm:{type:'boolean'},canPublish:{type:'boolean'}},required:['id','expectedVersion','confirm']}}
];
function setup(options:{revalidate?:()=>Promise<'ok'|'failed'|'not_configured'>, fail?:unknown, ready?:()=>Promise<void>}={}){
  const invocations:Array<{name:string,args:unknown,actor:{id:string,canPublish:boolean}}>=[];
  const app=buildApp({config,toolDefinitions:defs,ready:options.ready??(async()=>{}),isDomainError:(error)=>error instanceof TestDomainError,executeTool:async(name,args,actor)=>{
    invocations.push({name,args,actor});
    if(options.fail) throw options.fail;
    if(name==='bp_set_status' && !actor.canPublish) throw new TestDomainError('PUBLISH_FORBIDDEN','Publishing requires owner approval');
    return {id:'product-1',version:3};
  },revalidate:options.revalidate});
  return {app,invocations};
}
function rpc(app:ReturnType<typeof buildApp>,method:string,params?:unknown,token=config.MCP_BEARER_TOKEN!,extraHeaders:Record<string,string>={}){
  return app.request('/mcp',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream',...extraHeaders},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
}
async function message(response:Response):Promise<any>{
  const text=await response.text();
  if(response.headers.get('content-type')?.includes('text/event-stream')) return JSON.parse(text.split('\n').find(line=>line.startsWith('data:'))!.slice(5));
  return JSON.parse(text);
}
function publisher(){const now=Math.floor(Date.now()/1000);return signAccessToken({iss:config.MCP_PUBLIC_URL,aud:config.MCP_RESOURCE,sub:'approved',scope:'mcp',iat:now,exp:now+3600,canPublish:true},config.MCP_OAUTH_SECRET!);}
describe('real MCP HTTP contract',()=>{
  it('rejects unauthenticated and forged bearer requests with discovery',async()=>{
    const {app,invocations}=setup();
    const response=await app.request('/mcp',{method:'POST'});
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(`${config.MCP_PUBLIC_URL}/.well-known/oauth-protected-resource/mcp`);
    expect((await rpc(app,'tools/list',undefined,'forged')).status).toBe(401);
    expect(invocations).toEqual([]);
  });
  it('supports actual initialize and tools/list schemas',async()=>{
    const {app}=setup();
    const initialized=await message(await rpc(app,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test-client',version:'1'}}));
    expect(initialized.result.serverInfo.name).toBe('babiespicks-mcp');
    const list=await message(await rpc(app,'tools/list'));
    expect(list.result.tools.map((tool:any)=>tool.name)).toContain('bp_set_status');
    expect(list.result.tools.find((tool:any)=>tool.name==='bp_update_product').inputSchema.required).toContain('expectedVersion');
    expect(list.result.tools.map((tool:any)=>tool.name)).toContain('bp_revalidate');
  });
  it('passes only server-authenticated actor despite client-supplied claims',async()=>{
    const {app,invocations}=setup();
    const response=await message(await rpc(app,'tools/call',{name:'bp_update_product',arguments:{id:'product-1',expectedVersion:2,canPublish:true,actor:{id:'owner',canPublish:true}}}));
    expect(response.result.isError).not.toBe(true);
    expect(invocations[0].actor).toEqual({id:'static:editor',canPublish:false});
  });
  it('keeps static editor publication blocked while approved OAuth can publish',async()=>{
    const {app}=setup();
    const params={name:'bp_set_status',arguments:{id:'product-1',expectedVersion:2,confirm:true,canPublish:true}};
    const denied=await message(await rpc(app,'tools/call',params));
    expect(denied.result.isError).toBe(true);
    expect(denied.result.structuredContent.error.code).toBe('PUBLISH_FORBIDDEN');
    expect((await message(await rpc(app,'tools/call',params,publisher()))).result.isError).not.toBe(true);
  });
  it('enforces advertised expectedVersion and unknown tools do not dispatch',async()=>{
    const {app,invocations}=setup();
    const invalid=await message(await rpc(app,'tools/call',{name:'bp_update_product',arguments:{id:'product-1'}}));
    expect(invalid.result?.isError || invalid.error).toBeTruthy();
    const unknown=await message(await rpc(app,'tools/call',{name:'invented',arguments:{}}));
    expect(unknown.result?.isError || unknown.error).toBeTruthy();
    expect(invocations).toEqual([]);
  });
  it('returns successful saved result with cache warning and supports invalidation without repeating write',async()=>{
    let invalidations=0;
    const {app,invocations}=setup({revalidate:async()=>{invalidations++;return invalidations===1?'failed':'ok';}});
    const response=await message(await rpc(app,'tools/call',{name:'bp_update_product',arguments:{id:'product-1',expectedVersion:2}}));
    expect(response.result.isError).not.toBe(true);
    expect(response.result.structuredContent).toMatchObject({id:'product-1',version:3,revalidation:{status:'failed',retryTool:'bp_revalidate'}});
    expect(response.result.structuredContent.warnings[0].code).toBe('SAVED_REVALIDATION_FAILED');
    expect((await message(await rpc(app,'tools/call',{name:'bp_revalidate',arguments:{}}))).result.structuredContent.revalidation.status).toBe('ok');
    expect(invocations).toHaveLength(1);
  });
  it('does not invalidate reads or failed writes, preserves domain errors, and hides unknown errors',async()=>{
    let invalidations=0;
    const revalidate=async()=>{invalidations++;return 'ok' as const;};
    await rpc(setup({revalidate}).app,'tools/call',{name:'bp_list_products',arguments:{}});
    const conflict=await message(await rpc(setup({revalidate,fail:new TestDomainError('VERSION_CONFLICT','Read latest version')}).app,'tools/call',{name:'bp_update_product',arguments:{id:'a',expectedVersion:1}}));
    expect(conflict.result.structuredContent.error).toEqual({code:'VERSION_CONFLICT',message:'Read latest version'});
    const internal=await message(await rpc(setup({revalidate,fail:new Error('database_password=secret')}).app,'tools/call',{name:'bp_update_product',arguments:{id:'a',expectedVersion:1}}));
    expect(JSON.stringify(internal)).not.toContain('database_password');
    expect(internal.result.structuredContent.error.code).toBe('INTERNAL_ERROR');
    expect(invalidations).toBe(0);
  });
  it('limits actual body bytes and rejects unsupported content type and foreign browser origins',async()=>{
    const {app}=setup();
    expect((await app.request('/mcp',{method:'POST',headers:{authorization:`Bearer ${config.MCP_BEARER_TOKEN}`,'content-type':'application/json'},body:'x'.repeat(2*1024*1024+1)})).status).toBe(413);
    expect((await app.request('/mcp',{method:'POST',headers:{authorization:`Bearer ${config.MCP_BEARER_TOKEN}`,'content-type':'application/json','content-length':'1'},body:'x'.repeat(2*1024*1024+1)})).status).toBe(413);
    expect((await rpc(app,'tools/list',undefined,config.MCP_BEARER_TOKEN,{'content-type':'text/plain'})).status).toBe(415);
    expect((await rpc(app,'tools/list',undefined,config.MCP_BEARER_TOKEN,{origin:'https://evil.test'})).status).toBe(403);
  });
  it('allows authenticated JSON above the OAuth form limit and below the MCP image limit',async()=>{
    const {app,invocations}=setup();
    const response=await rpc(app,'tools/call',{name:'bp_update_product',arguments:{id:'x'.repeat(32*1024),expectedVersion:1}});
    expect(response.status).toBe(200);
    expect(invocations).toHaveLength(1);
  });
  it('serves liveness and readiness without disclosing connection errors',async()=>{
    const {app}=setup({ready:async()=>{throw new Error('sensitive-db-url');}});
    expect((await app.request('/health')).status).toBe(200);
    const response=await app.request('/ready');
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sensitive');
  });
});
