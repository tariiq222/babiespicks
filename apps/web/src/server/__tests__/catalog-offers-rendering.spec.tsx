import React from 'react';
import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {CatalogPageItem,OfferQuoteView,Product,ProductOffersPage} from '../../shared/lib/api';
import {ProductCard} from '../../shared/components/product-card';
import {ProductDetailsView} from '../../shared/components/product-details-view';
import {OfferGrid} from '../../shared/components/offer-grid';
import {CatalogPagination} from '../../shared/components/catalog-pagination';
import {CatalogFiltersPanel} from '../../shared/components/catalog-filters';
import {catalogNavigationQuery} from '../../shared/lib/catalog-navigation';
import {parseCatalogFilters,PRICE_BANDS} from '../../shared/lib/catalog-filters';
vi.stubGlobal('React',React);
vi.mock('../../i18n/navigation',()=>({Link:({children,href,...props}:Omit<React.ComponentProps<'a'>,'href'> & {href:string|{pathname:string;query?:Record<string,string>}})=><a {...props} href={typeof href==='string'?href:`${href.pathname}?${new URLSearchParams(href.query)}`}>{children}</a>}));

const product={id:'p',name:'International bottle',slug:'bottle',brand:'Brand',imageUrl:null,imageUrls:[],sources:[],translations:[],prices:[],specs:[],category:null,reviewSummary:null,verdict:null} as unknown as Product;
const quote:OfferQuoteView={offerId:'off-us',observationId:'obs-current',productId:'p',marketplaceCode:'US',listingId:'listing-us',sellerKey:'seller',fulfillerKey:'fulfiller',price:{amount:'25',currency:'USD'},originalPrice:null,convertedPrice:null,convertedOriginalPrice:null,discountPercent:null,fxSnapshotId:null,taxBasis:'UNKNOWN',checkedAt:'2026-11-03T10:00:00Z',expiresAt:'2026-11-03T11:00:00Z',audience:'PUBLIC',delivery:{state:'UNKNOWN',country:'US',precision:'UNKNOWN',checkedAt:null},comparisonGroup:null,store:{id:'us',name:'Amazon US',slug:'amazon-us'},purchasePath:'/go/offer/off-us?observationId=obs-current&shipTo=US'};
const selection={quotes:[quote],pendingDelivery:[quote],bestByGroup:{},reason:'NO_COMPARABLE_PRICE' as const,contextKey:'context',fxSnapshotId:null};
const item:CatalogPageItem={product:{...product,legacyOnly:false},offers:selection,legacyPrice:null};
const page=(overrides:Partial<ProductOffersPage>={}):ProductOffersPage=>({product:null,offers:selection,legacyPrice:null,total:1,nextCursor:null,filterOptions:{categories:[],brands:[],bands:[],hasDiscounts:false,hasRatings:false,hasVerdicts:false},contextKey:'context',...overrides});
const oldPrice={price:99,originalPrice:null,currency:'SAR',storeId:'sa',store:{id:'sa',name:'Amazon SA',slug:'amazon'}};

describe('engine-backed public offer rendering',()=>{
 it('uses catalog DTO rows in the home grid even when there are no legacy products',()=>{
  const html=renderToStaticMarkup(<OfferGrid offers={[]} catalogItems={[item]} products={[]} locale="en" shipTo="US" currency="SAR"/>);
  expect(html).toContain('International bottle');expect(html).toContain('25.00');expect(html).toContain('shipTo=US&amp;currency=SAR');
 });
 it('renders an international-only card and only the exact server purchase path',()=>{
  const html=renderToStaticMarkup(<ProductCard {...({product,locale:'en',shipTo:'US',currency:'SAR',catalogItem:item} as any)}/>);
  expect(html).toContain('International bottle');expect(html).toContain('USD');expect(html).toContain('25.00');
  expect(html).toContain('/go/offer/off-us?observationId=obs-current&amp;shipTo=US');expect(html).not.toContain('/go/p/');
  expect(html).toContain('Delivery needs checking');expect(html).not.toContain('Lowest price');
 });
 it('does not restore a raw old SAR price when the engine rejects every international source',()=>{
  const raw={...product,prices:[oldPrice]};
  const html=renderToStaticMarkup(<ProductDetailsView {...({product:raw,locale:'en',offerPage:page({offers:{...selection,quotes:[],pendingDelivery:[]}})} as any)}/>);
  expect(html).toContain('No recent price');expect(html).not.toContain('99');expect(html).not.toContain('/go/p/');expect(html).not.toContain('data-sticky-buy');
 });
 it('shows pending original money but no invented purchase link or comparison winner',()=>{
  const pending={...quote,purchasePath:null};
  const html=renderToStaticMarkup(<ProductDetailsView {...({product:{...product,prices:[oldPrice]},locale:'en',shipTo:'US',offerPage:page({offers:{...selection,quotes:[],pendingDelivery:[pending]}})} as any)}/>);
  expect(html).toContain('USD');expect(html).toContain('25.00');expect(html).toContain('Delivery needs checking');expect(html).not.toContain('/go/offer/');expect(html).not.toContain('99');expect(html).not.toContain('Lowest price');
 });
 it('preserves all fresh legacy store rows only when fallback is authorized',()=>{
  const raw={...product,prices:[oldPrice,{...oldPrice,price:109,storeId:'sa2',store:{id:'sa2',name:'Second store',slug:'second'}}]};
  const legacy={...oldPrice,currency:'SAR' as const,checkedAt:'2026-11-03T10:00:00Z'};
  const html=renderToStaticMarkup(<ProductDetailsView {...({product:raw,locale:'en',offerPage:page({offers:null,legacyPrice:legacy})} as any)}/>);
  expect(html).toContain('/go/p/sa?');expect(html).toContain('/go/p/sa2?');expect(html).toContain('Second store');
  expect(html).not.toContain('Lowest price');
 });
 it('does not render an estimate without a server FX snapshot',()=>{
  const unsafe={...quote,convertedPrice:{amount:'93.75',currency:'SAR'}};
  const html=renderToStaticMarkup(<ProductCard {...({product,locale:'en',catalogItem:{...item,offers:{...selection,quotes:[unsafe],pendingDelivery:[unsafe]}}} as any)}/>);
  expect(html).toContain('25.00');expect(html).not.toContain('93.75');
 });
 it('renders an approved estimate beside the original and keeps JSON-LD in the original currency',()=>{
  const converted={...quote,fxSnapshotId:'fx-verified',convertedPrice:{amount:'93.75',currency:'SAR'}};
  const html=renderToStaticMarkup(<ProductDetailsView product={product} locale="en" shipTo="US" offerPage={page({offers:{...selection,quotes:[converted],pendingDelivery:[converted]}})}/>);
  expect(html).toContain('93.75');expect(html).toContain('Approximate converted estimate');expect(html).toContain('data-sticky-buy');
  const json=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
  expect(json.offers).toEqual([expect.objectContaining({price:'25',priceCurrency:'USD'})]);
 });
 it('shows an unpriced pending card without resurrecting legacy money',()=>{
  const hidden={...quote,price:null,originalPrice:null,convertedPrice:null,discountPercent:null,purchasePath:null};
  const html=renderToStaticMarkup(<ProductCard product={{...product,prices:[oldPrice]}} locale="en" catalogItem={{...item,offers:{...selection,quotes:[],pendingDelivery:[hidden]}}}/>);
  expect(html).toContain('No recent price');expect(html).not.toContain('99');expect(html).not.toContain('data-store-link');
 });
 it.each(['pending','neutral'])('chooses an approved numeric %s quote before redacted metadata, retaining engine order',mode=>{
  const redacted={...quote,offerId:'disabled-offer',observationId:'disabled-observation',price:null,originalPrice:null,convertedPrice:null,discountPercent:null,purchasePath:null};
  const current={...quote,purchasePath:null};
  const offers={...selection,quotes:mode==='neutral'?[redacted,current]:[redacted],pendingDelivery:mode==='pending'?[current]:[]};
  const html=renderToStaticMarkup(<ProductCard product={product} locale="en" catalogItem={{...item,offers}}/>);
  expect(html).toContain('25.00');expect(html).toContain('USD');expect(html).not.toContain('No recent price');expect(html).not.toContain('/go/offer/');expect(html).not.toContain('Lowest price');
 });
 it('preserves filter/context/typed-budget state in next-page links and omits a link on the last page',()=>{
  const filters=parseCatalogFilters({category:'feeding',brand:'Brand',rated:'1',sort:'price'});
  const context={locale:'ar' as const,shipTo:'US' as const,displayCurrency:'SAR' as const,budget:{amount:'50',currency:'USD'},audience:'PUBLIC' as const};
  const query=catalogNavigationQuery('bottle',filters,context);
  const html=renderToStaticMarkup(<CatalogPagination nextCursor="opaque-cursor" query={query} locale="ar"/>);
  const url=new URL(html.match(/href="([^"]*)"/)![1].replaceAll('&amp;','&'),'https://local.test');
  expect(Object.fromEntries(url.searchParams)).toEqual({q:'bottle',category:'feeding',brand:'Brand',rated:'1',sort:'price',shipTo:'US',currency:'SAR',maxAmount:'50',budgetCurrency:'USD',cursor:'opaque-cursor'});
  expect(catalogNavigationQuery('bottle',filters,context,{category:'toys'})).not.toHaveProperty('cursor');
  expect(renderToStaticMarkup(<CatalogPagination nextCursor={null} query={query} locale="ar"/>)).toBe('');
 });
 it('requires a budget unit and omits numeric bands when the reader cannot name one unit',()=>{
  const html=renderToStaticMarkup(<CatalogFiltersPanel filters={parseCatalogFilters({})} options={{categories:[],brands:[],bands:[PRICE_BANDS[0],PRICE_BANDS[1]],hasDiscounts:false,hasRatings:false,hasVerdicts:false}} q="bottle" locale="en" activeCount={0} priceCurrency={null}/>);
  expect(html).toContain('name="maxAmount"');expect(html).toContain('name="budgetCurrency"');expect(html).toContain('Choose a currency');expect(html).not.toContain('name="price"');
 });
});
