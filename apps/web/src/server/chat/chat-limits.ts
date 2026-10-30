const WINDOW_MS=60000;const REQUESTS_PER_WINDOW=10;const MAX_TRACKED=5000;
const INPUT_USD_PER_TOKEN=0.05/1e6;const OUTPUT_USD_PER_TOKEN=0.17/1e6;

/** Per-process limits for the single web replica; a restart clears them. */
export function createChatLimits(now=()=>Date.now()){
 const hits=new Map<string,number[]>();let day='';let spent=0;
 const today=()=>new Date(now()).toISOString().slice(0,10);
 const rollDay=()=>{if(day!==today()){day=today();spent=0;}};
 return {
  allowRequest(key:string):boolean{
   const cutoff=now()-WINDOW_MS;const recent=(hits.get(key)??[]).filter(time=>time>cutoff);
   if(recent.length>=REQUESTS_PER_WINDOW){hits.set(key,recent);return false;}
   if(!hits.has(key)&&hits.size>=MAX_TRACKED)hits.clear();
   hits.set(key,[...recent,now()]);return true;
  },
  withinBudget(limitUsd:number):boolean{rollDay();return spent<limitUsd;},
  recordUsage({promptTokens,completionTokens}:{promptTokens:number;completionTokens:number}){rollDay();spent+=promptTokens*INPUT_USD_PER_TOKEN+completionTokens*OUTPUT_USD_PER_TOKEN;},
 };
}
