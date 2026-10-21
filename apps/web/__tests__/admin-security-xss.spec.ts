import { describe,it,expect,vi } from 'vitest';
import * as proxy from '../src/app/api/admin-proxy/[...path]/route';
import * as login from '../src/app/api/admin-auth/login/route';
import * as oldLogin from '../src/app/api/admin-login/route';

describe('retired admin endpoints',()=>{
 it('rejects old mutation and login entry points without forwarding any request',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch');
  try{
   for(const handler of [proxy.GET,proxy.POST,proxy.PATCH,proxy.DELETE,login.POST,oldLogin.POST]){
    const response=handler();
    expect(response.status).toBe(410);
    expect((await response.json()).message).toContain('MCP');
   }
   expect(fetch).not.toHaveBeenCalled();
  }finally{fetch.mockRestore()}
 });
});
