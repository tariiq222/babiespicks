import {describe,expect,it,vi} from 'vitest';
import {createOfferPurchaseHandler} from '../purchase-handler';

describe('public offer navigation',()=>{
 it('renders an understandable expired-offer page linking only to the published product',async()=>{
  const findFirst=vi.fn().mockResolvedValue({listing:{product:{slug:'bottle'}}});
  const handler=createOfferPurchaseHandler({purchaseOffer:{findFirst}} as never,vi.fn().mockResolvedValue(null));
  const response=await handler(new Request('https://babiespicks.com/go/offer/offer?observationId=old&shipTo=SA&locale=en&returnUrl=https://evil.test',{headers:{accept:'text/html'}}),{offerId:'offer'});
  expect(response.status).toBe(410);
  expect(response.headers.get('content-type')).toContain('text/html');
  const body=await response.text();
  expect(body).toContain('lang="en"');
  expect(body).toContain('This offer is unavailable');
  expect(body).toContain('/en/products/bottle?shipTo=SA');
  expect(body).not.toContain('evil.test');
  expect(findFirst.mock.calls[0][0].where.listing.product).toMatchObject({publishStatus:'PUBLISHED',isActive:true});
 });
 it('records the product/store identities instead of using offer/listing ids as foreign keys',async()=>{
  const create=vi.fn().mockResolvedValue({});
  const db={marketplaceListing:{findUnique:vi.fn().mockResolvedValue({productId:'product',storeId:'store'})},affiliateClick:{create}};
  const handler=createOfferPurchaseHandler(db as never,vi.fn().mockResolvedValue({url:'https://amazon.sa/dp/B000000001?tag=test-sa-21',offerId:'offer',listingId:'listing',marketplaceCode:'SA',observedSellerKey:'seller',price:{amount:'10',currency:'SAR'}}));
  const response=await handler(new Request('https://babiespicks.com/go/offer/offer?observationId=observation&shipTo=SA&locale=en'),{offerId:'offer'});
  expect(response.status).toBe(302);
  expect(create.mock.calls[0][0].data).toMatchObject({productId:'product',storeId:'store',locale:'en',country:'SA'});
 });
});
