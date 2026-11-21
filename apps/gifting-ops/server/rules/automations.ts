import type { Ctx } from '../context.ts';
import { addDays, today } from '../context.ts';
import { many, one } from '../db.ts';
import { notify, usersWithRole } from '../notify.ts';
import { getSetting } from '../settings.ts';
import { LINE_MATH, deliveryRisk } from './orders.ts';
import { vendorChecklist } from './vendors.ts';
import { receivableDue } from '../routes/finance.ts';
import { orderFinance } from './orders.ts';
import { taskLink } from '../routes/sales.ts';

/**
 * Scheduled checks. Each notification has a dedupe key that encodes the condition (e.g. the due date),
 * so re-running never repeats a notification, but a genuinely new situation (a new date) does notify.
 */
export function runAutomations(ctx: Ctx): { created: number; byRule: Record<string, number> } {
  const t = today(ctx); const now = ctx.now(); const db = ctx.db;
  const byRule: Record<string, number> = {};
  const n = (rule: string, userId: number | null | undefined, title: string, body: string | null, link: string | null, key: string) => {
    if (notify(db, now, userId, rule, title, body, link, key)) byRule[rule] = (byRule[rule] ?? 0) + 1;
  };
  const on = (k: Parameters<typeof getSetting>[1]) => getSetting(db, k) !== false;

  // Follow-ups and other tasks due today or overdue (one notice per task per due date).
  if (on('notify.follow_up_overdue')) for (const task of many(db, "SELECT * FROM tasks WHERE status='open' AND due_at IS NOT NULL AND due_at <= ?", t)) {
    const overdue = task.due_at < t;
    n(task.kind === 'follow_up' || task.kind === 'customer_approval' ? 'follow_up_due' : 'task_due', task.owner_id, `${overdue ? 'Overdue' : 'Due today'}: ${task.title}`, overdue ? `Was due ${task.due_at}` : null, taskLink(task), `task_due:${task.id}:${task.due_at}:${overdue ? 'over' : 'today'}`);
  }
  // Feasibility checks waiting more than 2 days.
  for (const f of many(db, "SELECT f.*, op.title FROM feasibility_checks f JOIN opportunities op ON op.id=f.opportunity_id WHERE f.status='requested' AND f.requested_at < ?", addDays(t, -2))) {
    n('feasibility_overdue', f.assigned_to, `Feasibility check waiting: ${f.title}`, 'Sales cannot commit price or date until you respond.', `/sales/opportunities/${f.opportunity_id}`, `feas_overdue:${f.id}`);
  }
  // Orders sitting in "confirmed" past the stage target = incomplete handoff.
  const targets = getSetting(db, 'order.stage_target_days') as Record<string, number>;
  for (const o of many(db, "SELECT * FROM orders WHERE stage='confirmed' AND archived_at IS NULL AND created_at < ?", addDays(t, -(targets.confirmed ?? 2)))) {
    n('handoff_stalled', o.procurement_owner_id ?? o.sales_owner_id, `${o.number} still not in procurement`, 'Complete the bill of materials and destinations so sourcing can start.', `/orders/${o.id}`, `handoff_stale:${o.id}`);
  }
  // Vendor onboarding past due with missing items.
  if (on('notify.vendor_onboarding_overdue')) for (const v of many(db, "SELECT * FROM vendors WHERE status IN ('draft','info_requested','documents_pending') AND archived_at IS NULL AND onboarding_due < ?", t)) {
    const missing = vendorChecklist(ctx, v.id).filter((c) => !c.done && c.group !== 'verification').map((c) => c.label);
    n('vendor_onboarding', v.onboarding_owner_id ?? v.created_by, `Vendor onboarding overdue: ${v.display_name}`, missing.length ? `Missing: ${missing.join(', ')}` : 'Ready to send for review.', `/procurement/vendors/${v.id}`, `vendor_onboarding_overdue:${v.id}:${v.onboarding_due}`);
  }
  // Vendor quotes past their response date.
  for (const q of many(db, "SELECT vq.*, r.created_by, r.title, v.display_name FROM vendor_quotes vq JOIN rfqs r ON r.id=vq.rfq_id JOIN vendors v ON v.id=vq.vendor_id WHERE vq.status='requested' AND r.status='open' AND vq.response_due < ?", t)) {
    n('vendor_quote_overdue', q.created_by, `Quote overdue from ${q.display_name}`, `${q.title} — was due ${q.response_due}`, `/procurement/rfqs/${q.rfq_id}`, `vq_overdue:${q.id}`);
  }
  // PO confirmation overdue.
  for (const po of many(db, "SELECT po.*, v.display_name FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id WHERE po.status='issued' AND po.confirmation_due < ? AND po.archived_at IS NULL", t)) {
    n('po_confirmation_overdue', po.owner_id ?? po.created_by, `${po.display_name} has not confirmed ${po.number}`, `Confirmation was due ${po.confirmation_due}`, `/procurement/purchase-orders/${po.id}`, `po_confirm_overdue:${po.id}`);
  }
  // Arrivals approaching or missed.
  const warn = getSetting(db, 'notify.arrival_warning_days');
  const openPos = many(db, "SELECT po.*, v.display_name FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id WHERE po.status IN ('issued','confirmed','partially_received') AND po.archived_at IS NULL AND po.promised_date IS NOT NULL");
  for (const po of openPos) {
    const outstanding = one<{ s: number }>(db, `SELECT COALESCE(SUM(outstanding),0) s FROM (SELECT ${LINE_MATH} FROM po_lines pl WHERE pl.po_id=?)`, po.id)!.s;
    if (!outstanding) continue;
    const owner = po.owner_id ?? po.created_by;
    if (po.promised_date < t) {
      const order = po.order_id ? one(db, 'SELECT * FROM orders WHERE id=?', po.order_id) : null;
      for (const uid of new Set([owner, order?.procurement_owner_id, order?.sales_owner_id].filter(Boolean))) n('arrival_missed', uid, `Missed delivery: ${po.number} from ${po.display_name}`, `${outstanding} unit(s) promised by ${po.promised_date} have not arrived.${order ? ` Order ${order.number} is affected.` : ''}`, `/procurement/purchase-orders/${po.id}`, `arrival_missed:${po.id}:${po.promised_date}`);
    } else if (po.promised_date <= addDays(t, warn)) {
      n('arrival_soon', owner, `Arriving soon: ${po.number} from ${po.display_name}`, `${outstanding} unit(s) due ${po.promised_date}. Confirm dispatch with the vendor.`, `/procurement/purchase-orders/${po.id}`, `arrival_soon:${po.id}:${po.promised_date}`);
      for (const uid of usersWithRole(db, 'packing_quality')) n('arrival_soon', uid, `Inbound ${po.promised_date}: ${po.number}`, `${outstanding} unit(s) from ${po.display_name}`, '/procurement/receiving', `arrival_soon_wh:${po.id}:${po.promised_date}`);
    }
  }
  // Delivery risk and overdue orders: notify both owners once per risk level and projected date.
  for (const o of many(db, "SELECT * FROM orders WHERE archived_at IS NULL AND stage NOT IN ('delivered','closed')")) {
    const risk = deliveryRisk(ctx, o);
    if (risk.level === 'late' || risk.level === 'at_risk') {
      for (const uid of new Set([o.sales_owner_id, o.procurement_owner_id].filter(Boolean))) n('delivery_risk', uid, `${risk.level === 'late' ? 'Late' : 'At risk'}: ${o.number}`, `${risk.reasons.slice(0, 2).join('; ')}. Projected ${risk.projected_delivery} vs due ${o.due_date}.`, `/orders/${o.id}`, `risk:${o.id}:${risk.level}:${risk.projected_delivery}`);
    }
    const dueSoon = (days: number) => o.due_date && o.due_date <= addDays(t, days);
    if (['goods_received', 'quality_check', 'packing'].includes(o.stage) && dueSoon(getSetting(db, 'notify.packing_due_days') as number + (getSetting(db, 'risk.buffer_days') as number))) {
      const team = many<{ user_id: number }>(db, "SELECT user_id FROM order_team WHERE order_id=? AND duty='packing'", o.id).map((x) => x.user_id);
      for (const uid of team.length ? team : usersWithRole(db, 'packing_quality')) n('packing_due', uid, `Packing due: ${o.number}`, `Customer due date ${o.due_date}.`, `/orders/${o.id}?tab=packing`, `packing_due:${o.id}:${o.due_date}`);
    }
    if (['packing', 'dispatch'].includes(o.stage) && dueSoon(getSetting(db, 'notify.dispatch_due_days') as number + 2)) {
      const ready = one<{ q: number }>(db, "SELECT COALESCE((SELECT SUM(qty) FROM packing_batches WHERE order_id=? AND status='checked'),0) - COALESCE((SELECT SUM(si.qty) FROM shipment_items si JOIN shipments s ON s.id=si.shipment_id WHERE s.order_id=? AND s.status<>'failed'),0) q", o.id, o.id)!.q;
      if (ready > 0) for (const uid of usersWithRole(db, 'dispatch')) n('dispatch_due', uid, `Dispatch due: ${o.number}`, `${ready} checked box(es) ready; customer due ${o.due_date}.`, `/orders/${o.id}?tab=shipments`, `dispatch_due:${o.id}:${o.due_date}`);
    }
  }
  // Shipments past their expected date.
  if (on('notify.shipment_delay')) for (const s of many(db, "SELECT s.*, o.number, o.sales_owner_id FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.status IN ('dispatched','in_transit','delayed') AND s.expected_on < ?", t)) {
    for (const uid of new Set([s.sales_owner_id, s.created_by])) n('shipment_delay', uid, `Shipment overdue on ${s.number}`, `${s.courier ?? ''} ${s.tracking_no ?? ''} was expected ${s.expected_on}. Check with the courier and update tracking.`, `/orders/${s.order_id}?tab=shipments`, `ship_overdue:${s.id}:${s.expected_on}`);
  }
  // Customer balances overdue.
  if (on('notify.balance_overdue')) for (const o of many(db, "SELECT * FROM orders WHERE archived_at IS NULL AND stage<>'closed'")) {
    const due = receivableDue(ctx, o); if (!due || due >= t) continue;
    const f = orderFinance(ctx, o.id); if (f.balance_paise <= 0) continue;
    for (const uid of usersWithRole(db, 'finance')) n('balance_overdue', uid, `Customer balance overdue: ${o.number}`, `₹${f.balance_paise / 100} was due ${due}.`, `/orders/${o.id}?tab=payments`, `balance_overdue:${o.id}:${due}`);
    n('balance_overdue', o.sales_owner_id, `Payment follow-up needed: ${o.number}`, `The customer's balance was due ${due}. Finance has the details.`, `/orders/${o.id}`, `balance_overdue_sales:${o.id}:${due}`);
  }
  // Vendor documents expiring.
  if (on('notify.vendor_doc_expiry')) {
    const days = getSetting(db, 'vendor.doc_expiry_warn_days');
    for (const d of many(db, 'SELECT d.*, v.display_name, v.onboarding_owner_id, v.created_by vcreated FROM vendor_documents d JOIN vendors v ON v.id=d.vendor_id WHERE d.archived_at IS NULL AND d.expires_on IS NOT NULL AND d.expires_on <= ? AND v.status NOT IN (\'rejected\',\'inactive\')', addDays(t, days))) {
      const expired = d.expires_on < t;
      n('vendor_doc_expiry', d.onboarding_owner_id ?? d.vcreated, `${expired ? 'Expired' : 'Expiring'}: ${d.kind} for ${d.display_name}`, `${expired ? 'Expired' : 'Expires'} ${d.expires_on}. Ask the vendor for a current copy.`, `/procurement/vendors/${d.vendor_id}`, `doc_expiry:${d.id}:${expired ? 'expired' : 'soon'}`);
    }
  }
  return { created: Object.values(byRule).reduce((a, b) => a + b, 0), byRule };
}
