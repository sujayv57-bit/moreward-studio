import type { Ctx } from '../context.ts';
import { addDays, daysBetween, today } from '../context.ts';
import { many, one } from '../db.ts';
import type { Missing } from '../http.ts';
import { getSetting } from '../settings.ts';
import { marginBp, mulBp } from '../money.ts';

export const STAGES = ['confirmed', 'procurement', 'goods_received', 'quality_check', 'packing', 'dispatch', 'delivered', 'closed'] as const;
export type Stage = (typeof STAGES)[number];
const COMMITTED_PO = "('issued','confirmed','partially_received','received')";

/** Per PO line: what is still expected from the vendor (rejected units count as owed replacements unless cancelled). */
export const LINE_MATH = `
  (pl.qty_received - pl.qty_accepted - pl.qty_rejected) AS awaiting_qc,
  MAX(0, pl.qty_ordered - pl.qty_cancelled - pl.qty_accepted - (pl.qty_received - pl.qty_accepted - pl.qty_rejected)) AS outstanding`;

export interface ComponentRow {
  id: number; variant_id: number; variant_name: string; variant_qty: number; component_name: string; category: string | null; qty_per_box: number; unit: string;
  is_critical: number; is_packaging: number; spec: string | null; est_unit_cost_paise: number; lead_time_days: number | null;
  required: number; ordered: number; planned: number; received: number; accepted: number; rejected: number; awaiting_qc: number; incoming: number;
  packed: number; available: number; still_needed: number; uncovered: number; next_arrival: string | null; latest_arrival: string | null;
  state: 'complete' | 'awaiting_qc' | 'incoming' | 'not_ordered';
}

/** Reconcile required vs ordered / received / accepted / rejected / still-needed for every BOM component. */
export function componentStatus(ctx: Ctx, orderId: number): ComponentRow[] {
  const items = many(ctx.db, `SELECT b.*, v.name variant_name, v.qty variant_qty FROM bom_items b JOIN box_variants v ON v.id=b.variant_id
    WHERE b.order_id=? AND b.archived_at IS NULL ORDER BY v.sort, v.id, b.id`, orderId);
  const lines = many(ctx.db, `SELECT pl.*, po.status po_status, po.promised_date, ${LINE_MATH} FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id
    WHERE po.order_id=? AND po.archived_at IS NULL AND po.status<>'cancelled'`, orderId);
  const packed = new Map(many<{ variant_id: number; qty: number }>(ctx.db, 'SELECT variant_id, SUM(qty) qty FROM packing_batches WHERE order_id=? GROUP BY variant_id', orderId).map((r) => [r.variant_id, r.qty]));
  return items.map((b) => {
    const mine = lines.filter((l) => l.bom_item_id === b.id);
    const committed = mine.filter((l) => COMMITTED_PO.includes(`'${l.po_status}'`));
    const sum = (arr: typeof mine, f: (l: (typeof mine)[number]) => number) => arr.reduce((a, l) => a + f(l), 0);
    const required = b.qty_per_box * b.variant_qty;
    const accepted = sum(committed, (l) => l.qty_accepted);
    const awaiting = sum(committed, (l) => l.awaiting_qc);
    const incoming = sum(committed, (l) => l.outstanding);
    const packedUnits = (packed.get(b.variant_id) ?? 0) * b.qty_per_box;
    const arrivals = committed.filter((l) => l.outstanding > 0 && l.promised_date).map((l) => l.promised_date as string).sort();
    const stillNeeded = Math.max(0, required - accepted);
    const uncovered = Math.max(0, required - accepted - awaiting - incoming);
    const state: ComponentRow['state'] = stillNeeded === 0 ? 'complete' : uncovered > 0 ? 'not_ordered' : incoming > 0 ? 'incoming' : 'awaiting_qc';
    return {
      ...b, required, ordered: sum(committed, (l) => l.qty_ordered - l.qty_cancelled), planned: sum(mine.filter((l) => !committed.includes(l)), (l) => l.qty_ordered),
      received: sum(committed, (l) => l.qty_received), accepted, rejected: sum(committed, (l) => l.qty_rejected), awaiting_qc: awaiting, incoming,
      packed: packedUnits, available: Math.max(0, accepted - packedUnits), still_needed: stillNeeded, uncovered,
      next_arrival: arrivals[0] ?? null, latest_arrival: arrivals[arrivals.length - 1] ?? null, state,
    } as ComponentRow;
  });
}

export interface Risk { level: 'none' | 'on_track' | 'at_risk' | 'late'; reasons: string[]; projected_delivery: string | null; days_late: number }
/** Delivery risk: how vendor dates and gaps affect the customer delivery date. Transparent reasons, no hidden score. */
export function deliveryRisk(ctx: Ctx, order: Record<string, any>, comps?: ComponentRow[]): Risk {
  if (['delivered', 'closed'].includes(order.stage) || order.archived_at) return { level: 'none', reasons: [], projected_delivery: null, days_late: 0 };
  const t = today(ctx); const buffer = getSetting(ctx.db, 'risk.buffer_days');
  const reasons: string[] = []; let level: Risk['level'] = 'on_track';
  const raise = (l: 'at_risk' | 'late', why: string) => { reasons.push(why); if (l === 'late') level = 'late'; else if (level === 'on_track') level = 'at_risk'; };
  const due = order.due_date as string | null;
  let readyBy = t;
  if (['confirmed', 'procurement', 'goods_received', 'quality_check'].includes(order.stage)) {
    for (const c of comps ?? componentStatus(ctx, order.id)) {
      if (c.state === 'complete') continue;
      if (c.uncovered > 0) {
        const eta = addDays(t, c.lead_time_days ?? 7);
        if (eta > readyBy) readyBy = eta;
        const why = `${c.uncovered} × ${c.component_name} (${c.variant_name}) not on any purchase order`;
        if (due && addDays(eta, buffer) > due) raise('late', `${why}; at ${c.lead_time_days ?? 7} days' lead time it cannot arrive in time`); else raise('at_risk', why);
      }
      if (c.incoming > 0 && c.latest_arrival) {
        if (c.latest_arrival > readyBy) readyBy = c.latest_arrival;
        if (c.latest_arrival < t) raise('late', `${c.component_name}: vendor promised ${c.latest_arrival}, ${c.incoming} still not received`);
        else if (due && c.latest_arrival > due) raise('late', `${c.component_name} arrives ${c.latest_arrival}, after the customer due date`);
        else if (due && addDays(c.latest_arrival, buffer) > due) raise('at_risk', `${c.component_name} arrives ${c.latest_arrival}, leaving under ${buffer} days to check, pack and ship`);
      }
      if (c.incoming > 0 && !c.latest_arrival) raise('at_risk', `${c.component_name}: no promised date from vendor`);
    }
  }
  const openShipDelays = many(ctx.db, "SELECT id, expected_on FROM shipments WHERE order_id=? AND status IN ('delayed','failed')", order.id);
  if (openShipDelays.length) raise('at_risk', `${openShipDelays.length} shipment(s) delayed or failed`);
  const projected = order.stage === 'dispatch' ? (one<{ d: string | null }>(ctx.db, "SELECT MAX(expected_on) d FROM shipments WHERE order_id=? AND status<>'delivered'", order.id)?.d ?? t) : addDays(readyBy, buffer);
  if (due && due < t) raise('late', `Customer due date ${due} has passed`);
  else if (due && projected > due && !reasons.some((r) => r.includes('after the customer due date') || r.includes('cannot arrive'))) raise('late', `Projected delivery ${projected} is after the due date ${due}`);
  return { level, reasons, projected_delivery: projected, days_late: due ? Math.max(0, daysBetween(due, projected)) : 0 };
}

/** Exactly what is missing before an order may enter a stage. */
export function readiness(ctx: Ctx, order: Record<string, any>, to: Stage): Missing[] {
  const m: Missing[] = [];
  const variants = many(ctx.db, 'SELECT * FROM box_variants WHERE order_id=?', order.id);
  const comps = () => componentStatus(ctx, order.id);
  switch (to) {
    case 'procurement': {
      if (!order.procurement_owner_id) m.push({ code: 'owner', message: 'No procurement owner', fix: 'Assign a procurement owner on the Overview tab.', tab: 'overview' });
      if (!order.due_date) m.push({ code: 'due', message: 'No customer due date', fix: 'Set the due date on the Overview tab.', tab: 'overview' });
      if (!variants.length) m.push({ code: 'variants', message: 'No gift box variants', fix: 'Add at least one box variant.', tab: 'contents' });
      for (const v of variants) {
        const n = one<{ n: number }>(ctx.db, 'SELECT COUNT(*) n FROM bom_items WHERE variant_id=? AND archived_at IS NULL', v.id)!.n;
        if (!n) m.push({ code: 'bom', message: `“${v.name}” has no components in its bill of materials`, fix: 'Add the components that go into this box.', tab: 'contents' });
        const alloc = one<{ q: number }>(ctx.db, 'SELECT COALESCE(SUM(qty),0) q FROM allocations WHERE variant_id=?', v.id)!.q;
        if (alloc !== v.qty) m.push({ code: 'alloc', message: `“${v.name}”: ${alloc} of ${v.qty} boxes allocated to destinations`, fix: 'Allocate every box to a delivery destination.', tab: 'contents' });
      }
      if (!one(ctx.db, 'SELECT id FROM destinations WHERE order_id=?', order.id)) m.push({ code: 'dest', message: 'No delivery destinations', fix: 'Add at least one delivery address.', tab: 'contents' });
      break;
    }
    case 'goods_received': case 'quality_check': {
      for (const c of comps()) if (c.accepted + c.awaiting_qc < c.required) m.push({ code: 'receive', message: `${c.component_name} (${c.variant_name}): ${c.accepted + c.awaiting_qc} of ${c.required} received`, fix: c.uncovered > 0 ? 'Raise a purchase order for the remainder.' : 'Record the goods receipt when the vendor delivers.', tab: 'received' });
      break;
    }
    case 'packing': {
      const exception = one(ctx.db, "SELECT id FROM approvals WHERE kind='partial_packing' AND order_id=? AND status='approved'", order.id);
      if (!exception) {
        for (const c of comps()) if (c.accepted < c.required) m.push({ code: 'components', message: `${c.component_name} (${c.variant_name}): ${c.accepted} of ${c.required} accepted after quality check`, fix: c.awaiting_qc ? 'Complete the quality check.' : 'Wait for replacements or request a partial-packing exception.', tab: 'quality' });
        const openQ = one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM issues WHERE order_id=? AND kind IN ('quality','shortage','damage') AND status<>'resolved'", order.id)!.n;
        if (openQ) m.push({ code: 'issues', message: `${openQ} open quality / shortage issue(s)`, fix: 'Resolve the issues or request a partial-packing exception.', tab: 'issues' });
      }
      for (const v of variants.filter((x) => x.artwork_required)) {
        if (!one(ctx.db, "SELECT id FROM artworks WHERE order_id=? AND (variant_id=? OR variant_id IS NULL) AND status='approved'", order.id, v.id)) m.push({ code: 'artwork', message: `Artwork for “${v.name}” is not approved`, fix: 'Record the customer’s artwork approval, or have an authorised person log an override.', tab: 'contents' });
      }
      break;
    }
    case 'dispatch': {
      if (!one(ctx.db, "SELECT id FROM packing_batches WHERE order_id=? AND status='checked'", order.id)) m.push({ code: 'packed', message: 'No packed and checked batches yet', fix: 'Pack a batch and have it checked.', tab: 'packing' });
      break;
    }
    case 'delivered': {
      for (const v of variants) {
        const shipped = one<{ q: number }>(ctx.db, "SELECT COALESCE(SUM(si.qty),0) q FROM shipment_items si JOIN shipments s ON s.id=si.shipment_id WHERE si.variant_id=? AND s.status='delivered'", v.id)!.q;
        if (shipped < v.qty) m.push({ code: 'undelivered', message: `“${v.name}”: ${shipped} of ${v.qty} boxes delivered`, fix: 'Dispatch and confirm delivery of the remaining boxes.', tab: 'shipments' });
      }
      break;
    }
    case 'closed': {
      const fin = orderFinance(ctx, order.id);
      if (fin.balance_paise > 0) m.push({ code: 'balance', message: `Customer balance outstanding: ₹${fin.balance_paise / 100}`, fix: 'Record the customer payment, or have the founder close with a reason.', tab: 'payments' });
      if (!one(ctx.db, 'SELECT id FROM invoices WHERE order_id=?', order.id)) m.push({ code: 'invoice', message: 'No invoice reference recorded', fix: 'Add the invoice number from the accounting system.', tab: 'payments' });
      break;
    }
    default: break;
  }
  return m;
}

export function orderFinance(ctx: Ctx, orderId: number) {
  const o = one(ctx.db, 'SELECT total_paise, subtotal_paise, est_cost_paise FROM orders WHERE id=?', orderId)!;
  const paid = one<{ s: number }>(ctx.db, 'SELECT COALESCE(SUM(amount_paise),0) s FROM customer_payments WHERE order_id=?', orderId)!.s;
  const advance = one<{ s: number }>(ctx.db, "SELECT COALESCE(SUM(amount_paise),0) s FROM customer_payments WHERE order_id=? AND kind='advance'", orderId)!.s;
  const invoiced = one<{ s: number }>(ctx.db, 'SELECT COALESCE(SUM(amount_paise),0) s FROM invoices WHERE order_id=?', orderId)!.s;
  const taxInCost = getSetting(ctx.db, 'costing.vendor_tax_in_cost');
  const pos = many(ctx.db, `SELECT po.id FROM purchase_orders po WHERE po.order_id=? AND po.status NOT IN ('cancelled','draft','pending_approval') AND po.archived_at IS NULL`, orderId);
  let vendorCost = 0;
  for (const po of pos) vendorCost += poTotals(ctx, po.id, taxInCost).cost_paise;
  const otherCosts = many<{ kind: string; s: number }>(ctx.db, 'SELECT kind, SUM(amount_paise) s FROM order_costs WHERE order_id=? GROUP BY kind', orderId);
  const other = otherCosts.reduce((a, c) => a + c.s, 0);
  const actualCost = vendorCost + other;
  const comps = componentStatus(ctx, orderId);
  const fullyOrdered = comps.length > 0 && comps.every((c) => c.uncovered === 0);
  const revenue = o.subtotal_paise;
  return {
    total_paise: o.total_paise, revenue_paise: revenue, received_paise: paid, advance_paise: advance, invoiced_paise: invoiced, balance_paise: o.total_paise - paid,
    est_cost_paise: o.est_cost_paise, est_margin_bp: revenue ? marginBp(revenue, o.est_cost_paise) : null,
    actual_cost_paise: actualCost, vendor_cost_paise: vendorCost, other_costs: otherCosts, actual_margin_bp: revenue ? marginBp(revenue, actualCost) : null,
    margin_provisional: !fullyOrdered, vendor_tax_in_cost: taxInCost,
  };
}

/** PO value: lines + per-line tax + shipping. `cost_paise` excludes tax unless the company counts vendor tax as cost. */
export function poTotals(ctx: Ctx, poId: number, taxInCost?: boolean) {
  const po = one(ctx.db, 'SELECT shipping_paise FROM purchase_orders WHERE id=?', poId)!;
  const lines = many(ctx.db, 'SELECT qty_ordered, qty_cancelled, unit_price_paise, tax_bp FROM po_lines WHERE po_id=?', poId);
  let sub = 0; let tax = 0;
  for (const l of lines) { const v = (l.qty_ordered - l.qty_cancelled) * l.unit_price_paise; sub += v; tax += mulBp(v, l.tax_bp); }
  const total = sub + tax + po.shipping_paise;
  const paid = one<{ s: number }>(ctx.db, 'SELECT COALESCE(SUM(amount_paise),0) s FROM vendor_payments WHERE po_id=?', poId)!.s;
  const advance = one<{ s: number }>(ctx.db, "SELECT COALESCE(SUM(amount_paise),0) s FROM vendor_payments WHERE po_id=? AND kind='advance'", poId)!.s;
  const inc = taxInCost ?? getSetting(ctx.db, 'costing.vendor_tax_in_cost');
  return { subtotal_paise: sub, tax_paise: tax, shipping_paise: po.shipping_paise, total_paise: total, paid_paise: paid, advance_paise: advance, balance_paise: total - paid, cost_paise: sub + po.shipping_paise + (inc ? tax : 0) };
}

export const STAGE_DEFAULT_ACTION: Record<string, string> = {
  confirmed: 'Procurement: confirm the bill of materials and destinations, then move to Procurement',
  procurement: 'Procurement: get vendor quotes and issue purchase orders for every component',
  goods_received: 'Warehouse: run quality checks on received goods',
  quality_check: 'Warehouse: finish quality checks, then start packing',
  packing: 'Packing: pack and check batches against the checklist',
  dispatch: 'Dispatch: book couriers, record tracking and confirm delivery',
  delivered: 'Finance: invoice and collect the balance',
  closed: 'Closed',
};
const STAGE_OWNER: Record<string, 'sales' | 'procurement'> = { confirmed: 'procurement', procurement: 'procurement', goods_received: 'procurement', quality_check: 'procurement', packing: 'procurement', dispatch: 'sales', delivered: 'sales', closed: 'sales' };

/** Never ambiguous: every order has a next action and owner; blocked orders also have a reason. */
export function orderStatus(ctx: Ctx, order: Record<string, any>, risk?: Risk) {
  const rk = risk ?? deliveryRisk(ctx, order);
  const defaultOwner = STAGE_OWNER[order.stage] === 'procurement' ? order.procurement_owner_id ?? order.sales_owner_id : order.sales_owner_id;
  if (order.blocker_reason) return { blocked: true, source: 'manual' as const, reason: order.blocker_reason as string, owner_id: (order.blocker_owner_id ?? defaultOwner) as number, next_action: (order.next_action ?? STAGE_DEFAULT_ACTION[order.stage]) as string };
  const issue = one(ctx.db, "SELECT * FROM issues WHERE order_id=? AND status<>'resolved' AND priority IN ('high','urgent') ORDER BY CASE priority WHEN 'urgent' THEN 0 ELSE 1 END, id LIMIT 1", order.id);
  if (issue) return { blocked: true, source: 'issue' as const, reason: `Open ${issue.priority} issue: ${issue.title}`, owner_id: issue.owner_id as number, next_action: `Resolve issue #${issue.id}${issue.due_date ? ` by ${issue.due_date}` : ''}` };
  if (rk.level === 'late') return { blocked: true, source: 'risk' as const, reason: rk.reasons[0] ?? 'Late', owner_id: defaultOwner as number, next_action: STAGE_OWNER[order.stage] === 'procurement' ? 'Chase vendors or find a backup source, and agree a revised date with the customer' : 'Agree a revised date with the customer' };
  return { blocked: false, source: null, reason: null, owner_id: defaultOwner as number, next_action: (order.next_action ?? STAGE_DEFAULT_ACTION[order.stage]) as string };
}
