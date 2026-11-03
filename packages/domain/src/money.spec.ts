import { describe, expect, it } from 'vitest';
import { convertMoney } from './money';
import type { FxSnapshot } from './international-contracts';

const now = new Date('2026-11-02T12:00:00Z');
const fx: FxSnapshot = { id: 'synthetic', base: 'USD', rates: { SAR: '3.75', EUR: '0.8', JPY: '150' }, sourceId: 'fixture-fx', asOf: '2026-11-02T11:00:00Z', expiresAt: '2026-11-02T13:00:00Z' };
describe('convertMoney — exact arithmetic, not source authorization', () => {
  it('uses target units per base and the inverse pair correctly', () => {
    expect(convertMoney({ amount: '40', currency: 'USD' }, 'SAR', fx, now)).toEqual({ amount: '150', currency: 'SAR' });
    expect(convertMoney({ amount: '150', currency: 'SAR' }, 'USD', fx, now)).toEqual({ amount: '40', currency: 'USD' });
  });
  it('crosses a third base in one calculation', () => {
    expect(convertMoney({ amount: '8', currency: 'EUR' }, 'SAR', fx, now)).toEqual({ amount: '37.5', currency: 'SAR' });
  });
  it('preserves small amounts and does not perform display rounding', () => {
    expect(convertMoney({ amount: '0.01', currency: 'USD' }, 'SAR', fx, now)?.amount).toBe('0.0375');
    expect(convertMoney({ amount: '0.000001', currency: 'USD' }, 'JPY', fx, now)?.amount).toBe('0.00015');
    expect(convertMoney({ amount: '1', currency: 'JPY' }, 'USD', fx, now)?.amount).toBe('0.006667');
  });
  it('does not convert null, underflow or overflow to zero', () => {
    expect(convertMoney(null, 'SAR', fx, now)).toBeNull();
    expect(convertMoney({ amount: '0.000001', currency: 'JPY' }, 'USD', fx, now)).toBeNull();
    expect(convertMoney({ amount: '99999999999999.999999', currency: 'USD' }, 'SAR', fx, now)).toBeNull();
  });
  it('keeps six-place accuracy at the Decimal(20,6) maximum', () => {
    expect(convertMoney({ amount: '99999999999999.999999', currency: 'USD' }, 'USD', fx, now)?.amount).toBe('99999999999999.999999');
  });
  it('fails closed for missing SAR, expiry and a non-unit base rate', () => {
    expect(convertMoney({ amount: '1', currency: 'USD' }, 'SAR', { ...fx, rates: { EUR: '0.8' } }, now)).toBeNull();
    expect(convertMoney({ amount: '1', currency: 'USD' }, 'SAR', { ...fx, expiresAt: now.toISOString() }, now)).toBeNull();
    expect(convertMoney({ amount: '1', currency: 'USD' }, 'SAR', { ...fx, rates: { ...fx.rates, USD: '2' } }, now)).toBeNull();
  });
  it.each(['NaN', 'Infinity', '-1', '1e3', '1.0000001'])('rejects invalid original amount %s', amount => {
    expect(convertMoney({ amount, currency: 'USD' }, 'SAR', fx, now)).toBeNull();
  });
  it('leaves original Money untouched when conversion is unavailable', () => {
    const original = Object.freeze({ amount: '100', currency: 'SAR' });
    expect(convertMoney(original, 'USD', { ...fx, expiresAt: now.toISOString() }, now)).toBeNull();
    expect(original).toEqual({ amount: '100', currency: 'SAR' });
    expect(convertMoney({ amount: 10, currency: 'USD' } as never, 'SAR', fx, now)).toBeNull();
  });
  it('rejects malformed, zero and future rates/timestamps', () => {
    for (const rates of [{ SAR: '0' }, { SAR: '-1' }, { SAR: 'NaN' }]) expect(convertMoney({ amount: '1', currency: 'USD' }, 'SAR', { ...fx, rates }, now)).toBeNull();
    expect(convertMoney({ amount: '1', currency: 'USD' }, 'SAR', { ...fx, asOf: '2026-11-03T00:00:00Z' }, now)).toBeNull();
    expect(convertMoney({ amount: '1', currency: 'USD' }, 'SAR', fx, new Date('invalid'))).toBeNull();
  });
});
