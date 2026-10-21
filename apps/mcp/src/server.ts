import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import type { Actor } from './auth.js';
import { registerTools, type ToolDependencies } from './registry.js';
/** A new server per request keeps trusted OAuth grants isolated across clients. */
export function createMcpHttpHandler(deps:ToolDependencies,actor:Actor,operationRef:string){
  return createMcpHandler(()=>{
    const server=new McpServer({name:'babiespicks-mcp',version:'0.1.0'},{capabilities:{tools:{}}});
    registerTools(server,deps,actor,operationRef);
    return server;
  },{legacy:'stateless'});
}
