import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS, DomainError, executeTool, OFFER_MUTATION_NAMES } from '@babiespicks/domain';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { isReadTool } from './registry.js';
const config=loadConfig({MCP_PUBLIC_URL:'https://mcp.babiespicks.test',MCP_BEARER_TOKEN:'test'.repeat(12)});
async function rpc(method:string,params?:unknown,database?:Parameters<typeof executeTool>[3]){
  const app=buildApp({config,toolDefinitions:TOOL_DEFINITIONS,executeTool:(name,args,actor)=>executeTool(name,args,actor,database),isDomainError:e=>e instanceof DomainError,ready:async()=>{}});
  const res=await app.request('/mcp',{method:'POST',headers:{authorization:`Bearer ${config.MCP_BEARER_TOKEN}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  const text=await res.text();
  return {status:res.status,body:res.headers.get('content-type')?.includes('text/event-stream')?JSON.parse(text.split('\n').find(l=>l.startsWith('data:'))!.slice(5)):JSON.parse(text)};
}
const INTERNATIONAL_TOOLS=['bp_upsert_listing','bp_upsert_offer','bp_get_offer','bp_record_offer_price','bp_record_delivery_evidence','bp_record_fx_snapshot'];
describe('real domain schemas through SDK without database writes',()=>{
  it('accepts marketplace store metadata through MCP without granting an editor publishing rights',async()=>{
    const database={operationReceipt:{findUnique:async()=>null},$transaction:async(work:(tx:unknown)=>Promise<unknown>)=>work({})};
    const response=await rpc('tools/call',{name:'bp_upsert_store',arguments:{name:'Amazon US',nameAr:'أمازون أمريكا',nameEn:'Amazon US',slug:'amazon-us-review',url:'https://www.amazon.com',marketplaceCode:'US',trackingId:'test-us-20',idempotencyKey:'market-store-schema-only'}},database as never);
    expect(response.body.result?.isError).toBe(true);
    expect(response.body.result?.structuredContent?.error?.code).toBe('PUBLISH_FORBIDDEN');
  });
  it('advertises every real domain schema and passes trusted editing capability',async()=>{
    const list=await rpc('tools/list');
    expect(list.status).toBe(200);
    expect(list.body.result.tools).toHaveLength(TOOL_DEFINITIONS.length+1);
    const capability=await rpc('tools/call',{name:'bp_get_capabilities',arguments:{}});
    expect(capability.body.result.structuredContent.publishing.allowed).toBe(false);
  });
  it('publishes the six international tools with their strict input schemas',async()=>{
    const list=await rpc('tools/list');
    const tools:Array<{name:string;description:string;inputSchema:Record<string,any>;annotations?:Record<string,unknown>}>=list.body.result.tools;
    const names=tools.map(tool=>tool.name);
    for(const name of INTERNATIONAL_TOOLS) expect(names).toContain(name);
    expect([...OFFER_MUTATION_NAMES].every(name=>names.includes(name))).toBe(true);
    const price=tools.find(tool=>tool.name==='bp_record_offer_price')!;
    expect(price.inputSchema.properties).toHaveProperty('marketplaceCode');
    expect(price.inputSchema.properties).toHaveProperty('sourceId');
    expect(price.inputSchema.properties).toHaveProperty('taxBasis');
    // No caller-supplied actor, verification claim or expiry is part of any input contract.
    for(const tool of tools.filter(tool=>INTERNATIONAL_TOOLS.includes(tool.name))){
      for(const forbidden of ['actor','canPublish','verified','expiresAt','scopeKey']){
        expect(Object.keys(tool.inputSchema.properties ?? {}),`${tool.name}.${forbidden}`).not.toContain(forbidden);
      }
    }
    expect(price.description).toMatch(/currency|marketplace/i);
    expect(isReadTool('bp_get_offer')).toBe(true);
    expect(INTERNATIONAL_TOOLS.filter(isReadTool)).toEqual(['bp_get_offer']);
  });
  it('reports the registered international tools while the capability stays disabled',async()=>{
    const capability=await rpc('tools/call',{name:'bp_get_capabilities',arguments:{}});
    const international=capability.body.result.structuredContent.internationalOffers;
    expect(international.enabled).toBe(false);
    expect(international.tools).toEqual([...INTERNATIONAL_TOOLS.filter(name=>name!=='bp_get_offer'),'bp_get_offer']);
    expect(capability.body.result.structuredContent.publishing.allowed).toBe(false);
  });
  it('rejects a client-supplied actor through the real strict schema',async()=>{
    const response=await rpc('tools/call',{name:'bp_get_capabilities',arguments:{actor:{canPublish:true}}});
    expect(response.body.result?.isError || response.body.error).toBeTruthy();
  });
  it('rejects a verification claim or a caller-chosen scope before any write',async()=>{
    for(const extra of [{verified:true},{scopeKey:'price:SA:in-marketplace'},{actor:{canPublish:true}}]){
      const response=await rpc('tools/call',{name:'bp_record_delivery_evidence',arguments:{idempotencyKey:'k',marketplaceCode:'SA',sourceId:'amazon-creators-api-sa',sourceUrl:'https://www.amazon.sa/dp/B000000001',checkedAt:new Date().toISOString(),offerId:'o',sellerKey:'s',fulfillerKey:'f',country:'SA',precision:'COUNTRY',state:'OBSERVED_AVAILABLE',...extra}});
      expect(response.body.result?.isError,JSON.stringify(extra)).toBe(true);
      // The SDK validates against the advertised JSON schema before the domain is reached.
      expect(response.body.result.content[0].text).toMatch(/validation error/i);
    }
  });
});
