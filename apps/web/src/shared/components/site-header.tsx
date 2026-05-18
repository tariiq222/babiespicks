'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { LogoMark } from './logo-mark';

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const otherLocale = locale === 'ar' ? 'en' : 'ar';

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const q = (form.elements.namedItem('q') as HTMLInputElement)?.value;
    if (q && q.length >= 2) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-cream/95 backdrop-blur hairline-b">
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 h-16 flex items-center gap-5">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <LogoMark size={36} />
          {locale === 'ar' ? (
            <div className="leading-tight text-right">
              <div className="text-[14px] text-charcoal">{t('header.logoAr')}</div>
            </div>
          ) : (
            <div className="leading-tight text-right">
              <div className="text-[11px] text-stone tracking-wider font-inter">BABIESPICKS</div>
            </div>
          )}
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-5 me-1">
          <Link href="/" className="text-[13px] text-charcoal transition-colors">{t('nav.home')}</Link>
          <Link href="/categories" className="text-[13px] text-stone hover:text-charcoal transition-colors">{t('nav.categories')}</Link>
          <Link href="/best" className="text-[13px] text-stone hover:text-charcoal transition-colors">{t('nav.bestLists')}</Link>
          <Link href="/about" className="text-[13px] text-stone hover:text-charcoal transition-colors">{t('nav.howWeReview')}</Link>
        </nav>

        {/* End cluster */}
        <div className="ms-auto flex items-center gap-2">
          {/* Search (lg+) */}
          <form onSubmit={handleSearch} className="hidden lg:flex items-center gap-2 bg-linen hairline rounded-full px-4 py-[7px] w-[200px]">
            <i className="ti ti-search text-stone text-[15px]"></i>
            <input
              name="q"
              className="bg-transparent flex-1 text-[12px] outline-none text-right"
              placeholder={t('header.searchPlaceholder')}
              aria-label={t('header.searchLabel')}
            />
          </form>

          {/* Search icon (mobile) */}
          <Link href="/search" className="lg:hidden w-10 h-10 grid place-items-center rounded-full hover:bg-linen text-stone" aria-label={t('header.searchAriaLabel')}>
            <i className="ti ti-search text-[18px]"></i>
          </Link>

          {/* Language toggle */}
          <Link
            href={pathname}
            locale={otherLocale}
            className="w-10 h-10 grid place-items-center rounded-full hover:bg-linen text-stone relative"
            aria-label={t('header.langToggleAriaLabel')}
          >
            <i className="ti ti-world text-[18px]"></i>
            <span className="absolute bottom-[3px] left-[3px] text-[8px] text-sage leading-none tracking-wider font-inter">
              {otherLocale === 'en' ? 'EN' : 'AR'}
            </span>
          </Link>

          {/* Newsletter CTA — bold with terracotta pulse indicator */}
          <Link
            href="#newsletter"
            className="hidden sm:inline-flex items-center gap-2 bg-sage text-cream rounded-full px-5 py-[9px] text-[12.5px] hover:bg-sage-hover relative overflow-hidden group"
          >
            <span className="absolute top-[7px] right-[7px] w-2 h-2 rounded-full bg-terracotta ring-2 ring-cream animate-pulse"></span>
            <i className="ti ti-sparkles text-[14px]"></i>
            <span className="font-medium">{t('header.newsletter')}</span>
          </Link>

          {/* Mobile menu */}
          <button
            onClick={() => setOpen((o) => !o)}
            className="md:hidden w-10 h-10 grid place-items-center rounded-full hover:bg-linen text-stone"
            aria-label={t('header.menuAriaLabel')}
          >
            <i className={`ti text-[18px] ${open ? 'ti-x' : 'ti-menu-2'}`}></i>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden hairline-t bg-cream px-5 py-3 flex flex-col gap-3">
          <Link href="/" onClick={() => setOpen(false)} className="text-[13px] text-charcoal">{t('nav.home')}</Link>
          <Link href="/categories" onClick={() => setOpen(false)} className="text-[13px] text-stone">{t('nav.categories')}</Link>
          <Link href="/best" onClick={() => setOpen(false)} className="text-[13px] text-stone">{t('nav.bestLists')}</Link>
          <Link href="/about" onClick={() => setOpen(false)} className="text-[13px] text-stone">{t('nav.howWeReview')}</Link>
          <Link
            href="#newsletter"
            onClick={() => setOpen(false)}
            className="mt-1 bg-sage text-cream rounded-lg px-4 py-2 text-[13px] flex items-center justify-center gap-2"
          >
            <i className="ti ti-sparkles text-[14px]"></i>
            <span>{t('header.newsletterMobile')}</span>
          </Link>
        </div>
      )}
    </header>
  );
}