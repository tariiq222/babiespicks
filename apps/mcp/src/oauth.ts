/**
 * Single-owner OAuth authorization-code + PKCE flow, adapted from Tariq's MCP.
 * Access tokens are HMAC-signed; short-lived codes, registrations and browser
 * transactions are in memory. Run one replica. Never import another site's secrets.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { boundedBody } from './body-limit.js';
import type { AppConfig } from './config.js';
import { isSecureUrl } from './config.js';
import { ACCESS_TOKEN_TTL_SECONDS, constantTimeEqual, signAccessToken } from './auth.js';
const FLOW_TTL = 10 * 60 * 1000;
const CLIENT_TTL = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 2048;
const nonce = () => randomBytes(32).toString('base64url');
const pkce = (value: string) => createHash('sha256').update(value, 'ascii').digest('base64url');
interface Client { redirects: string[]; expiresAt: number }
interface Grant { clientId: string; redirect: string; challenge: string; canPublish: boolean; expiresAt: number }
interface Login extends Omit<Grant, 'canPublish'> { state: string; csrf: string }
function prune<T extends {expiresAt:number}>(map:Map<string,T>) {
  const now = Date.now();
  for(const [key,value] of map) if(value.expiresAt <= now) map.delete(key);
}
function escape(value: string): string { return value.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function validRedirect(value: unknown): value is string {
  if(typeof value !== 'string' || value.length > 2048) return false;
  try { const url = new URL(value); return isSecureUrl(url) && !url.hash; } catch { return false; }
}
async function params(request: Request): Promise<Record<string,string> | null> {
  try {
    let value: unknown;
    if(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json') value = await request.json();
    else if(request.headers.get('content-type')?.split(';')[0].trim() === 'application/x-www-form-urlencoded') {
      const form = new URLSearchParams(await request.text());
      // Ambiguous repeated parameters must not overwrite an approved value.
      if(new Set(form.keys()).size !== Array.from(form.keys()).length) return null;
      value = Object.fromEntries(form);
    } else return null;
    if(!value || typeof value !== 'object' || Array.isArray(value) || !Object.values(value).every(v=>typeof v === 'string')) return null;
    return value as Record<string,string>;
  } catch { return null; }
}

export function createOAuthRoutes(config: AppConfig): Hono {
  const oauth = new Hono();
  const clients = new Map<string,Client>();
  const logins = new Map<string,Login>();
  const codes = new Map<string,Grant>();
  let failures = 0;
  let failureWindow = Date.now();
  let registrations = 0;
  let registrationWindow = Date.now();
  oauth.use('/oauth/*', boundedBody(16*1024,c=>c.json({error:'invalid_request'},413)));
  oauth.use('*', async(c,next)=>{
    c.header('Cache-Control','no-store');
    c.header('Pragma','no-cache');
    c.header('Referrer-Policy','no-referrer');
    c.header('X-Content-Type-Options','nosniff');
    c.header('Content-Security-Policy',"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    await next();
  });
  const protectedResource = {resource:config.MCP_RESOURCE,...(config.MCP_OAUTH_SECRET && config.MCP_ADMIN_PASSWORD ? {authorization_servers:[config.MCP_PUBLIC_URL]} : {}),scopes_supported:['mcp'],bearer_methods_supported:['header']};
  oauth.get('/.well-known/oauth-protected-resource',c=>c.json(protectedResource));
  oauth.get('/.well-known/oauth-protected-resource/mcp',c=>c.json(protectedResource));
  if(!config.MCP_OAUTH_SECRET || !config.MCP_ADMIN_PASSWORD) return oauth;
  const secret = config.MCP_OAUTH_SECRET;
  oauth.get('/.well-known/oauth-authorization-server',c=>c.json({
    issuer:config.MCP_PUBLIC_URL,
    authorization_endpoint:`${config.MCP_PUBLIC_URL}/oauth/authorize`,
    token_endpoint:`${config.MCP_PUBLIC_URL}/oauth/token`,
    registration_endpoint:`${config.MCP_PUBLIC_URL}/oauth/register`,
    response_types_supported:['code'],grant_types_supported:['authorization_code'],
    code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:['mcp'],
  }));
  oauth.post('/oauth/register', async c=>{
    if(Date.now()-registrationWindow>60_000){ registrations=0; registrationWindow=Date.now(); }
    if(++registrations>100) return c.json({error:'temporarily_unavailable'},429);
    prune(clients);
    if(clients.size>=MAX_ENTRIES) return c.json({error:'temporarily_unavailable'},503);
    const body: unknown = await c.req.json().catch(()=>null);
    if(!body || typeof body !== 'object' || Array.isArray(body)) return c.json({error:'invalid_client_metadata'},400);
    const metadata = body as Record<string,unknown>;
    const redirects = metadata.redirect_uris;
    if(!Array.isArray(redirects) || !redirects.length || redirects.length>10 || !redirects.every(validRedirect)
      || (metadata.token_endpoint_auth_method !== undefined && metadata.token_endpoint_auth_method !== 'none')
      // RFC 7591 allows registration to return a supported subset of requested
      // metadata. Grok Bot also requests refresh_token; register code-only and
      // keep refresh grants unavailable at the token endpoint.
      || (metadata.grant_types !== undefined && (!Array.isArray(metadata.grant_types) || !metadata.grant_types.includes('authorization_code') || metadata.grant_types.some(grant=>grant !== 'authorization_code' && grant !== 'refresh_token')))
      || (metadata.response_types !== undefined && (!Array.isArray(metadata.response_types) || metadata.response_types.length !== 1 || metadata.response_types[0] !== 'code')))
      return c.json({error:'invalid_client_metadata'},400);
    const clientId = `bp-${nonce()}`;
    clients.set(clientId,{redirects:[...new Set(redirects)],expiresAt:Date.now()+CLIENT_TTL});
    return c.json({client_id:clientId,client_id_issued_at:Math.floor(Date.now()/1000),redirect_uris:redirects,token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']},201);
  });
  oauth.get('/oauth/authorize',c=>{
    prune(clients); prune(logins);
    const query = new URL(c.req.url).searchParams;
    if(new Set(query.keys()).size !== Array.from(query.keys()).length) return c.json({error:'invalid_request'},400);
    const q = Object.fromEntries(query);
    const client = clients.get(q.client_id);
    if(q.response_type !== 'code' || !client || !client.redirects.includes(q.redirect_uri) || q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge ?? '') || q.resource !== config.MCP_RESOURCE || (q.scope && q.scope !== 'mcp') || (q.state?.length ?? 0)>2048) return c.json({error:'invalid_request'},400);
    if(logins.size>=MAX_ENTRIES) return c.json({error:'temporarily_unavailable'},503);
    const transaction=nonce();
    const csrf=nonce();
    logins.set(transaction,{clientId:q.client_id,redirect:q.redirect_uri,challenge:q.code_challenge,state:q.state??'',csrf,expiresAt:Date.now()+FLOW_TTL});
    setCookie(c,'bp_oauth',csrf,{httpOnly:true,secure:config.MCP_PUBLIC_URL.startsWith('https:'),sameSite:'Lax',path:'/oauth',maxAge:FLOW_TTL/1000});
    // Keep Origin on the same-origin browser form POST. no-referrer makes
    // Chrome send Origin:null, which correctly fails our strict CSRF check.
    c.header('Referrer-Policy','same-origin');
    // Chromium applies form-action to the redirect after form submission too.
    // Permit the client's validated callback origins, including its registered
    // loopback handoff to the desktop app. Grok's exact registered callback
    // currently returns HTTP 308 from www.cursor.com to cursor.com; Chromium
    // also checks that canonical hop. Other clients gain no extra origins.
    const callbackOrigins = [...new Set(client.redirects.map(uri=>new URL(uri).origin))];
    if(q.redirect_uri === 'https://www.cursor.com/agents/mcp/oauth/callback') callbackOrigins.push('https://cursor.com');
    c.header('Content-Security-Policy',`default-src 'none'; form-action 'self' ${callbackOrigins.join(' ')}; base-uri 'none'; frame-ancestors 'none'`);
    return c.html(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BabiesPicks MCP</title></head><body><main><h1>تفويض إدارة BabiesPicks</h1><p>العميل: ${escape(q.client_id)}</p><p>العودة إلى: ${escape(q.redirect_uri)}</p><p>أدخل كلمة مرور المالك للسماح بإدارة المحتوى. صلاحية النشر مستقلة ومدتها 30 يومًا.</p><form method="post" action="/oauth/authorize"><input type="hidden" name="transaction" value="${transaction}"><label>كلمة مرور المالك <input type="password" name="password" required autocomplete="current-password"></label>${config.ENABLE_MCP_PUBLISH?'<p><label><input type="checkbox" name="allow_publish" value="yes"> أسمح لهذا الاتصال بنشر المحتوى وتحرير المنشور وأرشفته وإلغاء نشره.</label></p>':''}<button type="submit">السماح بالاتصال</button></form></main></body></html>`);
  });
  oauth.post('/oauth/authorize',async c=>{
    prune(logins); prune(codes);
    if(Date.now()-failureWindow>15*60_000){failures=0;failureWindow=Date.now();}
    if(failures>=30) return c.json({error:'temporarily_unavailable'},429);
    const body = await params(c.req.raw);
    const login = body ? logins.get(body.transaction) : undefined;
    const cookie = getCookie(c,'bp_oauth');
    if(!body || !login || !cookie || !constantTimeEqual(cookie,login.csrf) || c.req.header('origin') !== config.MCP_PUBLIC_URL) return c.json({error:'invalid_request'},400);
    // One submitted form produces at most one grant, including password failure.
    logins.delete(body.transaction);
    if(!body.password || !constantTimeEqual(body.password,config.MCP_ADMIN_PASSWORD!)){++failures;return c.json({error:'access_denied'},401);}
    if(codes.size>=MAX_ENTRIES) return c.json({error:'temporarily_unavailable'},503);
    const code=nonce();
    codes.set(code,{clientId:login.clientId,redirect:login.redirect,challenge:login.challenge,canPublish:config.ENABLE_MCP_PUBLISH && body.allow_publish==='yes',expiresAt:Date.now()+FLOW_TTL});
    const redirect = new URL(login.redirect);
    redirect.searchParams.set('code',code);
    if(login.state) redirect.searchParams.set('state',login.state);
    return c.redirect(redirect.toString(),302);
  });
  oauth.post('/oauth/token',async c=>{
    prune(codes);
    const body = await params(c.req.raw);
    if(!body) return c.json({error:'invalid_request'},400);
    if(body.grant_type!=='authorization_code') return c.json({error:'unsupported_grant_type'},400);
    const grant = codes.get(body.code);
    codes.delete(body.code);
    if(!grant || body.client_id!==grant.clientId || body.redirect_uri!==grant.redirect || body.resource!==config.MCP_RESOURCE || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier??'') || !constantTimeEqual(pkce(body.code_verifier),grant.challenge)) return c.json({error:'invalid_grant'},400);
    const now=Math.floor(Date.now()/1000);
    return c.json({access_token:signAccessToken({iss:config.MCP_PUBLIC_URL,aud:config.MCP_RESOURCE,sub:grant.clientId,iat:now,exp:now+ACCESS_TOKEN_TTL_SECONDS,scope:'mcp',canPublish:grant.canPublish},secret),token_type:'Bearer',expires_in:ACCESS_TOKEN_TTL_SECONDS,scope:'mcp'});
  });
  return oauth;
}
