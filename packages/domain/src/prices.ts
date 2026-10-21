import type { PrismaClient } from '@babiespicks/db';
import { DomainError } from './errors';
export interface PriceLike {
  storeId:string; price:unknown; scrapedAt:Date|string; inStock?:boolean;
  store?:{isActive?:boolean}|null;
}
export function selectLatestPrices<T extends PriceLike>(prices:T[], now=new Date(), maxAgeHours=48):T[]{
  const latest=new Map<string,T>();
  for(const p of prices){
    const at=new Date(p.scrapedAt).getTime();
    if(!Number.isFinite(at)||at>now.getTime()+60000)continue;
    const old=latest.get(p.storeId);
    if(!old||at>new Date(old.scrapedAt).getTime())latest.set(p.storeId,p);
  }
  return [...latest.values()].filter(p=>p.inStock!==false&&p.store?.isActive!==false&&Number(p.price)>0&&now.getTime()-new Date(p.scrapedAt).getTime()<=maxAgeHours*3600000).sort((a,b)=>Number(a.price)-Number(b.price));
}
function hostIs(host:string,root:string){return host===root||host.endsWith(`.${root}`)}
export function wrapAffiliateUrl(raw:string,storeSlug:string,env:Record<string,string|undefined>=process.env,store?:{url?:string;affiliateNetwork?:string|null}):string{
  let u:URL;try{u=new URL(raw)}catch{throw new DomainError('INVALID_INPUT','Invalid destination')}
  if(u.protocol!=='https:'||u.username||u.password||u.port)throw new DomainError('INVALID_INPUT','HTTPS destination required');
  const host=u.hostname.toLowerCase();
  if(store?.url){
    let merchant:URL;try{merchant=new URL(store.url)}catch{throw new DomainError('INVALID_INPUT','Invalid store URL')}
    let target=u;
    const nested=host==='arabclicks.com'?u.searchParams.get('l'):host==='ad.admitad.com'?u.searchParams.get('ulp'):host==='s.noon.com'?u.searchParams.get('url'):null;
    if(nested){try{target=new URL(nested)}catch{throw new DomainError('INVALID_INPUT','Invalid merchant destination')}}
    const root=merchant.hostname.toLowerCase().replace(/^www\./,'');
    if(merchant.protocol!=='https:'||target.protocol!=='https:'||!hostIs(target.hostname.toLowerCase(),root))throw new DomainError('INVALID_INPUT','Purchase destination does not match selected store');
  }

  if(hostIs(host,'amazon.sa')||hostIs(host,'amazon.com')){
    if(env.AMAZON_ASSOCIATES_TAG)u.searchParams.set('tag',env.AMAZON_ASSOCIATES_TAG);
    return u.toString();
  }
  if(hostIs(host,'noon.com')){
    if(host==='s.noon.com')return u.toString();
    return env.NOON_AFFILIATE_CODE?`https://s.noon.com/${encodeURIComponent(env.NOON_AFFILIATE_CODE)}?url=${encodeURIComponent(u.toString())}`:u.toString();
  }
  if((host==='arabclicks.com'&&u.pathname==='/click')||(host==='ad.admitad.com'&&u.pathname.startsWith('/g/'))){
    const nested=u.searchParams.get(host==='arabclicks.com'?'l':'ulp');
    if(!nested)throw new DomainError('INVALID_INPUT','Deep link destination required');
    let target:URL;try{target=new URL(nested)}catch{throw new DomainError('INVALID_INPUT','Invalid deep link destination')}
    if(target.protocol!=='https:'||target.username||target.password)throw new DomainError('INVALID_INPUT','HTTPS merchant destination required');
    return u.toString();
  }
  const merchantHost=store?.url?new URL(store.url).hostname.toLowerCase():null;
  if(merchantHost&&hostIs(host,merchantHost)){
    if(store?.affiliateNetwork==='ArabClicks'&&env.ARABCLICKS_PUBLISHER_ID&&env.ARABCLICKS_ADVERTISER_ID)
      return `https://arabclicks.com/click?p=${encodeURIComponent(env.ARABCLICKS_PUBLISHER_ID)}&a=${encodeURIComponent(env.ARABCLICKS_ADVERTISER_ID)}&l=${encodeURIComponent(u.toString())}`;
    if(store?.affiliateNetwork==='Admitad'&&env.ADMITAD_CAMPAIGN_CODE)
      return `https://ad.admitad.com/g/${encodeURIComponent(env.ADMITAD_CAMPAIGN_CODE)}/?ulp=${encodeURIComponent(u.toString())}`;
    return u.toString();
  }
  // Additional network destinations require an explicit allowlist.

  const allowed=(env.AFFILIATE_ALLOWED_HOSTS??'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(allowed.includes(host))return u.toString();
  throw new DomainError('INVALID_INPUT',`Unapproved purchase host for ${storeSlug}`);
}
export async function resolvePurchaseTarget(db:PrismaClient,input:{productId:string;storeId?:string},now=new Date()){
  const product=await db.product.findFirst({where:{id:input.productId,publishStatus:'PUBLISHED',isActive:true},include:{prices:{include:{store:true}}}});
  if(!product)return null;
  const prices=selectLatestPrices(product.prices,now).filter(p=>(!input.storeId||p.storeId===input.storeId)&&p.currency==='SAR'&&p.url);
  for(const p of prices){try{return {url:wrapAffiliateUrl(p.url!,p.store.slug,process.env,p.store),storeId:p.storeId,price:Number(p.price),currency:p.currency}}catch{continue}}
  return null;
}
