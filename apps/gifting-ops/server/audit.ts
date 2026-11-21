import type { DB } from './db.ts';
export interface Actor { id: number | null }
/** Every important business change is recorded with user + timestamp. order_id powers the Order Workspace timeline. */
export function audit(db: DB, now: string, userId: number | null, action: string, entityType: string, entityId: number | null, summary: string, opts: { orderId?: number | null; details?: unknown } = {}) {
  db.prepare('INSERT INTO audit_events (at,user_id,action,entity_type,entity_id,order_id,summary,details) VALUES (?,?,?,?,?,?,?,?)')
    .run(now, userId, action, entityType, entityId, opts.orderId ?? null, summary, opts.details === undefined ? null : JSON.stringify(opts.details));
}
