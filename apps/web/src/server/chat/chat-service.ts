import {CHAT_LIMITS,SYSTEM_PROMPT,findTextViolation,fixedCopy,isMedicalMessage,modelReplySchema,replyKind,type ChatRequest,type ModelReply} from './chat-policy';
import {CHAT_TOOLS,createToolSession,searchCatalog,toCouponCard,toProductCard,type ChatCatalog,type ChatCouponCard,type ChatProductCard} from './chat-tools';

export interface ChatResponse {kind:'answer'|'out_of_scope'|'medical'|'unavailable';text:string;products:ChatProductCard[];coupons:ChatCouponCard[];suggestions:string[]}
export interface ChatConfig {apiKey:string;apiUrl:string;model:string}
export interface ChatDeps {catalog:ChatCatalog;config:ChatConfig;fetch?:typeof fetch;onUsage?:(usage:{promptTokens:number;completionTokens:number})=>void}
interface ToolCall {id:string;type:'function';function:{name:string;arguments:string}}
interface AssistantMessage {role:'assistant';content:string|null;tool_calls?:ToolCall[]}
type WireMessage={role:'system'|'user'|'assistant';content:string|null;tool_calls?:ToolCall[]}|{role:'tool';tool_call_id:string;content:string};

// Most calls take about two seconds, but a few hang: retrying beats waiting them out.
const MAX_ROUNDS=5;const ATTEMPT_TIMEOUT_MS=6000;const MAX_ATTEMPTS=2;const TURN_DEADLINE_MS=18000;

async function complete(messages:WireMessage[],{config,fetch:send=fetch,onUsage}:ChatDeps,mustReply:boolean,deadline:number):Promise<AssistantMessage>{
 const payload=JSON.stringify({model:config.model,messages,tools:CHAT_TOOLS,tool_choice:mustReply?{type:'function',function:{name:'submit_reply'}}:'required',reasoning_effort:'low',temperature:0.3,max_completion_tokens:800});
 for(let attempt=1;;attempt++){
  const remaining=deadline-Date.now();
  if(remaining<=0)throw new Error('Chat deadline reached');
  try{
   const response=await send(`${config.apiUrl.replace(/\/$/,'')}/chat/completions`,{method:'POST',signal:AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS,remaining)),headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:payload});
   if(!response.ok)throw new Error(`Chat provider returned ${response.status}`);
   const body=await response.json() as {choices?:{message?:AssistantMessage}[];usage?:{prompt_tokens?:number;completion_tokens?:number}};
   onUsage?.({promptTokens:body.usage?.prompt_tokens??0,completionTokens:body.usage?.completion_tokens??0});
   const message=body.choices?.[0]?.message;if(!message)throw new Error('Chat provider returned no message');
   return message;
  }catch(error){
   const retryable=error instanceof Error&&(error.name==='TimeoutError'||/returned (?:429|5\d\d)$/.test(error.message));
   if(attempt>=MAX_ATTEMPTS||!retryable)throw error;
  }
 }
}

function parseArguments(raw:string):Record<string,unknown>{
 try{const value=JSON.parse(raw);return value&&typeof value==='object'?value as Record<string,unknown>:{};}catch{return {};}
}

function buildReply(reply:ModelReply,session:ReturnType<typeof createToolSession>,locale:'ar'|'en'):ChatResponse{
 const copy=fixedCopy(locale);
 const kind=replyKind(reply);
 if(kind==='medical')return {kind:'medical',text:copy.medical,products:[],coupons:[],suggestions:[...copy.suggestions]};
 if(kind==='out_of_scope')return {kind:'out_of_scope',text:copy.outOfScope,products:[],coupons:[],suggestions:[...copy.suggestions]};
 const products=reply.productIds.flatMap(id=>{const product=session.seenProducts.get(id);const card=product&&toProductCard(product,locale);return card?[card]:[];});
 const coupons=reply.couponIds.flatMap(id=>{const coupon=session.seenCoupons.get(id);return coupon?[toCouponCard(coupon)]:[];});
 return {kind:'answer',text:reply.text||copy.cards,products,coupons,suggestions:reply.suggestions.filter(item=>!findTextViolation(item))};
}

async function fallback(request:ChatRequest,catalog:ChatCatalog):Promise<ChatResponse>{
 const copy=fixedCopy(request.locale);
 const query=request.messages.at(-1)?.content??'';
 const products=await catalog.products(request.locale).catch(()=>[]);
 const matches=searchCatalog(products,request.locale,{query},3);
 const cards=(matches.length?matches:searchCatalog(products,request.locale,{},3)).flatMap(product=>{const card=toProductCard(product,request.locale);return card?[card]:[];});
 return {kind:'unavailable',text:copy.unavailable,products:cards,coupons:[],suggestions:[...copy.suggestions]};
}

/** Tool loop whose final reply is validated in code; any provider failure degrades to catalog search. */
export async function runChat(request:ChatRequest,deps:ChatDeps):Promise<ChatResponse>{
 const copy=fixedCopy(request.locale);
 const last=request.messages.at(-1)?.content??'';
 if(isMedicalMessage(last))return {kind:'medical',text:copy.medical,products:[],coupons:[],suggestions:[...copy.suggestions]};
 const session=createToolSession(deps.catalog,request.locale);
 const context=[`Site language: ${request.locale}.`];
 try{
  if(request.productSlug){
   const current=(await session.load()).find(product=>product.slug===request.productSlug);
   if(current)context.push(`The user is viewing product id ${current.id}.`);
  }
  if(request.shownProductIds.length)context.push(`Products already shown to the user: ${request.shownProductIds.join(', ')}.`);
  const messages:WireMessage[]=[{role:'system',content:`${SYSTEM_PROMPT}\n${context.join(' ')}`},...request.messages.slice(-CHAT_LIMITS.historyMessages)];
  let textRetries=1;const deadline=Date.now()+TURN_DEADLINE_MS;
  for(let round=0;round<MAX_ROUNDS;round++){
   const message=await complete(messages,deps,round>=MAX_ROUNDS-2,deadline);
   const calls=message.tool_calls??[];
   if(!calls.length){console.warn('Chat degraded: reply had no tool call');break;}
   messages.push({role:'assistant',content:message.content??null,tool_calls:calls});
   const final=calls.find(call=>call.function.name==='submit_reply');
   if(final){
    const parsed=modelReplySchema.safeParse(parseArguments(final.function.arguments));
    if(!parsed.success){console.warn('Chat degraded: invalid submit_reply',parsed.error.issues.map(issue=>issue.path.join('.')).join(','),final.function.arguments.length);break;}
    const violation=replyKind(parsed.data)==='answer'?findTextViolation(parsed.data.text):null;
    if(!violation)return buildReply(parsed.data,session,request.locale);
    if(!textRetries--){
     const products=parsed.data.productIds.flatMap(id=>{const product=session.seenProducts.get(id);const card=product&&toProductCard(product,request.locale);return card?[card]:[];});
     return products.length?{kind:'answer',text:copy.cards,products,coupons:[],suggestions:[...copy.suggestions]}:fallback(request,deps.catalog);
    }
    for(const call of calls)messages.push({role:'tool',tool_call_id:call.id,content:call===final?`Rejected: ${violation} Call submit_reply again.`:'Skipped.'});
    continue;
   }
   for(const call of calls)messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(await session.run(call.function.name,parseArguments(call.function.arguments)))});
  }
 }catch(error){
  console.warn('Chat degraded to catalog search',error instanceof Error?error.message:'unknown');
 }
 return fallback(request,deps.catalog);
}
