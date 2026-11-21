import { Router } from 'express';
import { z } from 'zod';
import { vendorPaymentInput, vendorQuoteInput } from '../../shared/schemas.ts';
import { assertOrderAccess, assertPoAccess, orderScope, stripCosts } from '../access.ts';
import { audit } from '../audit.ts';
import { requirePerm } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { addDays, daysBetween, today } from '../context.ts';
import { insert, many, nextNumber, one, run, tx, update } from '../db.ts';
import { HttpError, badRequest, blocked, forbidden, notFound } from '../http.ts';
import { mulBp } from '../money.ts';
import { notify, notifyRoles } from '../notify.ts';
import { can, canAny, type AuthUser } from '../permissions.ts';
import { onDecision, requestApproval } from '../rules/approvals.ts';
import { pageParams, qstr, userName } from '../rules/common.ts';
import { LINE_MATH, componentStatus, deliveryRisk, poTotals } from '../rules/orders.ts';
import { PURCHASABLE, type VendorState } from '../rules/vendors.ts';
import { getSetting } from '../settings.ts';
import { assertUser, intParam, parse } from '../validate.ts';

const r = Router();
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------- queue + arrivals
r.get('/procurement/queue', requirePerm('procurement.write', 'receiving.write'), (req, res) => {
  const ctx = req.ctx; const s = orderScope(req.user);
  const mine = req.query.scope === 'mine';
  const orders = many(ctx.db, `SELECT o.*, c.name company_name, pu.name procurement_owner_name FROM orders o JOIN companies c ON c.id=o.company_id LEFT JOIN users pu ON pu.id=o.procurement_owner_id
    WHERE o.archived_at IS NULL AND o.stage IN ('confirmed','procurement','goods_received','quality_check') AND ${s.sql} ${mine ? 'AND o.procurement_owner_id=?' : ''} ORDER BY o.due_date`, ...s.params, ...(mine ? [req.user.id] : []));
  const rows = orders.map((o) => {
    const comps = componentStatus(ctx, o.id);
    return { id: o.id, number: o.number, title: o.title, company_name: o.company_name, stage: o.stage, due_date: o.due_date, procurement_owner_name: o.procurement_owner_name,
      components: comps.length, not_ordered: comps.filter((c) => c.state === 'not_ordered').length, incoming: comps.filter((c) => c.state === 'incoming').length,
      awaiting_qc: comps.filter((c) => c.state === 'awaiting_qc').length, complete: comps.filter((c) => c.state === 'complete').length, risk: deliveryRisk(ctx, o, comps) };
  });
  const t = today(ctx);
  res.json({
    orders: rows,
    rfqs_waiting: many(ctx.db, `SELECT vq.id, vq.response_due, v.display_name vendor, r.title, r.id rfq_id FROM vendor_quotes vq JOIN rfqs r ON r.id=vq.rfq_id JOIN vendors v ON v.id=vq.vendor_id WHERE vq.status='requested' AND r.status='open' ORDER BY vq.response_due`),
    awaiting_confirmation: many(ctx.db, `SELECT po.id, po.number, po.confirmation_due, v.display_name vendor FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id WHERE po.status='issued' AND po.archived_at IS NULL ORDER BY po.confirmation_due`),
    feasibility: many(ctx.db, `SELECT f.id, f.requested_at, op.title, op.id opportunity_id, a.name assigned_name FROM feasibility_checks f JOIN opportunities op ON op.id=f.opportunity_id LEFT JOIN users a ON a.id=f.assigned_to WHERE f.status='requested' ${can(req.user, 'procurement.all') ? '' : 'AND f.assigned_to=?'} ORDER BY f.requested_at`, ...(can(req.user, 'procurement.all') ? [] : [req.user.id])),
    today: t,
  });
});

function visiblePoWhere(user: AuthUser): { sql: string; params: unknown[] } {
  if (canAny(user, 'procurement.all', 'finance.view')) return { sql: '1=1', params: [] };
  const s = orderScope(user);
  return { sql: `(po.owner_id=? OR po.created_by=? OR (po.order_id IS NOT NULL AND EXISTS (SELECT 1 FROM orders o WHERE o.id=po.order_id AND ${s.sql})))`, params: [user.id, user.id, ...s.params] };
}

r.get('/arrivals', requirePerm('procurement.write', 'receiving.write'), (req, res) => {
  const ctx = req.ctx; const w = visiblePoWhere(req.user); const t = today(ctx);
  const days = Math.min(60, Number(req.query.days) || 14);
  const rows = many(ctx.db, `SELECT pl.id po_line_id, pl.description, pl.qty_ordered, pl.qty_received, ${LINE_MATH}, po.id po_id, po.number, po.promised_date, po.status, v.display_name vendor, o.number order_number, o.id order_id, o.due_date order_due
    FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id JOIN vendors v ON v.id=po.vendor_id LEFT JOIN orders o ON o.id=po.order_id
    WHERE po.status IN ('issued','confirmed','partially_received') AND po.archived_at IS NULL AND ${w.sql} AND (po.promised_date IS NULL OR po.promised_date <= date(?, '+' || ? || ' day'))
    ORDER BY po.promised_date IS NULL, po.promised_date`, ...w.params, t, days).filter((x) => x.outstanding > 0)
    .map((x) => ({ ...x, overdue: !!x.promised_date && x.promised_date < t, days_until: x.promised_date ? daysBetween(t, x.promised_date) : null }));
  res.json({ rows, today: t });
});

// ---------------------------------------------------------------- RFQs + comparison
r.get('/rfqs', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const status = qstr(req.query.status) ?? 'open';
  const rows = many(ctx.db, `SELECT r.*, o.number order_number, b.component_name,
      (SELECT COUNT(*) FROM vendor_quotes vq WHERE vq.rfq_id=r.id) requested, (SELECT COUNT(*) FROM vendor_quotes vq WHERE vq.rfq_id=r.id AND vq.status='received') received
    FROM rfqs r LEFT JOIN orders o ON o.id=r.order_id LEFT JOIN bom_items b ON b.id=r.bom_item_id WHERE ${status === 'all' ? '1=1' : 'r.status=?'} ORDER BY r.id DESC LIMIT 200`, ...(status === 'all' ? [] : [status]));
  res.json({ rows });
});
const rfqInput = z.object({
  order_id: z.number().int().positive().optional().nullable(), bom_item_id: z.number().int().positive().optional().nullable(),
  title: z.string().trim().min(2, 'Describe what you are sourcing'), qty: z.number({ error: 'Quantity is required' }).int().positive('Quantity must be at least 1'),
  needed_by: z.string().regex(dateRe, 'Enter a valid date').optional().nullable(), is_critical: z.boolean().optional(),
  vendor_ids: z.array(z.number().int().positive()).min(1, 'Choose at least one vendor'), response_due: z.string().regex(dateRe, 'Enter a valid date'),
});
function addVendorsToRfq(ctx: Ctx, user: AuthUser, rfqId: number, vendorIds: number[], due: string) {
  for (const vid of vendorIds) {
    const v = one(ctx.db, 'SELECT id, display_name, status FROM vendors WHERE id=? AND archived_at IS NULL', vid);
    if (!v) throw badRequest('Vendor not found.');
    if (['suspended', 'rejected', 'inactive'].includes(v.status)) throw badRequest(`${v.display_name} is ${v.status}; you cannot request quotes from them.`);
    run(ctx.db, 'INSERT OR IGNORE INTO vendor_quotes (rfq_id, vendor_id, requested_at, response_due) VALUES (?,?,?,?)', rfqId, vid, ctx.now(), due);
    insert(ctx.db, 'vendor_events', { vendor_id: vid, kind: 'contact', summary: `Quote requested for RFQ #${rfqId}`, by_user: user.id, at: ctx.now() });
  }
}
r.post('/rfqs', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const v = parse(rfqInput, req.body);
  if (v.order_id) assertOrderAccess(ctx, req.user, v.order_id);
  if (v.bom_item_id && !one(ctx.db, 'SELECT id FROM bom_items WHERE id=? AND order_id IS ?', v.bom_item_id, v.order_id ?? null)) throw badRequest('Component does not belong to this order.');
  const id = tx(ctx.db, () => {
    const id = insert(ctx.db, 'rfqs', { order_id: v.order_id ?? null, bom_item_id: v.bom_item_id ?? null, title: v.title, qty: v.qty, needed_by: v.needed_by ?? null, is_critical: v.is_critical ? 1 : 0, created_by: req.user.id, created_at: ctx.now() });
    addVendorsToRfq(ctx, req.user, id, v.vendor_ids, v.response_due);
    audit(ctx.db, ctx.now(), req.user.id, 'rfq', 'rfq', id, `RFQ “${v.title}” × ${v.qty} sent to ${v.vendor_ids.length} vendor(s)`, { orderId: v.order_id });
    return id;
  });
  res.status(201).json({ id });
});
r.post('/rfqs/:id/vendors', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const rfq = one(ctx.db, 'SELECT * FROM rfqs WHERE id=?', id); if (!rfq) throw notFound('RFQ');
  if (rfq.status !== 'open') throw badRequest('This RFQ is closed.');
  const v = parse(z.object({ vendor_ids: z.array(z.number().int().positive()).min(1), response_due: z.string().regex(dateRe) }), req.body);
  tx(ctx.db, () => addVendorsToRfq(ctx, req.user, id, v.vendor_ids, v.response_due));
  res.json({ ok: true });
});

export function compareQuotes(ctx: Ctx, rfq: Record<string, any>) {
  const t = today(ctx); const buffer = getSetting(ctx.db, 'risk.buffer_days');
  const quotes = many(ctx.db, `SELECT vq.*, v.display_name vendor, v.status vendor_status, v.lead_time_days vendor_lead_time FROM vendor_quotes vq JOIN vendors v ON v.id=vq.vendor_id WHERE vq.rfq_id=? ORDER BY vq.id`, rfq.id);
  const rows = quotes.map((q) => {
    if (q.status !== 'received') return { ...q, flags: [] as string[] };
    const goods = rfq.qty * q.unit_price_paise; const tax = mulBp(goods, q.tax_bp ?? 0);
    const landed = goods + tax + q.shipping_paise;
    const arrival = addDays(t, q.lead_time_days);
    const flags: string[] = [];
    if (!PURCHASABLE.includes(q.vendor_status as VendorState)) flags.push(`Vendor is ${q.vendor_status.replace('_', ' ')} — not approved for purchase orders`);
    if (q.moq && q.moq > rfq.qty) flags.push(`MOQ ${q.moq} is above the ${rfq.qty} needed`);
    if (q.valid_until && q.valid_until < t) flags.push(`Quote expired ${q.valid_until}`);
    let risk: 'ok' | 'tight' | 'late' | 'unknown' = 'unknown';
    if (rfq.needed_by) { const slack = daysBetween(arrival, rfq.needed_by); risk = slack < 0 ? 'late' : slack < buffer ? 'tight' : 'ok'; }
    return { ...q, goods_paise: goods, tax_paise: tax, landed_paise: landed, landed_per_unit_paise: Math.round(landed / rfq.qty), expected_arrival: arrival, delivery_risk: risk, flags };
  });
  const received = rows.filter((x) => x.status === 'received') as Array<Record<string, any>>;
  const cheapest = received.reduce<Record<string, any> | null>((a, b) => (!a || b.landed_paise < a.landed_paise ? b : a), null);
  const fastest = received.reduce<Record<string, any> | null>((a, b) => (!a || b.lead_time_days < a.lead_time_days ? b : a), null);
  return rows.map((x) => ({ ...x, cheapest: cheapest?.id === x.id, fastest: fastest?.id === x.id }));
}
r.get('/rfqs/:id', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const rfq = one(ctx.db, 'SELECT r.*, o.number order_number, o.due_date order_due, b.component_name, b.spec, u.name created_name FROM rfqs r LEFT JOIN orders o ON o.id=r.order_id LEFT JOIN bom_items b ON b.id=r.bom_item_id LEFT JOIN users u ON u.id=r.created_by WHERE r.id=?', id);
  if (!rfq) throw notFound('RFQ');
  if (rfq.order_id) assertOrderAccess(ctx, req.user, rfq.order_id);
  res.json({ rfq, quotes: compareQuotes(ctx, rfq), purchase_orders: many(ctx.db, "SELECT id, number, status, vendor_id FROM purchase_orders WHERE vendor_quote_id IN (SELECT id FROM vendor_quotes WHERE rfq_id=?)", id) });
});
r.put('/vendor-quotes/:id', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const q = one(ctx.db, 'SELECT vq.*, r.status rfq_status FROM vendor_quotes vq JOIN rfqs r ON r.id=vq.rfq_id WHERE vq.id=?', id); if (!q) throw notFound('Quote');
  if (q.rfq_status !== 'open') throw badRequest('This RFQ is already awarded or cancelled.');
  const v = parse(vendorQuoteInput, req.body);
  update(ctx.db, 'vendor_quotes', id, { ...v, status: 'received', received_at: ctx.now() });
  insert(ctx.db, 'vendor_events', { vendor_id: q.vendor_id, kind: 'contact', summary: `Quote received for RFQ #${q.rfq_id}: ₹${v.unit_price_paise / 100}/unit, ${v.lead_time_days} days`, by_user: req.user.id, at: ctx.now() });
  audit(ctx.db, ctx.now(), req.user.id, 'quote', 'rfq', q.rfq_id, `Vendor quote recorded (${one<{ display_name: string }>(ctx.db, 'SELECT display_name FROM vendors WHERE id=?', q.vendor_id)!.display_name})`);
  res.json({ ok: true });
});
r.post('/vendor-quotes/:id/decline', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const q = one(ctx.db, 'SELECT * FROM vendor_quotes WHERE id=?', id); if (!q) throw notFound('Quote');
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Say why') }), req.body);
  update(ctx.db, 'vendor_quotes', id, { status: 'declined', notes: reason, received_at: ctx.now() });
  insert(ctx.db, 'vendor_events', { vendor_id: q.vendor_id, kind: 'contact', summary: `Declined to quote for RFQ #${q.rfq_id}: ${reason}`, by_user: req.user.id, at: ctx.now() });
  res.json({ ok: true });
});
r.post('/rfqs/:id/award', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const rfq = one(ctx.db, 'SELECT * FROM rfqs WHERE id=?', id); if (!rfq) throw notFound('RFQ');
  if (rfq.order_id) assertOrderAccess(ctx, req.user, rfq.order_id);
  if (rfq.status !== 'open') throw badRequest('This RFQ is already closed.');
  const v = parse(z.object({ quote_id: z.number().int().positive(), reason: z.string().trim().min(5, 'Record why this vendor was selected'), backup_quote_id: z.number().int().positive().optional().nullable() }), req.body);
  const quotes = compareQuotes(ctx, rfq);
  const chosen = quotes.find((x) => x.id === v.quote_id);
  if (!chosen || chosen.status !== 'received') throw badRequest('Choose a received quote from this RFQ.');
  if (v.backup_quote_id) {
    const b = quotes.find((x) => x.id === v.backup_quote_id);
    if (!b || b.status !== 'received' || b.vendor_id === chosen.vendor_id) throw badRequest('The backup must be a received quote from a different vendor.');
  }
  tx(ctx.db, () => {
    update(ctx.db, 'rfqs', id, { status: 'awarded', selected_quote_id: v.quote_id, selection_reason: v.reason, backup_quote_id: v.backup_quote_id ?? null });
    audit(ctx.db, ctx.now(), req.user.id, 'award', 'rfq', id, `RFQ “${rfq.title}” awarded to ${chosen.vendor} (landed ₹${(chosen.landed_paise ?? 0) / 100}). Reason: ${v.reason}${v.backup_quote_id ? `. Backup: ${quotes.find((x) => x.id === v.backup_quote_id)!.vendor}` : ''}`, { orderId: rfq.order_id });
  });
  res.json({ ok: true, warnings: [...chosen.flags, ...(rfq.is_critical && !v.backup_quote_id ? ['Critical component awarded without a backup source'] : [])] });
});
r.post('/rfqs/:id/cancel', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const rfq = one(ctx.db, 'SELECT * FROM rfqs WHERE id=?', id); if (!rfq) throw notFound('RFQ');
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Say why') }), req.body);
  update(ctx.db, 'rfqs', id, { status: 'cancelled', selection_reason: reason });
  audit(ctx.db, ctx.now(), req.user.id, 'cancel', 'rfq', id, `RFQ cancelled: ${reason}`, { orderId: rfq.order_id });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- purchase orders
/** Normal POs go only to approved/active vendors; anything else needs a logged override by an authorised person. */
function vendorGate(ctx: Ctx, user: AuthUser, vendorId: number, overrideReason: string | null | undefined) {
  const v = one(ctx.db, 'SELECT id, display_name, status FROM vendors WHERE id=? AND archived_at IS NULL', vendorId);
  if (!v) throw badRequest('Vendor not found.');
  if (PURCHASABLE.includes(v.status as VendorState)) return { vendor: v, overridden: false };
  if (!overrideReason) throw blocked(`${v.display_name} is ${v.status.replace('_', ' ')} and cannot receive a purchase order.`, [{ code: 'vendor_status', message: `Vendor status: ${v.status.replace('_', ' ')}`, fix: v.status === 'suspended' ? 'Reinstate the vendor, choose another vendor, or have a procurement manager/founder record an override with a reason.' : 'Complete onboarding and approval, or have a procurement manager/founder record an override with a reason.' }]);
  if (!can(user, 'procurement.override')) throw forbidden('Only a procurement manager or the founder can override vendor approval.');
  if (overrideReason.trim().length < 10) throw new HttpError(400, 'validation', 'Override reason must be at least 10 characters.', { fields: { override_reason: 'At least 10 characters' } });
  return { vendor: v, overridden: true };
}
const poInput = z.object({
  order_id: z.number().int().positive().optional().nullable(), vendor_id: z.number({ error: 'Choose a vendor' }).int().positive(),
  vendor_quote_id: z.number().int().positive().optional().nullable(),
  lines: z.array(z.object({ bom_item_id: z.number().int().positive().optional().nullable(), description: z.string().trim().min(1, 'Describe the item'), qty_ordered: z.number().int().positive('Quantity must be at least 1'), unit_price_paise: z.number().int().min(0), tax_bp: z.number().int().min(0).max(10000) })).min(1, 'Add at least one line'),
  shipping_paise: z.number().int().min(0).default(0), promised_date: z.string().regex(dateRe, 'Enter the promised date'),
  advance_required_paise: z.number().int().min(0).default(0), notes: z.string().trim().optional().nullable(), override_reason: z.string().trim().optional().nullable(),
});
function createPo(ctx: Ctx, user: AuthUser, v: z.output<typeof poInput>) {
  if (v.order_id) assertOrderAccess(ctx, user, v.order_id);
  for (const l of v.lines) if (l.bom_item_id && !one(ctx.db, 'SELECT id FROM bom_items WHERE id=? AND order_id IS ?', l.bom_item_id, v.order_id ?? null)) throw badRequest('A line refers to a component from another order.');
  const gate = vendorGate(ctx, user, v.vendor_id, v.override_reason);
  return tx(ctx.db, () => {
    const number = nextNumber(ctx.db, 'po', 'PO', Number(today(ctx).slice(0, 4)));
    const order = v.order_id ? one(ctx.db, 'SELECT procurement_owner_id FROM orders WHERE id=?', v.order_id) : null;
    const id = insert(ctx.db, 'purchase_orders', {
      number, order_id: v.order_id ?? null, vendor_id: v.vendor_id, vendor_quote_id: v.vendor_quote_id ?? null, promised_date: v.promised_date,
      shipping_paise: v.shipping_paise, advance_required_paise: v.advance_required_paise, notes: v.notes,
      override_by: gate.overridden ? user.id : null, override_reason: gate.overridden ? v.override_reason : null,
      owner_id: order?.procurement_owner_id ?? user.id, created_by: user.id, created_at: ctx.now(), updated_at: ctx.now(),
    });
    for (const l of v.lines) insert(ctx.db, 'po_lines', { po_id: id, ...l, bom_item_id: l.bom_item_id ?? null });
    if (gate.overridden) {
      insert(ctx.db, 'vendor_events', { vendor_id: v.vendor_id, kind: 'override', summary: `PO ${number} raised despite vendor status “${gate.vendor.status}”: ${v.override_reason}`, by_user: user.id, at: ctx.now() });
      audit(ctx.db, ctx.now(), user.id, 'override', 'purchase_order', id, `VENDOR OVERRIDE on ${number}: ${gate.vendor.display_name} is ${gate.vendor.status} — ${v.override_reason}`, { orderId: v.order_id });
    }
    audit(ctx.db, ctx.now(), user.id, 'create', 'purchase_order', id, `PO ${number} drafted for ${gate.vendor.display_name}`, { orderId: v.order_id });
    return { id, number };
  });
}
r.post('/purchase-orders', requirePerm('procurement.write'), (req, res) => {
  res.status(201).json(createPo(req.ctx, req.user, parse(poInput, req.body)));
});
r.post('/rfqs/:id/create-po', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const rfq = one(ctx.db, 'SELECT * FROM rfqs WHERE id=?', id); if (!rfq) throw notFound('RFQ');
  const { use, override_reason, advance_required_paise } = parse(z.object({ use: z.enum(['selected', 'backup']).default('selected'), override_reason: z.string().trim().optional().nullable(), advance_required_paise: z.number().int().min(0).default(0) }), req.body);
  if (rfq.status !== 'awarded') throw badRequest('Award the RFQ first.');
  const qid = use === 'backup' ? rfq.backup_quote_id : rfq.selected_quote_id;
  if (!qid) throw badRequest('No backup quote recorded.');
  const q = one(ctx.db, 'SELECT * FROM vendor_quotes WHERE id=?', qid)!;
  const out = createPo(ctx, req.user, { order_id: rfq.order_id, vendor_id: q.vendor_id, vendor_quote_id: q.id, lines: [{ bom_item_id: rfq.bom_item_id, description: rfq.title, qty_ordered: rfq.qty, unit_price_paise: q.unit_price_paise, tax_bp: q.tax_bp ?? 0 }], shipping_paise: q.shipping_paise, promised_date: addDays(today(ctx), q.lead_time_days), advance_required_paise, notes: `From RFQ #${id}`, override_reason });
  res.status(201).json(out);
});

r.get('/purchase-orders', requirePerm('procurement.write', 'receiving.write', 'finance.view'), (req, res) => {
  const ctx = req.ctx; const { page, pageSize } = pageParams(req);
  const w = visiblePoWhere(req.user); const where = ['po.archived_at IS NULL', w.sql]; const p: unknown[] = [...w.params];
  const q = qstr(req.query.q); if (q) { where.push('(po.number LIKE ? OR v.display_name LIKE ? OR o.number LIKE ?)'); p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const status = qstr(req.query.status);
  if (status === 'open') where.push("po.status IN ('draft','pending_approval','issued','confirmed','partially_received')");
  else if (status === 'receivable') where.push("po.status IN ('issued','confirmed','partially_received')");
  else if (status) { where.push('po.status=?'); p.push(status); }
  const vendor = qstr(req.query.vendor); if (vendor) { where.push('po.vendor_id=?'); p.push(Number(vendor)); }
  const orderF = qstr(req.query.order); if (orderF) { where.push('po.order_id=?'); p.push(Number(orderF)); }
  const all = many(ctx.db, `SELECT po.*, v.display_name vendor, o.number order_number FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id LEFT JOIN orders o ON o.id=po.order_id WHERE ${where.join(' AND ')} ORDER BY po.id DESC`, ...p);
  const rows = all.slice((page - 1) * pageSize, page * pageSize).map((po) => ({ ...po, totals: can(req.user, 'costing.view') ? poTotals(ctx, po.id) : null, late: po.promised_date && po.promised_date < today(ctx) && ['issued', 'confirmed', 'partially_received'].includes(po.status) }));
  res.json({ rows, total: all.length, page, pageSize });
});
r.get('/purchase-orders/:id', requirePerm('procurement.write', 'receiving.write', 'finance.view'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertPoAccess(ctx, req.user, id);
  const po = one(ctx.db, 'SELECT po.*, v.display_name vendor, v.status vendor_status, o.number order_number, o.due_date order_due, ob.name override_name, ow.name owner_name FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id LEFT JOIN orders o ON o.id=po.order_id LEFT JOIN users ob ON ob.id=po.override_by LEFT JOIN users ow ON ow.id=po.owner_id WHERE po.id=?', id)!;
  const bank = one(ctx.db, 'SELECT verified_at, review_required FROM vendor_bank WHERE vendor_id=?', po.vendor_id);
  res.json(stripCosts(req.user, {
    po, totals: poTotals(ctx, id),
    lines: many(ctx.db, `SELECT pl.*, ${LINE_MATH}, b.component_name FROM po_lines pl LEFT JOIN bom_items b ON b.id=pl.bom_item_id WHERE pl.po_id=?`, id),
    receipts: many(ctx.db, 'SELECT g.*, u.name received_name FROM goods_receipts g JOIN users u ON u.id=g.received_by WHERE po_id=? ORDER BY g.id', id).map((g) => ({ ...g, lines: many(ctx.db, 'SELECT rl.*, pl.description FROM receipt_lines rl JOIN po_lines pl ON pl.id=rl.po_line_id WHERE receipt_id=?', g.id), files: many(ctx.db, "SELECT id, filename FROM attachments WHERE entity_type='goods_receipt' AND entity_id=?", g.id) })),
    quality: many(ctx.db, 'SELECT qc.*, pl.description, u.name checked_name FROM quality_checks qc JOIN po_lines pl ON pl.id=qc.po_line_id JOIN users u ON u.id=qc.checked_by WHERE pl.po_id=? ORDER BY qc.id', id),
    delays: many(ctx.db, 'SELECT d.*, u.name by_name FROM po_delay_log d LEFT JOIN users u ON u.id=d.by_user WHERE po_id=? ORDER BY d.id', id),
    payments: can(req.user, 'finance.view') ? many(ctx.db, 'SELECT vp.*, u.name recorded_name FROM vendor_payments vp LEFT JOIN users u ON u.id=vp.recorded_by WHERE po_id=? ORDER BY paid_on', id) : null,
    approvals: many(ctx.db, "SELECT a.*, u.name decided_name FROM approvals a LEFT JOIN users u ON u.id=a.decided_by WHERE entity_type='purchase_order' AND entity_id=? ORDER BY id DESC", id),
    bank_ready: !!(bank?.verified_at && !bank.review_required),
    can: { manage: can(req.user, 'procurement.write'), receive: can(req.user, 'receiving.write'), qc: can(req.user, 'quality.write'), pay: can(req.user, 'finance.write') },
  }));
});
function issue(ctx: Ctx, userId: number, po: Record<string, any>) {
  const days = getSetting(ctx.db, 'notify.po_confirmation_overdue_days');
  update(ctx.db, 'purchase_orders', po.id, { status: 'issued', issued_at: ctx.now(), confirmation_due: addDays(today(ctx), days), original_promised_date: po.original_promised_date ?? po.promised_date, updated_at: ctx.now(), version: po.version + 1 });
  insert(ctx.db, 'vendor_events', { vendor_id: po.vendor_id, kind: 'contact', summary: `PO ${po.number} issued`, by_user: userId, at: ctx.now() });
  audit(ctx.db, ctx.now(), userId, 'issued', 'purchase_order', po.id, `PO ${po.number} issued to vendor (promised ${po.promised_date})`, { orderId: po.order_id });
  if (po.order_id && ['confirmed'].includes(one<{ stage: string }>(ctx.db, 'SELECT stage FROM orders WHERE id=?', po.order_id)!.stage)) { /* order stage moves explicitly */ }
}
r.post('/purchase-orders/:id/issue', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertPoAccess(ctx, req.user, id);
  const po = one(ctx.db, 'SELECT * FROM purchase_orders WHERE id=?', id)!;
  if (po.status !== 'draft') throw badRequest(`PO is ${po.status.replace('_', ' ')}, not a draft.`);
  // Re-check the vendor at issue time (it may have been suspended since the draft). A recorded override still applies.
  if (!po.override_reason) vendorGate(ctx, req.user, po.vendor_id, null);
  const total = poTotals(ctx, id).total_paise;
  const threshold = getSetting(ctx.db, 'approval.po_value_threshold_paise');
  const out = tx(ctx.db, () => {
    if (total > threshold && !can(req.user, 'procurement.all')) {
      requestApproval(ctx, req.user, { kind: 'po_value', entity_type: 'purchase_order', entity_id: id, order_id: po.order_id, title: `${po.number} value ₹${total / 100}`, detail: `Above the ₹${threshold / 100} limit for executives.`, required_permission: 'approvals.procurement', link: `/procurement/purchase-orders/${id}` });
      update(ctx.db, 'purchase_orders', id, { status: 'pending_approval', updated_at: ctx.now() });
      return { status: 'pending_approval' };
    }
    issue(ctx, req.user.id, po); return { status: 'issued' };
  });
  res.json(out);
});
onDecision('po_value', (ctx, a, approved, user) => {
  const po = one(ctx.db, 'SELECT * FROM purchase_orders WHERE id=?', a.entity_id)!;
  if (po.status !== 'pending_approval') return;
  if (approved) issue(ctx, user.id, po); else update(ctx.db, 'purchase_orders', po.id, { status: 'draft', updated_at: ctx.now() });
});
r.post('/purchase-orders/:id/confirm', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertPoAccess(ctx, req.user, id);
  const po = one(ctx.db, 'SELECT * FROM purchase_orders WHERE id=?', id)!;
  if (po.status !== 'issued') throw badRequest('Only an issued PO can be confirmed.');
  const v = parse(z.object({ promised_date: z.string().regex(dateRe, 'Enter the date the vendor committed to'), reference: z.string().trim().optional() }), req.body);
  tx(ctx.db, () => {
    update(ctx.db, 'purchase_orders', id, { status: 'confirmed', confirmed_at: ctx.now(), promised_date: v.promised_date, updated_at: ctx.now(), version: po.version + 1 });
    if (v.promised_date > po.promised_date) recordDelay(ctx, req.user, po, v.promised_date, 'Vendor confirmed a later date than requested');
    audit(ctx.db, ctx.now(), req.user.id, 'confirmed', 'purchase_order', id, `Vendor confirmed ${po.number} for ${v.promised_date}${v.reference ? ` (ref ${v.reference})` : ''}`, { orderId: po.order_id });
  });
  res.json({ ok: true });
});
/** Log a vendor delay, then tell both order owners what it does to the customer date. */
function recordDelay(ctx: Ctx, user: AuthUser, po: Record<string, any>, newDate: string, reason: string) {
  insert(ctx.db, 'po_delay_log', { po_id: po.id, old_date: po.promised_date, new_date: newDate, reason, by_user: user.id, at: ctx.now() });
  insert(ctx.db, 'vendor_events', { vendor_id: po.vendor_id, kind: 'performance', summary: `${po.number} delayed ${po.promised_date} → ${newDate}: ${reason}`, by_user: user.id, at: ctx.now() });
  if (!po.order_id) return;
  const order = one(ctx.db, 'SELECT * FROM orders WHERE id=?', po.order_id)!;
  const risk = deliveryRisk(ctx, order);
  const body = `${po.number} moved from ${po.promised_date} to ${newDate} (${reason}). Projected customer delivery ${risk.projected_delivery ?? '—'} vs due ${order.due_date ?? '—'}${risk.days_late ? ` — ${risk.days_late} day(s) late` : ''}.`;
  for (const uid of new Set([order.sales_owner_id, order.procurement_owner_id])) notify(ctx.db, ctx.now(), uid, 'vendor_delay', `Vendor delay on ${order.number}`, body, `/orders/${order.id}?tab=procurement`, `po_delay:${po.id}:${newDate}`);
  audit(ctx.db, ctx.now(), user.id, 'delay', 'purchase_order', po.id, body, { orderId: order.id });
}
r.post('/purchase-orders/:id/reschedule', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertPoAccess(ctx, req.user, id);
  const po = one(ctx.db, 'SELECT * FROM purchase_orders WHERE id=?', id)!;
  if (!['issued', 'confirmed', 'partially_received'].includes(po.status)) throw badRequest('Only open POs can be rescheduled.');
  const v = parse(z.object({ new_date: z.string().regex(dateRe, 'Enter the new date'), reason: z.string().trim().min(5, 'Record the vendor’s reason') }), req.body);
  // Save the new date first so the impact on the customer date is computed from it.
  tx(ctx.db, () => { update(ctx.db, 'purchase_orders', id, { promised_date: v.new_date, updated_at: ctx.now(), version: po.version + 1 }); recordDelay(ctx, req.user, po, v.new_date, v.reason); });
  res.json({ ok: true });
});
r.post('/purchase-orders/:id/cancel', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertPoAccess(ctx, req.user, id);
  const po = one(ctx.db, 'SELECT * FROM purchase_orders WHERE id=?', id)!;
  const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Give a reason') }), req.body);
  if (one<{ n: number }>(ctx.db, 'SELECT COALESCE(SUM(qty_received),0) n FROM po_lines WHERE po_id=?', id)!.n > 0) throw badRequest('Goods were already received on this PO. Close the remaining lines short instead.');
  if (['cancelled', 'received'].includes(po.status)) throw badRequest(`PO is already ${po.status}.`);
  update(ctx.db, 'purchase_orders', id, { status: 'cancelled', notes: [po.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n'), updated_at: ctx.now() });
  run(ctx.db, "UPDATE approvals SET status='rejected', decision_note='PO cancelled', decided_at=? WHERE entity_type='purchase_order' AND entity_id=? AND status='pending'", ctx.now(), id);
  audit(ctx.db, ctx.now(), req.user.id, 'cancel', 'purchase_order', id, `PO ${po.number} cancelled: ${reason}`, { orderId: po.order_id });
  res.json({ ok: true });
});
r.post('/po-lines/:id/close-short', requirePerm('procurement.write'), (req, res) => {
  const ctx = req.ctx; const lid = intParam(req.params.id);
  const l = one(ctx.db, `SELECT pl.*, ${LINE_MATH}, po.order_id, po.number, po.id po_id FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id WHERE pl.id=?`, lid); if (!l) throw notFound('PO line');
  assertPoAccess(ctx, req.user, l.po_id);
  const v = parse(z.object({ qty: z.number().int().positive(), reason: z.string().trim().min(5, 'Record why the remainder will not come') }), req.body);
  if (v.qty > l.outstanding) throw badRequest(`Only ${l.outstanding} unit(s) are still outstanding.`);
  tx(ctx.db, () => {
    run(ctx.db, 'UPDATE po_lines SET qty_cancelled=qty_cancelled+?, cancel_reason=? WHERE id=?', v.qty, v.reason, lid);
    refreshPoStatus(ctx, l.po_id);
    audit(ctx.db, ctx.now(), req.user.id, 'close_short', 'purchase_order', l.po_id, `${l.number}: ${v.qty} × ${l.description} will not be supplied — ${v.reason}`, { orderId: l.order_id });
  });
  res.json({ ok: true });
});
export function refreshPoStatus(ctx: Ctx, poId: number) {
  const po = one(ctx.db, 'SELECT * FROM purchase_orders WHERE id=?', poId)!;
  if (!['issued', 'confirmed', 'partially_received', 'received'].includes(po.status)) return;
  const lines = many(ctx.db, `SELECT pl.*, ${LINE_MATH} FROM po_lines pl WHERE po_id=?`, poId);
  const done = lines.every((l) => l.outstanding === 0 && l.awaiting_qc === 0);
  const anyReceived = lines.some((l) => l.qty_received > 0);
  const status = done ? 'received' : anyReceived ? 'partially_received' : po.status;
  if (status !== po.status) run(ctx.db, 'UPDATE purchase_orders SET status=?, updated_at=? WHERE id=?', status, ctx.now(), poId);
}

// ---------------------------------------------------------------- goods receipt + quality
r.post('/purchase-orders/:id/receipts', requirePerm('receiving.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertPoAccess(ctx, req.user, id);
  const po = one(ctx.db, 'SELECT * FROM purchase_orders WHERE id=?', id)!;
  if (!['issued', 'confirmed', 'partially_received', 'received'].includes(po.status)) throw badRequest(`Goods cannot be received on a ${po.status.replace('_', ' ')} PO.`);
  const v = parse(z.object({ received_on: z.string().regex(dateRe, 'Enter the date received'), notes: z.string().trim().optional().nullable(), lines: z.array(z.object({ po_line_id: z.number().int().positive(), qty_received: z.number().int().min(0), discrepancy: z.string().trim().optional().nullable() })).min(1), attachment_ids: z.array(z.number().int()).optional() }), req.body);
  if (v.received_on > today(ctx)) throw new HttpError(400, 'validation', 'Received date cannot be in the future.', { fields: { received_on: 'Cannot be in the future' } });
  const lines = new Map(many(ctx.db, `SELECT pl.*, ${LINE_MATH} FROM po_lines pl WHERE po_id=?`, id).map((l) => [l.id, l]));
  const real = v.lines.filter((l) => l.qty_received > 0);
  if (!real.length) throw new HttpError(400, 'validation', 'Enter a received quantity for at least one line.', { fields: {} });
  for (const l of real) {
    const pl = lines.get(l.po_line_id); if (!pl) throw badRequest('Line does not belong to this PO.');
    if (l.qty_received > pl.outstanding) throw new HttpError(400, 'validation', `${pl.description}: receiving ${l.qty_received} but only ${pl.outstanding} outstanding. Record extra units as a discrepancy note instead.`, { fields: {} });
  }
  const rid = tx(ctx.db, () => {
    const rid = insert(ctx.db, 'goods_receipts', { po_id: id, received_on: v.received_on, received_by: req.user.id, notes: v.notes, created_at: ctx.now() });
    for (const l of real) {
      insert(ctx.db, 'receipt_lines', { receipt_id: rid, po_line_id: l.po_line_id, qty_received: l.qty_received, discrepancy: l.discrepancy });
      run(ctx.db, 'UPDATE po_lines SET qty_received=qty_received+? WHERE id=?', l.qty_received, l.po_line_id);
    }
    for (const aid of v.attachment_ids ?? []) run(ctx.db, "UPDATE attachments SET entity_type='goods_receipt', entity_id=? WHERE id=? AND uploaded_by=?", rid, aid, req.user.id);
    refreshPoStatus(ctx, id);
    const summary = real.map((l) => { const pl = lines.get(l.po_line_id)!; return `${l.qty_received} × ${pl.description}${l.qty_received < pl.outstanding ? ` (${pl.outstanding - l.qty_received} still due)` : ''}${l.discrepancy ? ` — ${l.discrepancy}` : ''}`; }).join('; ');
    audit(ctx.db, ctx.now(), req.user.id, 'receipt', 'purchase_order', id, `Goods received on ${po.number}: ${summary}`, { orderId: po.order_id });
    if (po.order_id) {
      const o = one(ctx.db, 'SELECT * FROM orders WHERE id=?', po.order_id)!;
      const short = real.some((l) => l.qty_received < lines.get(l.po_line_id)!.outstanding);
      notify(ctx.db, ctx.now(), o.procurement_owner_id, short ? 'partial_receipt' : 'receipt', `${short ? 'Partial delivery' : 'Goods received'}: ${po.number} (${o.number})`, summary, `/orders/${o.id}?tab=received`, `receipt:${rid}`);
    }
    return rid;
  });
  res.status(201).json({ id: rid });
});

r.post('/po-lines/:id/quality', requirePerm('quality.write'), (req, res) => {
  const ctx = req.ctx; const lid = intParam(req.params.id);
  const l = one(ctx.db, `SELECT pl.*, ${LINE_MATH}, po.order_id, po.vendor_id, po.number, po.id po_id FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id WHERE pl.id=?`, lid); if (!l) throw notFound('PO line');
  assertPoAccess(ctx, req.user, l.po_id);
  const v = parse(z.object({ qty_accepted: z.number().int().min(0), qty_rejected: z.number().int().min(0), reason: z.string().trim().optional().nullable(), action: z.enum(['replace', 'return', 'credit', 'accept_with_concession']).optional().nullable() })
    .refine((x) => x.qty_accepted + x.qty_rejected > 0, { message: 'Enter the quantities checked', path: ['qty_accepted'] })
    .refine((x) => !x.qty_rejected || (x.reason && x.reason.length >= 3), { message: 'Say what is wrong with the rejected goods', path: ['reason'] })
    .refine((x) => !x.qty_rejected || x.action, { message: 'Choose what happens to the rejected goods', path: ['action'] }), req.body);
  const checked = v.qty_accepted + v.qty_rejected;
  if (checked > l.awaiting_qc) throw new HttpError(400, 'validation', `Only ${l.awaiting_qc} unit(s) of ${l.description} are waiting for a quality check.`, { fields: { qty_accepted: `Max ${l.awaiting_qc}` } });
  const outcome = v.qty_rejected === 0 ? 'passed' : v.qty_accepted === 0 ? 'failed' : 'partial';
  const out = tx(ctx.db, () => {
    run(ctx.db, 'UPDATE po_lines SET qty_accepted=qty_accepted+?, qty_rejected=qty_rejected+? WHERE id=?', v.qty_accepted, v.qty_rejected, lid);
    let issueId: number | null = null;
    if (v.qty_rejected) {
      // Return/credit means the vendor will not replace: close that quantity so it is not expected again.
      if (v.action === 'return' || v.action === 'credit') run(ctx.db, 'UPDATE po_lines SET qty_cancelled=qty_cancelled+?, cancel_reason=? WHERE id=?', v.qty_rejected, `Rejected at QC (${v.action}): ${v.reason}`, lid);
      const order = l.order_id ? one(ctx.db, 'SELECT * FROM orders WHERE id=?', l.order_id) : null;
      const owner = order?.procurement_owner_id ?? req.user.id;
      issueId = insert(ctx.db, 'issues', { order_id: l.order_id, vendor_id: l.vendor_id, po_id: l.po_id, kind: 'quality', title: `QC ${outcome}: ${v.qty_rejected} × ${l.description} rejected`, detail: `${v.reason}. Action: ${v.action?.replace(/_/g, ' ')}.`, priority: 'high', owner_id: owner, due_date: addDays(today(ctx), 2), created_by: req.user.id, created_at: ctx.now() });
      insert(ctx.db, 'vendor_events', { vendor_id: l.vendor_id, kind: 'quality_incident', summary: `${l.number}: ${v.qty_rejected} × ${l.description} rejected — ${v.reason} (${v.action})`, by_user: req.user.id, at: ctx.now() });
      if (order) {
        const people = new Set<number>([order.procurement_owner_id, order.sales_owner_id, ...many<{ user_id: number }>(ctx.db, "SELECT user_id FROM order_team WHERE order_id=? AND duty IN ('packing','quality')", order.id).map((x) => x.user_id)].filter(Boolean));
        for (const uid of people) notify(ctx.db, ctx.now(), uid, 'quality_failed', `Quality check failed on ${order.number}`, `${v.qty_rejected} × ${l.description} rejected: ${v.reason}. Packing is blocked until resolved.`, `/orders/${order.id}?tab=quality`, `qc_fail:${issueId}`);
      } else notifyRoles(ctx.db, ctx.now(), ['procurement_manager'], 'quality_failed', `Quality check failed on ${l.number}`, v.reason ?? null, `/procurement/purchase-orders/${l.po_id}`, `qc_fail:${issueId}`);
    }
    const qid = insert(ctx.db, 'quality_checks', { po_line_id: lid, qty_checked: checked, qty_accepted: v.qty_accepted, qty_rejected: v.qty_rejected, outcome, reason: v.reason, action: v.action ?? null, checked_by: req.user.id, checked_at: ctx.now(), issue_id: issueId });
    refreshPoStatus(ctx, l.po_id);
    audit(ctx.db, ctx.now(), req.user.id, 'quality', 'purchase_order', l.po_id, `QC ${outcome} on ${l.description}: ${v.qty_accepted} accepted, ${v.qty_rejected} rejected${v.reason ? ` — ${v.reason}` : ''}`, { orderId: l.order_id });
    return { id: qid, outcome, issue_id: issueId };
  });
  res.status(201).json(out);
});

r.get('/orders/:id/quality', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOrderAccess(ctx, req.user, id);
  res.json({
    lines: many(ctx.db, `SELECT pl.*, ${LINE_MATH}, po.number po_number, po.id po_id, v.display_name vendor, b.component_name FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id JOIN vendors v ON v.id=po.vendor_id LEFT JOIN bom_items b ON b.id=pl.bom_item_id WHERE po.order_id=? AND po.status<>'cancelled' ORDER BY po.id, pl.id`, id),
    checks: many(ctx.db, 'SELECT qc.*, pl.description, po.number po_number, u.name checked_name FROM quality_checks qc JOIN po_lines pl ON pl.id=qc.po_line_id JOIN purchase_orders po ON po.id=pl.po_id JOIN users u ON u.id=qc.checked_by WHERE po.order_id=? ORDER BY qc.id DESC', id),
  });
});
r.get('/orders/:id/procurement', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOrderAccess(ctx, req.user, id);
  res.json(stripCosts(req.user, {
    rfqs: many(ctx.db, "SELECT r.*, b.component_name, (SELECT COUNT(*) FROM vendor_quotes vq WHERE vq.rfq_id=r.id AND vq.status='received') received, (SELECT COUNT(*) FROM vendor_quotes vq WHERE vq.rfq_id=r.id) requested FROM rfqs r LEFT JOIN bom_items b ON b.id=r.bom_item_id WHERE r.order_id=? ORDER BY r.id DESC", id),
    purchase_orders: many(ctx.db, 'SELECT po.*, v.display_name vendor FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id WHERE po.order_id=? AND po.archived_at IS NULL ORDER BY po.id', id).map((po) => ({ ...po, totals: poTotals(ctx, po.id), lines: many(ctx.db, `SELECT pl.*, ${LINE_MATH} FROM po_lines pl WHERE po_id=?`, po.id), late: po.promised_date && po.promised_date < today(ctx) && ['issued', 'confirmed', 'partially_received'].includes(po.status) })),
    components: componentStatus(ctx, id),
  }));
});

// ---------------------------------------------------------------- vendor payments (finance)
r.post('/purchase-orders/:id/payments', requirePerm('finance.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertPoAccess(ctx, req.user, id);
  const po = one(ctx.db, 'SELECT * FROM purchase_orders WHERE id=?', id)!;
  if (['draft', 'pending_approval', 'cancelled'].includes(po.status)) throw badRequest('Payments can only be recorded against an issued purchase order.');
  const v = parse(vendorPaymentInput, req.body);
  const bank = one(ctx.db, 'SELECT * FROM vendor_bank WHERE vendor_id=?', po.vendor_id);
  if (!bank?.verified_at || bank.review_required) throw blocked('Vendor bank details are not verified.', [{ code: 'bank', message: bank?.review_required ? 'Bank details changed and await verification' : 'Bank details not verified', fix: 'A second finance/admin person must verify the bank details on the vendor record.' }]);
  const t = poTotals(ctx, id);
  if (v.amount_paise > t.balance_paise) throw new HttpError(400, 'validation', `Payment exceeds the PO balance of ₹${t.balance_paise / 100}.`, { fields: { amount_paise: 'More than the balance' } });
  const pid = insert(ctx.db, 'vendor_payments', { po_id: id, ...v, recorded_by: req.user.id });
  audit(ctx.db, ctx.now(), req.user.id, 'payment', 'purchase_order', id, `Vendor ${v.kind} recorded on ${po.number}: ₹${v.amount_paise / 100} (ref ${v.reference}). Recorded only — no payment was made by this system.`, { orderId: po.order_id });
  res.status(201).json({ id: pid });
});

export { assertUser };
export default r;
