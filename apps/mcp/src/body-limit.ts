import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';

/** Hono normally trusts Content-Length. Always count the actual stream as well. */
export function boundedBody(maxSize:number,onError:(c:Context)=>Response):MiddlewareHandler {
  const limit=bodyLimit({maxSize,onError});
  return async(c,next)=>{
    const declared=c.req.header('content-length');
    if(declared!==undefined){
      if(!/^\d+$/.test(declared))return c.json({error:'invalid_request'},400);
      if(Number(declared)>maxSize)return onError(c);
      const headers=new Headers(c.req.raw.headers);
      headers.delete('content-length');
      c.req.raw=new Request(c.req.raw,{headers});
    }
    return limit(c,next);
  };
}
