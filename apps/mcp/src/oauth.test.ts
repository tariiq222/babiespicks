import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createOAuthRoutes } from './oauth.js';
import { authenticate } from './auth.js';
import { loadConfig } from './config.js';
const config = loadConfig({MCP_PUBLIC_URL:'https://mcp.babiespicks.test', MCP_OAUTH_SECRET:'s'.repeat(48), MCP_ADMIN_PASSWORD:'owner-test-password', ENABLE_MCP_PUBLISH:'true'});
const verifier = 'v'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const callback = 'https://chatgpt.com/connector/oauth/callback';
function form(body: Record<string, string>, cookie?: string) { return {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded', origin:config.MCP_PUBLIC_URL, ...(cookie ? {cookie} : {})}, body:new URLSearchParams(body)}; }
async function registration(app: ReturnType<typeof createOAuthRoutes>, redirect = callback) {
  const res = await app.request('/oauth/register', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({redirect_uris:[redirect], token_endpoint_auth_method:'none'})});
  return {res, client:await res.json() as {client_id:string}};
}
async function login(app: ReturnType<typeof createOAuthRoutes>, publish = false) {
  const {client} = await registration(app);
  const params = {response_type:'code',client_id:client.client_id,redirect_uri:callback,code_challenge:challenge,code_challenge_method:'S256',resource:config.MCP_RESOURCE,state:'state-value'};
  const page = await app.request(`/oauth/authorize?${new URLSearchParams(params)}`);
  const html = await page.text();
  const transaction = /name="transaction" value="([^"]+)"/.exec(html)?.[1] ?? '';
  const cookie = page.headers.get('set-cookie')?.split(';')[0] ?? '';
  const approved = await app.request('/oauth/authorize', form({transaction,password:config.MCP_ADMIN_PASSWORD!,...(publish?{allow_publish:'yes'}:{})}, cookie));
  return {client,approved,transaction,cookie,code: approved.headers.get('location') ? new URL(approved.headers.get('location')!).searchParams.get('code')! : ''};
}
async function exchange(app: ReturnType<typeof createOAuthRoutes>, grant: Awaited<ReturnType<typeof login>>, extra:Record<string,string>={}) {
  return app.request('/oauth/token', form({grant_type:'authorization_code',code:grant.code,client_id:grant.client.client_id,redirect_uri:callback,code_verifier:verifier,resource:config.MCP_RESOURCE,...extra}));
}
describe('single owner OAuth authorization code flow', () => {
  it('advertises the canonical issuer and exact MCP resource independent of Host', async () => {
    const app = createOAuthRoutes(config);
    const metadata = await (await app.request('https://evil.test/.well-known/oauth-protected-resource/mcp')).json();
    expect(metadata).toMatchObject({resource:config.MCP_RESOURCE,authorization_servers:[config.MCP_PUBLIC_URL]});
    expect(await (await app.request('/.well-known/oauth-authorization-server')).json()).toMatchObject({issuer:config.MCP_PUBLIC_URL,code_challenge_methods_supported:['S256']});
  });
  it('completes PKCE and grants editing unless the owner checked publication', async () => {
    const app = createOAuthRoutes(config);
    for (const publish of [false,true]) {
      const grant = await login(app,publish);
      expect(grant.approved.status).toBe(302);
      expect(new URL(grant.approved.headers.get('location')!).searchParams.get('state')).toBe('state-value');
      const exchanged = await exchange(app,grant,{canPublish:'true',allow_publish:'yes'});
      expect(exchanged.status).toBe(200);
      const token = (await exchanged.json()).access_token;
      expect(authenticate(`Bearer ${token}`,config)).toEqual({id:`oauth:${grant.client.client_id}`,canPublish:publish});
      expect((await exchange(app,grant)).status).toBe(400);
    }
  });
  it('rejects invalid PKCE, wrong client, wrong redirect and wrong resource at exchange', async () => {
    const app = createOAuthRoutes(config);
    for (const extra of [{code_verifier:'wrong'}, {client_id:'other'}, {redirect_uri:'https://evil.test/callback'}, {resource:'https://other.test/mcp'}]) {
      expect((await exchange(app,await login(app),extra)).status).toBe(400);
    }
  });
  it('does not let the request body invent an owner-approved grant', async () => {
    const app = createOAuthRoutes({...config,ENABLE_MCP_PUBLISH:false});
    const grant = await login(app,true);
    const response = await exchange(app,grant,{canPublish:'true'});
    expect(authenticate(`Bearer ${(await response.json()).access_token}`,config)?.canPublish).toBe(false);
  });
  it('requires registered exact redirect, PKCE S256 and local resource on both paths', async () => {
    const app = createOAuthRoutes(config);
    const {client} = await registration(app);
    const params={response_type:'code',client_id:client.client_id,redirect_uri:callback,code_challenge:challenge,code_challenge_method:'S256',resource:config.MCP_RESOURCE};
    for(const patch of [{client_id:'invented'}, {redirect_uri:'https://evil.test/callback'}, {code_challenge_method:'plain'}, {resource:'https://other.test'}, {code_challenge:'short'}]) {
      expect((await app.request(`/oauth/authorize?${new URLSearchParams({...params,...patch})}`)).status).toBe(400);
    }
    expect((await app.request('/oauth/authorize',form({...params,password:config.MCP_ADMIN_PASSWORD!,allow_publish:'yes'}))).status).toBe(400);
  });
  it('rejects misleading loopback domains, fragments and userinfo at registration', async () => {
    for(const uri of ['http://localhost.evil.test/callback','https://test/callback#fragment','https://user:pass@test/callback','javascript:alert(1)']) {
      expect((await registration(createOAuthRoutes(config),uri)).res.status).toBe(400);
    }
  });
  it('requires the browser transaction cookie and same-origin submission', async () => {
    const app = createOAuthRoutes(config);
    const grant = await login(app);
    expect((await app.request('/oauth/authorize',form({transaction:grant.transaction,password:config.MCP_ADMIN_PASSWORD!}))).status).toBe(400);
    const {client}=await registration(app);
    const page=await app.request(`/oauth/authorize?${new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:callback,code_challenge:challenge,code_challenge_method:'S256',resource:config.MCP_RESOURCE})}`);
    const transaction=/name="transaction" value="([^"]+)"/.exec(await page.text())![1];
    const request=form({transaction,password:config.MCP_ADMIN_PASSWORD!},page.headers.get('set-cookie')!.split(';')[0]);
    request.headers.origin='https://evil.test';
    expect((await app.request('/oauth/authorize',request)).status).toBe(400);
  });
});

describe('OAuth expiry and browser form integrity',()=>{
  it('limits actual OAuth body bytes even with an understated Content-Length',async()=>{
    const response=await createOAuthRoutes(config).request('/oauth/register',{method:'POST',headers:{'content-type':'application/json','content-length':'1'},body:JSON.stringify({redirect_uris:[callback],extra:'x'.repeat(20*1024)})});
    expect(response.status).toBe(413);
  });
  it('expires authorization codes before exchange',async()=>{
    const {vi}=await import('vitest');
    const app=createOAuthRoutes(config);
    const grant=await login(app,true);
    const now=Date.now();
    const clock=vi.spyOn(Date,'now').mockReturnValue(now+11*60*1000);
    try{expect((await exchange(app,grant)).status).toBe(400);}finally{clock.mockRestore();}
  });
  it('requires a current transaction cookie before accepting the owner password',async()=>{
    const app=createOAuthRoutes(config);
    const {client}=await registration(app);
    const page=await app.request(`/oauth/authorize?${new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:callback,code_challenge:challenge,code_challenge_method:'S256',resource:config.MCP_RESOURCE})}`);
    const transaction=/name="transaction" value="([^"]+)"/.exec(await page.text())![1];
    const body={transaction,password:config.MCP_ADMIN_PASSWORD!,allow_publish:'yes',redirect_uri:'https://evil.test/callback',client_id:'forged'};
    expect((await app.request('/oauth/authorize',form(body))).status).toBe(400);
    const response=await app.request('/oauth/authorize',form(body,page.headers.get('set-cookie')!.split(';')[0]));
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location')!).origin).toBe(new URL(callback).origin);
    expect((await app.request('/oauth/authorize',form(body,page.headers.get('set-cookie')!.split(';')[0]))).status).toBe(400);
  });
});
