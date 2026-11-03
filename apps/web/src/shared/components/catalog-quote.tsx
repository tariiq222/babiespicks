import {getLocalizedName,type OfferQuoteView,type Product} from '../lib/api';
import {purchasePathForQuote,quoteNeedsDeliveryCheck} from '../lib/offer-view';
import {MoneyPrice} from './money-price';
import {Tag} from './tags';

export function CatalogQuotePrice({quote,locale,className=''}:{quote:OfferQuoteView;locale:string;className?:string}){
 const ar=locale==='ar';
 const discounted=quote.discountPercent!==null&&Number(quote.discountPercent)>0;
 return <div className="space-y-1">
  <MoneyPrice price={quote.price} convertedPrice={quote.fxSnapshotId?quote.convertedPrice:null} locale={ar?'ar':'en'} taxBasis={quote.taxBasis} showDeliveryNote={false} className={className}/>
  {discounted&&quote.originalPrice&&<div className="flex flex-wrap items-center gap-2"><s className="text-xs text-stone"><MoneyPrice price={quote.originalPrice} locale={ar?'ar':'en'}/></s><Tag tone="deal"><bdi dir="ltr">−{quote.discountPercent}%</bdi></Tag></div>}
  {quoteNeedsDeliveryCheck(quote)&&<p className="text-xs leading-5 text-stone">{ar?'يحتاج التحقق من التوصيل':'Delivery needs checking'}</p>}
  <p className="text-xs text-stone">{quote.taxBasis==='INCLUDED'?(ar?'شامل الضريبة':'Tax included'):quote.taxBasis==='EXCLUDED'?(ar?'غير شامل الضريبة':'Tax excluded'):(ar?'المعاملة الضريبية غير معروفة':'Tax basis unknown')}</p>
 </div>;
}

export function CatalogQuoteLink({quote,product,locale,shipTo,placement,className='',children}:{quote:OfferQuoteView;product:Product;locale:string;shipTo?:'SA'|'US'|null;placement:string;className?:string;children:React.ReactNode}){
 const path=purchasePathForQuote(quote);
 if(!path)return <p className="mt-3 text-xs leading-5 text-stone">{locale==='ar'?'رابط الشراء غير متاح لهذا العرض حاليًا. تحقّقي من التوصيل والشروط لدى المتجر.':'A purchase link is not available for this offer yet. Delivery and terms need checking at the store.'}</p>;
 const name=getLocalizedName(product,locale),store=quote.store?.name??quote.marketplaceCode;
 return <a href={path} target="_blank" rel="sponsored noopener noreferrer" aria-label={locale==='ar'?`عرض ${name} في ${store}`:`View ${name} at ${store}`} className={className} data-store-link data-product-id={product.id} data-store-name={quote.store?.name} data-price={quote.price?.amount} data-currency={quote.price?.currency} data-ship-to={shipTo??''} data-marketplace={quote.marketplaceCode} data-placement={placement}>{children}</a>;
}
