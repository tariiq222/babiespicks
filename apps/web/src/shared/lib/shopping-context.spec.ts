import { describe, expect, it } from 'vitest';
import {
  neutralShoppingContext, parseShoppingPreferences, resolveShoppingContext,
  serializeShoppingPreferences, shoppingPreferencesCookieOptions, SHOPPING_PREFERENCES_COOKIE,
} from './shopping-context';

const q = (input: Record<string, string>) => input;

describe('resolveShoppingContext', () => {
  it('an explicit clear overrides saved destination and currency independently', () => {
    expect(resolveShoppingContext({ locale: 'en', query: { shipTo: '', currency: '' }, cookie: { shipTo: 'US', currency: 'USD' } })).toMatchObject({ shipTo: null, displayCurrency: null });
    expect(resolveShoppingContext({ locale: 'ar', query: { currency: '' }, cookie: { shipTo: 'SA', currency: 'SAR' } })).toMatchObject({ shipTo: 'SA', displayCurrency: null });
  });

  it('saved original currency stays neutral with a destination chosen', () => {
    const saved = parseShoppingPreferences(`${SHOPPING_PREFERENCES_COOKIE}=${encodeURIComponent('{"shipTo":"SA","currency":null}')}`);
    expect(resolveShoppingContext({ locale: 'en', cookie: saved })).toMatchObject({ shipTo: 'SA', displayCurrency: null });
  });
  it('an Arabic visitor in America choosing SA keeps Arabic language with SA destination', () => {
    const context = resolveShoppingContext({ locale: 'ar', query: q({ shipTo: 'SA' }), cookie: null });
    expect(context).toMatchObject({ locale: 'ar', shipTo: 'SA', displayCurrency: 'SAR', budget: null });
  });

  it('a VPN connection changes nothing: no IP is read, neutral stays neutral', () => {
    // There is no geo input at all — the resolver signature has none.
    const context = resolveShoppingContext({ locale: 'en', query: null, cookie: null });
    expect(context).toEqual({ locale: 'en', shipTo: null, displayCurrency: null, budget: null, audience: 'PUBLIC' });
    expect(neutralShoppingContext('ar')).toEqual({ locale: 'ar', shipTo: null, displayCurrency: null, budget: null, audience: 'PUBLIC' });
  });

  it('an explicit en link stays en regardless of destination or cookie', () => {
    const context = resolveShoppingContext({ locale: 'en', query: q({ shipTo: 'US' }), cookie: { shipTo: 'SA', currency: 'SAR' } });
    expect(context.locale).toBe('en');
    expect(context.shipTo).toBe('US');
    // The link's explicit destination wins over the saved preference, and the
    // saved explicit currency is kept over the destination suggestion.
    expect(context.displayCurrency).toBe('SAR');
  });

  it('the link choice wins over the saved preference', () => {
    const context = resolveShoppingContext({ locale: 'ar', query: q({ shipTo: 'US', currency: 'SAR' }), cookie: { shipTo: 'SA', currency: 'USD' } });
    expect(context.shipTo).toBe('US');
    expect(context.displayCurrency).toBe('SAR');
  });

  it('falls back to the saved preference when the link has no choice', () => {
    const context = resolveShoppingContext({ locale: 'ar', query: {}, cookie: { shipTo: 'US', currency: 'USD' } });
    expect(context).toMatchObject({ shipTo: 'US', displayCurrency: 'USD' });
  });

  it('suggests the destination currency only when the visitor never picked one', () => {
    // Destination with no saved/explicit currency → its own currency.
    expect(resolveShoppingContext({ locale: 'ar', query: q({ shipTo: 'SA' }) }).displayCurrency).toBe('SAR');
    expect(resolveShoppingContext({ locale: 'ar', query: q({ shipTo: 'US' }) }).displayCurrency).toBe('USD');
    // Explicit currency beats the suggestion.
    expect(resolveShoppingContext({ locale: 'ar', query: q({ shipTo: 'US', currency: 'SAR' }) }).displayCurrency).toBe('SAR');
    // A saved explicit currency beats the destination suggestion.
    expect(resolveShoppingContext({ locale: 'ar', query: q({ shipTo: 'SA' }), cookie: { currency: 'USD' } }).displayCurrency).toBe('USD');
    // Saved destination also suggests.
    expect(resolveShoppingContext({ locale: 'ar', cookie: { shipTo: 'US' } }).displayCurrency).toBe('USD');
    // No destination → no suggestion, per-offer original currencies.
    expect(resolveShoppingContext({ locale: 'ar', query: q({}), cookie: {} }).displayCurrency).toBeNull();
    // A saved currency with no destination stays the display currency.
    expect(resolveShoppingContext({ locale: 'en', cookie: { currency: 'SAR' } }).displayCurrency).toBe('SAR');
  });

  it('rejects invalid link values instead of reinterpreting them', () => {
    expect(resolveShoppingContext({ locale: 'ar', query: q({ shipTo: 'AE' }) }).shipTo).toBeNull();
    expect(resolveShoppingContext({ locale: 'ar', query: q({ shipTo: 'sa' }) }).shipTo).toBeNull();
    expect(resolveShoppingContext({ locale: 'ar', query: q({ currency: 'EUR' }) }).displayCurrency).toBeNull();
    expect(resolveShoppingContext({ locale: 'ar', query: q({ shipTo: ['SA', 'US'] as unknown as string }) }).shipTo).toBe('SA');
    expect(resolveShoppingContext({ locale: 'ar', query: q({ shipTo: ' SA ' }) }).shipTo).toBe('SA');
  });

  it('a budget needs its unit: maxAmount without budgetCurrency is never a budget', () => {
    expect(resolveShoppingContext({ locale: 'ar', query: q({ maxAmount: '100' }) }).budget).toBeNull();
    expect(resolveShoppingContext({ locale: 'ar', query: q({ budgetCurrency: 'USD' }) }).budget).toBeNull();
    expect(resolveShoppingContext({ locale: 'ar', query: q({ maxAmount: '100', budgetCurrency: 'USD' }) }).budget).toEqual({ amount: '100', currency: 'USD' });
    expect(resolveShoppingContext({ locale: 'ar', query: q({ maxAmount: '100', budgetCurrency: 'SAR' }) }).budget).toEqual({ amount: '100', currency: 'SAR' });
    // Malformed numbers never become 0 or a guess.
    expect(resolveShoppingContext({ locale: 'ar', query: q({ maxAmount: 'abc', budgetCurrency: 'USD' }) }).budget).toBeNull();
    expect(resolveShoppingContext({ locale: 'ar', query: q({ maxAmount: '-5', budgetCurrency: 'USD' }) }).budget).toBeNull();
    expect(resolveShoppingContext({ locale: 'ar', query: q({ maxAmount: '100.5.5', budgetCurrency: 'USD' }) }).budget).toBeNull();
  });

  it('degrades corrupt cookie values to neutral instead of crashing', () => {
    expect(resolveShoppingContext({ locale: 'ar', cookie: { shipTo: 'ZB', currency: 'XXX' } })).toMatchObject({ shipTo: null, displayCurrency: null });
    expect(resolveShoppingContext({ locale: 'ar', cookie: { shipTo: 42 as unknown as string } })).toMatchObject({ shipTo: null });
  });
});

describe('preferences cookie', () => {
  it('serializes choices only — never an address or IP', () => {
    const stored = JSON.parse(serializeShoppingPreferences({ shipTo: 'US', currency: 'USD', locale: 'en' }));
    expect(stored).toEqual({ shipTo: 'US', currency: 'USD', locale: 'en' });
    expect(Object.keys(stored)).toEqual(['shipTo', 'currency', 'locale']);
  });

  it('round-trips through the cookie header format', () => {
    const value = serializeShoppingPreferences({ shipTo: 'SA', currency: 'SAR', locale: 'ar' });
    const header = `${SHOPPING_PREFERENCES_COOKIE}=${encodeURIComponent(value)}; other=1`;
    expect(parseShoppingPreferences(header)).toEqual({ shipTo: 'SA', currency: 'SAR', locale: 'ar' });
  });

  it('drops unknown and invalid values instead of trusting them', () => {
    expect(parseShoppingPreferences(`${SHOPPING_PREFERENCES_COOKIE}=${encodeURIComponent('{"shipTo":"AE","currency":"EUR"}')}`)).toBeNull();
    expect(parseShoppingPreferences(`${SHOPPING_PREFERENCES_COOKIE}=${encodeURIComponent('{"shipTo":42}')}`)).toBeNull();
    expect(parseShoppingPreferences(`${SHOPPING_PREFERENCES_COOKIE}=%ZZ`)).toBeNull();
    expect(parseShoppingPreferences(`${SHOPPING_PREFERENCES_COOKIE}={"broken`)).toBeNull();
    expect(parseShoppingPreferences(`${SHOPPING_PREFERENCES_COOKIE}=${encodeURIComponent('[1,2]')}`)).toBeNull();
    expect(parseShoppingPreferences(`${SHOPPING_PREFERENCES_COOKIE}=${encodeURIComponent('{}')}`)).toBeNull();
    expect(parseShoppingPreferences(null)).toBeNull();
    expect(parseShoppingPreferences('other=1')).toBeNull();
  });

  it('a partially corrupt cookie keeps its valid choices and drops the rest', () => {
    expect(parseShoppingPreferences(`${SHOPPING_PREFERENCES_COOKIE}=${encodeURIComponent('{"shipTo":"US","currency":"EUR"}')}`)).toEqual({ shipTo: 'US' });
  });

  it('cookie attributes carry no identifying data', () => {
    const options = shoppingPreferencesCookieOptions();
    expect(options).toContain('SameSite=Lax');
    expect(options).toContain('Path=/');
    expect(options).toMatch(/Max-Age=\d+/);
  });
});
