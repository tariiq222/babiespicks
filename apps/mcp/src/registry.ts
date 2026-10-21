import { fromJsonSchema, type CallToolResult, type JsonSchemaType, type McpServer } from '@modelcontextprotocol/server';
import type { Actor } from './auth.js';
export interface ToolDefinition { name: string; description: string; inputSchema: Record<string, unknown> }
export type RevalidationStatus = 'ok' | 'failed' | 'not_configured';
export interface ToolDependencies {
  toolDefinitions: readonly ToolDefinition[];
  executeTool:(name:string,args:unknown,actor:Actor)=>Promise<unknown>;
  isDomainError:(error:unknown)=>boolean;
  revalidate:()=>Promise<RevalidationStatus>;
}
const SAFE_CODES = new Set(['NOT_FOUND','INVALID_INPUT','VERSION_CONFLICT','PUBLISH_FORBIDDEN','CONFIRMATION_REQUIRED','IDEMPOTENCY_CONFLICT','NO_OFFER','MEDIA_INVALID','MEDIA_TOO_LARGE','CONFIGURATION_REQUIRED']);
function textResult(data:Record<string,unknown>):CallToolResult {
  return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
}
function toolDescription(def:ToolDefinition):string {
  const guidance=/^bp_(create|update)_(product|content)$/.test(def.name)?' Cite factual claims with sources and checkedAt; unknown facts remain unknown. Updating a published record is immediately public and requires owner publishing permission plus allowPublishedEdit:true. Updates require the latest expectedVersion; use a stable idempotencyKey.':'';
  return def.description+guidance;
}
export function isReadTool(name:string):boolean { return /^bp_(get|list|search)(_|$)/.test(name); }
/** Revalidation never turns an already saved write into an apparent write failure. */
async function invalidate(deps:ToolDependencies):Promise<RevalidationStatus> {
  try{return await deps.revalidate();}catch{return 'failed';}
}
export function registerTools(server:McpServer,deps:ToolDependencies,actor:Actor,operationRef:string):void {
  for(const def of deps.toolDefinitions){
    server.registerTool(def.name,{description:toolDescription(def),inputSchema:fromJsonSchema(def.inputSchema as JsonSchemaType),annotations:{readOnlyHint:isReadTool(def.name),destructiveHint:!isReadTool(def.name),openWorldHint:false}},async(args)=>{
      try {
        // Authenticated actor is a separate argument. Tool input can never replace it.
        const result=await deps.executeTool(def.name,args,actor);
        const data=result && typeof result==='object' && !Array.isArray(result) ? {...result} as Record<string,unknown> : {result};
        if(!isReadTool(def.name)){
          const status=await invalidate(deps);
          data.revalidation={status,retryTool:'bp_revalidate'};
          if(status!=='ok'){
            const existing=Array.isArray(data.warnings)?data.warnings:[];
            data.warnings=[...existing,{code:status==='failed'?'SAVED_REVALIDATION_FAILED':'SAVED_REVALIDATION_NOT_CONFIGURED',message:'Saved successfully. Public caches may be stale. Retry bp_revalidate without repeating this write.',operationRef}];
          }
        }
        return textResult(data);
      }catch(error){
        const known=deps.isDomainError(error) && error instanceof Error && typeof (error as {code?:unknown}).code==='string' && SAFE_CODES.has((error as Error & {code:string}).code);
        const safe=known?{code:(error as Error & {code:string}).code,message:(error as Error).message}:{code:'INTERNAL_ERROR',message:'Internal error'};
        return {...textResult({error:safe}),isError:true};
      }
    });
  }
  server.registerTool('bp_revalidate',{
    description:'Retry public web cache invalidation without repeating a saved content write.',
    inputSchema:fromJsonSchema({type:'object',properties:{},additionalProperties:false}),
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async()=>textResult({revalidation:{status:await invalidate(deps)}}));
}
