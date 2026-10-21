import type { AppConfig } from './config.js';
import type { RevalidationStatus } from './registry.js';
export async function triggerRevalidation(config:AppConfig):Promise<RevalidationStatus>{
  if(!config.WEB_REVALIDATE_URL || !config.REVALIDATE_SECRET) return 'not_configured';
  try{
    const response=await fetch(config.WEB_REVALIDATE_URL,{
      method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${config.REVALIDATE_SECRET}`},
      body:JSON.stringify({tags:['products','content-pages','offers','coupons','stores']}),signal:AbortSignal.timeout(5000),redirect:'error',
    });
    await response.body?.cancel();
    return response.ok?'ok':'failed';
  }catch{return 'failed';}
}
