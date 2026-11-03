import type { PrismaClient } from '@babiespicks/db';
import { DomainError } from './errors';
import { isCurrencyApprovedForMarketplace, isMarketplaceUrl, resolveMarketplaceFromDomain, type MarketplaceCode } from './marketplaces';
import type { Money } from './international-contracts';
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
export function wrapAffiliateUrl(raw:string,storeSlug:string,env:Record<string,string|undefined>=process.env,store?:{url?:string;affiliateNetwork?:string|null;marketplaceCode?:string|null}):string{
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
    // The affiliate tag is per-marketplace: a store's tag belongs to its own market only
    // and is never written across markets. A legacy store without a verified marketplace
    // identity keeps the historical SAR fallback, pinned to amazon.sa — never extended.
    const marketplace=resolveMarketplaceFromDomain(host);
    if(!marketplace)throw new DomainError('INVALID_INPUT','Unapproved Amazon marketplace host');
    if(store?.marketplaceCode!==undefined&&store?.marketplaceCode!==null&&store.marketplaceCode!==marketplace)
      throw new DomainError('INVALID_INPUT',`Affiliate tag is configured for another marketplace than ${store.marketplaceCode}`);
    if(store?.marketplaceCode===null||store?.marketplaceCode===undefined){
      if(marketplace!=='SA')throw new DomainError('INVALID_INPUT','Unverified legacy affiliate tag is approved for the SA marketplace only');
    }
    // The old environment variable is a Saudi compatibility setting, never a US override.
    // The selected store URL is already matched to this destination above.
    const tag=env[`AMAZON_ASSOCIATES_TAG_${marketplace}`]?.trim()
      ||(marketplace==='SA'?env.AMAZON_ASSOCIATES_TAG?.trim():undefined)
      ||(store?.url?new URL(store.url).searchParams.get('tag')?.trim():undefined);
    if(!tag)throw new DomainError('INVALID_INPUT',`Missing affiliate tag for ${marketplace} marketplace`);
    u.searchParams.set('tag',tag);
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

/** The resolved international offer destination: one exact observation, one marketplace.
 * It never claims Buy Box or the seller who will charge at checkout. */
export interface ResolvedOffer {
  readonly url:string;
  readonly offerId:string;
  readonly listingId:string;
  readonly marketplaceCode:MarketplaceCode;
  readonly observedSellerKey:string;
  readonly price:Money;
}

/** Resolve one offer purchase target from one exact price observation. The observation id,
 * the offer's marketplace and the explicit destination are all required: an expired,
 * superseded or mismatched observation returns null so the caller can show an honest
 * explanation page instead of guessing another marketplace or version. Tracking uses the
 * offer marketplace's own tag only; the generic tag is a Saudi compatibility fallback.
 */
export async function resolveOfferTarget(db:PrismaClient,input:{offerId:string;observationId:string;shipTo:'SA'|'US'|null},now=new Date()):Promise<ResolvedOffer|null>{
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(input.offerId)||!/^[a-zA-Z0-9_-]{1,128}$/.test(input.observationId))return null;
  const observation=await db.offerPriceObservation.findFirst({
    where:{id:input.observationId,offerId:input.offerId,availability:'AVAILABLE',checkedAt:{lte:now},expiresAt:{gt:now}},
    include:{offer:{include:{listing:{include:{store:true,product:{select:{publishStatus:true,isActive:true}}}}}}},
  });
  if(!observation)return null;
  const offer=observation.offer,listing=offer.listing,store=listing.store;
  // Same publication boundary as the public catalog: a withdrawn product's offer is no
  // longer a public purchase target (a draft never was).
  if(listing.product.publishStatus!=='PUBLISHED'||listing.product.isActive===false)return null;
  // The listing's marketplace must actually trade with the explicit destination. A null
  // destination never resolves an in-marketplace observation into a guessed country.
  const destinationMarketplace=input.shipTo??null;
  if(!destinationMarketplace||listing.marketplaceCode!==destinationMarketplace)return null;
  if(observation.shipTo!==null&&observation.shipTo!==input.shipTo)return null;
  if(!offer.isActive||!store.isActive||!observation.amount||!observation.currency)return null;
  if(observation.audience!=='PUBLIC')return null;
  const money:Money={amount:String(observation.amount),currency:observation.currency};
  if(!isCurrencyApprovedForMarketplace(money.currency,listing.marketplaceCode))return null;
  if(!isMarketplaceUrl(listing.sourceUrl,listing.marketplaceCode))return null;
  try{
    const url=wrapAffiliateUrl(listing.sourceUrl,store.slug,process.env,store);
    return {url,offerId:offer.id,listingId:listing.id,marketplaceCode:listing.marketplaceCode,observedSellerKey:observation.offer.sellerKey,price:money};
  }catch{return null}
}
