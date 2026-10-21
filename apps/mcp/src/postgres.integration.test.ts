import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe,expect,it } from 'vitest';
import { PrismaClient } from '@babiespicks/db';
import { DomainError,executeTool,TOOL_DEFINITIONS } from '@babiespicks/domain';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
const testUrl=process.env.TEST_DATABASE_URL;
const testWeb=process.env.TEST_WEB_URL;
if(testWeb && !['127.0.0.1','localhost','[::1]'].includes(new URL(testWeb).hostname)) throw new Error('Refusing non-local test website');
// No fallback to DATABASE_URL. These tests only write to an explicitly named local test DB.
function testDatabase():PrismaClient {
  if(!testUrl)throw new Error('TEST_DATABASE_URL required');
  const url=new URL(testUrl);
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!url.pathname.includes('simplification_test'))throw new Error('Refusing non-local/non-test database');
  return new PrismaClient({datasources:{db:{url:testUrl}},log:[]});
}
describe.skipIf(!testUrl)('real OAuth → MCP → PostgreSQL content lifecycle',()=>{
  it('creates media/product/price/content, edits/reviews/publishes/unpublishes/archives with trusted grants and versions',async()=>{
    const db=testDatabase();
    const config=loadConfig({MCP_PUBLIC_URL:'https://mcp.babiespicks.test',MCP_OAUTH_SECRET:randomBytes(48).toString('base64url'),MCP_ADMIN_PASSWORD:randomBytes(24).toString('base64url'),MCP_BEARER_TOKEN:randomBytes(32).toString('base64url'),ENABLE_MCP_PUBLISH:'true'});
    const run=`mcp-${randomUUID()}`;
    const mediaRoot=resolve('.test-artifacts',run);
    const originalMedia=process.env.MEDIA_ROOT;
    process.env.MEDIA_ROOT=mediaRoot;
    await mkdir(mediaRoot,{recursive:true});
    let invalidations=0;
    const app=buildApp({config,toolDefinitions:TOOL_DEFINITIONS,executeTool:(name,args,actor)=>executeTool(name,args,actor,db),isDomainError:e=>e instanceof DomainError,ready:async()=>{await db.$queryRaw`SELECT 1`;},revalidate:async()=>{invalidations++;return 'ok';}});
    let requestId=0;
    async function call(name:string,args:Record<string,unknown>,token=config.MCP_BEARER_TOKEN!){
      const response=await app.request('/mcp',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method:'tools/call',params:{name,arguments:args}})});
      expect(response.status).toBe(200);
      const text=await response.text();
      const message=response.headers.get('content-type')?.includes('text/event-stream')?JSON.parse(text.split('\n').find(line=>line.startsWith('data:'))!.slice(5)):JSON.parse(text);
      if(message.error)throw new Error(JSON.stringify(message.error));
      return message.result;
    }
    async function success(name:string,args:Record<string,unknown>,token=config.MCP_BEARER_TOKEN!){
      const result=await call(name,args,token);
      expect(result.isError,JSON.stringify(result)).not.toBe(true);
      return result.structuredContent as Record<string,any>;
    }
    try{
      const verifier=randomBytes(48).toString('base64url');
      const registration=await app.request('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:['https://chatgpt.com/connector/oauth/callback']})});
      const {client_id}=await registration.json();
      const authParams={response_type:'code',client_id,redirect_uri:'https://chatgpt.com/connector/oauth/callback',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',resource:config.MCP_RESOURCE,state:run};
      const page=await app.request(`/oauth/authorize?${new URLSearchParams(authParams)}`);
      const transaction=/name="transaction" value="([^"]+)"/.exec(await page.text())![1];
      const approval=await app.request('/oauth/authorize',{method:'POST',headers:{origin:config.MCP_PUBLIC_URL,'content-type':'application/x-www-form-urlencoded',cookie:page.headers.get('set-cookie')!.split(';')[0]},body:new URLSearchParams({transaction,password:config.MCP_ADMIN_PASSWORD!,allow_publish:'yes'})});
      expect(approval.status).toBe(302);
      const tokenResponse=await app.request('/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id,redirect_uri:authParams.redirect_uri,code:new URL(approval.headers.get('location')!).searchParams.get('code')!,code_verifier:verifier,resource:config.MCP_RESOURCE})});
      expect(tokenResponse.status).toBe(200);
      const publisher=(await tokenResponse.json()).access_token;
      expect((await success('bp_get_capabilities',{},publisher)).publishing.allowed).toBe(true);
      const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/avcAAAAASUVORK5CYII=';
      const image=await success('bp_upload_image',{base64:png,mimeType:'image/png',idempotencyKey:`${run}-image`});
      expect(image.path).toMatch(/^\/media\/[a-f0-9]{64}\.png$/);
      expect(await readFile(resolve(mediaRoot,image.path.split('/').at(-1)))).toEqual(Buffer.from(png,'base64'));
      const source={url:'https://example.test/source',checkedAt:new Date().toISOString(),field:'name',note:'Isolated test fixture'};
      const input={name:'منتج تجريبي معزول',slug:run,imageUrl:image.path,sources:[source],idempotencyKey:`${run}-product`};
      let product=await success('bp_create_product',input);
      expect(product.publishStatus).toBe('DRAFT');
      if(testWeb) expect((await fetch(`${testWeb}/ar/products/${product.slug}`,{redirect:'manual'})).status).toBe(404);
      expect((await success('bp_create_product',input)).id).toBe(product.id);
      expect((await call('bp_create_product',{...input,name:'Different input'})).structuredContent.error.code).toBe('IDEMPOTENCY_CONFLICT');
      const store=await success('bp_upsert_store',{name:'Isolated MCP test store',slug:`${run}-store`,url:'https://www.amazon.sa',idempotencyKey:`${run}-store`},publisher);
      await success('bp_record_price',{productId:product.id,storeId:store.id,amount:123,currency:'SAR',sourceUrl:'https://www.amazon.sa/dp/TESTMCP',checkedAt:new Date().toISOString(),idempotencyKey:`${run}-price`});
      const initialVersion=product.version;
      product=await success('bp_update_product',{id:product.id,name:'منتج تجريبي مُراجع',expectedVersion:initialVersion,idempotencyKey:`${run}-edit`});
      expect((await call('bp_update_product',{id:product.id,name:'stale',expectedVersion:initialVersion,idempotencyKey:`${run}-stale`})).structuredContent.error.code).toBe('VERSION_CONFLICT');
      expect((await call('bp_set_status',{entityType:'product',id:product.id,status:'PUBLISHED',expectedVersion:product.version,confirm:true,idempotencyKey:`${run}-denied`})).structuredContent.error.code).toBe('PUBLISH_FORBIDDEN');
      product=await success('bp_set_status',{entityType:'product',id:product.id,status:'REVIEW',expectedVersion:product.version,confirm:true,idempotencyKey:`${run}-review`},publisher);
      product=await success('bp_set_status',{entityType:'product',id:product.id,status:'PUBLISHED',expectedVersion:product.version,confirm:true,idempotencyKey:`${run}-publish`},publisher);
      expect(product.publishStatus).toBe('PUBLISHED');
      if(testWeb){
        const page=await fetch(`${testWeb}/ar/products/${product.slug}`);
        expect(page.status).toBe(200);
        expect(await page.text()).toContain('منتج');
        const purchase=await fetch(`${testWeb}/go/best/${product.id}`,{redirect:'manual'});
        expect([302,307]).toContain(purchase.status);
        expect(new URL(purchase.headers.get('location')!).hostname).toBe('www.amazon.sa');
      }
      expect((await call('bp_update_product',{id:product.id,name:'unauthorized',expectedVersion:product.version,allowPublishedEdit:true,idempotencyKey:`${run}-deny-edit`})).structuredContent.error.code).toBe('PUBLISH_FORBIDDEN');
      expect((await call('bp_update_product',{id:product.id,name:'missing confirmation',expectedVersion:product.version,idempotencyKey:`${run}-deny-confirm`},publisher)).structuredContent.error.code).toBe('CONFIRMATION_REQUIRED');
      product=await success('bp_update_product',{id:product.id,name:'منتج منشور ومحدث',expectedVersion:product.version,allowPublishedEdit:true,idempotencyKey:`${run}-public-edit`},publisher);
      let content=await success('bp_create_content',{type:'BUYING_GUIDE',slug:`${run}-guide`,translations:[{locale:'ar',title:'دليل اختبار معزول',content:'محتوى اختبار موثق وغير إنتاجي'}],productIds:[product.id],imageUrl:image.path,sources:[source],idempotencyKey:`${run}-content`});
      for(const status of ['REVIEW','PUBLISHED','DRAFT','ARCHIVED']){
        content=await success('bp_set_status',{entityType:'content',id:content.id,status,expectedVersion:content.version,confirm:true,idempotencyKey:`${run}-content-${status}`},publisher);
        expect(content.publishStatus).toBe(status);
      }
      product=await success('bp_set_status',{entityType:'product',id:product.id,status:'ARCHIVED',expectedVersion:product.version,confirm:true,idempotencyKey:`${run}-archive`},publisher);
      const persisted=await db.product.findUniqueOrThrow({where:{id:product.id}});
      expect(persisted.publishStatus).toBe('ARCHIVED');
      if(testWeb) expect((await fetch(`${testWeb}/ar/products/${product.slug}`,{redirect:'manual'})).status).toBe(404);
      expect(await db.contentRevision.count({where:{entityId:product.id}})).toBeGreaterThanOrEqual(6);
      expect(await db.productPrice.count({where:{productId:product.id}})).toBe(1);
      expect(invalidations).toBeGreaterThan(10);
    }finally{
      await db.$disconnect();
      if(originalMedia===undefined)delete process.env.MEDIA_ROOT;else process.env.MEDIA_ROOT=originalMedia;
      await rm(mediaRoot,{recursive:true,force:true});
    }
  },30_000);
});
