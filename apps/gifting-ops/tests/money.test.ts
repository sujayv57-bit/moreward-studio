import { describe, expect, it } from 'vitest';
import { formatInr, marginBp, mulBp, parseRupees, quoteTotals } from '../server/money.ts';

describe('money (integer paise, half-up rounding)', () => {
  it('applies basis points with half-up rounding', () => {
    expect(mulBp(10000, 1800)).toBe(1800);      // ₹100 × 18% = ₹18
    expect(mulBp(333, 1800)).toBe(60);          // 59.94 → 60
    expect(mulBp(25, 1800)).toBe(5);            // 4.5 → 5 (half up)
    expect(mulBp(-25, 1800)).toBe(-5);
  });
  it('computes margin in basis points', () => {
    expect(marginBp(100000, 75000)).toBe(2500);
    expect(marginBp(30000, 20000)).toBe(3333);
    expect(marginBp(0, 100)).toBeNull();
    expect(marginBp(100, 150)).toBe(-5000);
  });
  it('parses rupee strings without floating point', () => {
    expect(parseRupees('1,250.50')).toBe(125050);
    expect(parseRupees('₹0.1')).toBe(10);
    expect(parseRupees('12')).toBe(1200);
    expect(parseRupees('1.234')).toBeNull();
    expect(parseRupees('abc')).toBeNull();
  });
  it('formats with Indian grouping', () => {
    expect(formatInr(1234567890)).toBe('₹1,23,45,678.90');
    expect(formatInr(100)).toBe('₹1');
    expect(formatInr(-5050)).toBe('-₹50.50');
  });
  it('totals a quote: tax on lines + shipping, margin on pre-tax revenue', () => {
    const t = quoteTotals([{ qty: 100, unit_price_paise: 150000, unit_cost_paise: 100000 }], 500000, 1800);
    expect(t.subtotal_paise).toBe(15000000);
    expect(t.tax_paise).toBe(mulBp(15500000, 1800));
    expect(t.total_paise).toBe(15500000 + 2790000);
    expect(t.est_cost_paise).toBe(10000000);
    expect(t.margin_bp).toBe(marginBp(15500000, 10000000));
  });
});
