import type { Ctx } from './context.ts';
import { one } from './db.ts';
import { forbidden, notFound } from './http.ts';
import { can, hasRole, type AuthUser } from './permissions.ts';

/**
 * Record-level visibility. These clauses are applied inside every list, search and detail query,
 * so restricted records are not reachable through direct URLs or API calls.
 */
export function orderScope(user: AuthUser, a = 'o'): { sql: string; params: unknown[] } {
  if (can(user, 'orders.view_all')) return { sql: '1=1', params: [] };
  const parts = [`${a}.sales_owner_id=?`, `${a}.procurement_owner_id=?`, `EXISTS (SELECT 1 FROM order_team t WHERE t.order_id=${a}.id AND t.user_id=?)`];
  const params: unknown[] = [user.id, user.id, user.id];
  if (can(user, 'orders.view_dispatch')) parts.push(`${a}.stage IN ('packing','dispatch','delivered','closed')`);
  // Warehouse (packing / quality) receives anything inbound, so it sees orders that are in the physical stages.
  if (hasRole(user, 'packing_quality')) parts.push(`${a}.stage IN ('procurement','goods_received','quality_check','packing','dispatch')`);
  return { sql: `(${parts.join(' OR ')})`, params };
}
export function leadScope(user: AuthUser, a = 'l'): { sql: string; params: unknown[] } {
  if (can(user, 'sales.all')) return { sql: '1=1', params: [] };
  if (can(user, 'sales.write')) return { sql: `${a}.owner_id=?`, params: [user.id] };
  return { sql: '0', params: [] };
}
export function oppScope(user: AuthUser, a = 'op'): { sql: string; params: unknown[] } {
  if (can(user, 'sales.all')) return { sql: '1=1', params: [] };
  if (can(user, 'sales.write')) return { sql: `${a}.owner_id=?`, params: [user.id] };
  // Procurement managers can cost any opportunity; executives see the ones they were asked to check.
  if (can(user, 'procurement.all')) return { sql: '1=1', params: [] };
  if (can(user, 'feasibility.write')) return { sql: `EXISTS (SELECT 1 FROM feasibility_checks f WHERE f.opportunity_id=${a}.id AND f.assigned_to=?)`, params: [user.id] };
  return { sql: '0', params: [] };
}
export function companyScope(user: AuthUser, a = 'c'): { sql: string; params: unknown[] } {
  if (can(user, 'sales.all') || can(user, 'orders.view_all')) return { sql: '1=1', params: [] };
  if (can(user, 'sales.write')) return {
    sql: `(${a}.owner_id=? OR EXISTS (SELECT 1 FROM leads l WHERE l.company_id=${a}.id AND l.owner_id=?) OR EXISTS (SELECT 1 FROM opportunities op WHERE op.company_id=${a}.id AND op.owner_id=?))`,
    params: [user.id, user.id, user.id],
  };
  return { sql: '0', params: [] };
}

export function assertOrderAccess(ctx: Ctx, user: AuthUser, orderId: number) {
  const s = orderScope(user);
  const row = one(ctx.db, `SELECT o.id FROM orders o WHERE o.id=? AND ${s.sql}`, orderId, ...s.params);
  if (!row) {
    // Same response whether it does not exist or is out of scope: do not leak existence.
    throw notFound('Order');
  }
}
export function assertLeadAccess(ctx: Ctx, user: AuthUser, id: number) {
  const s = leadScope(user);
  if (!one(ctx.db, `SELECT l.id FROM leads l WHERE l.id=? AND ${s.sql}`, id, ...s.params)) throw notFound('Lead');
}
export function assertOppAccess(ctx: Ctx, user: AuthUser, id: number) {
  const s = oppScope(user);
  if (!one(ctx.db, `SELECT op.id FROM opportunities op WHERE op.id=? AND ${s.sql}`, id, ...s.params)) throw notFound('Opportunity');
}
export function assertCompanyAccess(ctx: Ctx, user: AuthUser, id: number) {
  const s = companyScope(user);
  if (!one(ctx.db, `SELECT c.id FROM companies c WHERE c.id=? AND ${s.sql}`, id, ...s.params)) throw notFound('Company');
}
export function assertPoAccess(ctx: Ctx, user: AuthUser, poId: number) {
  const po = one<{ order_id: number | null }>(ctx.db, 'SELECT order_id FROM purchase_orders WHERE id=?', poId);
  if (!po) throw notFound('Purchase order');
  if (can(user, 'procurement.all') || can(user, 'finance.view')) return;
  if (!(can(user, 'procurement.write') || can(user, 'receiving.write'))) throw notFound('Purchase order');
  if (po.order_id) assertOrderAccess(ctx, user, po.order_id);
}

/** Can this user open an attachment that belongs to this entity? */
export function assertEntityAccess(ctx: Ctx, user: AuthUser, type: string, id: number) {
  switch (type) {
    case 'order': return assertOrderAccess(ctx, user, id);
    case 'lead': return assertLeadAccess(ctx, user, id);
    case 'opportunity': return assertOppAccess(ctx, user, id);
    case 'company': return assertCompanyAccess(ctx, user, id);
    case 'vendor': if (!can(user, 'vendors.view')) throw notFound('Vendor'); return;
    case 'purchase_order': return assertPoAccess(ctx, user, id);
    case 'shipment': { const s = one<{ order_id: number }>(ctx.db, 'SELECT order_id FROM shipments WHERE id=?', id); if (!s) throw notFound(); return assertOrderAccess(ctx, user, s.order_id); }
    case 'customer_payment': case 'vendor_payment': if (!can(user, 'finance.view')) throw forbidden(); return;
    default: throw notFound();
  }
}

const COST_KEYS = /(cost|margin|price|landed|_paise$|^totals$|^payments$|^finance$)/i;
/** Remove every money field (costs, prices, totals, payments) for users without costing visibility (packing, dispatch). */
export function stripCosts<T>(user: AuthUser, value: T): T {
  if (can(user, 'costing.view')) return value;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) if (!COST_KEYS.test(k)) o[k] = walk(val);
      return o;
    }
    return v;
  };
  return walk(value) as T;
}
