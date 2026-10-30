import Markdown from 'react-markdown';
import {Link} from '../../i18n/navigation';
import {getLocalizedDesc,getLocalizedName,getProductTranslation,type Product} from '../lib/api';
import {getCategoryLabel,getDiscount} from '../lib/catalog-filters';
import {getProductImages,getProductMetaDescription,organizeProductDescription} from '../lib/product-details';
import {ProductGallery} from './product-gallery';
import {ProductRatings} from './product-ratings';
import {ProductCard} from './product-card';
import {SarPrice} from './sar-price';
import {StoreLink} from './store-link';
import {JsonLd} from './json-ld';
export function ProductDetailsView({product,locale,related=[]}:{product:Product;locale:string;related?:Product[]}){
 const ar=locale==='ar';const name=getLocalizedName(product,locale);const images=getProductImages(product);
 const description=organizeProductDescription(getLocalizedDesc(product,locale));
 const introduction=description.split(/\n\s*\n/).find(block=>block.trim()&&!block.trim().startsWith('#'))??'';
 const contentLocale=getProductTranslation(product,locale)?.locale??locale;
 const prices=[...product.prices].sort((a,b)=>a.price-b.price);
 const specs=product.specs.filter(spec=>spec.locale===locale&&!/^(رابط (?:أمازون|الشراء)|amazon (?:url|link)|purchase (?:url|link))$/i.test(spec.key.trim()));
 const review=product.reviewSummary;const pros=(ar?review?.prosAr:review?.prosEn)??[];const cons=(ar?review?.consAr:review?.consEn)??[];
 const verdict=product.verdict;const reasoning=ar?verdict?.reasoningAr:verdict?.reasoningEn;const conditions=(ar?verdict?.conditionsAr:verdict?.conditionsEn)??[];
 const sources=(product.sources??[]).filter(source=>source.field==='verdict');
 const categoryLabel=getCategoryLabel(product.category,locale);const best=prices[0];const storeName=(price:Product['prices'][number])=>price.store?.name||(ar?'المتجر':'the store');
 const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||'https://babiespicks.com';
 return <main id="main" className="mx-auto max-w-6xl px-5 pt-6 pb-8 md:py-12">
  <nav aria-label={ar?'مسار التصفح':'Breadcrumb'} className="flex flex-wrap items-center gap-2 text-sm"><Link href="/" className="text-sage-deep underline underline-offset-4">{ar?'كل العروض':'All offers'}</Link>{categoryLabel&&<><span aria-hidden="true" className="text-stone">/</span><Link href={{pathname:'/',query:{category:product.category?.slug}}} className="text-sage-deep underline underline-offset-4">{categoryLabel}</Link></>}</nav>
  <div className="mt-7 grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-12">
   <div className="min-w-0"><ProductGallery images={images} name={name} locale={locale}/></div>
   <div className="min-w-0">
    {product.brand&&<p className="mb-2 text-sm font-medium text-stone" dir="auto">{product.brand}</p>}
    <h1 className="text-2xl font-semibold leading-relaxed md:text-3xl" lang={contentLocale} dir={contentLocale==='ar'?'rtl':'ltr'}>{name}</h1>
    <section className="mt-6 rounded-2xl bg-linen p-5" aria-labelledby="product-prices">
     <h2 id="product-prices" className="mb-4 text-lg font-semibold">{ar?'الأسعار المتاحة':'Available prices'}</h2>
     {!prices.length?<p role="status" className="text-sm leading-7 text-stone">{ar?'لا يتوفر سعر حديث لهذا المنتج حاليًا.':'No recent price is available for this product.'}</p>:<div className="space-y-3">{prices.map((price,index)=>{const discount=getDiscount(price);return <div key={price.storeId} className="rounded-xl border border-beige bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="text-sm">{storeName(price)}</span>{prices.length>1&&index===0&&<span className="rounded-md bg-verdict-good-bg px-2 py-0.5 text-xs text-verdict-good-text">{ar?'أقل سعر':'Lowest price'}</span>}<SarPrice amount={price.price} className="ms-auto text-2xl font-semibold"/></div>
      {discount>0&&<p className="mt-1 flex items-center justify-end gap-2 text-sm"><s className="text-stone"><SarPrice amount={price.originalPrice as number}/></s><span className="text-terracotta"><bdi dir="ltr">−{discount}%</bdi></span></p>}
      {price.checkedAt&&<p className="mt-2 text-xs text-stone">{ar?'آخر تحديث للسعر: ':'Price last updated: '}<time dateTime={price.checkedAt}>{new Intl.DateTimeFormat(ar?'ar-SA-u-ca-gregory':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(new Date(price.checkedAt))}</time></p>}
      <StoreLink product={product} price={price} locale={locale} placement="product_prices" label={ar?`شراء ${name} من ${storeName(price)}`:`Buy ${name} from ${storeName(price)}`} className="mt-3 flex min-h-12 items-center justify-center gap-1.5 rounded-lg bg-sage-deep px-4 font-medium text-cream transition-colors hover:bg-charcoal">{ar?`الشراء من ${storeName(price)}`:`Buy from ${storeName(price)}`}<i aria-hidden="true" className="ti ti-external-link text-lg"/></StoreLink>
     </div>;})}</div>}
     <p className="mt-4 text-xs leading-6 text-stone">{ar?'قد يتغير السعر والتوفر. تأكدي من السعر والشحن في المتجر قبل الشراء. قد نحصل على عمولة دون تكلفة إضافية عليك.':'Price and availability may change. Check the price and shipping at the store before buying. We may earn a commission at no extra cost to you.'}</p>
    </section>
    {introduction&&<div lang={contentLocale} dir={contentLocale==='ar'?'rtl':'ltr'} className="mt-6 line-clamp-3 text-sm leading-7 text-stone"><Markdown skipHtml allowedElements={['p','strong','em']} unwrapDisallowed>{introduction}</Markdown></div>}
    <ProductRatings product={product} locale={locale}/>
   </div>
  </div>
  <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
   <div className="min-w-0 space-y-8">
    {reasoning&&<section id="verdict-reasoning" className="scroll-mt-20 rounded-2xl border border-sage/30 bg-sage/5 p-6"><h2 className="text-xl font-semibold">{ar?'لماذا هذا التقييم؟':'Why this rating?'}</h2><p className="mt-3 whitespace-pre-line text-sm leading-8">{reasoning}</p>{conditions.length>0&&<><h3 className="mt-4 text-sm font-semibold">{ar?'يناسبك إذا':'A good fit if'}</h3><ul className="mt-2 list-disc space-y-2 ps-5 text-sm leading-7">{conditions.map((text,i)=><li key={i}>{text}</li>)}</ul></>}{sources.length>0&&<div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-sage/20 pt-4">{sources.map((source,i)=><a key={i} href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-sage-deep underline">{new URL(source.url).hostname} ↗</a>)}</div>}</section>}
    {(pros.length>0||cons.length>0)&&<section className="hairline rounded-2xl p-6">{pros.length>0&&<><h2 className="font-semibold text-sage-deep">{ar?'مميزات المنتج':'Product strengths'}</h2><ul className="mt-3 list-disc space-y-2 ps-5 text-sm leading-7">{pros.map((text,i)=><li key={i}>{text}</li>)}</ul></>}{cons.length>0&&<><h2 className={`${pros.length?'mt-6 ':''}font-semibold text-terracotta`}>{ar?'ملاحظات قبل الشراء':'Before you buy'}</h2><ul className="mt-3 list-disc space-y-2 ps-5 text-sm leading-7">{cons.map((text,i)=><li key={i}>{text}</li>)}</ul></>}</section>}
    {description&&<section aria-labelledby="product-description"><h2 id="product-description" className="mb-4 text-xl font-semibold">{ar?'عن المنتج':'About the product'}</h2><div lang={contentLocale} dir={contentLocale==='ar'?'rtl':'ltr'} className="break-words text-sm leading-8 [&_h2]:mt-6 [&_h2]:text-lg [&_h3]:mt-5 [&_h3]:font-semibold [&_p]:my-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5 [&_a]:text-sage-deep [&_a]:underline [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-linen [&_pre]:p-3 [&_code]:[overflow-wrap:anywhere]"><Markdown skipHtml components={{img:()=>null}}>{description}</Markdown></div></section>}
   </div>
   <div className="min-w-0 space-y-6">
    {specs.length>0&&<section className="hairline rounded-2xl p-6"><h2 className="mb-4 font-semibold">{ar?'مواصفات المنتج':'Product specifications'}</h2><dl className="divide-y divide-beige">{specs.map((spec,i)=><div key={i} className="grid grid-cols-2 gap-3 py-3 text-sm leading-7"><dt className="min-w-0 break-words text-stone">{spec.key}</dt><dd className="min-w-0 break-words">{spec.value}</dd></div>)}</dl></section>}
   </div>
  </div>
  {related.length>0&&<section aria-labelledby="related-products" className="mt-12"><h2 id="related-products" className="mb-5 text-xl font-semibold">{ar?'منتجات قد تناسبك':'You may also like'}</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">{related.map(item=><ProductCard key={item.id} product={item} locale={locale} placement="related"/>)}</div></section>}
  {best&&<div data-sticky-buy className="fixed inset-x-0 bottom-0 z-30 border-t border-beige bg-cream/95 px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden"><div className="flex items-center gap-3"><div className="min-w-0"><SarPrice amount={best.price} className="block text-lg font-semibold leading-6"/><p className="truncate text-xs text-stone">{storeName(best)}</p></div><StoreLink product={product} price={best} locale={locale} placement="mobile_sticky" label={ar?`شراء ${name} من ${storeName(best)}`:`Buy ${name} from ${storeName(best)}`} className="ms-auto flex min-h-12 shrink-0 items-center gap-1.5 rounded-lg bg-sage-deep px-5 font-medium text-cream">{ar?'الشراء من المتجر':'Buy from store'}<i aria-hidden="true" className="ti ti-external-link text-lg"/></StoreLink></div></div>}
  <JsonLd data={{'@context':'https://schema.org','@type':'Product',name,description:getProductMetaDescription(product,locale),brand:product.brand?{'@type':'Brand',name:product.brand}:undefined,image:images.length?images:undefined,offers:prices.map(price=>({'@type':'Offer',price:price.price,priceCurrency:'SAR',url:`${siteUrl}/${locale}/products/${product.slug}`,seller:price.store?{'@type':'Organization',name:price.store.name}:undefined}))}}/>
 </main>;
}
