import { Router } from 'express';
import { z } from 'zod';
import { bankInput, vendorInput } from '../../shared/schemas.ts';
import { audit } from '../audit.ts';
import { requirePerm } from '../auth.ts';
import { insert, many, one, run, tx, update } from '../db.ts';
import { HttpError, badRequest, blocked, forbidden, notFound } from '../http.ts';
import { notify, notifyRoles } from '../notify.ts';
import { can, hasRole, type Role } from '../permissions.ts';
import { pageParams, qstr, userName } from '../rules/common.ts';
import { REASON_REQUIRED, TRANSITIONS, VENDOR_STATES, vendorChecklist, vendorDuplicates, vendorPerformance, type VendorState } from '../rules/vendors.ts';
import { getSetting } from '../settings.ts';
import { assertUser, checkVersion, intParam, parse } from '../validate.ts';
import type { Ctx } from '../context.ts';
import { today, addDays } from '../context.ts';

const r = Router();
const SENSITIVE_FIELDS = ['gst_number', 'pan_number', 'legal_name'];

function vendorOr404(ctx: Ctx, id: number) {
  const v = one(ctx.db, 'SELECT * FROM vendors WHERE id=? AND archived_at IS NULL', id); if (!v) throw notFound('Vendor'); return v;
}
function event(ctx: Ctx, vendorId: number, userId: number | null, kind: string, summary: string) {
  insert(ctx.db, 'vendor_events', { vendor_id: vendorId, kind, summary, by_user: userId, at: ctx.now() });
}

r.get('/vendors', requirePerm('vendors.view', 'vendors.view.basic'), (req, res) => {
  const ctx = req.ctx; const { limit, offset, page, pageSize } = pageParams(req);
  const where = ['v.archived_at IS NULL']; const p: unknown[] = [];
  const q = qstr(req.query.q);
  if (q) { where.push('(v.display_name LIKE ? OR v.legal_name LIKE ? OR v.city LIKE ? OR v.categories LIKE ? OR v.gst_number LIKE ?)'); p.push(...Array(5).fill(`%${q}%`)); }
  const status = qstr(req.query.status);
  if (status === 'onboarding') where.push("v.status IN ('draft','info_requested','documents_pending','under_review')");
  else if (status === 'purchasable') where.push("v.status IN ('approved','active')");
  else if (status) { where.push('v.status=?'); p.push(status); }
  const cat = qstr(req.query.category); if (cat) { where.push('v.categories LIKE ?'); p.push(`%"${cat}"%`); }
  const w = where.join(' AND ');
  const total = one<{ n: number }>(ctx.db, `SELECT COUNT(*) n FROM vendors v WHERE ${w}`, ...p)!.n;
  const rows = many(ctx.db, `SELECT v.id, v.display_name, v.legal_name, v.status, v.city, v.categories, v.lead_time_days, v.moq, v.onboarding_due, v.onboarding_owner_id, u.name onboarding_owner_name,
      (SELECT MIN(expires_on) FROM vendor_documents d WHERE d.vendor_id=v.id AND d.archived_at IS NULL AND d.expires_on IS NOT NULL) next_expiry,
      (SELECT review_required FROM vendor_bank b WHERE b.vendor_id=v.id) bank_review
    FROM vendors v LEFT JOIN users u ON u.id=v.onboarding_owner_id WHERE ${w} ORDER BY v.display_name COLLATE NOCASE LIMIT ? OFFSET ?`, ...p, limit, offset)
    .map((v) => { const cl = vendorChecklist(ctx, v.id); return { ...v, categories: JSON.parse(v.categories), checklist_done: cl.filter((c) => c.done).length, checklist_total: cl.length }; });
  res.json({ rows, total, page, pageSize });
});

r.post('/vendors', requirePerm('vendors.write'), (req, res) => {
  const ctx = req.ctx; const v = parse(vendorInput, req.body);
  const dups = vendorDuplicates(ctx, v);
  if (dups.length && !v.confirm_duplicate) throw new HttpError(409, 'duplicate', 'This vendor may already exist. Check the matches before creating another record.', { duplicates: dups });
  assertUser(ctx, v.onboarding_owner_id);
  const now = ctx.now();
  const id = tx(ctx.db, () => {
    const { confirm_duplicate: _c, expected_version: _e, categories, sample_available, ...rest } = v;
    const id = insert(ctx.db, 'vendors', { ...rest, categories: JSON.stringify(categories), sample_available: sample_available ? 1 : 0, onboarding_owner_id: v.onboarding_owner_id ?? req.user.id, onboarding_due: v.onboarding_due ?? addDays(today(ctx), 7), created_by: req.user.id, created_at: now, updated_at: now });
    event(ctx, id, req.user.id, 'status_change', `Vendor record created (draft)${dups.length ? ` — possible duplicate of ${dups.map((d) => d.label).join(', ')} confirmed as new` : ''}`);
    audit(ctx.db, now, req.user.id, 'create', 'vendor', id, `Vendor ${v.display_name} created`);
    const owner = v.onboarding_owner_id ?? req.user.id;
    if (owner !== req.user.id) notify(ctx.db, now, owner, 'vendor_onboarding', `You own onboarding for ${v.display_name}`, null, `/procurement/vendors/${id}`, `vendor_owner:${id}:${owner}`);
    return id;
  });
  res.status(201).json({ id });
});

r.get('/vendors/:id', requirePerm('vendors.view', 'vendors.view.basic'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const v = vendorOr404(ctx, id);
  const sensitive = can(req.user, 'vendors.sensitive');
  const full = can(req.user, 'vendors.view');
  const bank = one(ctx.db, 'SELECT b.*, vu.name verified_name, cu.name changed_name FROM vendor_bank b LEFT JOIN users vu ON vu.id=b.verified_by LEFT JOIN users cu ON cu.id=b.changed_by WHERE vendor_id=?', id);
  const docs = many(ctx.db, 'SELECT d.*, a.filename, vu.name verified_name FROM vendor_documents d LEFT JOIN attachments a ON a.id=d.attachment_id LEFT JOIN users vu ON vu.id=d.verified_by WHERE d.vendor_id=? AND d.archived_at IS NULL ORDER BY d.kind, d.id DESC', id)
    .map((d) => (sensitive || !d.sensitive ? d : { ...d, attachment_id: null, reference: d.reference ? 'Restricted' : null, restricted: true }));
  const state = v.status as VendorState;
  const approvers = getSetting(ctx.db, 'approval.vendor_approver_roles') as readonly string[];
  res.json({
    vendor: { ...v, categories: JSON.parse(v.categories), onboarding_owner_name: userName(ctx, v.onboarding_owner_id), approved_by_name: userName(ctx, v.approved_by), ...(full ? {} : { pan_number: undefined, gst_number: undefined }) },
    contacts: many(ctx.db, 'SELECT * FROM vendor_contacts WHERE vendor_id=? ORDER BY is_primary DESC, name', id),
    // Bank details: full values only for finance/admin. Others learn only whether they are on file and verified.
    bank: sensitive ? bank ?? null : { restricted: true, on_file: !!bank?.account_number, verified: !!(bank?.verified_at && !bank.review_required), review_required: !!bank?.review_required },
    documents: docs,
    events: many(ctx.db, 'SELECT e.*, u.name by_name FROM vendor_events e LEFT JOIN users u ON u.id=e.by_user WHERE vendor_id=? ORDER BY e.id DESC', id),
    contact_log: many(ctx.db, "SELECT cl.*, u.name by_name FROM contact_log cl JOIN users u ON u.id=cl.by_user WHERE entity_type='vendor' AND entity_id=? ORDER BY at DESC", id),
    checklist: vendorChecklist(ctx, id),
    duplicates: vendorDuplicates(ctx, v, id),
    performance: full ? vendorPerformance(ctx, id) : null,
    purchase_orders: full ? many(ctx.db, 'SELECT po.id, po.number, po.status, po.promised_date, o.number order_number FROM purchase_orders po LEFT JOIN orders o ON o.id=po.order_id WHERE po.vendor_id=? AND po.archived_at IS NULL ORDER BY po.id DESC LIMIT 50', id) : [],
    quotes: full ? many(ctx.db, 'SELECT vq.*, r.title rfq_title FROM vendor_quotes vq JOIN rfqs r ON r.id=vq.rfq_id WHERE vq.vendor_id=? ORDER BY vq.id DESC LIMIT 50', id) : [],
    transitions: TRANSITIONS[state].map((to) => ({ to, reason_required: REASON_REQUIRED.includes(to), allowed: to === 'approved' || to === 'active' && state === 'suspended' ? hasRole(req.user, ...(approvers as Role[])) || can(req.user, '*') : ['suspended', 'inactive'].includes(to) ? can(req.user, 'vendors.approve') : can(req.user, 'vendors.write') })),
    can: { edit: can(req.user, 'vendors.write'), sensitive, verify: can(req.user, 'vendors.verify') },
  });
});

r.patch('/vendors/:id', requirePerm('vendors.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const v0 = vendorOr404(ctx, id);
  const v = parse(vendorInput.partial(), req.body);
  checkVersion(ctx, 'vendors', id, v.expected_version);
  if ('onboarding_owner_id' in req.body) assertUser(ctx, v.onboarding_owner_id);
  const patch: Record<string, unknown> = {};
  const keys = ['legal_name', 'display_name', 'phone', 'email', 'address', 'city', 'serviceable_locations', 'capabilities', 'customisation_options', 'lead_time_days', 'moq', 'capacity_per_week', 'payment_terms', 'preferred_comm', 'notes', 'gst_number', 'pan_number', 'onboarding_owner_id', 'onboarding_due'] as const;
  for (const k of keys) if (k in req.body) patch[k] = v[k];
  if ('categories' in req.body) patch.categories = JSON.stringify(v.categories ?? []);
  if ('sample_available' in req.body) patch.sample_available = v.sample_available ? 1 : 0;
  const changedSensitive = SENSITIVE_FIELDS.filter((k) => k in patch && (patch[k] ?? null) !== (v0[k] ?? null));
  const dups = vendorDuplicates(ctx, { ...v0, ...patch } as never, id);
  if (dups.some((d) => /GSTIN|PAN/.test(d.reason)) && !v.confirm_duplicate) throw new HttpError(409, 'duplicate', 'Another vendor already has this tax identifier.', { duplicates: dups });
  tx(ctx.db, () => {
    update(ctx.db, 'vendors', id, { ...patch, updated_at: ctx.now(), version: v0.version + 1 });
    audit(ctx.db, ctx.now(), req.user.id, 'update', 'vendor', id, `Vendor updated (${Object.keys(patch).join(', ')})`);
    if (changedSensitive.length && ['approved', 'active', 'suspended'].includes(v0.status)) {
      const msg = `Sensitive field changed after approval: ${changedSensitive.map((k) => `${k.replace('_', ' ')} ${v0[k] ?? '—'} → ${patch[k] ?? '—'}`).join('; ')}`;
      event(ctx, id, req.user.id, 'sensitive_change', msg);
      notifyRoles(ctx.db, ctx.now(), ['finance', 'admin'], 'vendor_sensitive_change', `Review vendor change: ${v0.display_name}`, msg, `/procurement/vendors/${id}`, `vendor_sensitive:${id}:${v0.version + 1}`);
    }
  });
  res.json({ ok: true });
});

r.put('/vendors/:id/bank', requirePerm('vendors.sensitive'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const v0 = vendorOr404(ctx, id);
  const v = parse(bankInput, req.body);
  const prev = one(ctx.db, 'SELECT * FROM vendor_bank WHERE vendor_id=?', id);
  const mask = (n: string | null | undefined) => (n ? `••••${n.slice(-4)}` : '—');
  tx(ctx.db, () => {
    if (prev) run(ctx.db, 'UPDATE vendor_bank SET account_name=?, account_number=?, ifsc=?, bank_name=?, upi_id=?, verified_by=NULL, verified_at=NULL, review_required=1, changed_at=?, changed_by=? WHERE vendor_id=?', v.account_name, v.account_number, v.ifsc, v.bank_name, v.upi_id, ctx.now(), req.user.id, id);
    else insert(ctx.db, 'vendor_bank', { vendor_id: id, ...v, changed_at: ctx.now(), changed_by: req.user.id, review_required: 1 });
    const summary = prev ? `Bank details CHANGED: account ${mask(prev.account_number)} → ${mask(v.account_number)}, IFSC ${prev.ifsc} → ${v.ifsc}. Needs verification before any vendor payment.` : `Bank details added (account ${mask(v.account_number)}). Needs verification.`;
    event(ctx, id, req.user.id, 'sensitive_change', summary);
    audit(ctx.db, ctx.now(), req.user.id, 'bank_change', 'vendor', id, summary);
    for (const uid of many<{ id: number; roles: string }>(ctx.db, 'SELECT id, roles FROM users WHERE active=1').filter((u) => u.id !== req.user.id && (JSON.parse(u.roles) as string[]).some((x) => ['finance', 'admin'].includes(x))).map((u) => u.id)) {
      notify(ctx.db, ctx.now(), uid, 'vendor_sensitive_change', `Verify bank details: ${v0.display_name}`, summary, `/procurement/vendors/${id}`, `bank_change:${id}:${ctx.now()}`);
    }
  });
  res.json({ ok: true });
});
r.post('/vendors/:id/bank/verify', requirePerm('vendors.verify'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); vendorOr404(ctx, id);
  const b = one(ctx.db, 'SELECT * FROM vendor_bank WHERE vendor_id=?', id); if (!b) throw badRequest('No bank details on file.');
  const { method } = parse(z.object({ method: z.string().trim().min(5, 'How did you verify? e.g. “Called vendor on known number, matched cancelled cheque”') }), req.body);
  if (b.changed_by === req.user.id) throw forbidden('Bank details must be verified by someone other than the person who entered them.');
  run(ctx.db, 'UPDATE vendor_bank SET verified_by=?, verified_at=?, review_required=0 WHERE vendor_id=?', req.user.id, ctx.now(), id);
  event(ctx, id, req.user.id, 'sensitive_change', `Bank details verified: ${method}`);
  audit(ctx.db, ctx.now(), req.user.id, 'verify', 'vendor', id, `Bank details verified: ${method}`);
  res.json({ ok: true });
});

r.post('/vendors/:id/documents', requirePerm('vendors.write', 'vendors.sensitive'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); vendorOr404(ctx, id);
  const v = parse(z.object({ kind: z.string().trim().min(2, 'Choose the document type'), attachment_id: z.number().int().positive().optional().nullable(), reference: z.string().trim().optional().nullable(), expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('').transform(() => null)), sensitive: z.boolean().optional() })
    .refine((x) => x.attachment_id || x.reference, { message: 'Attach the file or enter a reference number', path: ['attachment_id'] }), req.body);
  if (v.attachment_id && !one(ctx.db, "SELECT id FROM attachments WHERE id=? AND entity_type='vendor' AND entity_id=?", v.attachment_id, id)) throw badRequest('Upload the file to this vendor first.');
  const did = insert(ctx.db, 'vendor_documents', { vendor_id: id, kind: v.kind, attachment_id: v.attachment_id ?? null, reference: v.reference, expires_on: v.expires_on ?? null, sensitive: v.sensitive === false ? 0 : 1, uploaded_by: req.user.id, created_at: ctx.now() });
  if (v.attachment_id) run(ctx.db, 'UPDATE attachments SET sensitive=? WHERE id=?', v.sensitive === false ? 0 : 1, v.attachment_id);
  event(ctx, id, req.user.id, 'note', `Document added: ${v.kind}${v.expires_on ? ` (expires ${v.expires_on})` : ''}`);
  audit(ctx.db, ctx.now(), req.user.id, 'document', 'vendor', id, `Document added: ${v.kind}`);
  res.status(201).json({ id: did });
});
r.post('/vendor-documents/:id/verify', requirePerm('vendors.verify'), (req, res) => {
  const ctx = req.ctx; const did = intParam(req.params.id);
  const d = one(ctx.db, 'SELECT * FROM vendor_documents WHERE id=?', did); if (!d) throw notFound('Document');
  if (d.uploaded_by === req.user.id && !can(req.user, '*')) throw forbidden('Documents must be checked by someone other than the uploader.');
  run(ctx.db, 'UPDATE vendor_documents SET verified_by=?, verified_at=? WHERE id=?', req.user.id, ctx.now(), did);
  event(ctx, d.vendor_id, req.user.id, 'note', `${d.kind} checked (details match the record; this is an internal check, not a legal or tax compliance opinion)`);
  audit(ctx.db, ctx.now(), req.user.id, 'verify', 'vendor', d.vendor_id, `${d.kind} checked`);
  res.json({ ok: true });
});
r.post('/vendor-documents/:id/archive', requirePerm('vendors.write'), (req, res) => {
  const ctx = req.ctx; const did = intParam(req.params.id);
  const d = one(ctx.db, 'SELECT * FROM vendor_documents WHERE id=?', did); if (!d) throw notFound('Document');
  run(ctx.db, 'UPDATE vendor_documents SET archived_at=? WHERE id=?', ctx.now(), did);
  audit(ctx.db, ctx.now(), req.user.id, 'archive', 'vendor', d.vendor_id, `Document archived: ${d.kind}`);
  res.json({ ok: true });
});

r.post('/vendors/:id/contacts', requirePerm('vendors.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); vendorOr404(ctx, id);
  const v = parse(z.object({ name: z.string().trim().min(1, 'Name is required'), phone: z.string().trim().optional().nullable(), email: z.union([z.email('Enter a valid email'), z.literal(''), z.null()]).optional(), role: z.string().trim().optional().nullable(), is_primary: z.boolean().optional() }), req.body);
  const cid = tx(ctx.db, () => {
    if (v.is_primary) run(ctx.db, 'UPDATE vendor_contacts SET is_primary=0 WHERE vendor_id=?', id);
    return insert(ctx.db, 'vendor_contacts', { vendor_id: id, name: v.name, phone: v.phone, email: v.email || null, role: v.role, is_primary: v.is_primary ? 1 : 0 });
  });
  audit(ctx.db, ctx.now(), req.user.id, 'update', 'vendor', id, `Contact ${v.name} added`);
  res.status(201).json({ id: cid });
});

r.post('/vendors/:id/events', requirePerm('vendors.write', 'quality.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); vendorOr404(ctx, id);
  const v = parse(z.object({ kind: z.enum(['contact', 'note', 'sample', 'quality_incident', 'performance']), summary: z.string().trim().min(3, 'Add a summary'), channel: z.enum(['phone', 'email', 'whatsapp', 'meeting', 'visit']).optional() }), req.body);
  if (v.kind !== 'quality_incident' && !can(req.user, 'vendors.write')) throw forbidden();
  tx(ctx.db, () => {
    event(ctx, id, req.user.id, v.kind, v.summary);
    if (v.kind === 'contact') insert(ctx.db, 'contact_log', { party: 'vendor', entity_type: 'vendor', entity_id: id, channel: v.channel ?? 'phone', summary: v.summary, by_user: req.user.id, at: ctx.now() });
    audit(ctx.db, ctx.now(), req.user.id, v.kind, 'vendor', id, v.summary.slice(0, 200));
  });
  res.status(201).json({ ok: true });
});

r.post('/vendors/:id/transition', requirePerm('vendors.write', 'vendors.approve'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const v0 = vendorOr404(ctx, id);
  const v = parse(z.object({ to: z.enum(VENDOR_STATES), reason: z.string().trim().optional(), expected_version: z.number().int().optional() }), req.body);
  checkVersion(ctx, 'vendors', id, v.expected_version);
  const from = v0.status as VendorState;
  if (!TRANSITIONS[from].includes(v.to)) throw badRequest(`A vendor cannot move from “${from.replace('_', ' ')}” to “${v.to.replace('_', ' ')}”.`);
  if ((REASON_REQUIRED.includes(v.to) || (from === 'suspended' && v.to === 'active')) && !(v.reason && v.reason.length >= 5)) throw new HttpError(400, 'validation', 'Give a reason for this change.', { fields: { reason: 'Required (at least 5 characters)' } });
  const approvers = getSetting(ctx.db, 'approval.vendor_approver_roles') as readonly string[];
  const isApprover = hasRole(req.user, ...(approvers as Role[])) || can(req.user, '*');
  if ((v.to === 'approved' || (from === 'suspended' && v.to === 'active')) && !isApprover) throw forbidden(`Only ${approvers.join(' or ').replace(/_/g, ' ')} can approve vendors for purchasing.`);
  if (['suspended', 'inactive'].includes(v.to) && !can(req.user, 'vendors.approve')) throw forbidden('Only a procurement manager or the founder can suspend or deactivate a vendor.');
  const cl = vendorChecklist(ctx, id);
  if (v.to === 'under_review') {
    const missing = cl.filter((c) => !c.done && c.group !== 'verification');
    if (missing.length) throw blocked('The vendor record is not complete enough for review.', missing.map((c) => ({ code: c.key, message: `${c.label} missing${c.detail ? ` (${c.detail})` : ''}`, fix: c.group === 'documents' ? 'Upload the document on the Documents tab.' : c.group === 'bank' ? 'Finance/admin must enter bank details.' : 'Edit the vendor profile.' })));
  }
  if (v.to === 'approved') {
    const missing = cl.filter((c) => !c.done);
    if (missing.length) throw blocked('Approval needs every checklist item, including finance/admin verification.', missing.map((c) => ({ code: c.key, message: `${c.label}${c.detail ? ` (${c.detail})` : ''}`, fix: c.group === 'verification' ? 'Finance/admin must check it.' : 'Complete it first.' })));
    if (v0.created_by === req.user.id && v0.onboarding_owner_id === req.user.id && !can(req.user, '*')) throw forbidden('Someone other than the person who onboarded this vendor must approve it.');
  }
  tx(ctx.db, () => {
    const patch: Record<string, unknown> = { status: v.to, status_reason: v.reason ?? null, updated_at: ctx.now(), version: v0.version + 1 };
    if (v.to === 'approved') { patch.approved_by = req.user.id; patch.approved_at = ctx.now(); }
    update(ctx.db, 'vendors', id, patch);
    const summary = `Status ${from.replace('_', ' ')} → ${v.to.replace('_', ' ')}${v.reason ? `: ${v.reason}` : ''}`;
    event(ctx, id, req.user.id, 'status_change', summary);
    audit(ctx.db, ctx.now(), req.user.id, 'status', 'vendor', id, summary);
    if (v0.onboarding_owner_id && v0.onboarding_owner_id !== req.user.id) notify(ctx.db, ctx.now(), v0.onboarding_owner_id, 'vendor_status', `${v0.display_name}: ${v.to.replace('_', ' ')}`, v.reason ?? null, `/procurement/vendors/${id}`, `vendor_status:${id}:${v0.version + 1}`);
    if (v.to === 'under_review') for (const uid of many<{ id: number; roles: string }>(ctx.db, 'SELECT id, roles FROM users WHERE active=1').filter((u) => (JSON.parse(u.roles) as string[]).some((x) => approvers.includes(x) || x === 'finance')).map((u) => u.id)) {
      notify(ctx.db, ctx.now(), uid, 'vendor_review', `Vendor ready for review: ${v0.display_name}`, null, `/procurement/vendors/${id}`, `vendor_review:${id}:${v0.version + 1}`);
    }
  });
  res.json({ ok: true });
});

r.get('/vendor-meta', requirePerm('vendors.view', 'vendors.view.basic'), (req, res) => {
  res.json({ states: VENDOR_STATES, required_docs: getSetting(req.ctx.db, 'vendor.required_docs'), categories: many(req.ctx.db, 'SELECT name FROM categories WHERE active=1 ORDER BY name').map((c) => c.name) });
});

export default r;
