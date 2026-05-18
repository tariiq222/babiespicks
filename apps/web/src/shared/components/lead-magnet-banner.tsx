'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

const DISMISS_KEY = 'bp_lead_magnet_dismissed';

interface LeadMagnetBannerProps {
  /** Delay in ms before showing the banner */
  delay?: number;
  /** Scroll threshold (0–1) before showing */
  scrollThreshold?: number;
}

export function LeadMagnetBanner({
  delay = 5000,
  scrollThreshold = 0.3,
}: LeadMagnetBannerProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const t = useTranslations('newsletter');

  useEffect(() => {
    // Check if previously dismissed
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (stored) return;
    }

    let timer: ReturnType<typeof setTimeout>;
    let scrolled = false;

    const show = () => {
      if (!dismissed) setVisible(true);
    };

    timer = setTimeout(show, delay);

    const handleScroll = () => {
      if (scrolled) return;
      const scrollY = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? scrollY / docHeight : 0;
      if (progress >= scrollThreshold) {
        scrolled = true;
        clearTimeout(timer);
        show();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [delay, scrollThreshold, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setDone(true);
    setTimeout(() => {
      setVisible(false);
    }, 2000);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 px-4 pb-4 md:pb-6"
      role="complementary"
      aria-label={t('bannerTitle')}
    >
      <div
        className="mx-auto bg-charcoal text-cream rounded-2xl px-5 py-4 flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center shadow-2xl max-w-5xl"
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        {/* Content */}
        <div className="min-w-0 flex items-start sm:items-center gap-3 sm:gap-4">
          {!done ? (
            <form onSubmit={handleSubmit} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-lg" aria-hidden="true">📋</span>
                <span className="text-[13px] font-medium leading-tight hidden sm:block">
                  {t('bannerTitle')}
                </span>
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('bannerEmailPlaceholder')}
                className="bg-white/15 hairline rounded-lg px-3 py-[8px] text-[13px] outline-none text-cream placeholder:text-cream/60 w-40 sm:w-44 shrink-0"
              />
              <button
                type="submit"
                className="bg-sage text-cream rounded-lg px-4 py-[8px] text-[13px] hover:bg-sage-hover whitespace-nowrap inline-flex items-center gap-1 shrink-0"
              >
                <i className="ti ti-gift text-[13px]"></i>
                <span>{t('bannerCta')}</span>
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <i className="ti ti-check text-sage text-[18px]"></i>
              <span className="text-[13px]">{t('successTitle')}</span>
            </div>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          aria-label={t('bannerDismiss')}
          className="w-8 h-8 rounded-full bg-white/10 grid place-items-center hover:bg-white/20 transition-colors shrink-0"
        >
          <i className="ti ti-x text-cream text-[14px]"></i>
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}