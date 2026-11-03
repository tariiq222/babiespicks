import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyWithCode, moneyAmountText, moneyParts } from './money-format';

describe('formatMoney', () => {
  it('formats the original currency with its own unit, locale-independent of destination', () => {
    expect(formatMoney({ amount: '149.5', currency: 'SAR' }, 'ar')).toContain('ر.س');
    expect(formatMoney({ amount: '149.5', currency: 'SAR' }, 'en')).toContain('SAR');
    expect(formatMoney({ amount: '20', currency: 'USD' }, 'en')).toContain('USD');
    expect(formatMoney({ amount: '20', currency: 'USD' }, 'ar')).toContain('USD');
  });

  it('keeps USD, CAD and AUD visually distinct', () => {
    const en = (currency: string) => formatMoney({ amount: '20', currency }, 'en');
    const ar = (currency: string) => formatMoney({ amount: '20', currency }, 'ar');
    expect(en('USD')).not.toBe(en('CAD'));
    expect(en('CAD')).not.toBe(en('AUD'));
    expect(en('USD')).not.toBe(en('AUD'));
    expect(ar('USD')).not.toBe(ar('CAD'));
    expect(ar('CAD')).not.toBe(ar('AUD'));
    // The English forms still carry the distinguishing letters.
    expect(en('CAD')).toContain('CA');
    expect(en('AUD')).toContain('AU');
  });

  it('rejects values without a unit instead of guessing SAR', () => {
    expect(formatMoney(null, 'ar')).toBeNull();
    expect(formatMoney(undefined, 'ar')).toBeNull();
    expect(formatMoney({ amount: '20', currency: '' }, 'ar')).toBeNull();
    expect(formatMoney({ amount: '20', currency: 'usd' }, 'ar')).toBeNull();
    // Malformed amounts never render as a plausible price.
    expect(formatMoney({ amount: 'abc', currency: 'SAR' }, 'ar')).toBeNull();
    expect(formatMoney({ amount: '', currency: 'SAR' }, 'ar')).toBeNull();
    expect(formatMoney({ amount: '-5', currency: 'SAR' }, 'ar')).toBeNull();
  });

  it('renders Arabic output with Latin digits and bidi isolation support', () => {
    const text = formatMoney({ amount: '149.5', currency: 'SAR' }, 'ar')!;
    expect(text).toContain('149.50');
    expect(text).not.toContain('١٤٩');
  });

  it('never converts: a USD value formats as USD even for an Arabic reader', () => {
    expect(formatMoney({ amount: '20', currency: 'USD' }, 'ar')).toContain('USD');
    expect(formatMoney({ amount: '20', currency: 'USD' }, 'ar')).not.toContain('ر.س');
  });
});

describe('formatMoneyWithCode and helpers', () => {
  it('exposes the code form for labels and alt text', () => {
    expect(formatMoneyWithCode({ amount: '149.5', currency: 'SAR' }, 'en')).toContain('SAR');
    expect(formatMoneyWithCode({ amount: '149.5', currency: 'SAR' }, 'ar')).toContain('SAR');
    expect(formatMoneyWithCode(null, 'en')).toBeNull();
  });
  it('splits code and amount for wrapper rendering', () => {
    expect(moneyParts({ amount: '149.5', currency: 'SAR' })).toEqual({ code: 'SAR', amount: '149.5' });
    expect(moneyParts({ amount: '20', currency: 'USD' })).toEqual({ code: 'USD', amount: '20' });
    // moneyParts is purely structural (ISO-3 code + decimal string); marketplace
    // approval is enforced by the contracts layer, not the formatter.
    expect(moneyParts({ amount: '1', currency: 'JPY' })).toEqual({ code: 'JPY', amount: '1' });
    expect(moneyParts(null)).toBeNull();
  });
  it('returns locale-grouped numerals without currency text', () => {
    expect(moneyAmountText({ amount: '1234567.89', currency: 'SAR' }, 'en')).toBe('1,234,567.89');
    expect(moneyAmountText({ amount: '149.5', currency: 'SAR' }, 'ar')).toBe('149.5');
    expect(moneyAmountText({ amount: 'x', currency: 'SAR' }, 'en')).toBeNull();
  });
});
