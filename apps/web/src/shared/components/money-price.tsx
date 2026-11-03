/**
 * MoneyPrice (Task 8): renders a price with its original currency always
 * visible, and — only when the server produced a converted value through the
 * Task 6 engine — the estimate below it, with the shipping/tax basis stated.
 * The FX estimate is never presented as the original price and never written
 * back into it. A missing price renders the honest "price unavailable" line
 * instead of a synthetic 0.
 */

import type { Money, TaxBasis } from '@babiespicks/domain/international';
import { formatMoney } from '../lib/money-format';

export type MoneyPriceLocale = 'ar' | 'en';

const COPY = {
  ar: {
    unavailable: 'لا يتوفر سعر حديث',
    estimate: 'تقدير بالتقريب بالسعر المحوَّل، ليس السعر الأصلي',
    convertedFrom: 'السعر الأصلي',
    checkDelivery: 'يحتاج التحقق من التوصيل',
    taxIncluded: 'شامل الضريبة',
    taxExcluded: 'غير شامل الضريبة',
  },
  en: {
    unavailable: 'No recent price',
    estimate: 'Approximate converted estimate, not the original price',
    convertedFrom: 'Original price',
    checkDelivery: 'Delivery needs checking',
    taxIncluded: 'Tax included',
    taxExcluded: 'Tax excluded',
  },
} as const;

export interface MoneyPriceProps {
  price: Money | null | undefined;
  convertedPrice?: Money | null;
  locale: MoneyPriceLocale;
  className?: string;
  convertedClassName?: string;
  /** Tax basis of the observation, for the estimate footnote. */
  taxBasis?: TaxBasis;
  /** True when the offer's delivery to the chosen destination is unverified. */
  deliveryPending?: boolean;
  /** Show the "delivery needs checking" note for pending quotes. Default true. */
  showDeliveryNote?: boolean;
}

export function MoneyPrice({ price, convertedPrice, locale, className = '', convertedClassName = '', taxBasis, deliveryPending = false, showDeliveryNote = true }: MoneyPriceProps) {
  const copy = COPY[locale];
  const original = formatMoney(price, locale);
  const estimate = convertedPrice && convertedPrice.currency !== price?.currency ? formatMoney(convertedPrice, locale) : null;
  if (!original) {
    return <span className={`text-sm text-stone ${className}`} role="status">{copy.unavailable}</span>;
  }
  const taxNote = taxBasis === 'INCLUDED' ? copy.taxIncluded : taxBasis === 'EXCLUDED' ? copy.taxExcluded : null;
  return (
    <span className="inline-flex flex-col gap-0.5">
      <bdi dir="ltr" className={`font-variant-numeric tabular-nums ${className}`} style={{ unicodeBidi: 'isolate', whiteSpace: 'nowrap' }}>
        {original}
      </bdi>
      {estimate && (
        <bdi dir="ltr" className={`${convertedClassName || 'text-xs text-stone'}`} style={{ unicodeBidi: 'isolate', whiteSpace: 'nowrap' }}>
          ≈ {estimate}
        </bdi>
      )}
      {estimate && (
        <span className="text-[11px] leading-4 text-stone">
          {taxNote && <span>{taxNote}</span>}
          {taxNote && showDeliveryNote && deliveryPending ? ' · ' : ''}
          {showDeliveryNote && deliveryPending && <span>{copy.checkDelivery}</span>}
          {(taxNote || (showDeliveryNote && deliveryPending)) ? ' · ' : ''}{copy.estimate}
        </span>
      )}
    </span>
  );
}

/** Deprecated SAR-only wrapper kept for legacy fixtures; never use for a
 * non-SAR amount. New surfaces use MoneyPrice or formatMoney. */
export function LegacySarPriceText(amount: number): string {
  return `SAR ${amount}`;
}
