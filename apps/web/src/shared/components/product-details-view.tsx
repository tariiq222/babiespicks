import Markdown from 'react-markdown';
import {Link} from '../../i18n/navigation';
import {getLocalizedDesc,getLocalizedName,getProductTranslation,type Product} from '../lib/api';
import {getCategoryLabel,getDiscount} from '../lib/catalog-filters';
import {getProductImages,getProductMetaDescription,getVerdictLabel,groupSpecs,organizeProductDescription,splitSentences,splitSpecList,stripConditionPrefix} from '../lib/product-details';
import {ProductGallery} from './product-gallery';
import {ProductRatings} from './product-ratings';
import {ProductCard} from './product-card';
import {SarPrice} from './sar-price';
import {StoreLink} from './store-link';
import {JsonLd} from './json-ld';
const VERDICT_TONE={WORTH_IT:'bg-verdict-good-bg text-verdict-good-text',WORTH_IT_WITH:'bg-verdict-cond-bg text-verdict-cond-text',WAIT:'bg-verdict-wait-bg text-verdict-wait-text',NOT_WORTH_IT:'bg-verdict-bad-bg text-verdict-bad-text'} as const;
export function ProductDetailsView({product,locale,related=[]}:{product:Product;locale:string;related?:Product[]}){
 const ar=locale==='ar';const name=getLocalizedName(product,locale);const images=getProductImages(product);
 const description=organizeProductDescription(getLocalizedDesc(product,locale));
 const introduction=description.split(/\n\s*\n/).find(block=>block.trim()&&!block.trim().startsWith('#'))??'';
 const contentLocale=getProductTranslation(product,locale)?.locale??locale;
 const prices=[...product.prices].sort((a,b)=>a.price-b.price);
 const specs=product.specs.filter(spec=>spec.locale===locale&&!/^(رابط (?:أمازون|الشراء)|amazon (?:url|link)|purchase (?:url|link))$/i.test(spec.key.trim()));
 const review=product.reviewSummary;const pros=(ar?review?.prosAr:review?.prosEn)??[];const cons=(ar?review?.consAr:review?.consEn)??[];
 const {facts,details,identifiers}=groupSpecs(specs);
 const verdict=product.verdict;const reasoning=ar?verdict?.reasoningAr:verdict?.reasoningEn;const [leadSentence,...otherSentences]=splitSentences(reasoning??'');const verdictLabel=verdict?getVerdictLabel(verdict.type,locale):'';const conditions=(ar?verdict?.conditionsAr:verdict?.conditionsEn)??[];
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
      <StoreLink product={product} price={price} locale={locale} placement="product_prices" label={ar?`شراء ${name} من ${storeName(price)}`:`Buy ${name} from ${storeName(price)}`} className="mt-3 flex min-h-12 items-center justify-center gap-1.5 rounded-lg bg-sage-deep px-4 font-medium text-cream transition-colors hover:bg-charcoal">{ar?'اشتر الآن':'Buy now'}<i aria-hidden="true" className="ti ti-external-link text-lg"/></StoreLink>
     </div>;})}</div>}
     <p className="mt-4 text-xs leading-6 text-stone">{ar?'قد يتغير السعر والتوفر. تأكدي من السعر والشحن في المتجر قبل الشراء. قد نحصل على عمولة دون تكلفة إضافية عليك.':'Price and availability may change. Check the price and shipping at the store before buying. We may earn a commission at no extra cost to you.'}</p>
    </section>
    {introduction&&<div lang={contentLocale} dir={contentLocale==='ar'?'rtl':'ltr'} className="mt-6 line-clamp-3 text-sm leading-7 text-stone"><Markdown skipHtml allowedElements={['p','strong','em']} unwrapDisallowed>{introduction}</Markdown></div>}
    <ProductRatings product={product} locale={locale}/>
   </div>
  </div>
  <div className="mt-10 space-y-6">
   {reasoning&&verdict&&<section id="verdict-reasoning" className="scroll-mt-20 rounded-2xl border border-sage/30 bg-sage/5 p-5 md:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{ar?'لماذا هذا التقييم؟':'Why this rating?'}</h2><p className={`flex items-center gap-2 rounded-lg px-3 py-1 text-sm font-medium ${VERDICT_TONE[verdict.type]??'bg-verdict-good-bg text-verdict-good-text'}`}><bdi dir="ltr" className="tabular-nums">{verdict.overallScore.toFixed(1)} / 10</bdi>{verdictLabel&&<span>{verdictLabel}</span>}</p></div>
    <div className={`mt-5 grid gap-6 ${conditions.length>0?'md:grid-cols-2 md:gap-8':''}`}>
     <div className="min-w-0"><p className="text-base font-medium leading-8">{leadSentence}</p>{otherSentences.length>0&&<div className="mt-3 space-y-2 text-sm leading-7">{otherSentences.map((text,i)=><p key={i}>{text}</p>)}</div>}</div>
     {conditions.length>0&&<div className="min-w-0 border-t border-sage/20 pt-5 md:border-s md:border-t-0 md:ps-8 md:pt-0"><h3 className="font-semibold">{ar?'يناسبك إذا':'A good fit if'}</h3><ul className="mt-3 space-y-3 text-sm leading-7">{conditions.map((text,i)=><li key={i} className="flex gap-2.5"><i aria-hidden="true" className="ti ti-circle-check mt-1 text-lg leading-none text-sage-deep"/><span className="min-w-0">{stripConditionPrefix(text)}</span></li>)}</ul></div>}
    </div>
    {sources.length>0&&<div className="mt-5 flex flex-wrap gap-2 border-t border-sage/20 pt-4"><span className="me-1 self-center text-xs text-stone">{ar?'المصادر:':'Sources:'}</span>{sources.map((source,i)=><a key={i} href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-white/70 px-2.5 text-xs text-sage-deep underline underline-offset-2"><bdi dir="ltr">{new URL(source.url).hostname.replace(/^www\./,'')}</bdi><i aria-hidden="true" className="ti ti-external-link text-sm"/></a>)}</div>}
   </section>}
   {(pros.length>0||cons.length>0)&&<div className={`grid gap-4 ${pros.length>0&&cons.length>0?'md:grid-cols-2':''}`}>
    {pros.length>0&&<section className="rounded-2xl bg-verdict-good-bg/60 p-5 md:p-6"><h2 className="font-semibold text-sage-deep">{ar?'مميزات المنتج':'Product strengths'}</h2><ul className="mt-3 space-y-3 text-sm leading-7">{pros.map((text,i)=><li key={i} className="flex gap-2.5"><i aria-hidden="true" className="ti ti-check mt-1 text-lg leading-none text-sage-deep"/><span className="min-w-0">{text}</span></li>)}</ul></section>}
    {cons.length>0&&<section className="rounded-2xl bg-verdict-bad-bg/50 p-5 md:p-6"><h2 className="font-semibold text-verdict-bad-text">{ar?'ملاحظات قبل الشراء':'Before you buy'}</h2><ul className="mt-3 space-y-3 text-sm leading-7">{cons.map((text,i)=><li key={i} className="flex gap-2.5"><i aria-hidden="true" className="ti ti-alert-circle mt-1 text-lg leading-none text-terracotta"/><span className="min-w-0">{text}</span></li>)}</ul></section>}
   </div>}
   {specs.length>0&&<section className="hairline rounded-2xl p-5 md:p-6"><h2 className="mb-4 text-xl font-semibold">{ar?'مواصفات المنتج':'Product specifications'}</h2>
    {facts.length>0&&<dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{facts.map((spec,i)=><div key={i} className="min-w-0 rounded-xl bg-linen p-3.5"><dt className="break-words text-xs text-stone">{spec.key}</dt><dd className="mt-1 break-words text-sm font-medium leading-6">{spec.value}</dd></div>)}</dl>}
    {details.length>0&&<dl className={`${facts.length>0?'mt-5 ':''}space-y-5`}>{details.map((spec,i)=>{const items=splitSpecList(spec.value);return <div key={i} className="min-w-0"><dt className="break-words text-sm font-semibold">{spec.key}</dt><dd className="mt-2 min-w-0 text-sm leading-7">{items.length>1?<ul className="flex flex-wrap gap-2">{items.map((item,j)=><li key={j} className="min-w-0 break-words rounded-lg border border-beige px-3 py-1 leading-6">{item}</li>)}</ul>:spec.value}</dd></div>;})}</dl>}
    {identifiers.length>0&&<details className="group mt-5 border-t border-beige pt-4"><summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 rounded text-sm text-stone [&::-webkit-details-marker]:hidden">{ar?'معرّفات المنتج':'Product identifiers'}<i aria-hidden="true" className="ti ti-chevron-down text-base transition-transform group-open:rotate-180"/></summary><dl className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">{identifiers.map((spec,i)=><div key={i} className="flex min-w-0 justify-between gap-3 py-1.5 text-sm"><dt className="text-stone">{spec.key}</dt><dd className="min-w-0 break-words tabular-nums" dir="auto">{spec.value}</dd></div>)}</dl></details>}
   </section>}
   {description&&<details className="group hairline rounded-2xl"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 md:px-6 [&::-webkit-details-marker]:hidden"><h2 id="product-description" className="text-xl font-semibold">{ar?'عن المنتج':'About the product'}</h2><i aria-hidden="true" className="ti ti-chevron-down text-xl text-stone transition-transform group-open:rotate-180"/></summary><div lang={contentLocale} dir={contentLocale==='ar'?'rtl':'ltr'} className="max-w-[70ch] break-words px-5 pb-5 text-sm leading-8 md:px-6 md:pb-6 [&_h2]:mt-6 [&_h2]:text-lg [&_h3]:mt-5 [&_h3]:font-semibold [&_p]:my-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5 [&_a]:text-sage-deep [&_a]:underline [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-linen [&_pre]:p-3 [&_code]:[overflow-wrap:anywhere]"><Markdown skipHtml components={{img:()=>null}}>{description}</Markdown></div></details>}
  </div>
  {related.length>0&&<section aria-labelledby="related-products" className="mt-12"><h2 id="related-products" className="mb-5 text-xl font-semibold">{ar?'منتجات قد تناسبك':'You may also like'}</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">{related.map(item=><ProductCard key={item.id} product={item} locale={locale} placement="related"/>)}</div></section>}
  {best&&<div data-sticky-buy className="fixed inset-x-0 bottom-0 z-30 border-t border-beige bg-cream/95 px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden"><div className="flex items-center gap-3"><div className="min-w-0"><SarPrice amount={best.price} className="block text-lg font-semibold leading-6"/><p className="truncate text-xs text-stone">{storeName(best)}</p></div><StoreLink product={product} price={best} locale={locale} placement="mobile_sticky" label={ar?`شراء ${name} من ${storeName(best)}`:`Buy ${name} from ${storeName(best)}`} className="ms-auto flex min-h-12 shrink-0 items-center gap-1.5 rounded-lg bg-sage-deep px-5 font-medium text-cream">{ar?'اشتر الآن':'Buy now'}<i aria-hidden="true" className="ti ti-external-link text-lg"/></StoreLink></div></div>}
  <JsonLd data={{'@context':'https://schema.org','@type':'Product',name,description:getProductMetaDescription(product,locale),brand:product.brand?{'@type':'Brand',name:product.brand}:undefined,image:images.length?images:undefined,offers:prices.map(price=>({'@type':'Offer',price:price.price,priceCurrency:'SAR',url:`${siteUrl}/${locale}/products/${product.slug}`,seller:price.store?{'@type':'Organization',name:price.store.name}:undefined}))}}/>
 </main>;
}
