'use client';

/**
 * ShoppingPreferences (Task 8): the destination and display-currency selector.
 * It writes a small preferences cookie (choices only — no address, no IP, no
 * location) and reloads the current page with the chosen values in the URL so
 * the server re-renders in the new context. Language stays untouched: switching
 * destination/currency never switches locale, and switching language never
 * changes the saved destination or currency.
 */

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { serializeShoppingPreferences, SHOPPING_PREFERENCES_COOKIE, SHOPPING_PREFERENCES_MAX_AGE_SECONDS } from '../lib/shopping-context';
import {useShoppingContext} from './shopping-context-provider';

const COPY = {
  ar: {
    label: 'وجهة التوصيل',
    currencyLabel: 'عرض العملة',
    SA: 'السعودية',
    US: 'أمريكا',
    any: 'بدون وجهة محددة',
    SAR: 'ريال سعودي (SAR)',
    USD: 'دولار أمريكي (USD)',
    anyCurrency: 'عملة كل عرض الأصلية',
  },
  en: {
    label: 'Delivery destination',
    currencyLabel: 'Display currency',
    SA: 'Saudi Arabia',
    US: 'United States',
    any: 'No destination selected',
    SAR: 'Saudi Riyal (SAR)',
    USD: 'US Dollar (USD)',
    anyCurrency: 'Each offer’s original currency',
  },
} as const;

export function ShoppingPreferences({ compact = false }: { compact?: boolean }) {
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const copy = COPY[locale];
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const context = useShoppingContext();
  const currentShipTo = context.shipTo ?? '';
  const currentCurrency = context.displayCurrency ?? '';
  const [open, setOpen] = useState(false);

  const persist = (shipTo: string, currency: string) => {
    try {
      const stored = serializeShoppingPreferences({
        shipTo: shipTo || null,
        currency: currency || null,
        locale,
      });
      document.cookie = `${SHOPPING_PREFERENCES_COOKIE}=${encodeURIComponent(stored)}; Path=/; Max-Age=${SHOPPING_PREFERENCES_MAX_AGE_SECONDS}; SameSite=Lax`;
    } catch { /* preferences are best effort; the URL choice still applies */ }
  };

  const go = (shipTo: string, currency: string) => {
    persist(shipTo, currency);
    const params = new URLSearchParams(searchParams.toString());
    // Empty values explicitly clear saved choices and suppress automatic suggestions.
    params.set('shipTo', shipTo);
    params.set('currency', currency);
    params.delete('maxAmount');
    params.delete('budgetCurrency');
    const query = params.toString();
    window.location.href = `${pathname}${query ? `?${query}` : ''}`;
  };

  const chips: Array<{ key: string; label: string; active: boolean; onClick: () => void }> = [
    { key: '', label: copy.any, active: !currentShipTo, onClick: () => go('', currentCurrency) },
    { key: 'SA', label: copy.SA, active: currentShipTo === 'SA', onClick: () => go('SA', currentCurrency) },
    { key: 'US', label: copy.US, active: currentShipTo === 'US', onClick: () => go('US', currentCurrency) },
  ];
  const currencyChips: Array<{ key: string; label: string; active: boolean; onClick: () => void }> = [
    { key: '', label: copy.anyCurrency, active: !currentCurrency, onClick: () => go(currentShipTo, '') },
    { key: 'SAR', label: copy.SAR, active: currentCurrency === 'SAR', onClick: () => go(currentShipTo, 'SAR') },
    { key: 'USD', label: copy.USD, active: currentCurrency === 'USD', onClick: () => go(currentShipTo, 'USD') },
  ];

  if (compact) {
    return (
      <details className="relative" onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-full px-3 text-[13px] text-stone hover:bg-linen [&::-webkit-details-marker]:hidden" aria-label={copy.label}>
          <i aria-hidden="true" className="ti ti-world text-[18px]" />
          <span className="whitespace-nowrap">{currentShipTo ? copy[currentShipTo as 'SA' | 'US'] : copy.any}</span>
          <i aria-hidden="true" className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'} text-sm`} />
        </summary>
        <div className="absolute end-0 z-50 mt-2 w-72 rounded-2xl bg-white p-4 shadow-xl hairline">
          <p className="mb-2 text-xs font-semibold text-charcoal">{copy.label}</p>
          <div className="flex flex-wrap gap-2">
            {chips.map(chip => <button key={chip.key} type="button" aria-pressed={chip.active} onClick={chip.onClick} className={`min-h-9 rounded-full px-3 text-[13px] ${chip.active ? 'bg-sage-deep text-cream' : 'bg-linen text-charcoal hover:bg-linen-hover'}`}>{chip.label}</button>)}
          </div>
          <p className="mb-2 mt-4 text-xs font-semibold text-charcoal">{copy.currencyLabel}</p>
          <div className="flex flex-wrap gap-2">
            {currencyChips.map(chip => <button key={chip.key} type="button" aria-pressed={chip.active} onClick={chip.onClick} className={`min-h-9 rounded-full px-3 text-[13px] ${chip.active ? 'bg-sage-deep text-cream' : 'bg-linen text-charcoal hover:bg-linen-hover'}`}>{chip.label}</button>)}
          </div>
          <p className="mt-4 text-[11px] leading-4 text-stone">{locale === 'ar' ? 'يُحفظ اختيارك في ملف تفضيلات صغير بلا عنوان أو بيانات تعريف. لغتك مستقلة عن وجهتك.' : 'Your choice is saved in a small preferences cookie with no address or identifying data. Your language stays independent of your destination.'}</p>
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold text-charcoal">{copy.label}</p>
        <div className="flex flex-wrap gap-2">
          {chips.map(chip => <button key={chip.key} type="button" aria-pressed={chip.active} onClick={chip.onClick} className={`min-h-10 rounded-full px-4 text-sm ${chip.active ? 'bg-sage-deep text-cream' : 'bg-linen text-charcoal hover:bg-linen-hover'}`}>{chip.label}</button>)}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-charcoal">{copy.currencyLabel}</p>
        <div className="flex flex-wrap gap-2">
          {currencyChips.map(chip => <button key={chip.key} type="button" aria-pressed={chip.active} onClick={chip.onClick} className={`min-h-10 rounded-full px-4 text-sm ${chip.active ? 'bg-sage-deep text-cream' : 'bg-linen text-charcoal hover:bg-linen-hover'}`}>{chip.label}</button>)}
        </div>
      </div>
      <p className="text-[11px] leading-4 text-stone">{locale === 'ar' ? 'يُحفظ اختيارك في ملف تفضيلات صغير بلا عنوان أو بيانات تعريف. لغتك مستقلة عن وجهتك.' : 'Your choice is saved in a small preferences cookie with no address or identifying data. Your language stays independent of your destination.'}</p>
    </div>
  );
}
