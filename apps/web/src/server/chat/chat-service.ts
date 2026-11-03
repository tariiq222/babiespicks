import type {ShoppingContext} from '@babiespicks/domain/international';
import {CHAT_LIMITS,SYSTEM_PROMPT,findTextViolation,fixedCopy,isMedicalMessage,modelReplySchema,replyKind,requestContext,type ChatRequest,type ModelReply} from './chat-policy';
import {CHAT_TOOLS,contextLine,createToolSession,searchCatalog,toCouponCard,type ChatCatalog,type ChatCouponCard,type ChatProductCard,type ToolSession} from './chat-tools';

export interface ChatResponse {
 kind:'answer'|'out_of_scope'|'medical'|'unavailable';
 text:string;
 products:ChatProductCard[];
 coupons:ChatCouponCard[];
 suggestions:string[];
 /** The engine contextKey these cards belong to; the widget drops cards on a change. */
 contextKey:string;
 /** True when the reply asked the visitor for a currency instead of guessing one. */
 needsCurrency:boolean;
}
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

/**
 * Cards come only from this turn's tool results; a quote that vanished becomes an honest
 * card. A card whose offer link points at an expired/mismatched observation is rebuilt
 * on the product page in the same contextKey instead of carrying a dead purchase target.
 */
async function cardsFor(ids:string[],session:ToolSession):Promise<ChatProductCard[]>{
 const cards:ChatProductCard[]=[];
 for(const id of ids){
  const card=await session.existingCard(id);
  const product=session.seenProducts.get(id);
  if(card)cards.push(card.link==='OFFER'?await session.withoutOfferLink(card):card);else if(product)cards.push(session.goneCard(product));
 }
 return cards;
}
const couponCards=(ids:string[],session:ToolSession)=>ids.flatMap(id=>{const coupon=session.seenCoupons.get(id);return coupon?[toCouponCard(coupon)]:[];});

/**
 * The contextKey the Task 6 engine stamps on a selection for this turn's context
 * (offer-selection.ts). Cards and the reply are only current under this exact key.
 */
export function engineContextKey(context: ShoppingContext): string {
 return JSON.stringify([context.locale, context.shipTo, context.displayCurrency, context.audience, context.budget]);
}
/** Every exit carries the same contextKey and currency state as the turn it belongs to. */
function respond(kind:ChatResponse['kind'],text:string,session:ToolSession,extra:Partial<Pick<ChatResponse,'products'|'coupons'|'suggestions'>>={}):ChatResponse{
 return {kind,text,products:extra.products??[],coupons:extra.coupons??[],suggestions:extra.suggestions??[],contextKey:session.contextKey(),needsCurrency:session.budgetAsked()};
}

async function buildReply(reply:ModelReply,session:ToolSession,locale:'ar'|'en'):Promise<ChatResponse>{
 const copy=fixedCopy(locale);
 const kind=replyKind(reply);
 if(kind==='medical')return respond('medical',copy.medical,session,{suggestions:[...copy.suggestions]});
 if(kind==='out_of_scope')return respond('out_of_scope',copy.outOfScope,session,{suggestions:[...copy.suggestions]});
 const products=await cardsFor(reply.productIds,session);
 return respond('answer',reply.text||copy.cards,session,{products,coupons:couponCards(reply.couponIds,session),suggestions:reply.suggestions.filter(item=>!findTextViolation(item))});
}

/**
 * The provider failed: fall back to the catalog in the same context. A budget never
 * becomes a number without its currency, so the free-text request cannot filter price.
 */
async function fallback(request:ChatRequest,session:ToolSession):Promise<ChatResponse>{
 const copy=fixedCopy(request.locale);
 const query=request.messages.at(-1)?.content??'';
 let products:ChatProductCard[]=[];
 try{
  // The same engine path as the search tool: results are only cards after their
  // selection resolves in this context, so a summary never shows an unverified price.
  // A fallback card always carries an offer from this context; the legacy SAR view
  // stays out of it so no figure appears without the engine's selection behind it.
  const result=await session.run('search_products',{query}) as {products?:Array<{id:string}>};
  const cards=(await cardsFor((result.products??[]).map(item=>item.id),session)).filter(card=>card.offerId);
  products=cards.slice(0,3);
 }catch{products=[];}
 return respond('unavailable',copy.unavailable,session,{products,suggestions:[...copy.suggestions]});
}

/** Tool loop whose final reply is validated in code; any provider failure degrades to catalog search. */
export async function runChat(request:ChatRequest,deps:ChatDeps):Promise<ChatResponse>{
 // The request's explicit choices only; parseShoppingContext keeps them neutral when absent.
 const context=requestContext(request);
 const session=createToolSession({catalog:deps.catalog,locale:request.locale,context,contextKey:engineContextKey(context)});
 const copy=fixedCopy(request.locale);
 const last=request.messages.at(-1)?.content??'';
 if(isMedicalMessage(last))return respond('medical',copy.medical,session,{suggestions:[...copy.suggestions]});
 const lines=[`Site language: ${request.locale}.`,contextLine(context)];
 try{
  if(request.productSlug){
   const current=(await session.load()).find(product=>product.slug===request.productSlug);
   if(current)lines.push(`The user is viewing product id ${current.id}.`);
  }
  if(request.shownProductIds.length)lines.push(`Products already shown to the user: ${request.shownProductIds.join(', ')}.`);
  const messages:WireMessage[]=[{role:'system',content:`${SYSTEM_PROMPT}\n${lines.join(' ')}`},...request.messages.slice(-CHAT_LIMITS.historyMessages)];
  let textRetries=1;let budgetRetries=1;const deadline=Date.now()+TURN_DEADLINE_MS;
  for(let round=0;round<MAX_ROUNDS;round++){
   const message=await complete(messages,deps,round>=MAX_ROUNDS-2,deadline);
   const calls=message.tool_calls??[];
   if(!calls.length){console.warn('Chat degraded: reply had no tool call');break;}
   messages.push({role:'assistant',content:message.content??null,tool_calls:calls});
   const final=calls.find(call=>call.function.name==='submit_reply');
   if(final){
    const parsed=modelReplySchema.safeParse(parseArguments(final.function.arguments));
    if(!parsed.success){console.warn('Chat degraded: invalid submit_reply',parsed.error.issues.map(issue=>issue.path.join('.')).join(','),final.function.arguments.length);break;}
    // A budget without a chosen currency is a question to the visitor, never an assumption:
    // the model's priced answer is replaced by the fixed currency prompt.
    if(session.budgetAsked())return respond('answer',copy.pickCurrency,session);
    const violation=replyKind(parsed.data)==='answer'?findTextViolation(parsed.data.text):null;
    if(!violation)return buildReply(parsed.data,session,request.locale);
    if(!textRetries--){
     const products=await cardsFor(parsed.data.productIds,session);
     return products.length?respond('answer',copy.cards,session,{products,suggestions:[...copy.suggestions]}):fallback(request,session);
    }
    for(const call of calls)messages.push({role:'tool',tool_call_id:call.id,content:call===final?`Rejected: ${violation} Call submit_reply again.`:'Skipped.'});
    continue;
   }
   for(const call of calls){
    const result=await session.run(call.function.name,parseArguments(call.function.arguments)) as {budgetAsked?:boolean}|null;
    // The model tried to price a budget without a currency: it is told to ask, once.
    if(result&&result.budgetAsked&&session.budgetAsked()&&budgetRetries-->0){
     messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify({...result,instruction:'Ask the visitor to choose SAR or USD first; do not filter by price.'})});
     continue;
    }
    messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
   }
  }
 }catch(error){
  console.warn('Chat degraded to catalog search',error instanceof Error?error.message:'unknown');
 }
 return fallback(request,session);
}
