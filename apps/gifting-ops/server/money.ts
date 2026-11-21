// Decimal-safe money. All amounts are integer paise (1 INR = 100 paise); rates are basis points (100 bp = 1%).
// Rounding rule (documented in README): percentages and divisions round HALF UP to the nearest paisa.
export const CURRENCY_DEFAULT = 'INR';

export function assertPaise(n: unknown, label = 'amount'): number {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw new Error(`${label} must be a whole number of paise`);
  return n;
}
/** (paise * bp) / 10000, rounded half up (away from zero for negatives). */
export function mulBp(paise: number, bp: number): number {
  const num = paise * bp;
  const q = Math.trunc(Math.abs(num) / 10000);
  const r = Math.abs(num) % 10000;
  const rounded = r >= 5000 ? q + 1 : q;
  return num < 0 ? -rounded : rounded;
}
/** Margin in basis points: (revenue - cost) / revenue. null when revenue is zero. */
export function marginBp(revenuePaise: number, costPaise: number): number | null {
  if (revenuePaise <= 0) return null;
  const diff = revenuePaise - costPaise;
  const q = Math.trunc(Math.abs(diff) * 10000 / revenuePaise);
  const r = (Math.abs(diff) * 10000) % revenuePaise;
  const rounded = r * 2 >= revenuePaise ? q + 1 : q;
  return diff < 0 ? -rounded : rounded;
}
/** Parse a rupee string such as "1,250.50" into paise without floating point. */
export function parseRupees(input: string): number | null {
  const s = input.trim().replace(/,/g, '').replace(/^₹/, '');
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const paise = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] ? -paise : paise;
}
export function formatInr(paise: number | null | undefined, currency = 'INR'): string {
  if (paise == null) return '—';
  const neg = paise < 0; const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100); const ps = String(abs % 100).padStart(2, '0');
  // Indian digit grouping: last 3, then groups of 2.
  const r = String(rupees);
  const grouped = r.length > 3 ? r.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + r.slice(-3) : r;
  const sym = currency === 'INR' ? '₹' : currency + ' ';
  return `${neg ? '-' : ''}${sym}${grouped}${ps === '00' ? '' : '.' + ps}`;
}
export interface LineIn { qty: number; unit_price_paise: number; unit_cost_paise?: number }
export function quoteTotals(lines: LineIn[], shippingPaise: number, taxBp: number) {
  const subtotal = lines.reduce((a, l) => a + l.qty * l.unit_price_paise, 0);
  const taxable = subtotal + shippingPaise;
  const tax = mulBp(taxable, taxBp);
  const cost = lines.reduce((a, l) => a + l.qty * (l.unit_cost_paise ?? 0), 0);
  // Margin is measured on pre-tax revenue (lines + shipping charged) against estimated cost.
  return { subtotal_paise: subtotal, tax_paise: tax, total_paise: taxable + tax, est_cost_paise: cost, margin_bp: marginBp(taxable, cost) };
}
