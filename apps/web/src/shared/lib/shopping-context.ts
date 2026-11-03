/**
 * Shopping context resolution for the international storefront (Task 8).
 *
 * One pure resolver for every surface (pages, filters, store links, analytics
 * and the URL contract):
 * - Priority: a valid explicit link choice (shipTo/currency query params), then
 *   the saved cookie preference, then neutral. Never IP/VPN geolocation: the
 *   browsing location is never read, so language, destination and currency
 *   never change because of where the visitor connects from.
 * - Language is independent: it comes from the route/locale only and is saved
 *   alongside the preference, never inferred from the destination.
 * - A budget (`maxAmount`) always travels with `budgetCurrency`; a number
 *   without its unit is rejected, never assumed to be SAR or USD.
 * - Neutral means null everywhere: no destination, no display currency and no
 *   budget. Missing/invalid cookie values and corrupt JSON fall back to neutral
 *   rather than being reinterpreted.
 */

import type { DeliveryCountry, DisplayCurrency, Money, ShoppingContext } from '@babiespicks/domain/international';
import { parseShoppingContext } from '@babiespicks/domain/international';

export const SHOPPING_PREFERENCES_COOKIE = 'bp_prefs';

const DELIVERY_COUNTRIES: readonly DeliveryCountry[] = ['SA', 'US'];
const DISPLAY_CURRENCIES: readonly DisplayCurrency[] = ['SAR', 'USD'];

export interface ShoppingContextQuery {
  shipTo?: unknown;
  currency?: unknown;
  maxAmount?: unknown;
  budgetCurrency?: unknown;
}

export interface ShoppingContextCookie {
  shipTo?: unknown;
  currency?: unknown;
  locale?: unknown;
}

/** Single-value query/text guard: arrays collapse, whitespace is trimmed. */
const one = (value: unknown): string | null => {
  if (Array.isArray(value)) value = value[0];
  return typeof value === 'string' ? value.trim() : null;
};

/** Empty URL choices and explicit cookie nulls mean clear, rather than fallback. */
const cleared = (value: unknown): boolean => value === null || one(value) === '';

/** A whole nonnegative amount, at most six decimals (Decimal(20,6) boundary). */
const amount = (value: unknown): string | null => {
  const text = one(value);
  return text !== null && /^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(text) ? text : null;
};

/** Pick the first explicitly valid choice; anything else is absent, not defaulted. */
function choice<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const text = one(value);
  return text !== null && (allowed as readonly string[]).includes(text) ? (text as T) : null;
}

/**
 * The neutral context: no destination, no display currency, no budget.
 * Missing choices must never be reinterpreted as a market default.
 */
export function neutralShoppingContext(locale: 'ar' | 'en'): ShoppingContext {
  return { locale, shipTo: null, displayCurrency: null, budget: null, audience: 'PUBLIC' };
}

export interface ResolveShoppingContextInput {
  /** Route locale. Language is independent of destination and currency. */
  locale: 'ar' | 'en';
  /** URL choices (shipTo / currency / maxAmount+budgetCurrency), if present. */
  query?: ShoppingContextQuery | null;
  /** Saved preference, if a readable cookie exists. */
  cookie?: ShoppingContextCookie | null;
}

/** The display currency falls back to the destination's own currency when the
 * visitor chose a destination explicitly but no currency — the documented
 * suggestion — and stays neutral when neither was chosen. */
function suggestedCurrency(shipTo: DeliveryCountry | null, explicit: DisplayCurrency | null, saved: DisplayCurrency | null): DisplayCurrency | null {
  return explicit ?? saved ?? (shipTo ? (shipTo === 'SA' ? 'SAR' : 'USD') : null);
}

/**
 * Resolve the effective shopping context.
 * Priority: valid link choice → saved choice → neutral. Only an explicit URL
 * choice or an explicit saved currency produces `displayCurrency` (plus the
 * destination suggestion when the visitor chose a destination but no currency);
 * a link without `budgetCurrency` never turns `maxAmount` into a budget.
 */
export function resolveShoppingContext({ locale, query, cookie }: ResolveShoppingContextInput): ShoppingContext {
  const linkShipTo = query ? choice<DeliveryCountry>(query.shipTo, DELIVERY_COUNTRIES) : null;
  const linkCurrency = query ? choice<DisplayCurrency>(query.currency, DISPLAY_CURRENCIES) : null;
  const linkAmount = query ? amount(query.maxAmount) : null;
  const linkBudgetCurrency = query ? choice<DisplayCurrency>(query.budgetCurrency, DISPLAY_CURRENCIES) : null;
  // A budget needs both number and unit. Nothing is inferred from the locale,
  // the destination or the display currency.
  const linkBudget: Money | null = linkAmount && linkBudgetCurrency ? { amount: linkAmount, currency: linkBudgetCurrency } : null;

  const savedShipTo = cookie ? choice<DeliveryCountry>(cookie.shipTo, DELIVERY_COUNTRIES) : null;
  const savedCurrency = cookie ? choice<DisplayCurrency>(cookie.currency, DISPLAY_CURRENCIES) : null;

  const shipTo = cleared(query?.shipTo) ? null : linkShipTo ?? savedShipTo;
  const displayCurrency = cleared(query?.currency) ? null : linkCurrency
    ?? (cleared(cookie?.currency) ? null : suggestedCurrency(shipTo, null, savedCurrency));
  return parseShoppingContext({
    locale,
    shipTo,
    displayCurrency,
    budget: linkBudget,
    audience: 'PUBLIC',
  });
}

/** Serialized cookie value; the preference carries choices only — never an
 * address, IP or any other identifying data. */
export function serializeShoppingPreferences(preference: { shipTo?: string | null; currency?: string | null; locale?: string | null }): string {
  const kept: Record<string, string | null> = {};
  const shipTo = choice<DeliveryCountry>(preference.shipTo, DELIVERY_COUNTRIES);
  const currency = choice<DisplayCurrency>(preference.currency, DISPLAY_CURRENCIES);
  const locale = choice(preference.locale, ['ar', 'en'] as const);
  if (shipTo) kept.shipTo = shipTo;
  if (currency) kept.currency = currency;
  if (locale) kept.locale = locale;
  if (preference.shipTo === null) kept.shipTo = null;
  if (preference.currency === null) kept.currency = null;
  return JSON.stringify(kept);
}

/**
 * Read the saved preference from the cookie header. Corrupt JSON, wrong types
 * and unknown values degrade to neutral — the resolver decides what each
 * absent choice means, so no invalid value is ever reinterpreted here.
 */
export function parseShoppingPreferences(cookieHeader: string | null | undefined): { shipTo?: 'SA' | 'US' | null; currency?: 'SAR' | 'USD' | null; locale?: 'ar' | 'en' } | null {
  if (!cookieHeader) return null;
  const raw = cookieHeader.split(/;\s*/).find((part) => part.startsWith(`${SHOPPING_PREFERENCES_COOKIE}=`));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw.slice(SHOPPING_PREFERENCES_COOKIE.length + 1)));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const shipTo = choice<DeliveryCountry>(record.shipTo, DELIVERY_COUNTRIES);
    const currency = choice<DisplayCurrency>(record.currency, DISPLAY_CURRENCIES);
    const locale = choice(record.locale, ['ar', 'en'] as const);
    if (!shipTo && !currency && !locale && record.shipTo !== null && record.currency !== null) return null;
    return { ...(shipTo ? { shipTo } : record.shipTo === null ? { shipTo: null } : {}), ...(currency ? { currency } : record.currency === null ? { currency: null } : {}), ...(locale ? { locale } : {}) };
  } catch {
    return null;
  }
}

/** Cookie attributes: choices only, no identifying data, bounded age. */
export const SHOPPING_PREFERENCES_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
export function shoppingPreferencesCookieOptions(): string {
  return `Path=/; Max-Age=${SHOPPING_PREFERENCES_MAX_AGE_SECONDS}; SameSite=Lax`;
}
