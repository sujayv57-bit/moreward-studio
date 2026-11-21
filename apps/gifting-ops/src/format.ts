import { formatInr, parseRupees } from '../shared/money.ts';
export { formatInr, parseRupees };
export const money = (p: number | null | undefined, cur = 'INR') => formatInr(p, cur);
export const pct = (bp: number | null | undefined) => (bp == null ? '—' : `${(bp / 100).toFixed(1)}%`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Unambiguous dates: "21 Nov 2026". */
export function date(d: string | null | undefined) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}
export function dateTime(d: string | null | undefined) {
  if (!d) return '—';
  const t = new Date(d);
  return `${date(t.toLocaleDateString('en-CA'))}, ${t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}
export const todayStr = () => new Date().toLocaleDateString('en-CA');
export function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
export function relDays(d: string | null | undefined) {
  if (!d) return '';
  const diff = Math.round((Date.parse(d.slice(0, 10)) - Date.parse(todayStr())) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}
export const label = (s: string | null | undefined) => (s ? (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' ') : '—');
