import { Router } from 'express';
import { z } from 'zod';
import { convertInput, customerApprovalInput, quoteVersionInput } from '../../shared/schemas.ts';
import { assertOppAccess, stripCosts } from '../access.ts';
import { audit } from '../audit.ts';
import { requirePerm } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { addDays, today } from '../context.ts';
import { insert, many, nextNumber, one, run, tx } from '../db.ts';
import { HttpError, badRequest, blocked, forbidden, notFound, type Missing } from '../http.ts';
import { quoteTotals } from '../money.ts';
import { notify } from '../notify.ts';
import { can, type AuthUser } from '../permissions.ts';
import { decide, onDecision, requestApproval } from '../rules/approvals.ts';
import { userName } from '../rules/common.ts';
import { getSetting } from '../settings.ts';
import { assertUser, intParam, parse } from '../validate.ts';

const r = Router();

function quoteForUser(ctx: Ctx, user: AuthUser, id: number) {
  const q = one(ctx.db, 'SELECT * FROM quotations WHERE id=? AND archived_at IS NULL', id);
  if (!q) throw notFound('Quotation');
  assertOppAccess(ctx, user, q.opportunity_id);
  return q;
}
function versionLines(ctx: Ctx, versionId: number) {
  return many(ctx.db, 'SELECT * FROM quote_lines WHERE version_id=? ORDER BY sort, id', versionId);
}

/** Field-by-field comparison with the previous version so reviewers see exactly what changed. */
export function diffVersions(prev: { v: Record<string, any>; lines: Record<string, any>[] } | null, cur: { v: Record<string, any>; lines: Record<string, any>[] }) {
  if (!prev) return null;
  const key = (l: Record<string, any>) => l.description.trim().toLowerCase();
  const pm = new Map(prev.lines.map((l) => [key(l), l])); const cm = new Map(cur.lines.map((l) => [key(l), l]));
  const changes: string[] = [];
  for (const [k, l] of cm) {
    const o = pm.get(k);
    if (!o) { changes.push(`Added “${l.description}” (${l.qty} × ${l.unit_price_paise / 100})`); continue; }
    if (o.qty !== l.qty) changes.push(`“${l.description}” quantity ${o.qty} → ${l.qty}`);
    if (o.unit_price_paise !== l.unit_price_paise) changes.push(`“${l.description}” unit price ₹${o.unit_price_paise / 100} → ₹${l.unit_price_paise / 100}`);
    if ((o.customisation ?? '') !== (l.customisation ?? '')) changes.push(`“${l.description}” customisation changed`);
  }
  for (const [k, l] of pm) if (!cm.has(k)) changes.push(`Removed “${l.description}”`);
  const fields: [string, string][] = [['shipping_paise', 'Shipping'], ['tax_bp', 'Tax rate'], ['validity_date', 'Valid until'], ['delivery_date', 'Delivery date'], ['total_paise', 'Total']];
  for (const [f, label] of fields) if (prev.v[f] !== cur.v[f]) changes.push(`${label}: ${fmt(f, prev.v[f])} → ${fmt(f, cur.v[f])}`);
  return changes;
}
const fmt = (f: string, v: unknown) => (f.endsWith('_paise') ? `₹${Number(v) / 100}` : f.endsWith('_bp') ? `${Number(v) / 100}%` : String(v ?? '—'));

function writeVersion(ctx: Ctx, user: AuthUser, quotationId: number, version: number, v: z.output<typeof quoteVersionInput>, prevLines: Record<string, any>[]) {
  const canCost = can(user, 'feasibility.write') || can(user, 'quotes.approve');
  const prevCost = new Map(prevLines.map((l) => [l.description.trim().toLowerCase(), l.unit_cost_paise]));
  const lines = v.lines.map((l) => ({ ...l, unit_cost_paise: canCost && l.unit_cost_paise !== undefined ? l.unit_cost_paise : (prevCost.get(l.description.trim().toLowerCase()) ?? 0) }));
  const t = quoteTotals(lines, v.shipping_paise, v.tax_bp);
  const vid = insert(ctx.db, 'quote_versions', {
    quotation_id: quotationId, version, validity_date: v.validity_date, delivery_date: v.delivery_date, shipping_paise: v.shipping_paise,
    tax_name: v.tax_name, tax_bp: v.tax_bp, ...t, notes: v.notes, change_note: v.change_note, created_by: user.id, created_at: ctx.now(),
  });
  lines.forEach((l, i) => insert(ctx.db, 'quote_lines', { version_id: vid, sort: i, description: l.description, category: l.category, qty: l.qty, unit_price_paise: l.unit_price_paise, unit_cost_paise: l.unit_cost_paise, customisation: l.customisation }));
  return vid;
}

r.post('/opportunities/:id/quotations', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const oppId = intParam(req.params.id); assertOppAccess(ctx, req.user, oppId);
  const opp = one(ctx.db, 'SELECT * FROM opportunities WHERE id=?', oppId)!;
  if (['won', 'lost'].includes(opp.stage)) throw badRequest('This opportunity is closed.');
  const v = parse(quoteVersionInput, req.body);
  const out = tx(ctx.db, () => {
    const number = nextNumber(ctx.db, 'quote', 'Q', Number(today(ctx).slice(0, 4)));
    const qid = insert(ctx.db, 'quotations', { number, opportunity_id: oppId, created_by: req.user.id, created_at: ctx.now(), updated_at: ctx.now() });
    writeVersion(ctx, req.user, qid, 1, v, []);
    if (['requirements', 'feasibility'].includes(opp.stage) === false && opp.stage !== 'quotation') { /* keep stage */ }
    audit(ctx.db, ctx.now(), req.user.id, 'create', 'opportunity', oppId, `Quotation ${number} v1 drafted`);
    return { id: qid, number };
  });
  res.status(201).json(out);
});

r.get('/quotations/:id', requirePerm('sales.write', 'sales.all', 'feasibility.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const q = quoteForUser(ctx, req.user, id);
  const versions = many(ctx.db, 'SELECT qv.*, u.name created_name, ob.name override_name FROM quote_versions qv LEFT JOIN users u ON u.id=qv.created_by LEFT JOIN users ob ON ob.id=qv.commitment_override_by WHERE quotation_id=? ORDER BY version', id)
    .map((v) => ({ ...v, lines: versionLines(ctx, v.id) }));
  const withDiff = versions.map((v, i) => ({ ...v, changes: diffVersions(i ? { v: versions[i - 1], lines: versions[i - 1].lines } : null, { v, lines: v.lines }) }));
  const opp = one(ctx.db, 'SELECT op.*, c.name company_name FROM opportunities op JOIN companies c ON c.id=op.company_id WHERE op.id=?', q.opportunity_id)!;
  res.json(stripCosts(req.user, {
    quotation: q, opportunity: { id: opp.id, title: opp.title, company_name: opp.company_name, owner_id: opp.owner_id, stage: opp.stage, approx_qty: opp.approx_qty },
    versions: withDiff.reverse(),
    approvals: many(ctx.db, "SELECT a.*, u.name decided_name, rq.name requested_name FROM approvals a LEFT JOIN users u ON u.id=a.decided_by JOIN users rq ON rq.id=a.requested_by WHERE entity_type='quotation' AND entity_id=? ORDER BY a.id DESC", id),
    customer_approvals: many(ctx.db, 'SELECT ca.*, qv.version, u.name recorded_name FROM customer_approvals ca JOIN quote_versions qv ON qv.id=ca.version_id JOIN users u ON u.id=ca.recorded_by WHERE ca.quotation_id=?', id),
    commitment: commitmentCheck(ctx, q, versions[versions.length - 1]),
    policy: { margin_min_bp: getSetting(ctx.db, 'approval.margin_min_bp'), margin_floor_bp: getSetting(ctx.db, 'approval.margin_floor_bp') },
  }));
});

/** Replace the current draft version in place (only before it was submitted or sent). */
r.put('/quotations/:id/draft', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const q = quoteForUser(ctx, req.user, id);
  const v = parse(quoteVersionInput, req.body);
  if (v.expected_version !== undefined && v.expected_version !== q.current_version) throw new HttpError(409, 'stale', 'A newer version of this quotation exists. Reload before editing.');
  const cur = one(ctx.db, 'SELECT * FROM quote_versions WHERE quotation_id=? AND version=?', id, q.current_version)!;
  const submitted = one(ctx.db, "SELECT id FROM approvals WHERE entity_type='quotation' AND entity_id=? AND detail LIKE ?", id, `%v${q.current_version}%`);
  if (q.status !== 'draft' || cur.sent_at || submitted) throw badRequest('This version was already submitted or sent. Create a revision instead so the earlier version is preserved.');
  tx(ctx.db, () => {
    const prev = versionLines(ctx, cur.id);
    run(ctx.db, 'DELETE FROM quote_lines WHERE version_id=?', cur.id);
    run(ctx.db, 'DELETE FROM quote_versions WHERE id=?', cur.id);
    writeVersion(ctx, req.user, id, q.current_version, v, prev);
    run(ctx.db, 'UPDATE quotations SET updated_at=?, version=version+1 WHERE id=?', ctx.now(), id);
    audit(ctx.db, ctx.now(), req.user.id, 'update', 'opportunity', q.opportunity_id, `Quotation ${q.number} v${q.current_version} draft edited`);
  });
  res.json({ ok: true });
});

r.post('/quotations/:id/revise', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const q = quoteForUser(ctx, req.user, id);
  if (['customer_approved', 'expired'].includes(q.status)) throw badRequest(q.status === 'customer_approved' ? 'The customer already approved this quotation. Start a new quotation for changes.' : 'This quotation has expired.');
  const v = parse(quoteVersionInput.refine((x) => !!x.change_note, { message: 'Say what changed and why', path: ['change_note'] }), req.body);
  if (v.expected_version !== undefined && v.expected_version !== q.current_version) throw new HttpError(409, 'stale', 'Someone else revised this quotation. Reload to see the latest version.');
  const cur = one(ctx.db, 'SELECT * FROM quote_versions WHERE quotation_id=? AND version=?', id, q.current_version)!;
  tx(ctx.db, () => {
    writeVersion(ctx, req.user, id, q.current_version + 1, v, versionLines(ctx, cur.id));
    run(ctx.db, "UPDATE quotations SET current_version=?, status='draft', updated_at=?, version=version+1 WHERE id=?", q.current_version + 1, ctx.now(), id);
    run(ctx.db, "UPDATE approvals SET status='rejected', decision_note='Superseded by a newer version', decided_at=? WHERE entity_type='quotation' AND entity_id=? AND status='pending'", ctx.now(), id);
    audit(ctx.db, ctx.now(), req.user.id, 'revise', 'opportunity', q.opportunity_id, `Quotation ${q.number} revised to v${q.current_version + 1}: ${v.change_note}`);
  });
  res.status(201).json({ version: q.current_version + 1 });
});

/** Procurement supplies unit costs and lead times; margin is recalculated on the version. */
r.put('/quotations/:id/costs', requirePerm('feasibility.write', 'quotes.approve'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const q = quoteForUser(ctx, req.user, id);
  if (!['draft', 'pending_approval'].includes(q.status)) throw badRequest('Costs can only change while the quotation is a draft or awaiting internal approval. Revise it to change costs.');
  const { lines } = parse(z.object({ lines: z.array(z.object({ id: z.number().int(), unit_cost_paise: z.number().int().min(0) })).min(1) }), req.body);
  const cur = one(ctx.db, 'SELECT * FROM quote_versions WHERE quotation_id=? AND version=?', id, q.current_version)!;
  tx(ctx.db, () => {
    for (const l of lines) run(ctx.db, 'UPDATE quote_lines SET unit_cost_paise=? WHERE id=? AND version_id=?', l.unit_cost_paise, l.id, cur.id);
    const t = quoteTotals(versionLines(ctx, cur.id), cur.shipping_paise, cur.tax_bp);
    run(ctx.db, 'UPDATE quote_versions SET est_cost_paise=?, margin_bp=? WHERE id=?', t.est_cost_paise, t.margin_bp, cur.id);
    audit(ctx.db, ctx.now(), req.user.id, 'costing', 'opportunity', q.opportunity_id, `Costs supplied for ${q.number} v${q.current_version} (estimated cost ₹${t.est_cost_paise / 100})`);
  });
  res.json({ ok: true });
});

r.post('/quotations/:id/submit', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const q = quoteForUser(ctx, req.user, id);
  if (q.status !== 'draft') throw badRequest(`Quotation is “${q.status.replace('_', ' ')}”, not a draft.`);
  const cur = one(ctx.db, 'SELECT * FROM quote_versions WHERE quotation_id=? AND version=?', id, q.current_version)!;
  const lines = versionLines(ctx, cur.id);
  const missing: Missing[] = lines.filter((l) => !l.unit_cost_paise).map((l) => ({ code: 'cost', message: `No cost for “${l.description}”`, fix: 'Ask procurement to supply costs (Costing on the quotation).' }));
  if (missing.length) throw blocked('Margin cannot be checked until every line has a cost.', missing);
  const min = getSetting(ctx.db, 'approval.margin_min_bp'); const floor = getSetting(ctx.db, 'approval.margin_floor_bp');
  const margin = cur.margin_bp as number;
  const opp = one(ctx.db, 'SELECT * FROM opportunities WHERE id=?', q.opportunity_id)!;
  const out = tx(ctx.db, () => {
    if (margin >= min) {
      run(ctx.db, "UPDATE quotations SET status='approved', updated_at=? WHERE id=?", ctx.now(), id);
      audit(ctx.db, ctx.now(), req.user.id, 'approved', 'opportunity', q.opportunity_id, `${q.number} v${q.current_version} within margin policy (${margin / 100}% ≥ ${min / 100}%) — approved automatically`);
      return { status: 'approved' };
    }
    const perm = margin < floor ? 'approvals.admin' : 'approvals.sales';
    requestApproval(ctx, req.user, { kind: 'quote_margin', entity_type: 'quotation', entity_id: id, title: `${q.number} v${q.current_version} margin ${margin / 100}% (${opp.title})`, detail: `v${q.current_version}: margin ${margin / 100}% is below the ${margin < floor ? 'founder floor' : 'policy minimum'} of ${(margin < floor ? floor : min) / 100}%.`, required_permission: perm, link: `/sales/quotations/${id}` });
    run(ctx.db, "UPDATE quotations SET status='pending_approval', updated_at=? WHERE id=?", ctx.now(), id);
    return { status: 'pending_approval' };
  });
  res.json(out);
});
onDecision('quote_margin', (ctx, a, approved) => {
  run(ctx.db, 'UPDATE quotations SET status=?, updated_at=? WHERE id=? AND status=\'pending_approval\'', approved ? 'approved' : 'draft', ctx.now(), a.entity_id);
});

/** Firm commitment gate: a completed feasibility check that supports this quantity and date, or an authorised override. */
export function commitmentCheck(ctx: Ctx, q: Record<string, any>, version: Record<string, any>): { ok: boolean; missing: Missing[]; feasibility_id: number | null; warning: string | null } {
  const f = one(ctx.db, "SELECT * FROM feasibility_checks WHERE opportunity_id=? AND status='completed' ORDER BY id DESC LIMIT 1", q.opportunity_id);
  const missing: Missing[] = [];
  if (!f) {
    missing.push({ code: 'feasibility', message: 'No completed feasibility check', fix: 'Request a feasibility check from procurement and wait for the result.' });
    return { ok: false, missing, feasibility_id: null, warning: null };
  }
  const qty = (version.lines ?? many(ctx.db, 'SELECT qty FROM quote_lines WHERE version_id=?', version.id)).reduce((a: number, l: { qty: number }) => a + l.qty, 0);
  if (f.result === 'infeasible') missing.push({ code: 'infeasible', message: 'Procurement marked this requirement infeasible', fix: f.notes ?? 'Change scope, date or quantity and ask for a new check.' });
  if (f.earliest_delivery && version.delivery_date < f.earliest_delivery) missing.push({ code: 'date', message: `Quoted delivery ${version.delivery_date} is earlier than the feasible date ${f.earliest_delivery}`, fix: 'Move the delivery date or ask procurement to re-check.' });
  if (f.max_quantity && qty > f.max_quantity) missing.push({ code: 'qty', message: `Quoted quantity ${qty} exceeds the feasible maximum ${f.max_quantity}`, fix: 'Reduce the quantity or ask procurement to re-check.' });
  return { ok: missing.length === 0, missing, feasibility_id: f.id, warning: f.result === 'at_risk' ? `Procurement flagged this as at risk: ${f.notes ?? ''}` : null };
}

r.post('/quotations/:id/send', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const q = quoteForUser(ctx, req.user, id);
  const { override_reason } = parse(z.object({ override_reason: z.string().trim().min(10, 'Give a reason of at least 10 characters').optional() }), req.body);
  if (q.status === 'pending_approval') throw blocked('Waiting for margin approval.', [{ code: 'approval', message: 'Internal approval is pending', fix: 'A manager must approve the margin first.' }]);
  if (q.status !== 'approved') throw badRequest(`Only an internally approved quotation can be sent (status is “${q.status.replace('_', ' ')}”). Submit it for approval first.`);
  const cur = one(ctx.db, 'SELECT * FROM quote_versions WHERE quotation_id=? AND version=?', id, q.current_version)!;
  const check = commitmentCheck(ctx, q, cur);
  if (!check.ok) {
    if (!override_reason) throw blocked('Sales cannot make a firm price or delivery commitment without a feasibility check that supports it.', check.missing);
    if (!can(req.user, 'feasibility.override')) throw forbidden('Only a sales manager or founder can override a feasibility check.');
  }
  const opp = one(ctx.db, 'SELECT * FROM opportunities WHERE id=?', q.opportunity_id)!;
  tx(ctx.db, () => {
    run(ctx.db, 'UPDATE quote_versions SET sent_at=?, feasibility_id=?, commitment_override_by=?, commitment_override_reason=? WHERE id=?', ctx.now(), check.feasibility_id, check.ok ? null : req.user.id, check.ok ? null : override_reason, cur.id);
    run(ctx.db, "UPDATE quotations SET status='sent', updated_at=? WHERE id=?", ctx.now(), id);
    run(ctx.db, "UPDATE opportunities SET stage='awaiting_approval', updated_at=? WHERE id=?", ctx.now(), opp.id);
    const due = addDays(today(ctx), getSetting(ctx.db, 'tasks.followup_days_after_quote'));
    const existing = one<{ id: number }>(ctx.db, "SELECT id FROM tasks WHERE kind='customer_approval' AND entity_type='opportunity' AND entity_id=? AND status='open'", opp.id);
    if (existing) run(ctx.db, 'UPDATE tasks SET due_at=?, title=? WHERE id=?', due, `Chase customer approval: ${q.number} v${q.current_version}`, existing.id);
    else insert(ctx.db, 'tasks', { title: `Chase customer approval: ${q.number} v${q.current_version}`, owner_id: opp.owner_id, due_at: due, kind: 'customer_approval', entity_type: 'opportunity', entity_id: opp.id, created_by: req.user.id, created_at: ctx.now() });
    audit(ctx.db, ctx.now(), req.user.id, 'sent', 'opportunity', opp.id, `${q.number} v${q.current_version} recorded as sent to customer${check.ok ? '' : ` — FEASIBILITY OVERRIDE by ${req.user.name}: ${override_reason}`}`);
  });
  res.json({ ok: true, warning: check.warning });
});

r.post('/quotations/:id/customer-approval', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const q = quoteForUser(ctx, req.user, id);
  const v = parse(customerApprovalInput, req.body);
  if (q.status !== 'sent') throw badRequest(q.status === 'customer_approved' ? 'Customer approval is already recorded.' : 'Record customer approval only after the quotation was sent.');
  const ver = one(ctx.db, 'SELECT * FROM quote_versions WHERE quotation_id=? AND version=?', id, v.version);
  if (!ver) throw badRequest(`Version ${v.version} does not exist.`);
  if (!ver.sent_at) throw badRequest(`Version ${v.version} was never sent to the customer, so they cannot have approved it.`);
  if (v.attachment_id && !one(ctx.db, "SELECT id FROM attachments WHERE id=? AND entity_type IN ('quotation','opportunity')", v.attachment_id)) throw badRequest('Attachment not found on this opportunity.');
  tx(ctx.db, () => {
    insert(ctx.db, 'customer_approvals', { quotation_id: id, version_id: ver.id, approver_name: v.approver_name, approved_on: v.approved_on, reference: v.reference, attachment_id: v.attachment_id ?? null, recorded_by: req.user.id, recorded_at: ctx.now() });
    run(ctx.db, "UPDATE quotations SET status='customer_approved', updated_at=? WHERE id=?", ctx.now(), id);
    run(ctx.db, "UPDATE tasks SET status='done', completed_at=? WHERE kind='customer_approval' AND entity_type='opportunity' AND entity_id=? AND status='open'", ctx.now(), q.opportunity_id);
    audit(ctx.db, ctx.now(), req.user.id, 'customer_approved', 'opportunity', q.opportunity_id, `Customer approved ${q.number} v${v.version} — ${v.approver_name} on ${v.approved_on}${v.reference ? ` (ref ${v.reference})` : ''}`);
  });
  res.json({ ok: true });
});
r.post('/quotations/:id/customer-rejected', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const q = quoteForUser(ctx, req.user, id);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Say why') }), req.body);
  if (q.status !== 'sent') throw badRequest('Only a sent quotation can be declined by the customer.');
  run(ctx.db, "UPDATE quotations SET status='rejected', updated_at=? WHERE id=?", ctx.now(), id);
  run(ctx.db, "UPDATE opportunities SET stage='quotation', updated_at=? WHERE id=?", ctx.now(), q.opportunity_id);
  audit(ctx.db, ctx.now(), req.user.id, 'customer_rejected', 'opportunity', q.opportunity_id, `Customer declined ${q.number}: ${reason}`);
  res.json({ ok: true });
});

/** Convert an approved quotation into a confirmed order with a complete sales → procurement handoff. */
r.post('/quotations/:id/convert', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const q = quoteForUser(ctx, req.user, id);
  if (q.status !== 'customer_approved') throw blocked('Only a customer-approved quotation can become an order.', [{ code: 'approval', message: 'No customer approval recorded', fix: 'Record the customer approval with the exact version they approved.' }]);
  const v = parse(convertInput, req.body);
  assertUser(ctx, v.procurement_owner_id, 'procurement owner');
  const pRoles = JSON.parse(one<{ roles: string }>(ctx.db, 'SELECT roles FROM users WHERE id=?', v.procurement_owner_id)!.roles) as string[];
  if (!pRoles.some((x) => ['procurement_manager', 'procurement_exec', 'admin'].includes(x))) throw badRequest('The procurement owner must be in procurement.');
  if (one(ctx.db, 'SELECT id FROM orders WHERE quotation_id=?', id)) throw new HttpError(409, 'conflict', 'An order already exists for this quotation.');
  const approval = one(ctx.db, 'SELECT * FROM customer_approvals WHERE quotation_id=? ORDER BY id DESC LIMIT 1', id)!;
  const ver = one(ctx.db, 'SELECT * FROM quote_versions WHERE id=?', approval.version_id)!;
  const lines = versionLines(ctx, ver.id);
  const opp = one(ctx.db, 'SELECT * FROM opportunities WHERE id=?', q.opportunity_id)!;
  const now = ctx.now();
  const out = tx(ctx.db, () => {
    const number = nextNumber(ctx.db, 'order', 'ORD', Number(today(ctx).slice(0, 4)));
    const orderId = insert(ctx.db, 'orders', {
      number, company_id: opp.company_id, contact_id: opp.contact_id, opportunity_id: opp.id, quotation_id: id, quote_version_id: ver.id,
      title: opp.title, currency: ver.currency, sales_owner_id: opp.owner_id, procurement_owner_id: v.procurement_owner_id, due_date: v.due_date,
      customer_po_ref: v.customer_po_ref ?? approval.reference, requirements: opp.requirements,
      subtotal_paise: ver.subtotal_paise + ver.shipping_paise, tax_paise: ver.tax_paise, total_paise: ver.total_paise, est_cost_paise: ver.est_cost_paise,
      next_action: 'Procurement: confirm the bill of materials for each box and start sourcing', created_at: now, updated_at: now,
    });
    run(ctx.db, 'INSERT INTO order_team VALUES (?,?,?)', orderId, opp.owner_id, 'sales');
    run(ctx.db, 'INSERT INTO order_team VALUES (?,?,?)', orderId, v.procurement_owner_id, 'procurement');
    const destIds = v.destinations.map((d) => insert(ctx.db, 'destinations', { order_id: orderId, ...d }));
    lines.forEach((l, i) => {
      const vid = insert(ctx.db, 'box_variants', { order_id: orderId, name: l.description, qty: l.qty, customisation: l.customisation, artwork_required: l.customisation ? 1 : 0, sort: i });
      if (destIds.length === 1) insert(ctx.db, 'allocations', { order_id: orderId, variant_id: vid, destination_id: destIds[0], qty: l.qty });
    });
    // Files the customer sent during sales travel with the order (same stored file, new link).
    for (const a of many(ctx.db, "SELECT * FROM attachments WHERE (entity_type='opportunity' AND entity_id=?) OR (entity_type='quotation' AND entity_id=?)", opp.id, id)) {
      insert(ctx.db, 'attachments', { entity_type: 'order', entity_id: orderId, order_id: orderId, kind: a.kind, filename: a.filename, stored_name: a.stored_name, mime: a.mime, size: a.size, sensitive: a.sensitive, uploaded_by: a.uploaded_by, uploaded_at: a.uploaded_at });
    }
    run(ctx.db, "UPDATE opportunities SET stage='won', order_id=?, updated_at=? WHERE id=?", orderId, now, opp.id);
    insert(ctx.db, 'tasks', { title: `Confirm BOM and start sourcing for ${number}`, owner_id: v.procurement_owner_id, due_at: addDays(today(ctx), 1), kind: 'handoff', entity_type: 'order', entity_id: orderId, order_id: orderId, created_by: req.user.id, created_at: now });
    notify(ctx.db, now, v.procurement_owner_id, 'handoff', `New order handed to you: ${number}`, `${opp.title}. Due ${v.due_date}. ${lines.length} box type(s), ${v.destinations.length} destination(s).`, `/orders/${orderId}`, `handoff:${orderId}`);
    audit(ctx.db, now, req.user.id, 'create', 'order', orderId, `Order ${number} confirmed from ${q.number} v${ver.version} (customer approval by ${approval.approver_name} on ${approval.approved_on}). Handoff to ${userName(ctx, v.procurement_owner_id)}.`, { orderId });
    audit(ctx.db, now, req.user.id, 'won', 'opportunity', opp.id, `Won — order ${number}`);
    return { id: orderId, number };
  });
  res.status(201).json(out);
});

// ---------------------------------------------------------------- approvals inbox
r.get('/approvals', (req, res) => {
  const ctx = req.ctx;
  const status = req.query.status === 'decided' ? "a.status<>'pending'" : "a.status='pending'";
  const rows = many(ctx.db, `SELECT a.*, u.name requested_name, d.name decided_name FROM approvals a JOIN users u ON u.id=a.requested_by LEFT JOIN users d ON d.id=a.decided_by WHERE ${status} ORDER BY a.id DESC LIMIT 200`);
  const mine = rows.filter((a) => can(req.user, a.required_permission) || a.requested_by === req.user.id);
  res.json({ rows: mine.map((a) => ({ ...a, can_decide: a.status === 'pending' && can(req.user, a.required_permission) && (a.requested_by !== req.user.id || can(req.user, '*')), link: approvalLink(a) })) });
});
export function approvalLink(a: { entity_type: string; entity_id: number; order_id: number | null }) {
  if (a.entity_type === 'quotation') return `/sales/quotations/${a.entity_id}`;
  if (a.entity_type === 'vendor') return `/procurement/vendors/${a.entity_id}`;
  if (a.entity_type === 'purchase_order') return `/procurement/purchase-orders/${a.entity_id}`;
  if (a.order_id) return `/orders/${a.order_id}`;
  return null;
}
r.post('/approvals/:id/decide', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const v = parse(z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().optional() }).refine((x) => x.decision === 'approved' || (x.note && x.note.length >= 3), { message: 'Give a reason when rejecting', path: ['note'] }), req.body);
  const out = tx(ctx.db, () => decide(ctx, req.user, id, v.decision === 'approved', v.note ?? null));
  if ('error' in out) {
    if (out.error === 'not_found') throw notFound('Approval');
    if (out.error === 'decided') throw new HttpError(409, 'conflict', 'This approval was already decided.');
    if (out.error === 'self') throw forbidden('You cannot approve your own request.');
    throw forbidden('You are not authorised to decide this approval.');
  }
  res.json({ ok: true });
});

export default r;
