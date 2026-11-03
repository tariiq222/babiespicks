import type { PrismaClient } from '@babiespicks/db';
import type { resolvePurchaseTarget, resolveOfferTarget } from '@babiespicks/domain';

/** Valid single-segment ids: cuid, backfill stable ids and similar. */
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
/** The purchase path's own destination is the only redirect target: no free returnUrl. */
const safeLocale = (request: Request) => new URL(request.url).searchParams.get('locale') === 'en' ? 'en' : 'ar';
const escapeHtml = (value:string) => value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

export function createPurchaseHandler(db: PrismaClient, resolve: typeof resolvePurchaseTarget) {
  return async (request: Request, input: { productId: string; storeId?: string }) => {
    if (!idPattern.test(input.productId) || (input.storeId && !idPattern.test(input.storeId))) return new Response('Not found', { status: 404 });
    const target = await resolve(db, input);
    if (!target) return new Response('Purchase link unavailable', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    // Measure only an actual resolved destination. Analytics failure must not block purchase.
    try {
      await db.affiliateClick.create({ data: { productId: input.productId, storeId: target.storeId, userAgent: request.headers.get('user-agent')?.slice(0, 500), referrer: request.headers.get('referer')?.slice(0, 500), locale: safeLocale(request) } });
    } catch { /* best effort analytics */ }
    return new Response(null, { status: 302, headers: { Location: target.url, 'Cache-Control': 'no-store' } });
  };
}

/**
 * International offer route: one exact observation, one explicit destination. An expired,
 * superseded or mismatched observation answers with a browser explanation or JSON —
 * it never substitutes another
 * marketplace or another version. Click counting stays best effort and non-blocking,
 * and a counted click is never a confirmed commission.
 */
export function createOfferPurchaseHandler(db: PrismaClient, resolve: typeof resolveOfferTarget) {
  return async (request: Request, input: { offerId: string }) => {
    const url = new URL(request.url);
    const observationId = url.searchParams.get('observationId') ?? '';
    const shipToParam = url.searchParams.get('shipTo');
    const locale=safeLocale(request),ar=locale==='ar';
    const context=new URLSearchParams();
    if(shipToParam==='SA'||shipToParam==='US')context.set('shipTo',shipToParam);
    const currency=url.searchParams.get('currency');if(currency==='SAR'||currency==='USD')context.set('currency',currency);
    const homePath=`/${locale}${context.size?`?${context}`:''}`;
    const explanation = (payload: Record<string, unknown>, status = 410) => {
      if(!request.headers.get('accept')?.includes('text/html'))return new Response(JSON.stringify({status:'offerUnavailable',...payload}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
      const optionsPath=typeof payload.optionsPath==='string'?payload.optionsPath:homePath;
      const heading=ar?'هذا العرض غير متاح حاليًا':'This offer is unavailable';
      const note=ar?'لا يمكن التحقق من هذا الرابط الآن. افتحي صفحة المنتج أو العروض للاطلاع على الخيارات الحالية.':'This link cannot be verified right now. Open the product page or browse offers for current options.';
      return new Response(`<!doctype html><html lang="${locale}" dir="${ar?'rtl':'ltr'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading} | BabiesPicks</title><main style="max-width:42rem;margin:4rem auto;padding:1.5rem;font-family:system-ui;line-height:1.8"><h1>${heading}</h1><p>${note}</p><p><a href="${escapeHtml(optionsPath)}">${ar?'عرض الخيارات الحالية':'View current options'}</a></p><p><a href="${escapeHtml(homePath)}">${ar?'تصفح العروض':'Browse offers'}</a></p></main></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
    };
    if (!idPattern.test(input.offerId) || !idPattern.test(observationId)) return explanation({ reason: 'INVALID_TARGET' }, 404);
    if (shipToParam !== 'SA' && shipToParam !== 'US') return explanation({ reason: 'DESTINATION_REQUIRED' }, 400);
    const target = await resolve(db, { offerId: input.offerId, observationId, shipTo: shipToParam });
    if (!target) {
      let optionsPath=homePath;
      try{
        const offer=await db.purchaseOffer.findFirst({where:{id:input.offerId,listing:{product:{publishStatus:'PUBLISHED',isActive:true}}},select:{listing:{select:{product:{select:{slug:true}}}}}});
        if(offer)optionsPath=`/${locale}/products/${encodeURIComponent(offer.listing.product.slug)}${context.size?`?${context}`:''}`;
      }catch{ /* A missing options lookup does not create a new purchase target. */ }
      return explanation({ reason: 'OBSERVATION_EXPIRED', offerId: input.offerId, observationId, shipTo: shipToParam, optionsPath });
    }
    try {
      const listing=await db.marketplaceListing.findUnique({where:{id:target.listingId},select:{productId:true,storeId:true}});
      if(listing)await db.affiliateClick.create({ data: { productId: listing.productId, storeId: listing.storeId, userAgent: request.headers.get('user-agent')?.slice(0, 500), referrer: request.headers.get('referer')?.slice(0, 500), locale, country: shipToParam } });
    } catch { /* best effort analytics */ }
    return new Response(null, { status: 302, headers: { Location: target.url, 'Cache-Control': 'no-store' } });
  };
}
