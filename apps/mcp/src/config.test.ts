import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
const base = { MCP_PUBLIC_URL: 'https://mcp.babiespicks.test', MCP_BEARER_TOKEN: 'x'.repeat(40) };
describe('configuration', () => {
  it('defaults publishing off and canonicalizes issuer with mcp resource', () => {
    expect(loadConfig({...base, MCP_PUBLIC_URL: `${base.MCP_PUBLIC_URL}/`})).toMatchObject({MCP_PUBLIC_URL:base.MCP_PUBLIC_URL, MCP_RESOURCE:`${base.MCP_PUBLIC_URL}/mcp`, ENABLE_MCP_PUBLISH:false});
  });
  it('prefers MCP_PORT, keeps PORT compatibility and defaults to 8765',()=>{
    expect(loadConfig(base).PORT).toBe(8765);
    expect(loadConfig({...base,PORT:'3002'}).PORT).toBe(3002);
    expect(loadConfig({...base,PORT:'3002',MCP_PORT:'8766'}).PORT).toBe(8766);
  });
  it('permits the explicit internal web revalidation endpoint without relaxing OAuth origins',()=>{
    const internal={...base,WEB_REVALIDATE_URL:'http://web:3000/api/revalidate',REVALIDATE_SECRET:'test-secret',WEB_REVALIDATE_ALLOW_INTERNAL_HTTP:'true'};
    expect(loadConfig(internal).WEB_REVALIDATE_URL).toBe(internal.WEB_REVALIDATE_URL);
    expect(()=>loadConfig({...internal,WEB_REVALIDATE_ALLOW_INTERNAL_HTTP:'false'})).toThrow();
    expect(()=>loadConfig({...internal,WEB_REVALIDATE_URL:'http://evil.test:3000/api/revalidate'})).toThrow();
    expect(()=>loadConfig({...internal,WEB_REVALIDATE_URL:'http://web:3000/other'})).toThrow();
    expect(()=>loadConfig({...internal,MCP_PUBLIC_URL:'http://web:3000'})).toThrow();
  });
  it.each([{}, {...base, MCP_BEARER_TOKEN:'short'}, {...base, MCP_OAUTH_SECRET:'s'.repeat(40)}, {...base,MCP_PUBLIC_URL:'http://localhost.evil.test'}, {...base,MCP_PUBLIC_URL:'https://test/path'}, {...base,ENABLE_MCP_PUBLISH:'yes'}, {...base,PORT:'NaN'}, {...base,WEB_REVALIDATE_URL:'https://web.test/revalidate'}])('rejects missing credentials or unsafe/ambiguous config %j', env => {
    expect(() => loadConfig(env)).toThrow();
  });
});
