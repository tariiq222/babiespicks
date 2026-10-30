import type {Product} from '../lib/api';
import {getAmazonReviewSource,getVerdictLabel} from '../lib/product-details';
function date(value:string,locale:string){return new Intl.DateTimeFormat(locale==='ar'?'ar-SA-u-ca-gregory':'en-GB',{dateStyle:'medium',timeZone:'Asia/Riyadh'}).format(new Date(value));}
export function ProductRatings({product,locale}:{product:Product;locale:string}){
 const ar=locale==='ar';const source=getAmazonReviewSource(product.sources);const review=source&&product.reviewSummary;const verdict=product.verdict;const hasReason=!!(ar?verdict?.reasoningAr:verdict?.reasoningEn);
 return <section aria-label={ar?'تقييمات المنتج':'Product ratings'} className="mt-6 grid grid-cols-2 gap-3">
  <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
   <h2 className="text-sm font-semibold">{ar?'تقييم أمازون':'Amazon rating'}</h2>
   {review&&Number.isFinite(review.averageRating)&&review.averageRating>=0&&review.averageRating<=5&&review.totalReviews>0?<>
    <p className="mt-3 flex items-baseline gap-1" aria-label={`${review.averageRating} / 5`}><span className="text-3xl font-semibold tabular-nums">{review.averageRating.toFixed(1)}</span><span className="text-sm text-stone">/ 5</span><span aria-hidden="true" className="ms-auto text-amber-700">★</span></p>
    <p className="mt-2 text-xs text-stone">{new Intl.NumberFormat(ar?'ar-SA':'en-GB').format(review.totalReviews)} {ar?'تقييم من المتسوقين':'shopper ratings'}</p>
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs text-sage-deep underline">{ar?'المصدر: أمازون':'Source: Amazon'} ↗</a>
    <p className="mt-1 text-[11px] text-stone">{ar?'تم التحقق: ':'Checked: '}{date(source.checkedAt,locale)}</p>
   </>:<p className="mt-4 text-sm leading-6 text-stone">{ar?'لا يتوفر تقييم موثّق من أمازون حاليًا.':'A verified Amazon rating is not available yet.'}</p>}
  </div>
  <div className="rounded-2xl border border-sage/40 bg-sage/10 p-4">
   <h2 className="text-sm font-semibold">{ar?'تقييمنا في BabiesPicks':'BabiesPicks rating'}</h2>
   {verdict?<><p className="mt-3 flex flex-wrap items-baseline gap-x-1" aria-label={`${verdict.overallScore} / 10`}><span className="text-3xl font-semibold tabular-nums">{verdict.overallScore.toFixed(1)}</span><span className="text-sm text-stone">/ 10</span><span className="ms-auto text-sm font-medium text-sage-deep">{getVerdictLabel(verdict.type,locale)}</span></p><p className="mt-2 text-xs leading-6 text-stone">{ar?'تقييم تحريري مستقل عن متوسط تقييمات المتسوقين.':'An editorial assessment, separate from shopper ratings.'}</p>{hasReason&&<a href="#verdict-reasoning" className="mt-2 inline-block text-xs text-sage-deep underline">{ar?'لماذا هذا التقييم؟':'Why this rating?'}</a>}</>:<p className="mt-4 text-sm leading-6 text-stone">{ar?'لم نقيّم هذا المنتج بعد.':'We have not rated this product yet.'}</p>}
  </div>
 </section>;
}
