import { Router } from 'express';
import { z } from 'zod';
import { destinationInput, requirementsInput } from '../../shared/schemas.ts';
import { assertOrderAccess, orderScope, stripCosts } from '../access.ts';
import { audit } from '../audit.ts';
import { requirePerm } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { insert, many, one, run, tx, update } from '../db.ts';
import { HttpError, badRequest, blocked, forbidden, notFound } from '../http.ts';
import { notify } from '../notify.ts';
import { can, canAny, type AuthUser } from '../permissions.ts';
import { onDecision, requestApproval } from '../rules/approvals.ts';
import { pageParams, qstr, userName } from '../rules/common.ts';
import { STAGES, componentStatus, deliveryRisk, orderFinance, orderStatus, readiness, type Stage } from '../rules/orders.ts';
import { getSetting } from '../settings.ts';
import { assertUser, checkVersion, intParam, parse } from '../validate.ts';

const r = Router();
const canEditOrder = (u: AuthUser) => canAny(u, 'orders.write', 'procurement.write');
const LOCKED_STAGES = ['packing', 'dispatch', 'delivered', 'closed'];

function loadOrder(ctx: Ctx, user: AuthUser, id: number) {
  assertOrderAccess(ctx, user, id);
  return one(ctx.db, 'SELECT * FROM orders WHERE id=?', id)!;
}
function assertContentEditable(order: Record<string, any>, user: AuthUser) {
  if (!canEditOrder(user)) throw forbidden();
  if (LOCKED_STAGES.includes(order.stage) && !can(user, '*')) throw badRequest('Box contents are locked once packing starts. Ask the founder/admin if a change is unavoidable.');
}
function bump(ctx: Ctx, id: number) { run(ctx.db, 'UPDATE orders SET updated_at=?, version=version+1 WHERE id=?', ctx.now(), id); }

// ---------------------------------------------------------------- list
r.get('/orders', (req, res) => {
  const ctx = req.ctx; const { page, pageSize } = pageParams(req);
  const s = orderScope(req.user); const where = [s.sql]; const p: unknown[] = [...s.params];
  where.push(req.query.archived === '1' ? 'o.archived_at IS NOT NULL' : 'o.archived_at IS NULL');
  const q = qstr(req.query.q);
  if (q) { where.push('(o.number LIKE ? OR o.title LIKE ? OR c.name LIKE ? OR o.customer_po_ref LIKE ?)'); p.push(...Array(4).fill(`%${q}%`)); }
  const stage = qstr(req.query.stage);
  if (stage === 'active') where.push("o.stage NOT IN ('delivered','closed')"); else if (stage) { where.push('o.stage=?'); p.push(stage); }
  const owner = qstr(req.query.owner);
  if (owner) { where.push('(o.sales_owner_id=? OR o.procurement_owner_id=?)'); p.push(Number(owner), Number(owner)); }
  const t = ctx.now().slice(0, 10);
  if (req.query.due === 'overdue') { where.push("o.due_date < ? AND o.stage NOT IN ('delivered','closed')"); p.push(t); }
  if (req.query.due === 'week') { where.push("o.due_date BETWEEN ? AND date(?, '+7 day')"); p.push(t, t); }
  const sort = ({ due: 'o.due_date IS NULL, o.due_date', created: 'o.created_at DESC', number: 'o.number DESC', customer: 'c.name COLLATE NOCASE' } as Record<string, string>)[String(req.query.sort)] ?? 'o.due_date IS NULL, o.due_date';
  // Risk is computed from live procurement data, so filter after computing (order volume is in the hundreds per year).
  const all = many(ctx.db, `SELECT o.*, c.name company_name, su.name sales_owner_name, pu.name procurement_owner_name FROM orders o JOIN companies c ON c.id=o.company_id
    JOIN users su ON su.id=o.sales_owner_id LEFT JOIN users pu ON pu.id=o.procurement_owner_id WHERE ${where.join(' AND ')} ORDER BY ${sort}`, ...p)
    .map((o) => { const risk = deliveryRisk(ctx, o); const status = orderStatus(ctx, o, risk); return { ...o, risk, status, status_owner_name: userName(ctx, status.owner_id) }; });
  const riskF = qstr(req.query.risk);
  const filtered = all.filter((o) => !riskF || (riskF === 'attention' ? o.status.blocked || o.risk.level !== 'on_track' && o.risk.level !== 'none' : riskF === 'blocked' ? o.status.blocked : o.risk.level === riskF));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  res.json({ rows: stripCosts(req.user, rows), total: filtered.length, page, pageSize });
});

// ---------------------------------------------------------------- workspace overview
r.get('/orders/:id', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  const comps = componentStatus(ctx, id);
  const risk = deliveryRisk(ctx, o, comps); const status = orderStatus(ctx, o, risk);
  const idx = STAGES.indexOf(o.stage as Stage); const next = STAGES[idx + 1] as Stage | undefined;
  const order = { ...o, requirements: JSON.parse(o.requirements) };
  const fin = canAny(req.user, 'finance.view', 'margin.view') ? orderFinance(ctx, id) : null;
  res.json(stripCosts(req.user, {
    order,
    company: one(ctx.db, 'SELECT id, name, city FROM companies WHERE id=?', o.company_id),
    contact: o.contact_id ? one(ctx.db, 'SELECT id, name, email, phone, designation FROM contacts WHERE id=?', o.contact_id) : null,
    quotation: o.quotation_id ? one(ctx.db, 'SELECT q.id, q.number, qv.version FROM quotations q JOIN quote_versions qv ON qv.id=? WHERE q.id=?', o.quote_version_id, o.quotation_id) : null,
    customer_approval: o.quotation_id ? one(ctx.db, 'SELECT ca.*, qv.version FROM customer_approvals ca JOIN quote_versions qv ON qv.id=ca.version_id WHERE ca.quotation_id=? ORDER BY ca.id DESC LIMIT 1', o.quotation_id) : null,
    owners: { sales: userName(ctx, o.sales_owner_id), procurement: userName(ctx, o.procurement_owner_id), status: userName(ctx, status.owner_id), blocker: userName(ctx, o.blocker_owner_id) },
    team: many(ctx.db, 'SELECT t.user_id, t.duty, u.name FROM order_team t JOIN users u ON u.id=t.user_id WHERE t.order_id=? ORDER BY t.duty', id),
    status, risk, next_stage: next ?? null, next_missing: next && next !== 'delivered' ? readiness(ctx, o, next) : next === 'delivered' ? readiness(ctx, o, 'delivered') : [],
    stage_labels: getSetting(ctx.db, 'order.stage_labels'),
    finance: fin && (can(req.user, 'finance.view') ? fin : { est_margin_bp: fin.est_margin_bp, actual_margin_bp: fin.actual_margin_bp, margin_provisional: fin.margin_provisional }),
    counts: {
      components: comps.length, components_complete: comps.filter((c) => c.state === 'complete').length,
      open_issues: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM issues WHERE order_id=? AND status<>'resolved'", id)!.n,
      pending_approvals: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM approvals WHERE order_id=? AND status='pending'", id)!.n,
      files: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM attachments WHERE order_id=? AND archived_at IS NULL", id)!.n,
      shipments: one<{ n: number }>(ctx.db, 'SELECT COUNT(*) n FROM shipments WHERE order_id=?', id)!.n,
    },
    tasks: many(ctx.db, "SELECT t.*, u.name owner_name FROM tasks t JOIN users u ON u.id=t.owner_id WHERE t.order_id=? AND t.status='open' ORDER BY t.due_at", id),
    can: { edit: canEditOrder(req.user), finance: can(req.user, 'finance.view'), assign: canAny(req.user, 'sales.assign', 'procurement.all') },
  }));
});

r.patch('/orders/:id', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  if (!canEditOrder(req.user)) throw forbidden();
  const v = parse(z.object({
    title: z.string().trim().min(1, 'Title is required').optional(), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date').optional(),
    procurement_owner_id: z.number().int().positive().optional(), sales_owner_id: z.number().int().positive().optional(),
    next_action: z.string().trim().min(3, 'Describe the next action').optional(), customer_po_ref: z.string().trim().optional().nullable(),
    requirements: requirementsInput.optional(), expected_version: z.number().int().optional(), change_reason: z.string().trim().optional(),
  }), req.body);
  checkVersion(ctx, 'orders', id, v.expected_version);
  if ((v.sales_owner_id && v.sales_owner_id !== o.sales_owner_id) || (v.procurement_owner_id && v.procurement_owner_id !== o.procurement_owner_id)) {
    if (!canAny(req.user, 'sales.assign', 'procurement.all')) throw forbidden('Only a manager can reassign order owners.');
    assertUser(ctx, v.sales_owner_id); assertUser(ctx, v.procurement_owner_id);
  }
  if (v.due_date && v.due_date !== o.due_date && !v.change_reason) throw new HttpError(400, 'validation', 'Say why the due date is changing.', { fields: { change_reason: 'Required when the due date changes' } });
  const patch: Record<string, unknown> = {};
  for (const f of ['title', 'due_date', 'procurement_owner_id', 'sales_owner_id', 'next_action', 'customer_po_ref'] as const) if (f in req.body) patch[f] = v[f];
  if (v.requirements) patch.requirements = JSON.stringify(v.requirements);
  tx(ctx.db, () => {
    update(ctx.db, 'orders', id, { ...patch, updated_at: ctx.now(), version: o.version + 1 });
    const changes: string[] = [];
    for (const [k, val] of Object.entries(patch)) {
      if (k === 'requirements') { changes.push('customer requirements updated'); continue; }
      if (k.endsWith('owner_id')) {
        changes.push(`${k.startsWith('sales') ? 'Sales' : 'Procurement'} owner → ${userName(ctx, val as number)}`);
        run(ctx.db, 'INSERT OR IGNORE INTO order_team VALUES (?,?,?)', id, val, k.startsWith('sales') ? 'sales' : 'procurement');
        notify(ctx.db, ctx.now(), val as number, 'order_assigned', `You now own ${k.startsWith('sales') ? 'customer communication' : 'procurement'} for ${o.number}`, o.title, `/orders/${id}`, `order_owner:${id}:${k}:${val}`);
      } else if (o[k] !== val) changes.push(`${k.replace(/_/g, ' ')}: ${o[k] ?? '—'} → ${val ?? '—'}`);
    }
    audit(ctx.db, ctx.now(), req.user.id, 'update', 'order', id, `${changes.join('; ')}${v.change_reason ? ` (reason: ${v.change_reason})` : ''}`, { orderId: id });
  });
  res.json({ ok: true });
});

r.post('/orders/:id/blocker', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  if (!canEditOrder(req.user) && !canAny(req.user, 'packing.write', 'shipments.write', 'receiving.write')) throw forbidden();
  const v = parse(z.object({ reason: z.string().trim().min(5, 'Describe what is blocking the order'), owner_id: z.number({ error: 'Choose who will unblock it' }).int().positive(), next_action: z.string().trim().min(5, 'Describe the next action') }), req.body);
  assertUser(ctx, v.owner_id);
  tx(ctx.db, () => {
    run(ctx.db, 'UPDATE orders SET blocker_reason=?, blocker_owner_id=?, next_action=?, updated_at=?, version=version+1 WHERE id=?', v.reason, v.owner_id, v.next_action, ctx.now(), id);
    notify(ctx.db, ctx.now(), v.owner_id, 'order_blocked', `${o.number} is blocked — you own the next step`, `${v.reason}. Next: ${v.next_action}`, `/orders/${id}`, `blocked:${id}:${ctx.now()}`);
    audit(ctx.db, ctx.now(), req.user.id, 'blocked', 'order', id, `Blocked: ${v.reason}. Owner ${userName(ctx, v.owner_id)}. Next: ${v.next_action}`, { orderId: id });
  });
  res.json({ ok: true });
});
r.post('/orders/:id/unblock', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  if (!o.blocker_reason) throw badRequest('This order has no manual blocker.');
  const v = parse(z.object({ resolution: z.string().trim().min(3, 'Say how it was resolved'), next_action: z.string().trim().optional() }), req.body);
  run(ctx.db, 'UPDATE orders SET blocker_reason=NULL, blocker_owner_id=NULL, next_action=?, updated_at=?, version=version+1 WHERE id=?', v.next_action || null, ctx.now(), id);
  audit(ctx.db, ctx.now(), req.user.id, 'unblocked', 'order', id, `Blocker cleared: ${v.resolution}`, { orderId: id });
  res.json({ ok: true });
});

/** Move an order forward one stage, enforcing required information. */
r.post('/orders/:id/advance', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  const v = parse(z.object({ to: z.enum(STAGES), override_reason: z.string().trim().optional(), expected_version: z.number().int().optional() }), req.body);
  checkVersion(ctx, 'orders', id, v.expected_version);
  const idx = STAGES.indexOf(o.stage as Stage);
  if (STAGES.indexOf(v.to) !== idx + 1) throw badRequest(`An order in “${o.stage}” can only move to “${STAGES[idx + 1] ?? '—'}”.`);
  const perm: Record<Stage, string[]> = { confirmed: [], procurement: ['procurement.write', 'orders.write'], goods_received: ['receiving.write', 'procurement.write'], quality_check: ['quality.write', 'receiving.write', 'procurement.write'], packing: ['packing.write', 'procurement.write'], dispatch: ['shipments.write', 'packing.write', 'procurement.all'], delivered: ['shipments.write', 'orders.write'], closed: ['finance.write'] };
  if (!canAny(req.user, ...perm[v.to])) throw forbidden(`Your role cannot move orders to ${v.to.replace('_', ' ')}.`);
  const missing = readiness(ctx, o, v.to);
  let overridden = false;
  if (missing.length) {
    if (v.to === 'closed' && v.override_reason && can(req.user, '*')) overridden = true;
    else throw blocked(`This order cannot move to ${String(getSetting(ctx.db, 'order.stage_labels')[v.to as keyof object] ?? v.to)} yet.`, missing);
  }
  tx(ctx.db, () => {
    run(ctx.db, 'UPDATE orders SET stage=?, next_action=NULL, updated_at=?, version=version+1 WHERE id=?', v.to, ctx.now(), id);
    audit(ctx.db, ctx.now(), req.user.id, 'stage', 'order', id, `Stage ${o.stage} → ${v.to}${overridden ? ` (FOUNDER OVERRIDE: ${v.override_reason}; open items: ${missing.map((m) => m.message).join('; ')})` : ''}`, { orderId: id });
    if (v.to === 'procurement') run(ctx.db, "UPDATE tasks SET status='done', completed_at=? WHERE kind='handoff' AND order_id=? AND status='open'", ctx.now(), id);
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- contents: variants, BOM, destinations, allocations, artwork
r.get('/orders/:id/contents', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); loadOrder(ctx, req.user, id);
  res.json(stripCosts(req.user, {
    variants: many(ctx.db, 'SELECT * FROM box_variants WHERE order_id=? ORDER BY sort, id', id).map((v) => ({ ...v, bom: many(ctx.db, 'SELECT * FROM bom_items WHERE variant_id=? AND archived_at IS NULL ORDER BY id', v.id) })),
    destinations: many(ctx.db, 'SELECT * FROM destinations WHERE order_id=? ORDER BY id', id),
    allocations: many(ctx.db, 'SELECT * FROM allocations WHERE order_id=?', id),
    artworks: many(ctx.db, 'SELECT a.*, f.filename, u.name recorded_name, ob.name override_name FROM artworks a LEFT JOIN attachments f ON f.id=a.attachment_id LEFT JOIN users u ON u.id=a.recorded_by LEFT JOIN users ob ON ob.id=a.override_by WHERE a.order_id=? ORDER BY a.variant_id, a.version DESC', id),
    categories: many(ctx.db, 'SELECT name FROM categories WHERE active=1 ORDER BY name').map((c) => c.name),
  }));
});
const variantInput = z.object({ name: z.string().trim().min(1, 'Name is required'), qty: z.number({ error: 'Quantity is required' }).int().positive('Quantity must be at least 1'), customisation: z.string().trim().optional().nullable(), artwork_required: z.boolean().optional() });
r.post('/orders/:id/variants', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id); assertContentEditable(o, req.user);
  const v = parse(variantInput, req.body);
  const vid = insert(ctx.db, 'box_variants', { order_id: id, name: v.name, qty: v.qty, customisation: v.customisation ?? null, artwork_required: v.artwork_required ? 1 : 0, sort: 99 });
  bump(ctx, id); audit(ctx.db, ctx.now(), req.user.id, 'contents', 'order', id, `Box variant “${v.name}” × ${v.qty} added`, { orderId: id });
  res.status(201).json({ id: vid });
});
r.patch('/variants/:id', (req, res) => {
  const ctx = req.ctx; const vid = intParam(req.params.id);
  const vr = one(ctx.db, 'SELECT * FROM box_variants WHERE id=?', vid); if (!vr) throw notFound('Variant');
  const o = loadOrder(ctx, req.user, vr.order_id); assertContentEditable(o, req.user);
  const v = parse(variantInput.partial().extend({ change_reason: z.string().trim().optional() }), req.body);
  if (v.qty && v.qty !== vr.qty && o.stage !== 'confirmed' && !v.change_reason) throw new HttpError(400, 'validation', 'Say why the quantity is changing after handoff.', { fields: { change_reason: 'Required' } });
  update(ctx.db, 'box_variants', vid, { ...(v.name ? { name: v.name } : {}), ...(v.qty ? { qty: v.qty } : {}), ...('customisation' in req.body ? { customisation: v.customisation } : {}), ...('artwork_required' in req.body ? { artwork_required: v.artwork_required ? 1 : 0 } : {}) });
  bump(ctx, o.id);
  audit(ctx.db, ctx.now(), req.user.id, 'contents', 'order', o.id, `Variant “${vr.name}” updated${v.qty && v.qty !== vr.qty ? `: quantity ${vr.qty} → ${v.qty}` : ''}${v.change_reason ? ` (${v.change_reason})` : ''}`, { orderId: o.id });
  if (v.qty && v.qty !== vr.qty && o.procurement_owner_id) notify(ctx.db, ctx.now(), o.procurement_owner_id, 'order_changed', `${o.number}: quantity changed for ${vr.name}`, `${vr.qty} → ${v.qty}`, `/orders/${o.id}`, `qty:${vid}:${v.qty}`);
  res.json({ ok: true });
});
const bomInput = z.object({
  component_name: z.string().trim().min(1, 'Component is required'), category: z.string().trim().optional().nullable(), qty_per_box: z.number({ error: 'Quantity per box is required' }).int().positive('At least 1'),
  unit: z.string().trim().min(1).default('pc'), is_packaging: z.boolean().optional(), is_critical: z.boolean().optional(), spec: z.string().trim().optional().nullable(),
  est_unit_cost_paise: z.number().int().min(0).optional(), lead_time_days: z.number().int().positive().optional().nullable(),
});
r.post('/variants/:id/bom', (req, res) => {
  const ctx = req.ctx; const vid = intParam(req.params.id);
  const vr = one(ctx.db, 'SELECT * FROM box_variants WHERE id=?', vid); if (!vr) throw notFound('Variant');
  const o = loadOrder(ctx, req.user, vr.order_id); assertContentEditable(o, req.user);
  const v = parse(bomInput, req.body);
  const bid = insert(ctx.db, 'bom_items', { order_id: o.id, variant_id: vid, component_name: v.component_name, category: v.category, qty_per_box: v.qty_per_box, unit: v.unit, is_packaging: v.is_packaging ? 1 : 0, is_critical: v.is_critical ? 1 : 0, spec: v.spec, est_unit_cost_paise: v.est_unit_cost_paise ?? 0, lead_time_days: v.lead_time_days });
  bump(ctx, o.id); audit(ctx.db, ctx.now(), req.user.id, 'contents', 'order', o.id, `BOM: ${v.qty_per_box} × ${v.component_name} added to “${vr.name}”`, { orderId: o.id });
  res.status(201).json({ id: bid });
});
r.patch('/bom/:id', (req, res) => {
  const ctx = req.ctx; const bid = intParam(req.params.id);
  const b = one(ctx.db, 'SELECT * FROM bom_items WHERE id=?', bid); if (!b) throw notFound('Component');
  const o = loadOrder(ctx, req.user, b.order_id); assertContentEditable(o, req.user);
  const v = parse(bomInput.partial().extend({ archived: z.boolean().optional() }), req.body);
  if (v.archived && one(ctx.db, "SELECT pl.id FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id WHERE pl.bom_item_id=? AND po.status<>'cancelled'", bid)) throw badRequest('This component is on a purchase order. Cancel the PO line first.');
  const patch: Record<string, unknown> = {};
  for (const f of ['component_name', 'category', 'qty_per_box', 'unit', 'spec', 'est_unit_cost_paise', 'lead_time_days'] as const) if (f in req.body) patch[f] = v[f];
  for (const f of ['is_packaging', 'is_critical'] as const) if (f in req.body) patch[f] = v[f] ? 1 : 0;
  if (v.archived) patch.archived_at = ctx.now();
  update(ctx.db, 'bom_items', bid, patch); bump(ctx, o.id);
  audit(ctx.db, ctx.now(), req.user.id, 'contents', 'order', o.id, `BOM: ${b.component_name} ${v.archived ? 'removed' : 'updated'}`, { orderId: o.id });
  res.json({ ok: true });
});
r.post('/orders/:id/destinations', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  if (!canEditOrder(req.user)) throw forbidden();
  if (['delivered', 'closed'].includes(o.stage)) throw badRequest('Order is already delivered.');
  const v = parse(destinationInput, req.body);
  const did = insert(ctx.db, 'destinations', { order_id: id, ...v });
  bump(ctx, id); audit(ctx.db, ctx.now(), req.user.id, 'contents', 'order', id, `Destination “${v.label}” added (${v.city ?? ''})`, { orderId: id });
  res.status(201).json({ id: did });
});
r.patch('/destinations/:id', (req, res) => {
  const ctx = req.ctx; const did = intParam(req.params.id);
  const d = one(ctx.db, 'SELECT * FROM destinations WHERE id=?', did); if (!d) throw notFound('Destination');
  loadOrder(ctx, req.user, d.order_id); if (!canEditOrder(req.user)) throw forbidden();
  const v = parse(destinationInput.partial(), req.body);
  if (one(ctx.db, "SELECT id FROM shipments WHERE destination_id=? AND status<>'planned'", did)) throw badRequest('A shipment already left for this address; add a new destination instead.');
  update(ctx.db, 'destinations', did, v);
  audit(ctx.db, ctx.now(), req.user.id, 'contents', 'order', d.order_id, `Destination “${d.label}” updated`, { orderId: d.order_id });
  res.json({ ok: true });
});
r.put('/orders/:id/allocations', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  if (!canEditOrder(req.user)) throw forbidden();
  const { rows } = parse(z.object({ rows: z.array(z.object({ variant_id: z.number().int(), destination_id: z.number().int(), qty: z.number().int().min(0) })) }), req.body);
  const variants = new Map(many(ctx.db, 'SELECT id, name, qty FROM box_variants WHERE order_id=?', id).map((v) => [v.id, v]));
  const dests = new Set(many(ctx.db, 'SELECT id FROM destinations WHERE order_id=?', id).map((d) => d.id));
  const sums = new Map<number, number>();
  for (const row of rows) {
    if (!variants.has(row.variant_id) || !dests.has(row.destination_id)) throw badRequest('Allocation refers to a variant or destination from another order.');
    sums.set(row.variant_id, (sums.get(row.variant_id) ?? 0) + row.qty);
  }
  for (const [vid, s] of sums) if (s > variants.get(vid)!.qty) throw new HttpError(400, 'validation', `“${variants.get(vid)!.name}”: ${s} allocated but only ${variants.get(vid)!.qty} boxes ordered.`, { fields: {} });
  tx(ctx.db, () => {
    run(ctx.db, 'DELETE FROM allocations WHERE order_id=?', id);
    for (const row of rows.filter((x) => x.qty > 0)) insert(ctx.db, 'allocations', { order_id: id, ...row });
    bump(ctx, id); audit(ctx.db, ctx.now(), req.user.id, 'contents', 'order', id, 'Destination allocations updated', { orderId: id, details: rows });
  });
  void o; res.json({ ok: true });
});

r.post('/orders/:id/artworks', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); loadOrder(ctx, req.user, id);
  if (!canEditOrder(req.user)) throw forbidden();
  const v = parse(z.object({ variant_id: z.number().int().positive().optional().nullable(), attachment_id: z.number({ error: 'Upload the artwork file first' }).int().positive(), notes: z.string().trim().optional().nullable() }), req.body);
  if (!one(ctx.db, 'SELECT id FROM attachments WHERE id=? AND order_id=?', v.attachment_id, id)) throw badRequest('Upload the artwork to this order first.');
  const ver = (one<{ m: number | null }>(ctx.db, 'SELECT MAX(version) m FROM artworks WHERE order_id=? AND COALESCE(variant_id,0)=?', id, v.variant_id ?? 0)!.m ?? 0) + 1;
  const aid = tx(ctx.db, () => {
    run(ctx.db, "UPDATE artworks SET status='rejected', notes=COALESCE(notes,'') || ' (superseded)' WHERE order_id=? AND COALESCE(variant_id,0)=? AND status='pending'", id, v.variant_id ?? 0);
    const aid = insert(ctx.db, 'artworks', { order_id: id, variant_id: v.variant_id ?? null, version: ver, attachment_id: v.attachment_id, notes: v.notes, recorded_by: req.user.id, created_at: ctx.now() });
    audit(ctx.db, ctx.now(), req.user.id, 'artwork', 'order', id, `Artwork v${ver} uploaded for approval`, { orderId: id });
    return aid;
  });
  res.status(201).json({ id: aid, version: ver });
});
r.post('/artworks/:id/decision', (req, res) => {
  const ctx = req.ctx; const aid = intParam(req.params.id);
  const a = one(ctx.db, 'SELECT * FROM artworks WHERE id=?', aid); if (!a) throw notFound('Artwork');
  loadOrder(ctx, req.user, a.order_id); if (!canEditOrder(req.user)) throw forbidden();
  const v = parse(z.discriminatedUnion('decision', [
    z.object({ decision: z.literal('approved'), approved_by_name: z.string().trim().min(2, 'Who at the customer approved it?'), approved_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date') }),
    z.object({ decision: z.literal('rejected'), note: z.string().trim().min(3, 'Say what must change') }),
    z.object({ decision: z.literal('override'), reason: z.string().trim().min(10, 'Give a reason of at least 10 characters') }),
  ]), req.body);
  if (a.status !== 'pending') throw new HttpError(409, 'conflict', 'This artwork version was already decided.');
  if (v.decision === 'override' && !canAny(req.user, 'quotes.approve', 'procurement.override')) throw forbidden('Only a manager or the founder can approve use of unapproved artwork.');
  tx(ctx.db, () => {
    if (v.decision === 'approved') update(ctx.db, 'artworks', aid, { status: 'approved', approved_by_name: v.approved_by_name, approved_on: v.approved_on });
    if (v.decision === 'rejected') update(ctx.db, 'artworks', aid, { status: 'rejected', notes: [a.notes, v.note].filter(Boolean).join(' — ') });
    if (v.decision === 'override') update(ctx.db, 'artworks', aid, { status: 'approved', override_by: req.user.id, override_reason: v.reason });
    audit(ctx.db, ctx.now(), req.user.id, 'artwork', 'order', a.order_id, v.decision === 'approved' ? `Artwork v${a.version} approved by ${v.approved_by_name} on ${v.approved_on}` : v.decision === 'rejected' ? `Artwork v${a.version} rejected: ${v.note}` : `ARTWORK OVERRIDE: v${a.version} used without customer approval — ${v.reason}`, { orderId: a.order_id });
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- components, costing, history, team
r.get('/orders/:id/components', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); loadOrder(ctx, req.user, id);
  res.json(stripCosts(req.user, { rows: componentStatus(ctx, id) }));
});
r.get('/orders/:id/costing', requirePerm('margin.view', 'finance.view'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  const quoteLines = o.quote_version_id ? many(ctx.db, 'SELECT description, qty, unit_price_paise, unit_cost_paise FROM quote_lines WHERE version_id=? ORDER BY sort', o.quote_version_id) : [];
  res.json({
    finance: orderFinance(ctx, id), quote_lines: quoteLines,
    costs: many(ctx.db, 'SELECT oc.*, u.name recorded_name FROM order_costs oc LEFT JOIN users u ON u.id=oc.recorded_by WHERE order_id=? ORDER BY incurred_on', id),
    purchase_orders: many(ctx.db, "SELECT po.id, po.number, po.status, v.display_name vendor FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id WHERE po.order_id=? AND po.archived_at IS NULL ORDER BY po.id", id),
  });
});
r.post('/orders/:id/costs', requirePerm('finance.write', 'procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); loadOrder(ctx, req.user, id);
  const v = parse(z.object({ kind: z.enum(['packaging', 'customisation', 'shipping', 'other']), description: z.string().trim().min(2, 'Describe the cost'), amount_paise: z.number().int().positive('Amount must be more than zero'), incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date') }), req.body);
  const cid = insert(ctx.db, 'order_costs', { order_id: id, ...v, recorded_by: req.user.id });
  audit(ctx.db, ctx.now(), req.user.id, 'cost', 'order', id, `${v.kind} cost added: ${v.description} ₹${v.amount_paise / 100}`, { orderId: id });
  res.status(201).json({ id: cid });
});
r.get('/orders/:id/history', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); loadOrder(ctx, req.user, id);
  const kind = qstr(req.query.kind);
  const rows = many(ctx.db, `SELECT a.id, a.at, a.action, a.summary, a.entity_type, u.name user_name FROM audit_events a LEFT JOIN users u ON u.id=a.user_id WHERE a.order_id=? ${kind === 'comments' ? "AND a.action='comment'" : kind === 'exceptions' ? "AND (a.action IN ('blocked','override','approved','rejected') OR a.summary LIKE '%OVERRIDE%')" : ''} ORDER BY a.id DESC LIMIT 500`, id);
  const contacts = many(ctx.db, 'SELECT cl.*, u.name by_name FROM contact_log cl JOIN users u ON u.id=cl.by_user WHERE cl.order_id=? ORDER BY cl.at DESC', id);
  res.json({ rows, contacts });
});
r.post('/orders/:id/comments', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  const { text, mention } = parse(z.object({ text: z.string().trim().min(1, 'Write a comment').max(4000), mention: z.number().int().positive().optional() }), req.body);
  audit(ctx.db, ctx.now(), req.user.id, 'comment', 'order', id, text, { orderId: id });
  if (mention) { assertUser(ctx, mention); notify(ctx.db, ctx.now(), mention, 'mention', `${req.user.name} mentioned you on ${o.number}`, text.slice(0, 200), `/orders/${id}?tab=activity`, `mention:${id}:${ctx.now()}:${mention}`); }
  res.status(201).json({ ok: true });
});
r.post('/orders/:id/team', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  if (!canAny(req.user, 'sales.assign', 'procurement.all', 'orders.write')) throw forbidden();
  const v = parse(z.object({ user_id: z.number().int().positive(), duty: z.enum(['sales', 'procurement', 'packing', 'quality', 'dispatch', 'finance']), remove: z.boolean().optional() }), req.body);
  assertUser(ctx, v.user_id);
  if (v.remove) run(ctx.db, 'DELETE FROM order_team WHERE order_id=? AND user_id=? AND duty=?', id, v.user_id, v.duty);
  else { run(ctx.db, 'INSERT OR IGNORE INTO order_team VALUES (?,?,?)', id, v.user_id, v.duty); notify(ctx.db, ctx.now(), v.user_id, 'order_assigned', `You were added to ${o.number} (${v.duty})`, o.title, `/orders/${id}`, `team:${id}:${v.user_id}:${v.duty}`); }
  audit(ctx.db, ctx.now(), req.user.id, 'team', 'order', id, `${userName(ctx, v.user_id)} ${v.remove ? 'removed from' : 'added as'} ${v.duty}`, { orderId: id });
  res.json({ ok: true });
});
r.post('/orders/:id/archive', requirePerm('*'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Give a reason') }), req.body);
  run(ctx.db, 'UPDATE orders SET archived_at=?, updated_at=? WHERE id=?', ctx.now(), ctx.now(), id);
  audit(ctx.db, ctx.now(), req.user.id, 'archive', 'order', id, `Order ${o.number} archived: ${reason}`, { orderId: id });
  res.json({ ok: true });
});
r.post('/orders/:id/partial-packing', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const o = loadOrder(ctx, req.user, id);
  if (!canAny(req.user, 'packing.write', 'procurement.write')) throw forbidden();
  const { reason } = parse(z.object({ reason: z.string().trim().min(10, 'Explain why packing should start with missing components') }), req.body);
  const missing = readiness(ctx, o, 'packing');
  const aid = requestApproval(ctx, req.user, { kind: 'partial_packing', entity_type: 'order', entity_id: id, order_id: id, title: `Partial packing for ${o.number}`, detail: `${reason}. Missing: ${missing.map((m) => m.message).join('; ')}`, required_permission: 'procurement.override', link: `/orders/${id}` });
  res.status(201).json({ id: aid });
});
onDecision('partial_packing', () => { /* approval row itself is what readiness() checks */ });

export default r;
