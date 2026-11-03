import {getActiveCoupons,getAllProducts,getOfferSelection,legacyPriceFor,resolveOfferTarget} from '@/server/queries';
import {createChatLimits} from '@/server/chat/chat-limits';
import {CHAT_LIMITS,chatRequestSchema,fixedCopy,requestContext} from '@/server/chat/chat-policy';
import {runChat} from '@/server/chat/chat-service';
export const dynamic='force-dynamic';

const limits=createChatLimits();
const noStore={'Cache-Control':'no-store'};
const budget=()=>{const value=Number(process.env.CHAT_DAILY_BUDGET_USD??2);return Number.isFinite(value)&&value>=0?value:2;};

export async function POST(request:Request){
 const apiKey=process.env.DEPLOY_API_KEY;
 if(!apiKey)return Response.json({message:'Chat is not configured'},{status:503,headers:noStore});
 if(Number(request.headers.get('content-length')??0)>CHAT_LIMITS.bodyBytes)return Response.json({message:'Request too large'},{status:413,headers:noStore});
 const raw=await request.text();
 if(raw.length>CHAT_LIMITS.bodyBytes)return Response.json({message:'Request too large'},{status:413,headers:noStore});
 let body:unknown;try{body=JSON.parse(raw);}catch{return Response.json({message:'Invalid request'},{status:400,headers:noStore});}
 const parsed=chatRequestSchema.safeParse(body);
 if(!parsed.success)return Response.json({message:'Invalid request'},{status:400,headers:noStore});
 const client=request.headers.get('x-real-ip')??request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??'unknown';
 if(!limits.allowRequest(client))return Response.json({message:'Too many requests'},{status:429,headers:{...noStore,'Retry-After':'60'}});
 // Task 10: the chat reads the same Task 6 selection and coupon policy as the pages, in
 // the shopping context the visitor chose on this site (explicit request choices only;
 // the server re-parses them and never derives a context from an address).
 const context=requestContext(parsed.data);
 const catalog={
  products:(locale:string)=>getAllProducts(locale),
  coupons:()=>getActiveCoupons(5,{audience:'PUBLIC',eligibleCountries:context.shipTo?[context.shipTo]:[],now:new Date()}),
  offers:(productId:string,selectionContext:typeof context)=>getOfferSelection(productId,selectionContext),
  legacyPrice:(productId:string)=>legacyPriceFor(productId),
  // Task 7 purchase target for the exact quote and destination (null = expired or another
  // marketplace: the chat card falls back to the product page instead of guessing).
  offerTarget:(input:{offerId:string;observationId:string;shipTo:'SA'|'US'|null})=>resolveOfferTarget(input),
 };
 if(!limits.withinBudget(budget())){
  const copy=fixedCopy(parsed.data.locale);
  return Response.json({kind:'unavailable',text:copy.unavailable,products:[],coupons:[],suggestions:[],contextKey:null,needsCurrency:false},{headers:noStore});
 }
 const reply=await runChat(parsed.data,{catalog,config:{apiKey,apiUrl:process.env.DEPLOY_API_URL??'https://api-cdn.deploy.com/api/v1',model:process.env.CHAT_MODEL??'zai-org/glm-5.3-flash'},onUsage:limits.recordUsage});
 return Response.json(reply,{headers:noStore});
}
