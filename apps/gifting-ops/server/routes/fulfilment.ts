import { Router } from 'express';
import { z } from 'zod';
import { issueInput, shipmentInput } from '../../shared/schemas.ts';
import { assertOrderAccess, orderScope } from '../access.ts';
import { audit } from '../audit.ts';
import { requirePerm } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { addDays, today } from '../context.ts';
import { insert, many, one, run, tx, update } from '../db.ts';
import { HttpError, badRequest, blocked, forbidden, notFound } from '../http.ts';
import { notify, notifyRoles } from '../notify.ts';
import { can, canAny, type AuthUser } from '../permissions.ts';
import { pageParams, qstr, userName } from '../rules/common.ts';
import { componentStatus, readiness } from '../rules/orders.ts';
import { getSetting } from '../settings.ts';
import { assertUser, intParam, parse } from '../validate.ts';

const r = Router();
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------- packing
/** How many complete boxes of each variant can be packed from accepted, not-yet-used components. */
export function packability(ctx: Ctx, orderId: number) {
  const comps = componentStatus(ctx, orderId);
  const variants = many(ctx.db, 'SELECT * FROM box_variants WHERE order_id=? ORDER BY sort, id', orderId);
  return variants.map((v) => {
    const mine = comps.filter((c) => c.variant_id === v.id);
    const batched = one<{ q: number }>(ctx.db, 'SELECT COALESCE(SUM(qty),0) q FROM packing_batches WHERE variant_id=?', v.id)!.q;
    const checked = one<{ q: number }>(ctx.db, "SELECT COALESCE(SUM(qty),0) q FROM packing_batches WHERE variant_id=? AND status='checked'", v.id)!.q;
    const canPack = mine.length ? Math.min(...mine.map((c) => Math.floor(c.available / c.qty_per_box))) : 0;
    const short = mine.filter((c) => Math.floor(c.available / c.qty_per_box) < v.qty - batched).map((c) => `${c.component_name}: ${c.available} available, ${(v.qty - batched) * c.qty_per_box} needed`);
    return { variant_id: v.id, name: v.name, qty: v.qty, batched, checked, remaining: v.qty - batched, packable_now: Math.min(canPack, v.qty - batched), short };
  });
}

r.get('/packing/queue', requirePerm('packing.write', 'procurement.all'), (req, res) => {
  const ctx = req.ctx; const s = orderScope(req.user);
  const orders = many(ctx.db, `SELECT o.*, c.name company_name FROM orders o JOIN companies c ON c.id=o.company_id WHERE o.archived_at IS NULL AND o.stage IN ('goods_received','quality_check','packing') AND ${s.sql} ORDER BY o.due_date`, ...s.params);
  const t = today(ctx); const soon = addDays(t, getSetting(ctx.db, 'notify.packing_due_days'));
  res.json({ rows: orders.map((o) => {
    const pk = packability(ctx, o.id);
    const missing = o.stage === 'packing' ? [] : readiness(ctx, o, 'packing');
    return { id: o.id, number: o.number, title: o.title, company_name: o.company_name, stage: o.stage, due_date: o.due_date, due_soon: !!o.due_date && o.due_date <= soon,
      boxes: pk.reduce((a, v) => a + v.qty, 0), checked: pk.reduce((a, v) => a + v.checked, 0), batched: pk.reduce((a, v) => a + v.batched, 0),
      ready: o.stage === 'packing' || missing.length === 0, missing,
      my_batches: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM packing_batches WHERE order_id=? AND assigned_to=? AND status<>'checked'", o.id, req.user.id)!.n };
  }) });
});
r.get('/orders/:id/packing', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOrderAccess(ctx, req.user, id);
  const o = one(ctx.db, 'SELECT * FROM orders WHERE id=?', id)!;
  res.json({
    stage: o.stage, variants: packability(ctx, id),
    batches: many(ctx.db, 'SELECT b.*, v.name variant_name, pu.name packed_name, cu.name checked_name, au.name assigned_name FROM packing_batches b JOIN box_variants v ON v.id=b.variant_id LEFT JOIN users pu ON pu.id=b.packed_by LEFT JOIN users cu ON cu.id=b.checked_by LEFT JOIN users au ON au.id=b.assigned_to WHERE b.order_id=? ORDER BY b.id DESC', id)
      .map((b) => ({ ...b, items: many(ctx.db, 'SELECT i.*, u.name done_name FROM packing_checklist_items i LEFT JOIN users u ON u.id=i.done_by WHERE batch_id=? ORDER BY i.id', b.id) })),
    packing_missing: o.stage === 'packing' || o.stage === 'dispatch' ? [] : readiness(ctx, o, 'packing'),
    exception: one(ctx.db, "SELECT a.*, u.name decided_name FROM approvals a LEFT JOIN users u ON u.id=a.decided_by WHERE kind='partial_packing' AND order_id=? ORDER BY id DESC LIMIT 1", id) ?? null,
    checker_must_differ: getSetting(ctx.db, 'packing.checker_must_differ'),
  });
});
r.post('/orders/:id/packing-batches', requirePerm('packing.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOrderAccess(ctx, req.user, id);
  const o = one(ctx.db, 'SELECT * FROM orders WHERE id=?', id)!;
  const v = parse(z.object({ variant_id: z.number().int().positive(), qty: z.number({ error: 'Enter how many boxes' }).int().positive('At least 1 box'), assigned_to: z.number().int().positive().optional().nullable() }), req.body);
  if (!['packing', 'dispatch'].includes(o.stage)) {
    const missing = readiness(ctx, o, 'packing');
    throw blocked(missing.length ? 'Packing cannot start: required components are not available.' : 'Move the order to Packing first.', missing.length ? missing : [{ code: 'stage', message: `Order is in ${o.stage.replace('_', ' ')}`, fix: 'Use “Move to Packing” on the order.', tab: 'overview' }]);
  }
  if (v.assigned_to) assertUser(ctx, v.assigned_to);
  const pk = packability(ctx, id).find((x) => x.variant_id === v.variant_id);
  if (!pk) throw badRequest('Variant not on this order.');
  if (v.qty > pk.remaining) throw new HttpError(400, 'validation', `Only ${pk.remaining} box(es) of ${pk.name} remain to be packed.`, { fields: { qty: `Max ${pk.remaining}` } });
  const exception = one<{ id: number }>(ctx.db, "SELECT id FROM approvals WHERE kind='partial_packing' AND order_id=? AND status='approved' ORDER BY id DESC LIMIT 1", id);
  if (v.qty > pk.packable_now && !exception) throw blocked(`Components for only ${pk.packable_now} box(es) of ${pk.name} are available.`, pk.short.map((s, i) => ({ code: `short${i}`, message: s, fix: 'Wait for accepted stock, or request a partial-packing exception.', tab: 'packing' })));
  const bid = tx(ctx.db, () => {
    const bid = insert(ctx.db, 'packing_batches', { order_id: id, variant_id: v.variant_id, qty: v.qty, assigned_to: v.assigned_to ?? req.user.id, exception_approval_id: v.qty > pk.packable_now ? exception!.id : null, created_by: req.user.id, created_at: ctx.now() });
    // Checklist generated from the approved bill of materials, plus any active packing template steps.
    for (const b of many(ctx.db, 'SELECT * FROM bom_items WHERE variant_id=? AND archived_at IS NULL ORDER BY is_packaging, id', v.variant_id)) {
      insert(ctx.db, 'packing_checklist_items', { batch_id: bid, label: `${b.component_name}${b.spec ? ` (${b.spec})` : ''}: ${b.qty_per_box * v.qty} ${b.unit}${b.qty_per_box > 1 ? ` (${b.qty_per_box} per box)` : ''}`, required_qty: b.qty_per_box * v.qty, bom_item_id: b.id });
    }
    for (const t of many(ctx.db, "SELECT items FROM checklist_templates WHERE kind='packing' AND active=1")) for (const label of JSON.parse(t.items) as string[]) insert(ctx.db, 'packing_checklist_items', { batch_id: bid, label });
    const variant = one<{ artwork_required: number; customisation: string | null }>(ctx.db, 'SELECT artwork_required, customisation FROM box_variants WHERE id=?', v.variant_id)!;
    if (variant.artwork_required) insert(ctx.db, 'packing_checklist_items', { batch_id: bid, label: `Customisation matches the approved artwork${variant.customisation ? ` (${variant.customisation})` : ''}` });
    if (v.assigned_to && v.assigned_to !== req.user.id) notify(ctx.db, ctx.now(), v.assigned_to, 'packing_assigned', `Packing batch assigned: ${v.qty} × ${pk.name} (${o.number})`, null, `/orders/${id}?tab=packing`, `batch:${bid}`);
    audit(ctx.db, ctx.now(), req.user.id, 'packing', 'order', id, `Packing batch #${bid} started: ${v.qty} × ${pk.name}${v.qty > pk.packable_now ? ' (under partial-packing exception)' : ''}`, { orderId: id });
    return bid;
  });
  res.status(201).json({ id: bid });
});
function batchOr404(ctx: Ctx, user: AuthUser, id: number) {
  const b = one(ctx.db, 'SELECT * FROM packing_batches WHERE id=?', id); if (!b) throw notFound('Batch');
  assertOrderAccess(ctx, user, b.order_id); return b;
}
r.post('/checklist-items/:id/toggle', requirePerm('packing.write'), (req, res) => {
  const ctx = req.ctx; const iid = intParam(req.params.id);
  const it = one(ctx.db, 'SELECT * FROM packing_checklist_items WHERE id=?', iid); if (!it) throw notFound('Checklist item');
  const b = batchOr404(ctx, req.user, it.batch_id);
  if (b.status !== 'in_progress') throw badRequest('This batch is already packed; ask the checker to reject it if something is wrong.');
  const { done } = parse(z.object({ done: z.boolean() }), req.body);
  run(ctx.db, 'UPDATE packing_checklist_items SET done=?, done_by=?, done_at=? WHERE id=?', done ? 1 : 0, done ? req.user.id : null, done ? ctx.now() : null, iid);
  res.json({ ok: true });
});
r.post('/packing-batches/:id/packed', requirePerm('packing.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const b = batchOr404(ctx, req.user, id);
  if (b.status !== 'in_progress') throw badRequest('Batch is not in progress.');
  const open = many(ctx.db, 'SELECT label FROM packing_checklist_items WHERE batch_id=? AND done=0', id);
  if (open.length) throw blocked('Tick every checklist item before marking the batch packed.', open.map((o, i) => ({ code: `item${i}`, message: o.label, fix: 'Confirm it is in the box, then tick it.' })));
  update(ctx.db, 'packing_batches', id, { status: 'packed', packed_by: req.user.id, packed_at: ctx.now() });
  audit(ctx.db, ctx.now(), req.user.id, 'packing', 'order', b.order_id, `Batch #${id} packed (${b.qty} boxes) by ${req.user.name}`, { orderId: b.order_id });
  res.json({ ok: true });
});
r.post('/packing-batches/:id/check', requirePerm('packing.write', 'quality.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const b = batchOr404(ctx, req.user, id);
  const v = parse(z.object({ result: z.enum(['pass', 'fail']), note: z.string().trim().optional() }).refine((x) => x.result === 'pass' || (x.note && x.note.length >= 3), { message: 'Say what is wrong', path: ['note'] }), req.body);
  if (b.status !== 'packed') throw badRequest('Only a packed batch can be checked.');
  if (getSetting(ctx.db, 'packing.checker_must_differ') && b.packed_by === req.user.id) throw forbidden('A batch must be checked by someone other than the person who packed it.');
  tx(ctx.db, () => {
    if (v.result === 'pass') update(ctx.db, 'packing_batches', id, { status: 'checked', checked_by: req.user.id, checked_at: ctx.now() });
    else { update(ctx.db, 'packing_batches', id, { status: 'in_progress', packed_by: null, packed_at: null }); run(ctx.db, 'UPDATE packing_checklist_items SET done=0, done_by=NULL, done_at=NULL WHERE batch_id=?', id); }
    audit(ctx.db, ctx.now(), req.user.id, 'packing', 'order', b.order_id, `Batch #${id} ${v.result === 'pass' ? 'checked and passed' : `failed check: ${v.note}`} by ${req.user.name}`, { orderId: b.order_id });
    if (v.result === 'fail' && b.packed_by) notify(ctx.db, ctx.now(), b.packed_by, 'packing_rework', `Batch #${id} needs rework`, v.note ?? null, `/orders/${b.order_id}?tab=packing`, `batch_fail:${id}:${ctx.now()}`);
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- shipments
/** Per destination × variant: allocated, already shipped (excluding failed), remaining; and checked boxes not yet shipped. */
export function shippable(ctx: Ctx, orderId: number) {
  const variants = many(ctx.db, 'SELECT id, name, qty FROM box_variants WHERE order_id=?', orderId);
  const dests = many(ctx.db, 'SELECT * FROM destinations WHERE order_id=?', orderId);
  const shippedTo = (vid: number, did?: number) => one<{ q: number }>(ctx.db, `SELECT COALESCE(SUM(si.qty),0) q FROM shipment_items si JOIN shipments s ON s.id=si.shipment_id WHERE si.variant_id=? AND s.status<>'failed' ${did ? 'AND s.destination_id=?' : ''}`, vid, ...(did ? [did] : []))!.q;
  const ready = variants.map((v) => {
    const checked = one<{ q: number }>(ctx.db, "SELECT COALESCE(SUM(qty),0) q FROM packing_batches WHERE variant_id=? AND status='checked'", v.id)!.q;
    return { variant_id: v.id, name: v.name, qty: v.qty, checked, shipped: shippedTo(v.id), ready_to_ship: checked - shippedTo(v.id) };
  });
  const matrix = dests.map((d) => ({ ...d, items: variants.map((v): { variant_id: number; name: string; allocated: number; shipped: number; remaining: number } => {
    const allocated = one<{ q: number }>(ctx.db, 'SELECT COALESCE(SUM(qty),0) q FROM allocations WHERE variant_id=? AND destination_id=?', v.id, d.id)!.q;
    const shipped = shippedTo(v.id, d.id);
    return { variant_id: v.id, name: v.name, allocated, shipped, remaining: allocated - shipped };
  }) }));
  return { ready, destinations: matrix };
}
r.get('/orders/:id/shipments', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOrderAccess(ctx, req.user, id);
  res.json({
    ...shippable(ctx, id),
    shipments: many(ctx.db, 'SELECT s.*, d.label destination, d.city, d.address FROM shipments s JOIN destinations d ON d.id=s.destination_id WHERE s.order_id=? ORDER BY s.id', id).map((s) => ({
      ...s, items: many(ctx.db, 'SELECT si.*, v.name variant_name FROM shipment_items si JOIN box_variants v ON v.id=si.variant_id WHERE shipment_id=?', s.id),
      updates: many(ctx.db, 'SELECT t.*, u.name by_name FROM tracking_updates t LEFT JOIN users u ON u.id=t.by_user WHERE shipment_id=? ORDER BY t.id DESC', s.id),
      pod_filename: s.pod_attachment_id ? one<{ filename: string }>(ctx.db, 'SELECT filename FROM attachments WHERE id=?', s.pod_attachment_id)?.filename : null,
    })),
    courier_integration: ctx.providers.courier,
  });
});
r.post('/orders/:id/shipments', requirePerm('shipments.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOrderAccess(ctx, req.user, id);
  const o = one(ctx.db, 'SELECT * FROM orders WHERE id=?', id)!;
  if (!['packing', 'dispatch'].includes(o.stage)) throw badRequest(`Shipments can be planned once packing has started (order is in ${o.stage.replace('_', ' ')}).`);
  const v = parse(shipmentInput, req.body);
  const sh = shippable(ctx, id);
  const dest = sh.destinations.find((d) => d.id === v.destination_id); if (!dest) throw badRequest('Destination is not on this order.');
  for (const it of v.items) {
    const rd = sh.ready.find((x) => x.variant_id === it.variant_id); const al = dest.items.find((x: { variant_id: number }) => x.variant_id === it.variant_id);
    if (!rd || !al) throw badRequest('Item is not on this order.');
    if (it.qty > rd.ready_to_ship) throw new HttpError(400, 'validation', `${rd.name}: only ${rd.ready_to_ship} checked box(es) are ready to ship.`, { fields: {} });
    if (it.qty > al.remaining) throw new HttpError(400, 'validation', `${rd.name}: only ${al.remaining} box(es) are still allocated to ${dest.label}.`, { fields: {} });
  }
  const sid = tx(ctx.db, () => {
    const sid = insert(ctx.db, 'shipments', { order_id: id, destination_id: v.destination_id, courier: v.courier, notes: v.notes, created_by: req.user.id, created_at: ctx.now(), updated_at: ctx.now() });
    for (const it of v.items) insert(ctx.db, 'shipment_items', { shipment_id: sid, ...it });
    audit(ctx.db, ctx.now(), req.user.id, 'shipment', 'order', id, `Shipment #${sid} planned to ${dest.label}: ${v.items.map((i) => `${i.qty} × ${sh.ready.find((x) => x.variant_id === i.variant_id)!.name}`).join(', ')}`, { orderId: id });
    return sid;
  });
  res.status(201).json({ id: sid });
});
function shipmentOr404(ctx: Ctx, user: AuthUser, id: number) {
  const s = one(ctx.db, 'SELECT * FROM shipments WHERE id=?', id); if (!s) throw notFound('Shipment');
  assertOrderAccess(ctx, user, s.order_id); return s;
}
r.post('/shipments/:id/dispatch', requirePerm('shipments.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const s = shipmentOr404(ctx, req.user, id);
  if (s.status !== 'planned') throw badRequest('This shipment was already dispatched.');
  const v = parse(z.object({ courier: z.string().trim().min(2, 'Courier is required'), tracking_no: z.string().trim().min(3, 'Tracking / docket number is required'), dispatched_on: z.string().regex(dateRe, 'Enter the dispatch date'), expected_on: z.string().regex(dateRe, 'Enter the expected delivery date') }).refine((x) => x.expected_on >= x.dispatched_on, { message: 'Expected date cannot be before dispatch', path: ['expected_on'] }), req.body);
  const o = one(ctx.db, 'SELECT * FROM orders WHERE id=?', s.order_id)!;
  tx(ctx.db, () => {
    update(ctx.db, 'shipments', id, { ...v, status: 'dispatched', updated_at: ctx.now() });
    insert(ctx.db, 'tracking_updates', { shipment_id: id, status: 'dispatched', note: `${v.courier} ${v.tracking_no}`, by_user: req.user.id, at: ctx.now() });
    if (o.stage === 'packing') {
      run(ctx.db, "UPDATE orders SET stage='dispatch', next_action=NULL, updated_at=?, version=version+1 WHERE id=?", ctx.now(), o.id);
      audit(ctx.db, ctx.now(), req.user.id, 'stage', 'order', o.id, 'Stage packing → dispatch (first shipment left)', { orderId: o.id });
    }
    audit(ctx.db, ctx.now(), req.user.id, 'shipment', 'order', o.id, `Shipment #${id} dispatched via ${v.courier} (${v.tracking_no}), expected ${v.expected_on}`, { orderId: o.id });
    notify(ctx.db, ctx.now(), o.sales_owner_id, 'dispatched', `${o.number}: shipment dispatched`, `${v.courier} ${v.tracking_no}, expected ${v.expected_on}. Share tracking with the customer.`, `/orders/${o.id}?tab=shipments`, `dispatched:${id}`);
  });
  res.json({ ok: true });
});
r.post('/shipments/:id/tracking', requirePerm('shipments.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const s = shipmentOr404(ctx, req.user, id);
  if (['planned', 'delivered', 'failed'].includes(s.status)) throw badRequest(`Cannot add tracking to a ${s.status} shipment.`);
  const v = parse(z.object({ status: z.enum(['in_transit', 'delayed', 'failed']), note: z.string().trim().min(3, 'Add what the courier said'), expected_on: z.string().regex(dateRe).optional().nullable() }), req.body);
  const o = one(ctx.db, 'SELECT * FROM orders WHERE id=?', s.order_id)!;
  tx(ctx.db, () => {
    update(ctx.db, 'shipments', id, { status: v.status, ...(v.expected_on ? { expected_on: v.expected_on } : {}), updated_at: ctx.now() });
    insert(ctx.db, 'tracking_updates', { shipment_id: id, status: v.status, note: v.note, by_user: req.user.id, at: ctx.now() });
    audit(ctx.db, ctx.now(), req.user.id, 'shipment', 'order', o.id, `Shipment #${id}: ${v.status.replace('_', ' ')} — ${v.note}`, { orderId: o.id });
    if (v.status === 'delayed') notify(ctx.db, ctx.now(), o.sales_owner_id, 'shipment_delay', `Shipment delayed on ${o.number}`, `${v.note}${v.expected_on ? `. New expected date ${v.expected_on}` : ''}. Update the customer.`, `/orders/${o.id}?tab=shipments`, `ship_delay:${id}:${v.expected_on ?? s.expected_on}`);
    if (v.status === 'failed') {
      const iid = insert(ctx.db, 'issues', { order_id: o.id, kind: 'failed_delivery', title: `Delivery failed: shipment #${id}`, detail: v.note, priority: 'high', owner_id: o.sales_owner_id, due_date: addDays(today(ctx), 1), created_by: req.user.id, created_at: ctx.now() });
      for (const uid of new Set([o.sales_owner_id, o.procurement_owner_id])) notify(ctx.db, ctx.now(), uid, 'failed_delivery', `Delivery failed on ${o.number}`, v.note, `/orders/${o.id}?tab=issues`, `failed:${iid}`);
    }
  });
  res.json({ ok: true });
});
r.post('/shipments/:id/deliver', requirePerm('shipments.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const s = shipmentOr404(ctx, req.user, id);
  if (!['dispatched', 'in_transit', 'delayed'].includes(s.status)) throw badRequest(`A ${s.status} shipment cannot be marked delivered.`);
  const v = parse(z.object({ delivered_on: z.string().regex(dateRe, 'Enter the delivery date'), received_by_name: z.string().trim().optional().nullable(), pod_attachment_id: z.number().int().positive().optional().nullable() })
    .refine((x) => (x.received_by_name && x.received_by_name.length >= 2) || x.pod_attachment_id, { message: 'Record who received it or attach the proof of delivery', path: ['received_by_name'] }), req.body);
  if (v.delivered_on < (s.dispatched_on ?? '')) throw new HttpError(400, 'validation', 'Delivery date is before the dispatch date.', { fields: { delivered_on: 'Before dispatch' } });
  if (v.pod_attachment_id && !one(ctx.db, 'SELECT id FROM attachments WHERE id=? AND order_id=?', v.pod_attachment_id, s.order_id)) throw badRequest('Upload the proof of delivery to this order first.');
  const o = one(ctx.db, 'SELECT * FROM orders WHERE id=?', s.order_id)!;
  const out = tx(ctx.db, () => {
    update(ctx.db, 'shipments', id, { status: 'delivered', delivered_on: v.delivered_on, received_by_name: v.received_by_name, pod_attachment_id: v.pod_attachment_id ?? null, updated_at: ctx.now() });
    insert(ctx.db, 'tracking_updates', { shipment_id: id, status: 'delivered', note: `Received by ${v.received_by_name ?? 'see proof of delivery'}`, by_user: req.user.id, at: ctx.now() });
    audit(ctx.db, ctx.now(), req.user.id, 'shipment', 'order', o.id, `Shipment #${id} delivered on ${v.delivered_on}${v.received_by_name ? ` to ${v.received_by_name}` : ''}`, { orderId: o.id });
    // The order is delivered only when every box has been delivered — partial shipments never complete it early.
    const missing = readiness(ctx, o, 'delivered');
    if (!missing.length && o.stage === 'dispatch') {
      run(ctx.db, "UPDATE orders SET stage='delivered', next_action=NULL, updated_at=?, version=version+1 WHERE id=?", ctx.now(), o.id);
      audit(ctx.db, ctx.now(), req.user.id, 'stage', 'order', o.id, 'Stage dispatch → delivered (all shipments delivered)', { orderId: o.id });
      notify(ctx.db, ctx.now(), o.sales_owner_id, 'order_delivered', `${o.number} fully delivered`, 'Confirm with the customer and make sure the invoice is raised.', `/orders/${o.id}`, `delivered:${o.id}`);
      notifyRoles(ctx.db, ctx.now(), ['finance'], 'order_delivered', `${o.number} delivered — invoice and collect`, null, `/orders/${o.id}?tab=payments`, `delivered_fin:${o.id}`);
      return { order_delivered: true, remaining: [] };
    }
    return { order_delivered: false, remaining: missing.map((m) => m.message) };
  });
  res.json(out);
});

// ---------------------------------------------------------------- issues
r.get('/issues', (req, res) => {
  const ctx = req.ctx; const { page, pageSize } = pageParams(req); const s = orderScope(req.user);
  const where = [`(i.order_id IS NULL AND ? OR i.order_id IN (SELECT o.id FROM orders o WHERE ${s.sql}) OR i.owner_id=?)`]; const p: unknown[] = [canAny(req.user, 'procurement.write', 'vendors.view') ? 1 : 0, ...s.params, req.user.id];
  const status = qstr(req.query.status) ?? 'open';
  if (status === 'open') where.push("i.status<>'resolved'"); else if (status !== 'all') { where.push('i.status=?'); p.push(status); }
  const kind = qstr(req.query.kind); if (kind) { where.push('i.kind=?'); p.push(kind); }
  if (req.query.owner === 'me') { where.push('i.owner_id=?'); p.push(req.user.id); }
  const order = qstr(req.query.order); if (order) { where.push('i.order_id=?'); p.push(Number(order)); }
  const all = many(ctx.db, `SELECT i.*, o.number order_number, u.name owner_name, v.display_name vendor FROM issues i LEFT JOIN orders o ON o.id=i.order_id JOIN users u ON u.id=i.owner_id LEFT JOIN vendors v ON v.id=i.vendor_id WHERE ${where.join(' AND ')}
    ORDER BY i.status='resolved', CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.due_date`, ...p);
  res.json({ rows: all.slice((page - 1) * pageSize, page * pageSize).map((i) => ({ ...i, overdue: i.status !== 'resolved' && i.due_date && i.due_date < today(ctx) })), total: all.length, page, pageSize });
});
r.post('/issues', (req, res) => {
  const ctx = req.ctx; const v = parse(issueInput, req.body);
  if (v.order_id) assertOrderAccess(ctx, req.user, v.order_id);
  assertUser(ctx, v.owner_id);
  const id = insert(ctx.db, 'issues', { ...v, order_id: v.order_id ?? null, vendor_id: v.vendor_id ?? null, created_by: req.user.id, created_at: ctx.now() });
  audit(ctx.db, ctx.now(), req.user.id, 'issue', 'issue', id, `Issue raised (${v.kind}, ${v.priority}): ${v.title} — owner ${userName(ctx, v.owner_id)}`, { orderId: v.order_id });
  if (v.owner_id !== req.user.id) notify(ctx.db, ctx.now(), v.owner_id, 'issue_assigned', `Issue assigned: ${v.title}`, v.detail, v.order_id ? `/orders/${v.order_id}?tab=issues` : '/fulfilment/issues', `issue:${id}:${v.owner_id}`);
  res.status(201).json({ id });
});
r.patch('/issues/:id', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const i = one(ctx.db, 'SELECT * FROM issues WHERE id=?', id); if (!i) throw notFound('Issue');
  if (i.order_id) assertOrderAccess(ctx, req.user, i.order_id); else if (i.owner_id !== req.user.id && !canAny(req.user, 'procurement.write', 'orders.write')) throw notFound('Issue');
  const v = parse(z.object({ status: z.enum(['open', 'in_progress', 'resolved']).optional(), owner_id: z.number().int().positive().optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(), due_date: z.string().regex(dateRe).optional().nullable(), resolution: z.string().trim().optional() })
    .refine((x) => x.status !== 'resolved' || (x.resolution && x.resolution.length >= 3), { message: 'Describe how it was resolved', path: ['resolution'] }), req.body);
  if (v.owner_id) assertUser(ctx, v.owner_id);
  tx(ctx.db, () => {
    update(ctx.db, 'issues', id, { ...v, ...(v.status === 'resolved' ? { resolved_at: ctx.now() } : {}) });
    const parts = Object.entries(v).map(([k, val]) => `${k.replace('_', ' ')}: ${k === 'owner_id' ? userName(ctx, val as number) : val}`);
    audit(ctx.db, ctx.now(), req.user.id, v.status === 'resolved' ? 'resolved' : 'update', 'issue', id, `Issue #${id} ${parts.join('; ')}`, { orderId: i.order_id });
    if (v.owner_id && v.owner_id !== i.owner_id) notify(ctx.db, ctx.now(), v.owner_id, 'issue_assigned', `Issue assigned: ${i.title}`, null, i.order_id ? `/orders/${i.order_id}?tab=issues` : '/fulfilment/issues', `issue:${id}:${v.owner_id}`);
  });
  res.json({ ok: true });
});

r.get('/dispatch/queue', requirePerm('shipments.write', 'procurement.all'), (req, res) => {
  const ctx = req.ctx; const s = orderScope(req.user); const t = today(ctx);
  const orders = many(ctx.db, `SELECT o.*, c.name company_name FROM orders o JOIN companies c ON c.id=o.company_id WHERE o.archived_at IS NULL AND o.stage IN ('packing','dispatch') AND ${s.sql} ORDER BY o.due_date`, ...s.params);
  res.json({
    orders: orders.map((o) => { const sh = shippable(ctx, o.id); return { id: o.id, number: o.number, title: o.title, company_name: o.company_name, stage: o.stage, due_date: o.due_date, ready_to_ship: sh.ready.reduce((a, x) => a + x.ready_to_ship, 0), total_boxes: sh.ready.reduce((a, x) => a + x.qty, 0), shipped: sh.ready.reduce((a, x) => a + x.shipped, 0) }; }),
    in_transit: many(ctx.db, `SELECT sh.*, o.number order_number, d.label destination, d.city FROM shipments sh JOIN orders o ON o.id=sh.order_id JOIN destinations d ON d.id=sh.destination_id WHERE sh.status IN ('planned','dispatched','in_transit','delayed') AND ${s.sql} ORDER BY sh.expected_on`, ...s.params)
      .map((x) => ({ ...x, overdue: x.expected_on && x.expected_on < t && x.status !== 'planned' })),
  });
});

export { can };
export default r;
