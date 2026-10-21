import { createServer } from 'node:http';
import { describe,expect,it } from 'vitest';
import { triggerRevalidation } from './revalidate.js';
import { loadConfig } from './config.js';
const base=loadConfig({MCP_PUBLIC_URL:'https://mcp.babiespicks.test',MCP_BEARER_TOKEN:'t'.repeat(40)});
describe('public cache invalidation',()=>{
  it('makes no request when optional configuration is absent',async()=>{expect(await triggerRevalidation(base)).toBe('not_configured');});
  it('posts broad cache tag with secret and reports failure without a second HTTP write',async()=>{
    const requests:Array<{secret:string|undefined,body:string}>=[];
    let status=200;
    const server=createServer(async(req,res)=>{
      let body='';for await(const chunk of req)body+=chunk.toString();
      requests.push({secret:req.headers['authorization'] as string|undefined,body});
      res.writeHead(status,{...(status===302?{location:'http://127.0.0.1:1/exfiltrate'}:{})});res.end();
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();if(!address||typeof address==='string')throw new Error('No test address');
    const config={...base,WEB_REVALIDATE_URL:`http://127.0.0.1:${address.port}/api/revalidate`,REVALIDATE_SECRET:'test-only-secret'};
    try{
      expect(await triggerRevalidation(config)).toBe('ok');
      expect(requests[0]).toEqual({secret:'Bearer test-only-secret',body:JSON.stringify({tags:['products','content-pages','offers','coupons','stores']})});
      status=500;expect(await triggerRevalidation(config)).toBe('failed');
      status=302;expect(await triggerRevalidation(config)).toBe('failed');
      expect(requests).toHaveLength(3);
    }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  });
});
