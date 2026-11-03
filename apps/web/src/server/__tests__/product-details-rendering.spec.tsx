import React from 'react';
import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.stubGlobal('React',React);
vi.mock('../../i18n/navigation',()=>({Link:({children,href,...props}:Omit<React.ComponentProps<'a'>,'href'> & {href:string|{pathname:string;query?:Record<string,string>}})=>{
 const target=typeof href==='string'?href:`${href.pathname}?${new URLSearchParams(href.query)}`;
 return <a {...props} href={target}>{children}</a>;
}}));
import {ProductDetailsView} from '../../shared/components/product-details-view';
import {OfferGrid} from '../../shared/components/offer-grid';
const product={id:'p',name:'Bottle',slug:'bottle',brand:'Brand',imageUrl:'https://m.media-amazon.com/a.jpg',imageUrls:['https://m.media-amazon.com/b.jpg'],sources:[{url:'https://www.amazon.sa/dp/X',field:'reviewSummary',checkedAt:'2026-10-21T12:00:00Z'}],translations:[{locale:'ar',name:'رضاعة',slug:'bottle',description:'وصف كامل. لماذا اخترناها: سبب الاختيار. انتبهي: ملاحظة. رابط الشراء: https://www.amazon.sa/dp/X?tag=test'}],prices:[],specs:[],category:null,reviewSummary:{averageRating:4.4,totalReviews:19932,prosAr:['خفيفة'],consAr:['ملاحظة مهمة'],prosEn:[],consEn:[]},verdict:{overallScore:7.8,reasoningAr:'سبب تقييمنا',reasoningEn:'Our reasoning',conditionsAr:[],conditionsEn:[]}};
describe('readable product details',()=>{
 it.each(['ar','en'])('keeps explicit US/USD in %s product breadcrumbs and preserves the category',locale=>{
  const html=renderToStaticMarkup(<ProductDetailsView product={{...product,category:{slug:'feeding',name:'الرضاعة',nameEn:'Feeding'}} as never} locale={locale} shipTo="US" currency="USD"/>);
  const nav=html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0]??'';
  const links=[...nav.matchAll(/href="([^"]*)"/g)].map(match=>new URL(match[1].replaceAll('&amp;','&'),'https://local.test'));
  expect(links).toHaveLength(2);
  for(const link of links){expect(link.pathname).toBe('/');expect(link.searchParams.get('shipTo')).toBe('US');expect(link.searchParams.get('currency')).toBe('USD');}
  expect(links[0].searchParams.has('category')).toBe(false);expect(links[1].searchParams.get('category')).toBe('feeding');
 });
 it('keeps explicit neutral choices on the filtered-empty catalog reset link',()=>{
  const html=renderToStaticMarkup(<OfferGrid offers={[]} products={[]} locale="en" filtered shipTo={null} currency={null}/>);
  const href=html.match(/href="([^"]*)"/)?.[1]??'';
  const url=new URL(href.replaceAll('&amp;','&'),'https://local.test');
  expect(url.searchParams.get('shipTo')).toBe('');expect(url.searchParams.get('currency')).toBe('');
 });
 it('shows independent rating scales, source, complete details and gallery controls',()=>{
  const html=renderToStaticMarkup(<ProductDetailsView product={product as never} locale="ar"/>);
  for(const text of ['تقييم أمازون','4.4','/ 5','تقييمنا في BabiesPicks','7.8','/ 10','سبب تقييمنا','وصف كامل.','سبب الاختيار.','مميزات المنتج','خفيفة','ملاحظة مهمة','عرض الصورة 2 من 2'])expect(html).toContain(text);
  expect(html).not.toContain('رابط الشراء:');expect(html).not.toContain('?tag=test');expect(html).not.toContain('aggregateRating');
 });
 it('does not relabel a price source as an Amazon rating and handles missing assessment/gallery',()=>{
  const html=renderToStaticMarkup(<ProductDetailsView product={{...product,imageUrl:null,imageUrls:[],sources:[{...product.sources[0],field:'price'}],verdict:null} as never} locale="en"/>);
  expect(html).toContain('A verified Amazon rating is not available');expect(html).toContain('We have not rated this product');expect(html).not.toContain('>4.4<');expect(html).not.toContain('View photo 2');
 });
});
