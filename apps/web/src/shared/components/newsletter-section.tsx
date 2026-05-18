'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const t = useTranslations('newsletter');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE}/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          locale: document.documentElement.lang || 'ar',
        }),
      });
      const data: { success: boolean; message: string; duplicate: boolean } = await res.json();
      if (res.ok && (data.success || data.duplicate)) {
        setDone(true);
      } else {
        setSubmitError(data.message || 'حدث خطأ، حاول مرة أخرى');
      }
    } catch {
      setSubmitError('حدث خطأ، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="newsletter" className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16 scroll-mt-24">
      <div className="hairline rounded-2xl overflow-hidden grid md:grid-cols-[1fr_1.1fr]">
        {/* Visual side */}
        <div
          className="relative p-8 md:p-10 flex flex-col justify-between min-h-[300px]"
          style={{ background: 'linear-gradient(155deg, #E8EFE9 0%, #F0F3EC 55%, #FAF8F5 100%)' }}
        >
          {/* Lead magnet badge */}
          <div>
            <span className="inline-flex items-center gap-2 bg-terracotta/10 text-terracotta hairline rounded-full px-3 py-[5px] text-[11px]">
              <i className="ti ti-gift text-[13px]"></i>
              <span>{t('leadMagnetTitle')}</span>
            </span>
            <h2 className="text-[26px] md:text-[34px] text-charcoal mt-4 leading-[1.25] tracking-[-0.01em]">
              {t('title')}<br />
              <span className="text-sage-deep">{t('titleAccent')}</span>
            </h2>
            <p className="text-[13px] text-stone mt-3 leading-[1.8]">{t('leadMagnetSubtitle')}</p>
          </div>

          {/* Benefits */}
          <ul className="space-y-3 text-[13px] text-charcoal mt-6">
            <li className="flex items-center gap-2">
              <i className="ti ti-discount-2 text-sage text-[18px]"></i> {t('benefit1')}
            </li>
            <li className="flex items-center gap-2">
              <i className="ti ti-bolt text-sage text-[18px]"></i> {t('benefit2')}
            </li>
            <li className="flex items-center gap-2">
              <i className="ti ti-mail-opened text-sage text-[18px]"></i> {t('benefit3')}
            </li>
          </ul>

          {/* Subscriber social proof */}
          <div className="mt-5 flex items-center gap-2">
            <div className="flex -space-x-2 rtl:space-x-reverse">
              {['💜', '🤍', '💜', '🤍'].map((e, i) => (
                <span key={i} className="w-6 h-6 rounded-full bg-linen hairline grid place-items-center text-[10px]">{e}</span>
              ))}
            </div>
            <span className="text-[11px] text-stone">{t('subscriberCount')}</span>
          </div>
        </div>

        {/* Form side */}
        <div className="bg-cream p-8 md:p-10 flex flex-col justify-center">
          {done ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-verdict-good-bg grid place-items-center mx-auto">
                <i className="ti ti-mail-heart text-verdict-good-text text-[26px]"></i>
              </div>
              <h3 className="text-[18px] text-charcoal mt-4">{t('successTitle')}</h3>
              <p className="text-[13px] text-stone mt-2">{t('successDesc')}</p>
            </div>
          ) : (
            <>
              <p className="text-[14px] md:text-[15px] text-stone leading-[1.95] mb-5">
                {t.rich('joinText', { highlight: (chunks) => <span className="text-charcoal">{chunks}</span> })}
              </p>
              <form className="flex flex-col sm:flex-row gap-2" onSubmit={handleSubmit}>
                <div className="flex-1 bg-linen hairline rounded-lg flex items-center px-3">
                  <i className="ti ti-mail text-stone text-[16px]"></i>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    className="bg-transparent flex-1 px-3 py-[12px] text-[13px] outline-none placeholder:text-stone/70"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-sage text-cream rounded-lg px-6 py-3 text-[14px] hover:bg-sage-hover whitespace-nowrap inline-flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <i className={`ti ${loading ? 'ti-loader-2 animate-spin' : 'ti-gift'} text-[14px]`}></i>
                  <span>{loading ? '...' : t('leadMagnetDownload')}</span>
                </button>
              </form>
              {submitError && (
                <p className="text-[12px] text-red-500 mt-2">{submitError}</p>
              )}
              <p className="text-[11px] text-stone mt-3 flex items-center gap-1">
                <i className="ti ti-lock text-[12px]"></i>
                {t('privacyNote')}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}