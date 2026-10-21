import { describe,expect,it } from 'vitest';
import { TOOL_DEFINITIONS, DomainError, executeTool } from '@babiespicks/domain';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
const config=loadConfig({MCP_PUBLIC_URL:'https://mcp.babiespicks.test',MCP_BEARER_TOKEN:'test'.repeat(12)});
async function rpc(method:string,params?:unknown){
  const app=buildApp({config,toolDefinitions:TOOL_DEFINITIONS,executeTool,isDomainError:e=>e instanceof DomainError,ready:async()=>{}});
  const res=await app.request('/mcp',{method:'POST',headers:{authorization:`Bearer ${config.MCP_BEARER_TOKEN}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  const text=await res.text();
  return {status:res.status,body:res.headers.get('content-type')?.includes('text/event-stream')?JSON.parse(text.split('\n').find(l=>l.startsWith('data:'))!.slice(5)):JSON.parse(text)};
}
describe('real domain schemas through SDK without database writes',()=>{
  it('advertises every real domain schema and passes trusted editing capability',async()=>{
    const list=await rpc('tools/list');
    expect(list.status).toBe(200);
    expect(list.body.result.tools).toHaveLength(TOOL_DEFINITIONS.length+1);
    const capability=await rpc('tools/call',{name:'bp_get_capabilities',arguments:{}});
    expect(capability.body.result.structuredContent.publishing.allowed).toBe(false);
  });
  it('rejects a client-supplied actor through the real strict schema',async()=>{
    const response=await rpc('tools/call',{name:'bp_get_capabilities',arguments:{actor:{canPublish:true}}});
    expect(response.body.result?.isError || response.body.error).toBeTruthy();
  });
});
