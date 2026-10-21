'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
interface Coupon { id: string; code: string; discountPercent: number | null; discountAmount: number | null; description: string | null; validUntil: string | null; store: { id: string; name: string; slug: string } }
function CopyCode({ code, ar }: { code: string; ar: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  return <div><button type="button" className="rounded-lg px-3 py-2 bg-sage text-cream text-sm" onClick={async () => { try { await navigator.clipboard.writeText(code); setState('copied'); } catch { setState('error'); } }}>{state === 'copied' ? (ar ? 'تم النسخ' : 'Copied') : (ar ? 'نسخ الكود' : 'Copy code')}</button>{state === 'error' && <p role="status" className="text-xs mt-2">{ar ? 'تعذر النسخ. يمكنك تحديد الكود ونسخه يدويًا.' : 'Copy failed. Select and copy the code manually.'}</p>}</div>;
}
export function CouponsClient({ storeSlug }: { storeSlug?: string }) {
  const locale = useLocale(); const ar = locale === 'ar'; const t = useTranslations('coupons');
  const [coupons, setCoupons] = useState<Coupon[]>([]); const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'); const [activeStore, setActiveStore] = useState('all'); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setState('loading');
      try {
        const response = await fetch(`/api/coupons${storeSlug ? `?storeSlug=${encodeURIComponent(storeSlug)}` : ''}`, { signal: controller.signal });
        if (!response.ok) throw new Error('COUPONS_UNAVAILABLE');
        const data = await response.json(); if (!Array.isArray(data)) throw new Error('INVALID_RESPONSE');
        setCoupons(data); setState('ready');
      } catch { if (!controller.signal.aborted) setState('error'); }
    }; void load(); return () => controller.abort();
  }, [storeSlug, retry]);
  const stores = [...new Map(coupons.map(c => [c.store.slug, c.store])).values()];
  const visible = activeStore === 'all' ? coupons : coupons.filter(c => c.store.slug === activeStore);
  return <div>
    {state === 'loading' && <p role="status">{ar ? 'جارٍ تحميل الكوبونات…' : 'Loading coupons…'}</p>}
    {state === 'error' && <div role="alert"><p>{ar ? 'تعذر تحميل الكوبونات.' : 'Coupons could not be loaded.'}</p><button onClick={() => setRetry(n => n + 1)} className="text-sage-deep underline mt-3">{ar ? 'إعادة المحاولة' : 'Try again'}</button></div>}
    {state === 'ready' && <>
      {!storeSlug && stores.length > 1 && <div className="flex flex-wrap gap-2 mb-6">{[{ slug: 'all', name: ar ? 'الكل' : 'All' }, ...stores].map(store => <button key={store.slug} aria-pressed={store.slug === activeStore} onClick={() => setActiveStore(store.slug)} className={`px-4 py-2 rounded-full ${store.slug === activeStore ? 'bg-sage text-cream' : 'bg-linen'}`}>{store.name}</button>)}</div>}
      {visible.length === 0 && <div role="status" className="text-center py-12"><h2 className="text-xl mb-3">{t('emptyTitle')}</h2><p className="text-stone">{t('emptyDesc')}</p></div>}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{visible.map(coupon => <article key={coupon.id} className="hairline rounded-xl p-5 space-y-4">
        <h2 className="text-lg">{coupon.store.name}</h2>
        {coupon.discountPercent !== null && <p className="text-xl text-terracotta">{coupon.discountPercent}%</p>}
        {coupon.discountAmount !== null && <p>{coupon.discountAmount} {ar ? 'ر.س' : 'SAR'}</p>}
        {coupon.description && <p className="text-sm text-stone">{coupon.description}</p>}
        <div className="flex flex-wrap justify-between items-center gap-3"><code dir="ltr" className="select-all bg-linen px-3 py-2 rounded">{coupon.code}</code><CopyCode code={coupon.code} ar={ar} /></div>
        {coupon.validUntil && <p className="text-xs text-stone">{t('expires')} {new Date(coupon.validUntil).toLocaleDateString(ar ? 'ar-SA' : 'en-GB')}</p>}
        <p className="text-xs text-stone">{ar ? 'تطبق شروط المتجر على استخدام الكود.' : 'Store conditions apply to this code.'}</p>
      </article>)}</div>
    </>}
  </div>;
}
