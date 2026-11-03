/**
 * Client-safe money formatting for the international storefront (Task 8).
 *
 * Rules encoded here:
 * - The original amount is always formatted with its own currency. A value is
 *   never converted or relabelled without its unit — the caller supplies the
 *   converted value already computed by the server (Task 6 engine), not here.
 * - The display locale is independent of the delivery destination and the
 *   currency: an Arabic reader in the US sees Arabic digits/text with USD.
 * - USD, CAD and AUD are visually distinct (US$/CA$/AU$ in Arabic; $ / CA$ /
 *   A$ in English) and the formatted string is bidi-isolated so mixed
 *   direction text cannot scramble the amount.
 */

import type { Money } from '@babiespicks/domain/international';

export type FormatLocale = 'ar' | 'en';

/** Bounded cache; NumberFormat construction is expensive on hot render paths. */
const cache = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: FormatLocale, currency: string, style: Intl.NumberFormatOptions['currencyDisplay'] | undefined): Intl.NumberFormat {
  const key = `${locale}|${currency}|${style ?? 'auto'}`;
  let found = cache.get(key);
  if (!found) {
    found = new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      style: 'currency', currency, currencyDisplay: style,
    });
    if (cache.size < 64) cache.set(key, found);
  }
  return found;
}

function formatDecimal(amount: string, locale: FormatLocale): string {
  // The decimal string stays exact: no float parse, no currency-specific digit
  // guessing. Only the locale digits come from Intl. 'ar' yields Latin digits
  // here (ar defaults to arab numbering); Arabic-context figures keep the site's
  // existing tabular-numeral style used by SarPrice.
  const [integer, fraction = ''] = amount.split('.');
  const textLocale = locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
  const group = new Intl.NumberFormat(textLocale, { useGrouping: true, maximumFractionDigits: 0 }).format(Number(integer));
  return fraction ? `${group}.${fraction}` : group;
}

/**
 * Format a Money value in the display locale. The currency always comes from
 * the value itself, never from the locale or destination. Unknown or invalid
 * currencies return null so the caller can drop the figure instead of showing
 * a mislabelled amount.
 */
export function formatMoney(value: Money | null | undefined, locale: FormatLocale): string | null {
  if (!value || typeof value.amount !== 'string' || !value.amount.trim()) return null;
  if (!/^[A-Z]{3}$/.test(value.currency)) return null;
  const amount = value.amount.trim();
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(amount)) return null;
  // USD/CAD/AUD must stay visually distinct: narrowSymbol collapses them to the
  // same glyph, so those fall back to the disambiguating code form.
  const style = value.currency === 'USD' || value.currency === 'CAD' || value.currency === 'AUD' ? 'code' : undefined;
  try {
    return numberFormat(locale, value.currency, style).format(Number(amount));
  } catch {
    try { return numberFormat(locale, value.currency, 'code').format(Number(amount)); } catch { return null; }
  }
}

/** Exact code form (e.g. "SAR 149.50" / "149.50 SAR") for alt text and analytics labels. */
export function formatMoneyWithCode(value: Money | null | undefined, locale: FormatLocale): string | null {
  if (!value) return null;
  const formatted = formatMoney(value, locale);
  if (!formatted) return null;
  // Intl keeps RTL marks around Arabic output; code stays plain.
  const plain = formatted.replace(/[\u200E\u200F\u202A-\u202E]/g, '');
  return locale === 'ar' ? `${plain} (${value.currency})` : `${plain} ${value.currency}`;
}

/** Helper for the wrapper form: a leading currency code, isolated direction. */
export function moneyParts(value: Money | null | undefined): { code: string; amount: string } | null {
  if (!value || !/^[A-Z]{3}$/.test(value.currency)) return null;
  const amount = formatDecimal(value.amount, 'en');
  if (!amount) return null;
  return { code: value.currency, amount };
}

/** Numeric display string (Latin digits, locale grouping) without any currency text. */
export function moneyAmountText(value: Money | null | undefined, locale: FormatLocale): string | null {
  if (!value || !/^[A-Z]{3}$/.test(value.currency) || !/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(value.amount)) return null;
  return formatDecimal(value.amount, locale);
}
