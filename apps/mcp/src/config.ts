export interface AppConfig {
  MCP_PUBLIC_URL: string;
  MCP_RESOURCE: string;
  MCP_OAUTH_SECRET?: string;
  MCP_ADMIN_PASSWORD?: string;
  MCP_BEARER_TOKEN?: string;
  ENABLE_MCP_PUBLISH: boolean;
  WEB_REVALIDATE_URL?: string;
  REVALIDATE_SECRET?: string;
  WEB_REVALIDATE_ALLOW_INTERNAL_HTTP: boolean;
  PORT: number;
}

/** Never infer OAuth issuer from Host or forwarded headers. */
export function isSecureUrl(url: URL): boolean {
  return !url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  if (!env.MCP_PUBLIC_URL) throw new Error('MCP_PUBLIC_URL is required');
  const url = new URL(env.MCP_PUBLIC_URL);
  if (!isSecureUrl(url) || url.pathname !== '/' || url.search || url.hash) throw new Error('MCP_PUBLIC_URL must be a secure origin');
  const origin = url.origin;
  const secret = env.MCP_OAUTH_SECRET || undefined;
  const password = env.MCP_ADMIN_PASSWORD || undefined;
  const bearer = env.MCP_BEARER_TOKEN || undefined;
  if (Boolean(secret) !== Boolean(password)) throw new Error('OAuth requires both secret and owner password');
  if (secret && (secret.length < 32 || password!.length < 12)) throw new Error('OAuth secret/password too short');
  if (bearer && bearer.length < 32) throw new Error('Static token must have at least 32 characters');
  if (!secret && !bearer) throw new Error('At least one authentication mechanism must be configured');
  if (env.ENABLE_MCP_PUBLISH && !['true', 'false'].includes(env.ENABLE_MCP_PUBLISH)) throw new Error('ENABLE_MCP_PUBLISH must be true or false');
  const publish = env.ENABLE_MCP_PUBLISH === 'true';
  if (publish && !secret) throw new Error('Publishing requires OAuth');
  const revalidateUrl = env.WEB_REVALIDATE_URL || undefined;
  const revalidateSecret = env.REVALIDATE_SECRET || undefined;
  if (Boolean(revalidateUrl) !== Boolean(revalidateSecret)) throw new Error('Revalidation URL and secret must be configured together');
  if (env.WEB_REVALIDATE_ALLOW_INTERNAL_HTTP && !['true','false'].includes(env.WEB_REVALIDATE_ALLOW_INTERNAL_HTTP)) throw new Error('WEB_REVALIDATE_ALLOW_INTERNAL_HTTP must be true or false');
  const internalHttp = env.WEB_REVALIDATE_ALLOW_INTERNAL_HTTP === 'true';
  if (revalidateUrl) {
    const target = new URL(revalidateUrl);
    const internalTarget = internalHttp && target.protocol === 'http:' && target.hostname === 'web' && target.port === '3000' && target.pathname === '/api/revalidate' && !target.username && !target.password && !target.search;
    if ((!isSecureUrl(target) && !internalTarget) || target.hash) throw new Error('Invalid revalidation URL');
  }
  const port = Number(env.MCP_PORT ?? env.PORT ?? '8765');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return {MCP_PUBLIC_URL:origin, MCP_RESOURCE:`${origin}/mcp`, MCP_OAUTH_SECRET:secret, MCP_ADMIN_PASSWORD:password, MCP_BEARER_TOKEN:bearer, ENABLE_MCP_PUBLISH:publish, WEB_REVALIDATE_URL:revalidateUrl, REVALIDATE_SECRET:revalidateSecret, WEB_REVALIDATE_ALLOW_INTERNAL_HTTP:internalHttp, PORT:port};
}
