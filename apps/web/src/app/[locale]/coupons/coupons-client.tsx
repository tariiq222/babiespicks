'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { trackEvent } from '@/shared/lib/analytics';
import { couponDaysLeft, couponIsOncePerCustomer, couponMinimumFromScope, couponMinimumLabel, parseCouponDescription, couponPresentation, couponRequestPath } from '@/shared/lib/coupons';
import type { CouponScope } from '@babiespicks/domain';
import { Tag } from '@/shared/components/tags';
import {useShoppingContext} from '@/shared/components/shopping-context-provider';
import {contextParams} from '@/shared/lib/offer-view';
interface Coupon {
  id: string; code: string | null; expired?: boolean; verified?: boolean;
  discountPercent: number | null; discountAmount: number | null;
  /** The currency of discountAmount. Null means the stored amount has no currency yet. */
  discountCurrency?: string | null;
  /** The structured minimum with its own currency. */
  minimumSpend?: { amount: string; currency: string } | null;
  description: string | null; validUntil: string | null;
  reviewRequired?: boolean;
  visibility?: string;
  store: { id: string; name: string; slug: string };
}
function CopyCode({ code, ar, store }: { code: string; ar: boolean; store: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  return <div><button type="button" className="min-h-10 shrink-0 rounded-lg bg-sage-deep px-4 text-sm font-medium text-cream" onClick={async () => { try { await navigator.clipboard.writeText(code); setState('copied'); trackEvent('coupon_copy', { store_name: store }); } catch { setState('error'); } }}>{state === 'copied' ? (ar ? 'تم النسخ' : 'Copied') : (ar ? 'نسخ الكود' : 'Copy code')}</button>{state === 'error' && <p role="status" className="text-xs mt-2">{ar ? 'تعذر النسخ. يمكنك تحديد الكود ونسخه يدويًا.' : 'Copy failed. Select and copy the code manually.'}</p>}</div>;
}
export function CouponsClient({ storeSlug }: { storeSlug?: string }) {
  const context = useShoppingContext();
  const shipTo = context.shipTo;
  const locale = useLocale(); const ar = locale === 'ar'; const t = useTranslations('coupons');
  const [coupons, setCoupons] = useState<Coupon[]>([]); const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'); const [activeStore, setActiveStore] = useState('all'); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setState('loading');
      try {
        const response = await fetch(couponRequestPath(storeSlug, shipTo), { signal: controller.signal });
        if (!response.ok) throw new Error('COUPONS_UNAVAILABLE');
        const data = await response.json(); if (!Array.isArray(data)) throw new Error('INVALID_RESPONSE');
        setCoupons(data); setState('ready');
      } catch { if (!controller.signal.aborted) setState('error'); }
    }; void load(); return () => controller.abort();
  }, [storeSlug, retry, shipTo]);
  const stores = [...new Map(coupons.map(c => [c.store.slug, c.store])).values()];
  const visible = activeStore === 'all' ? coupons : coupons.filter(c => c.store.slug === activeStore);
  return <div>
    {!shipTo && <p role="status" className="mb-4 text-sm text-stone">{ar ? 'اختاري وجهة التوصيل لعرض أكواد الكوبونات المتاحة لها.' : 'Choose a delivery destination to see eligible coupon codes.'}</p>}
    {state === 'loading' && <p role="status">{ar ? 'جارٍ تحميل الكوبونات…' : 'Loading coupons…'}</p>}
    {state === 'error' && <div role="alert"><p>{ar ? 'تعذر تحميل الكوبونات.' : 'Coupons could not be loaded.'}</p><button onClick={() => setRetry(n => n + 1)} className="text-sage-deep underline mt-3">{ar ? 'إعادة المحاولة' : 'Try again'}</button></div>}
    {state === 'ready' && <>
      {!storeSlug && stores.length > 1 && <div className="flex flex-wrap gap-2 mb-6">{[{ slug: 'all', name: ar ? 'الكل' : 'All' }, ...stores].map(store => <button key={store.slug} aria-pressed={store.slug === activeStore} onClick={() => setActiveStore(store.slug)} className={`px-4 py-2 rounded-full ${store.slug === activeStore ? 'bg-sage-deep text-cream' : 'bg-linen'}`}>{store.name}</button>)}</div>}
      {visible.length === 0 && <div role="status" className="text-center py-12"><h2 className="text-xl mb-3">{t('emptyTitle')}</h2><p className="text-stone">{t('emptyDesc')}</p><Link href={{pathname:'/',query:contextParams(context.shipTo,context.displayCurrency)}} className="inline-block mt-5 rounded-lg bg-sage-deep px-5 py-3 text-sm text-cream">{ar ? 'تصفحي العروض والأسعار' : 'Browse offers and prices'}</Link></div>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{visible.map(coupon => {
        const details = parseCouponDescription(coupon.description);
        const date = (value: string) => new Intl.DateTimeFormat(ar ? 'ar-SA-u-ca-gregory' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Riyadh' }).format(new Date(value));
        const daysLeft = couponDaysLeft(coupon.validUntil);
        const {ended, code, notice} = couponPresentation(coupon);
        // The money condition comes from structured fields only; a note is never parsed for it.
        const minimum = couponMinimumLabel(couponMinimumFromScope({ minimumSpend: coupon.minimumSpend ?? null } as Pick<CouponScope, 'minimumSpend'>));
        // The amount is only shown with the currency it was written in. A legacy amount without
        // one stays unlabelled rather than being presented as SAR.
        const amount = coupon.discountAmount !== null && coupon.discountCurrency ? { value: coupon.discountAmount, currency: coupon.discountCurrency } : null;
        // An unverified or unstated money claim is explained in words, never rendered as a figure.
        return <article key={coupon.id} aria-label={ended ? (ar ? `عرض منتهٍ من ${coupon.store.name}` : `Ended offer from ${coupon.store.name}`) : undefined} className={`flex min-w-0 flex-col rounded-2xl p-5 ${ended ? 'bg-tag-muted-bg text-tag-muted-text' : 'hairline bg-white'}`}>
          <div className="flex items-center justify-between gap-3"><h2 className={`min-w-0 truncate text-sm font-medium ${ended ? '' : 'text-stone'}`}>{coupon.store.name}</h2>{ended ? <Tag tone="muted" icon="ti-clock-off">{ar ? 'انتهى العرض' : 'Offer ended'}</Tag> : coupon.verified ? <Tag tone="verified" icon="ti-rosette-discount-check">{ar ? 'تم التحقق' : 'Verified'}</Tag> : null}</div>
          {coupon.discountPercent !== null && <p className={`mt-2 text-3xl font-semibold ${ended ? 'line-through decoration-1' : 'text-terracotta'}`}><bdi dir="ltr">{coupon.discountPercent}%</bdi></p>}
          {amount && <p className={`mt-2 text-3xl font-semibold ${ended ? 'line-through decoration-1' : 'text-terracotta'}`}><bdi dir="ltr">{amount.value} {amount.currency}</bdi></p>}
          {details.summary && <p className="mt-2 break-words text-sm leading-6" dir="auto">{details.summary}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {coupon.validUntil && (ended ? <Tag tone="muted" icon="ti-calendar">{ar ? 'انتهى ' : 'Ended '}{date(coupon.validUntil)}</Tag> : <Tag tone={daysLeft !== null && daysLeft <= 3 ? 'urgent' : 'time'} icon="ti-calendar">{t('expires')} {date(coupon.validUntil)}</Tag>)}
            {!ended && daysLeft !== null && daysLeft <= 7 && <Tag tone="urgent" icon="ti-hourglass">{ar ? (daysLeft === 1 ? 'آخر يوم' : `باقي ${daysLeft} أيام`) : (daysLeft === 1 ? 'Last day' : `${daysLeft} days left`)}</Tag>}
            {minimum && <Tag tone={ended ? 'muted' : 'info'} icon="ti-shopping-cart">{ar ? `حد أدنى ${minimum}` : `Min. spend ${minimum}`}</Tag>}
            {couponIsOncePerCustomer(details.terms) && <Tag tone={ended ? 'muted' : 'info'} icon="ti-user-check">{ar ? 'مرة لكل عميلة' : 'Once per customer'}</Tag>}
          </div>
          {code && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-dashed border-sage bg-linen p-2 ps-3"><code dir="ltr" className="min-w-0 select-all truncate text-sm font-semibold tracking-wide">{code}</code><CopyCode code={code} ar={ar} store={coupon.store.name} /></div>}
          {notice && <p className="mt-3 text-xs leading-5 text-stone">{notice === 'destination' ? (ar ? 'اختاري وجهة التوصيل للتحقق من أهلية هذا الكوبون.' : 'Choose a delivery destination to check this coupon’s eligibility.') : notice === 'ineligible' ? (ar ? 'هذا الكوبون غير متاح لوجهة التوصيل المختارة.' : 'This coupon is not available for the selected delivery destination.') : notice === 'review' ? (ar ? 'هذا الكوبون يحتاج إلى مراجعة قبل إتاحة رمزه.' : 'This coupon needs review before its code can be shown.') : (ar ? 'رمز هذا الكوبون غير متاح حاليًا لعدم اكتمال التحقق.' : 'This coupon’s code is currently unavailable because verification is incomplete.')}</p>}
          {!ended && <details className="group mt-3"><summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded text-xs text-stone [&::-webkit-details-marker]:hidden">{ar ? 'الشروط والمصدر' : 'Terms and source'}<i aria-hidden="true" className="ti ti-chevron-down text-sm transition-transform group-open:rotate-180" /></summary>
            <div className="space-y-2 pt-1 text-xs leading-5 text-stone">
              {details.terms.length > 0 && <ul className="list-disc space-y-1 ps-4">{details.terms.map((term, index) => <li key={index} dir="auto">{term}</li>)}</ul>}
              {details.period && <p>{ar ? 'الفترة: ' : 'Period: '}{details.period}</p>}
              <p>{ar ? 'تطبق شروط المتجر على استخدام الكود.' : 'Store conditions apply to this code.'}</p>
              {details.sourceUrl && <p><a href={details.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sage-deep underline underline-offset-2">{ar ? 'صفحة العرض في المتجر' : 'Offer page at the store'}<i aria-hidden="true" className="ti ti-external-link text-sm" /></a>{details.checkedAt && <span>{ar ? ' · تم التحقق ' : ' · Checked '}{date(details.checkedAt)}</span>}</p>}
            </div>
          </details>}
        </article>;
      })}</div>
    </>}
  </div>;
}
