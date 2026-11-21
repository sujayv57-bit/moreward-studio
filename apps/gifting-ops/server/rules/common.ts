import type { Request } from 'express';
import type { Ctx } from '../context.ts';
import { many, one, insert, run } from '../db.ts';

export function pageParams(req: Request) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 25));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}
export const qstr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Normalise a business name for duplicate detection: lowercase, drop punctuation and legal suffixes. */
export function normName(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(private|pvt|limited|ltd|llp|inc|co|company|corporation|corp|india|enterprises|the)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
export const normPhone = (s: string | null | undefined) => { const d = (s ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : d || null; };
export const normEmail = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : null);

/** Keep a single open follow-up task per record; moving the date updates it instead of piling up tasks. */
export function upsertFollowUp(ctx: Ctx, entityType: string, entityId: number, ownerId: number, date: string | null, title: string, createdBy: number) {
  const existing = one<{ id: number }>(ctx.db, "SELECT id FROM tasks WHERE entity_type=? AND entity_id=? AND kind='follow_up' AND status='open'", entityType, entityId);
  if (!date) {
    if (existing) run(ctx.db, "UPDATE tasks SET status='cancelled', completed_at=? WHERE id=?", ctx.now(), existing.id);
    return null;
  }
  if (existing) { run(ctx.db, 'UPDATE tasks SET due_at=?, owner_id=?, title=? WHERE id=?', date, ownerId, title, existing.id); return existing.id; }
  return insert(ctx.db, 'tasks', { title, owner_id: ownerId, due_at: date, kind: 'follow_up', entity_type: entityType, entity_id: entityId, created_by: createdBy, created_at: ctx.now() });
}
export function userName(ctx: Ctx, id: number | null | undefined): string | null {
  if (!id) return null;
  return one<{ name: string }>(ctx.db, 'SELECT name FROM users WHERE id=?', id)?.name ?? null;
}
export function activitiesFor(ctx: Ctx, pairs: [string, number | null | undefined][]) {
  const conds = pairs.filter(([, id]) => id).map(() => '(a.entity_type=? AND a.entity_id=?)');
  if (!conds.length) return [];
  return many(ctx.db, `SELECT a.*, u.name by_name FROM activities a JOIN users u ON u.id=a.by_user WHERE ${conds.join(' OR ')} ORDER BY a.at DESC`, ...pairs.filter(([, id]) => id).flat());
}
export function csv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  // Spreadsheet formula injection guard: prefix cells that start with = + - @ (and tab/CR).
  const cell = (v: unknown) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // plain negative numbers stay numeric
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(','))].join('\r\n') + '\r\n';
}
/** Paise → '1234.50' for exports, using integer maths only. */
export const rupees = (p: number | null | undefined) => {
  if (p == null) return '';
  const a = Math.abs(p);
  return `${p < 0 ? '-' : ''}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, '0')}`;
};
