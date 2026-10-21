'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LogoMark } from './logo-mark';

export function SiteFooter() {
  const t = useTranslations('footer');

  return (
    <footer className="bg-linen hairline-t mt-16">
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 py-12 grid grid-cols-2 md:grid-cols-3 gap-8 text-[13px]">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <LogoMark size={36} />
            <div className="leading-tight">
              <span className="text-[15px] text-charcoal font-medium">BabiesPicks</span>
              <span className="block text-[10px] text-stone tracking-widest font-inter">BABIESPICKS</span>
            </div>
          </div>
          <p className="text-stone leading-[1.8] max-w-[260px]">
            {t('tagline')}
          </p>

        </div>
        <div>
          <div className="text-charcoal mb-3">{t('platform')}</div>
          <ul className="space-y-2 text-stone">
            <li><Link className="hover:text-charcoal" href="/">{t('offers')}</Link></li>
            <li><Link className="hover:text-charcoal" href="/about">{t('about')}</Link></li>
            <li><Link className="hover:text-charcoal" href="/coupons">{t('coupons')}</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-charcoal mb-3">{t('legal')}</div>
          <ul className="space-y-2 text-stone">
            <li><Link className="hover:text-charcoal" href="/privacy">{t('privacy')}</Link></li>
            <li><Link className="hover:text-charcoal" href="/terms">{t('terms')}</Link></li>
            <li><Link className="hover:text-charcoal" href="/disclosure">{t('disclosure')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pb-8 pt-2 hairline-t mt-2 flex flex-col md:flex-row items-center gap-2 text-[11px] text-stone">
        <span>{t('copyright')}</span>
        <span className="md:ms-auto">{t('region')}</span>
      </div>
    </footer>
  );
}
