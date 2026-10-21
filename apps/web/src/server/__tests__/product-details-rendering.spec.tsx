import React from 'react';
import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.stubGlobal('React',React);
vi.mock('../../i18n/navigation',()=>({Link:({children,...props}:React.ComponentProps<'a'>)=><a {...props}>{children}</a>}));
import {ProductDetailsView} from '../../shared/components/product-details-view';
const product={id:'p',name:'Bottle',slug:'bottle',brand:'Brand',imageUrl:'https://m.media-amazon.com/a.jpg',imageUrls:['https://m.media-amazon.com/b.jpg'],sources:[{url:'https://www.amazon.sa/dp/X',field:'reviewSummary',checkedAt:'2026-10-21T12:00:00Z'}],translations:[{locale:'ar',name:'رضاعة',slug:'bottle',description:'وصف كامل. لماذا اخترناها: سبب الاختيار. انتبهي: ملاحظة. رابط الشراء: https://www.amazon.sa/dp/X?tag=test'}],prices:[],specs:[],category:null,reviewSummary:{averageRating:4.4,totalReviews:19932,prosAr:['خفيفة'],consAr:['ملاحظة مهمة'],prosEn:[],consEn:[]},verdict:{overallScore:7.8,reasoningAr:'سبب تقييمنا',reasoningEn:'Our reasoning',conditionsAr:[],conditionsEn:[]}};
describe('readable product details',()=>{
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
