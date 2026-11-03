'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { LogoMark } from './logo-mark';
import { ShoppingPreferences } from './shopping-preferences';
import {useShoppingContext} from './shopping-context-provider';

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const context = useShoppingContext();
  const contextQuery = {shipTo:context.shipTo??'',currency:context.displayCurrency??''};

  const otherLocale = locale === 'ar' ? 'en' : 'ar';

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const q = (form.elements.namedItem('q') as HTMLInputElement)?.value.trim();
    if (q) {
      setSearchOpen(false);
      router.push({pathname:'/',query:{q,...contextQuery}});
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-cream/95 backdrop-blur hairline-b">
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 h-16 flex items-center gap-5">
        {/* Logo */}
        <Link href={{pathname:'/',query:contextQuery}} className="flex items-center gap-2 shrink-0">
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
          <Link href={{pathname:'/',query:contextQuery}} className={`text-[13px] transition-colors ${pathname === '/' ? 'text-charcoal font-medium' : 'text-stone hover:text-charcoal'}`}>{t('nav.offers')}</Link>
          <Link href={{pathname:'/coupons',query:contextQuery}} className={`text-[13px] transition-colors ${pathname?.startsWith('/coupons') ? 'text-charcoal font-medium' : 'text-stone hover:text-charcoal'}`}>{t('nav.coupons')}</Link>
        </nav>

        {/* End cluster */}
        <div className="ms-auto flex items-center gap-2">
          {/* Search (lg+) */}
          <form onSubmit={handleSearch} className="hidden lg:flex items-center gap-2 bg-linen hairline rounded-full px-4 py-[7px] w-[200px]">
            <i className="ti ti-search text-stone text-[15px]"></i>
            <input
              name="q"
              className="bg-transparent flex-1 text-[12px] outline-none text-start"
              placeholder={t('header.searchPlaceholder')}
              aria-label={t('header.searchLabel')}
            />
          </form>

          {/* Search icon (mobile) */}
          <button
            type="button"
            onClick={() => { setSearchOpen((o) => !o); setOpen(false); }}
            className="lg:hidden w-11 h-11 grid place-items-center rounded-full hover:bg-linen text-stone"
            aria-label={t('header.searchAriaLabel')}
            aria-expanded={searchOpen}
          >
            <i className={`ti text-[18px] ${searchOpen ? 'ti-x' : 'ti-search'}`}></i>
          </button>

          {/* Destination and display-currency preferences (Task 8): never touches
              the language, and never infers a location from IP. */}
          <ShoppingPreferences compact />

          {/* Language toggle */}
          <Link
            href={{pathname,query:contextQuery}}
            locale={otherLocale}
            className="w-11 h-11 grid place-items-center rounded-full hover:bg-linen text-stone relative"
            aria-label={t('header.langToggleAriaLabel')}
          >
            <i className="ti ti-world text-[18px]"></i>
            <span className="absolute bottom-[3px] left-[3px] text-[8px] text-sage leading-none tracking-wider font-inter">
              {otherLocale === 'en' ? 'EN' : 'AR'}
            </span>
          </Link>


          {/* Mobile menu */}
          <button
            onClick={() => { setOpen((o) => !o); setSearchOpen(false); }}
            className="md:hidden w-11 h-11 grid place-items-center rounded-full hover:bg-linen text-stone"
            aria-label={t('header.menuAriaLabel')}
            aria-expanded={open}
          >
            <i className={`ti text-[18px] ${open ? 'ti-x' : 'ti-menu-2'}`}></i>
          </button>
        </div>
      </div>

      {/* Mobile search */}
      {searchOpen && (
        <form onSubmit={handleSearch} className="lg:hidden hairline-t bg-cream px-5 py-3 flex gap-2">
          <input
            name="q"
            type="search"
            autoFocus
            maxLength={200}
            className="min-w-0 flex-1 rounded-xl hairline bg-white px-4 py-2.5 text-base outline-none focus:border-sage"
            placeholder={t('header.searchPlaceholder')}
            aria-label={t('header.searchLabel')}
          />
          <button className="rounded-xl bg-sage-deep px-4 text-sm text-cream">{t('header.searchAriaLabel')}</button>
        </form>
      )}

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden hairline-t bg-cream px-5 py-2 flex flex-col">
          <Link href={{pathname:'/',query:contextQuery}} onClick={() => setOpen(false)} className={`py-2 text-sm ${pathname === '/' ? 'text-charcoal font-medium' : 'text-stone'}`}>{t('nav.offers')}</Link>
          <Link href={{pathname:'/coupons',query:contextQuery}} onClick={() => setOpen(false)} className={`py-2 text-sm ${pathname?.startsWith('/coupons') ? 'text-charcoal font-medium' : 'text-stone'}`}>{t('nav.coupons')}</Link>
        </div>
      )}
    </header>
  );
}
