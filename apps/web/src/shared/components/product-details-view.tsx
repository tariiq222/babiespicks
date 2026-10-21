import Markdown from 'react-markdown';
import {Link} from '../../i18n/navigation';
import {getLocalizedDesc,getLocalizedName,getProductTranslation,type Product} from '../lib/api';
import {getProductImages,organizeProductDescription} from '../lib/product-details';
import {ProductGallery} from './product-gallery';
import {ProductRatings} from './product-ratings';
import {SarPrice} from './sar-price';
import {JsonLd} from './json-ld';
export function ProductDetailsView({product,locale}:{product:Product;locale:string}){
 const ar=locale==='ar';const name=getLocalizedName(product,locale);const images=getProductImages(product);
 const description=organizeProductDescription(getLocalizedDesc(product,locale));
 const introduction=description.split(/\n\s*\n/).find(block=>block.trim()&&!block.trim().startsWith('#'))??'';
 const contentLocale=getProductTranslation(product,locale)?.locale??locale;
 const prices=[...product.prices].sort((a,b)=>a.price-b.price);
 const specs=product.specs.filter(spec=>spec.locale===locale&&!/^(رابط (?:أمازون|الشراء)|amazon (?:url|link)|purchase (?:url|link))$/i.test(spec.key.trim()));
 const review=product.reviewSummary;const pros=(ar?review?.prosAr:review?.prosEn)??[];const cons=(ar?review?.consAr:review?.consEn)??[];
 const verdict=product.verdict;const reasoning=ar?verdict?.reasoningAr:verdict?.reasoningEn;const conditions=(ar?verdict?.conditionsAr:verdict?.conditionsEn)??[];
 const sources=(product.sources??[]).filter(source=>source.field==='verdict');
 return <main className="mx-auto max-w-6xl px-5 py-8 md:py-12">
  <Link href="/" className="text-sm text-sage-deep underline underline-offset-4">{ar?'كل العروض':'All offers'}</Link>
  <div className="mt-7 grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-12">
   <div className="min-w-0"><ProductGallery images={images} name={name} locale={locale}/></div>
   <div className="min-w-0">
    {product.brand&&<p className="mb-2 text-sm font-medium text-stone" dir="auto">{product.brand}</p>}
    <h1 className="text-2xl font-semibold leading-relaxed md:text-3xl" lang={contentLocale} dir={contentLocale==='ar'?'rtl':'ltr'}>{name}</h1>
    {introduction&&<div lang={contentLocale} dir={contentLocale==='ar'?'rtl':'ltr'} className="mt-4 line-clamp-3 text-sm leading-7 text-stone"><Markdown skipHtml allowedElements={['p','strong','em']} unwrapDisallowed>{introduction}</Markdown></div>}
    <ProductRatings product={product} locale={locale}/>
    <section className="mt-6 rounded-2xl bg-linen p-5" aria-labelledby="product-prices">
     <h2 id="product-prices" className="mb-4 text-lg font-semibold">{ar?'الأسعار المتاحة':'Available prices'}</h2>
     {!prices.length?<p role="status" className="text-sm leading-7 text-stone">{ar?'لا يتوفر سعر حديث لهذا المنتج حاليًا.':'No recent price is available for this product.'}</p>:<div className="space-y-3">{prices.map(price=><a key={price.storeId} href={`/go/${product.id}/${price.storeId}`} target="_blank" rel="sponsored noopener noreferrer" className="flex flex-wrap items-center gap-3 rounded-xl border border-beige bg-white p-4 transition-colors hover:border-sage focus-visible:outline-2 focus-visible:outline-sage-deep"><span className="text-sm">{price.store?.name||(ar?'المتجر':'Store')}</span><SarPrice amount={price.price} className="ms-auto text-lg"/><span className="rounded-lg bg-sage-deep px-3 py-2 text-xs text-white">{ar?'إلى المتجر':'Visit store'} ↗</span></a>)}</div>}
     <p className="mt-4 text-xs leading-6 text-stone">{ar?'قد يتغير السعر والتوفر. تأكدي من السعر والشحن في المتجر قبل الشراء. قد نحصل على عمولة دون تكلفة إضافية عليك.':'Price and availability may change. Check the price and shipping at the store before buying. We may earn a commission at no extra cost to you.'}</p>
    </section>
   </div>
  </div>
  <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
   <div className="min-w-0 space-y-8">
    {description&&<section aria-labelledby="product-description"><h2 id="product-description" className="mb-4 text-xl font-semibold">{ar?'عن المنتج':'About the product'}</h2><div lang={contentLocale} dir={contentLocale==='ar'?'rtl':'ltr'} className="break-words text-sm leading-8 [&_h2]:mt-6 [&_h2]:text-lg [&_h3]:mt-5 [&_h3]:font-semibold [&_p]:my-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5 [&_a]:text-sage-deep [&_a]:underline [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-linen [&_pre]:p-3 [&_code]:[overflow-wrap:anywhere]"><Markdown skipHtml components={{img:()=>null}}>{description}</Markdown></div></section>}
    {reasoning&&<section className="rounded-2xl border border-sage/30 bg-sage/5 p-6"><h2 className="text-xl font-semibold">{ar?'لماذا هذا التقييم؟':'Why this rating?'}</h2><p className="mt-3 whitespace-pre-line text-sm leading-8">{reasoning}</p>{conditions.length>0&&<><h3 className="mt-4 text-sm font-semibold">{ar?'يناسبك إذا':'A good fit if'}</h3><ul className="mt-2 list-disc space-y-2 ps-5 text-sm leading-7">{conditions.map((text,i)=><li key={i}>{text}</li>)}</ul></>}{sources.length>0&&<div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-sage/20 pt-4">{sources.map((source,i)=><a key={i} href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-sage-deep underline">{new URL(source.url).hostname} ↗</a>)}</div>}</section>}
   </div>
   <div className="min-w-0 space-y-6">
    {(pros.length>0||cons.length>0)&&<section className="hairline rounded-2xl p-6">{pros.length>0&&<><h2 className="font-semibold text-sage-deep">{ar?'مميزات المنتج':'Product strengths'}</h2><ul className="mt-3 list-disc space-y-2 ps-5 text-sm leading-7">{pros.map((text,i)=><li key={i}>{text}</li>)}</ul></>}{cons.length>0&&<><h2 className={`${pros.length?'mt-6 ':''}font-semibold text-terracotta`}>{ar?'ملاحظات قبل الشراء':'Before you buy'}</h2><ul className="mt-3 list-disc space-y-2 ps-5 text-sm leading-7">{cons.map((text,i)=><li key={i}>{text}</li>)}</ul></>}</section>}
    {specs.length>0&&<section className="hairline rounded-2xl p-6"><h2 className="mb-4 font-semibold">{ar?'مواصفات المنتج':'Product specifications'}</h2><dl className="divide-y divide-beige">{specs.map((spec,i)=><div key={i} className="grid grid-cols-2 gap-3 py-3 text-sm leading-7"><dt className="min-w-0 break-words text-stone">{spec.key}</dt><dd className="min-w-0 break-words">{spec.value}</dd></div>)}</dl></section>}
   </div>
  </div>
  <JsonLd data={{'@context':'https://schema.org','@type':'Product',name,image:images.length?images:undefined,offers:prices.map(price=>({'@type':'Offer',price:price.price,priceCurrency:'SAR',url:`${process.env.NEXT_PUBLIC_SITE_URL||'https://babiespicks.com'}/go/${product.id}/${price.storeId}`}))}}/>
 </main>;
}
