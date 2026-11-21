import { Router } from 'express';
import { z } from 'zod';
import { activityInput, companyInput, contactInput, feasibilityResultInput, leadInput, requirementsInput, taskInput } from '../../shared/schemas.ts';
import { assertCompanyAccess, assertLeadAccess, assertOppAccess, companyScope, leadScope, oppScope } from '../access.ts';
import { audit } from '../audit.ts';
import { requirePerm } from '../auth.ts';
import { insert, many, one, run, tx, update } from '../db.ts';
import { HttpError, badRequest, blocked, forbidden, notFound, type Missing } from '../http.ts';
import { notify, usersWithRole } from '../notify.ts';
import { can } from '../permissions.ts';
import { getSetting } from '../settings.ts';
import { assertUser, checkVersion, intParam, parse } from '../validate.ts';
import { activitiesFor, normEmail, normName, normPhone, pageParams, qstr, upsertFollowUp, userName } from '../rules/common.ts';
import type { Ctx } from '../context.ts';

const r = Router();
const LEAD_STAGES = ['new', 'contacted', 'qualified', 'converted', 'lost'];

// ---------------------------------------------------------------- duplicates
export function findLeadDuplicates(ctx: Ctx, v: { company_name: string; phone?: string | null; email?: string | null }, excludeId?: number) {
  const name = normName(v.company_name); const phone = normPhone(v.phone); const email = normEmail(v.email);
  const out: { type: string; id: number; label: string; reason: string }[] = [];
  for (const l of many(ctx.db, "SELECT id, company_name, contact_name, phone, email, stage FROM leads WHERE archived_at IS NULL AND id<>?", excludeId ?? 0)) {
    const reasons: string[] = [];
    if (name && normName(l.company_name) === name) reasons.push('same company name');
    if (phone && normPhone(l.phone) === phone) reasons.push('same phone');
    if (email && normEmail(l.email) === email) reasons.push('same email');
    if (reasons.length) out.push({ type: 'lead', id: l.id, label: `${l.company_name} — ${l.contact_name} (${l.stage})`, reason: reasons.join(', ') });
  }
  for (const c of many(ctx.db, 'SELECT id, name FROM companies WHERE archived_at IS NULL')) {
    if (name && normName(c.name) === name) out.push({ type: 'company', id: c.id, label: c.name, reason: 'existing customer company' });
  }
  for (const c of many(ctx.db, 'SELECT ct.id, ct.name, ct.phone, ct.email, co.name company FROM contacts ct JOIN companies co ON co.id=ct.company_id WHERE ct.archived_at IS NULL')) {
    const reasons: string[] = [];
    if (phone && normPhone(c.phone) === phone) reasons.push('same phone');
    if (email && normEmail(c.email) === email) reasons.push('same email');
    if (reasons.length) out.push({ type: 'contact', id: c.id, label: `${c.name} at ${c.company}`, reason: reasons.join(', ') });
  }
  return out;
}

// ---------------------------------------------------------------- leads
r.get('/leads', requirePerm('sales.write', 'sales.all'), (req, res) => {
  const ctx = req.ctx; const { limit, offset, page, pageSize } = pageParams(req);
  const s = leadScope(req.user);
  const where = ['l.archived_at IS NULL', s.sql]; const p: unknown[] = [...s.params];
  const q = qstr(req.query.q);
  if (q) { where.push('(l.company_name LIKE ? OR l.contact_name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.occasion LIKE ?)'); p.push(...Array(5).fill(`%${q}%`)); }
  const stage = qstr(req.query.stage);
  if (stage === 'open') where.push("l.stage IN ('new','contacted','qualified')"); else if (stage) { where.push('l.stage=?'); p.push(stage); }
  const owner = qstr(req.query.owner);
  if (owner) { where.push('l.owner_id=?'); p.push(Number(owner)); }
  if (req.query.followup === 'overdue') { where.push("l.next_follow_up < ? AND l.stage IN ('new','contacted','qualified')"); p.push(ctx.now().slice(0, 10)); }
  const sort = ({ follow_up: 'l.next_follow_up IS NULL, l.next_follow_up', created: 'l.created_at DESC', company: 'l.company_name COLLATE NOCASE', required_by: 'l.required_by IS NULL, l.required_by' } as Record<string, string>)[String(req.query.sort)] ?? 'l.created_at DESC';
  const w = where.join(' AND ');
  const total = one<{ n: number }>(ctx.db, `SELECT COUNT(*) n FROM leads l WHERE ${w}`, ...p)!.n;
  const rows = many(ctx.db, `SELECT l.*, u.name owner_name FROM leads l JOIN users u ON u.id=l.owner_id WHERE ${w} ORDER BY ${sort} LIMIT ? OFFSET ?`, ...p, limit, offset);
  res.json({ rows, total, page, pageSize });
});

r.post('/leads', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const v = parse(leadInput, req.body);
  assertUser(ctx, v.owner_id, 'lead owner');
  if (v.owner_id !== req.user.id && !can(req.user, 'sales.assign')) throw forbidden('Only a sales manager can create a lead for someone else.');
  const dups = findLeadDuplicates(ctx, v);
  if (dups.length && !v.confirm_duplicate) throw new HttpError(409, 'duplicate', 'This looks like an existing lead or customer. Review the matches, then save anyway if it is genuinely new.', { duplicates: dups });
  const now = ctx.now();
  const id = tx(ctx.db, () => {
    const id = insert(ctx.db, 'leads', {
      company_id: v.company_id ?? null, company_name: v.company_name, contact_name: v.contact_name, phone: v.phone, email: v.email, source: v.source,
      occasion: v.occasion, approx_qty: v.approx_qty, budget_paise: v.budget_paise, required_by: v.required_by, locations: v.locations, notes: v.notes,
      owner_id: v.owner_id, next_follow_up: v.next_follow_up, created_by: req.user.id, created_at: now, updated_at: now,
    });
    if (v.next_follow_up) upsertFollowUp(ctx, 'lead', id, v.owner_id, v.next_follow_up, `Follow up: ${v.company_name}`, req.user.id);
    audit(ctx.db, now, req.user.id, 'create', 'lead', id, `Lead created for ${v.company_name}${dups.length ? ' (possible duplicate confirmed)' : ''}`);
    if (v.owner_id !== req.user.id) notify(ctx.db, now, v.owner_id, 'lead_assigned', `New lead assigned: ${v.company_name}`, `${req.user.name} assigned you a lead.`, `/sales/leads/${id}`, `lead_assigned:${id}:${v.owner_id}`);
    return id;
  });
  res.status(201).json({ id });
});

r.get('/leads/:id', requirePerm('sales.write', 'sales.all'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertLeadAccess(ctx, req.user, id);
  const lead = one(ctx.db, 'SELECT l.*, u.name owner_name FROM leads l JOIN users u ON u.id=l.owner_id WHERE l.id=?', id)!;
  res.json({
    lead,
    activities: activitiesFor(ctx, [['lead', id]]),
    tasks: many(ctx.db, "SELECT t.*, u.name owner_name FROM tasks t JOIN users u ON u.id=t.owner_id WHERE entity_type='lead' AND entity_id=? ORDER BY status='open' DESC, due_at", id),
    duplicates: lead.stage === 'converted' ? [] : findLeadDuplicates(ctx, lead as never, id),
    history: many(ctx.db, "SELECT a.*, u.name user_name FROM audit_events a LEFT JOIN users u ON u.id=a.user_id WHERE entity_type='lead' AND entity_id=? ORDER BY a.id DESC", id),
  });
});

r.patch('/leads/:id', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertLeadAccess(ctx, req.user, id);
  const v = parse(leadInput.partial().extend({ expected_version: z.number().int().optional() }), req.body);
  checkVersion(ctx, 'leads', id, v.expected_version);
  const lead = one(ctx.db, 'SELECT * FROM leads WHERE id=?', id)!;
  if (['converted', 'lost'].includes(lead.stage)) throw badRequest('This lead is closed. Edit the opportunity instead.');
  if (v.owner_id && v.owner_id !== lead.owner_id) throw badRequest('Use “Reassign” to change the owner.');
  const fields = ['company_name', 'contact_name', 'phone', 'email', 'source', 'occasion', 'approx_qty', 'budget_paise', 'required_by', 'locations', 'notes', 'next_follow_up'] as const;
  const patch: Record<string, unknown> = {};
  for (const f of fields) if (f in req.body) patch[f] = (v as Record<string, unknown>)[f];
  tx(ctx.db, () => {
    update(ctx.db, 'leads', id, { ...patch, updated_at: ctx.now(), version: lead.version + 1 });
    if ('next_follow_up' in patch) upsertFollowUp(ctx, 'lead', id, lead.owner_id, (patch.next_follow_up as string) ?? null, `Follow up: ${patch.company_name ?? lead.company_name}`, req.user.id);
    audit(ctx.db, ctx.now(), req.user.id, 'update', 'lead', id, `Lead updated (${Object.keys(patch).join(', ')})`);
  });
  res.json({ ok: true });
});

r.post('/leads/:id/assign', requirePerm('sales.assign'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertLeadAccess(ctx, req.user, id);
  const { owner_id, reason } = parse(z.object({ owner_id: z.number().int().positive(), reason: z.string().trim().optional() }), req.body);
  assertUser(ctx, owner_id, 'owner');
  const lead = one(ctx.db, 'SELECT * FROM leads WHERE id=?', id)!;
  tx(ctx.db, () => {
    run(ctx.db, 'UPDATE leads SET owner_id=?, updated_at=?, version=version+1 WHERE id=?', owner_id, ctx.now(), id);
    run(ctx.db, "UPDATE tasks SET owner_id=? WHERE entity_type='lead' AND entity_id=? AND status='open'", owner_id, id);
    audit(ctx.db, ctx.now(), req.user.id, 'assign', 'lead', id, `Reassigned from ${userName(ctx, lead.owner_id)} to ${userName(ctx, owner_id)}${reason ? `: ${reason}` : ''}`);
    notify(ctx.db, ctx.now(), owner_id, 'lead_assigned', `Lead assigned to you: ${lead.company_name}`, reason ?? null, `/sales/leads/${id}`, `lead_assigned:${id}:${owner_id}`);
  });
  res.json({ ok: true });
});

function logActivity(ctx: Ctx, userId: number, entityType: string, entityId: number, v: z.output<typeof activityInput>) {
  return insert(ctx.db, 'activities', { entity_type: entityType, entity_id: entityId, kind: v.kind, summary: v.summary, outcome: v.outcome, by_user: userId, at: ctx.now() });
}
r.post('/leads/:id/activities', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertLeadAccess(ctx, req.user, id);
  const v = parse(activityInput, req.body);
  const lead = one(ctx.db, 'SELECT * FROM leads WHERE id=?', id)!;
  tx(ctx.db, () => {
    logActivity(ctx, req.user.id, 'lead', id, v);
    const patch: Record<string, unknown> = { updated_at: ctx.now() };
    if (lead.stage === 'new' && v.kind !== 'note') patch.stage = 'contacted';
    if (v.next_follow_up !== undefined && 'next_follow_up' in req.body) {
      patch.next_follow_up = v.next_follow_up;
      upsertFollowUp(ctx, 'lead', id, lead.owner_id, v.next_follow_up, `Follow up: ${lead.company_name}`, req.user.id);
    }
    update(ctx.db, 'leads', id, patch);
    audit(ctx.db, ctx.now(), req.user.id, 'activity', 'lead', id, `${v.kind} logged: ${v.summary.slice(0, 80)}`);
  });
  res.status(201).json({ ok: true });
});

export function leadQualificationGaps(ctx: Ctx, lead: Record<string, any>): Missing[] {
  const m: Missing[] = [];
  if (!lead.approx_qty) m.push({ code: 'qty', message: 'Approximate quantity is missing', fix: 'Edit the lead and add an approximate quantity.' });
  if (!lead.required_by) m.push({ code: 'date', message: 'Required delivery date is missing', fix: 'Edit the lead and add the date the customer needs delivery.' });
  if (!lead.budget_paise) m.push({ code: 'budget', message: 'Budget is missing', fix: 'Ask the customer for an indicative budget per box or in total.' });
  const acts = one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM activities WHERE entity_type='lead' AND entity_id=? AND kind<>'note'", lead.id)!.n;
  if (!acts) m.push({ code: 'contact', message: 'No call, meeting or message has been logged', fix: 'Log the conversation where you confirmed the requirement.' });
  return m;
}
r.post('/leads/:id/qualify', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertLeadAccess(ctx, req.user, id);
  const lead = one(ctx.db, 'SELECT * FROM leads WHERE id=?', id)!;
  if (!['new', 'contacted'].includes(lead.stage)) throw badRequest(`A lead in “${lead.stage}” cannot be qualified.`);
  const gaps = leadQualificationGaps(ctx, lead);
  if (gaps.length) throw blocked('This lead is not ready to qualify.', gaps);
  run(ctx.db, "UPDATE leads SET stage='qualified', updated_at=?, version=version+1 WHERE id=?", ctx.now(), id);
  audit(ctx.db, ctx.now(), req.user.id, 'stage', 'lead', id, 'Lead qualified');
  res.json({ ok: true });
});

r.post('/leads/:id/lose', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertLeadAccess(ctx, req.user, id);
  const reasons = getSetting(ctx.db, 'sales.lost_reasons') as readonly string[];
  const { reason, detail } = parse(z.object({ reason: z.string().refine((x) => reasons.includes(x), 'Choose a reason'), detail: z.string().trim().optional() }), req.body);
  const lead = one(ctx.db, 'SELECT * FROM leads WHERE id=?', id)!;
  if (lead.stage === 'converted') throw badRequest('Converted leads are closed through their opportunity.');
  tx(ctx.db, () => {
    run(ctx.db, "UPDATE leads SET stage='lost', lost_reason=?, updated_at=?, version=version+1 WHERE id=?", reason + (detail ? ` — ${detail}` : ''), ctx.now(), id);
    upsertFollowUp(ctx, 'lead', id, lead.owner_id, null, '', req.user.id);
    audit(ctx.db, ctx.now(), req.user.id, 'stage', 'lead', id, `Lead marked lost: ${reason}`);
  });
  res.json({ ok: true });
});

r.post('/leads/:id/convert', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertLeadAccess(ctx, req.user, id);
  const lead = one(ctx.db, 'SELECT * FROM leads WHERE id=?', id)!;
  if (lead.stage !== 'qualified') throw blocked('Only a qualified lead can become an opportunity.', [{ code: 'qualify', message: `Lead is “${lead.stage}”`, fix: 'Qualify the lead first.' }]);
  const now = ctx.now();
  const oppId = tx(ctx.db, () => {
    let companyId: number | null = lead.company_id;
    if (!companyId) {
      const match = many(ctx.db, 'SELECT id, name FROM companies WHERE archived_at IS NULL').find((c) => normName(c.name) === normName(lead.company_name));
      companyId = match?.id ?? insert(ctx.db, 'companies', { name: lead.company_name, owner_id: lead.owner_id, created_at: now, updated_at: now });
    }
    let contactId = lead.contact_id as number | null;
    if (!contactId) {
      const existing = many(ctx.db, 'SELECT id, phone, email, name FROM contacts WHERE company_id=? AND archived_at IS NULL', companyId)
        .find((c) => (lead.email && normEmail(c.email) === normEmail(lead.email)) || (lead.phone && normPhone(c.phone) === normPhone(lead.phone)) || c.name.toLowerCase() === lead.contact_name.toLowerCase());
      const isFirst = !one(ctx.db, 'SELECT id FROM contacts WHERE company_id=?', companyId);
      contactId = existing?.id ?? insert(ctx.db, 'contacts', { company_id: companyId, name: lead.contact_name, email: lead.email, phone: lead.phone, is_primary: isFirst ? 1 : 0, created_at: now });
    }
    const requirements = { occasion: lead.occasion, recipients: lead.approx_qty, delivery_locations: lead.locations, delivery_by: lead.required_by, notes: lead.notes, budget_per_box_paise: lead.budget_paise && lead.approx_qty ? Math.round(lead.budget_paise / lead.approx_qty) : null };
    const oppId = insert(ctx.db, 'opportunities', {
      company_id: companyId, contact_id: contactId, lead_id: id, title: `${lead.company_name} — ${lead.occasion || 'Corporate gifting'}`, owner_id: lead.owner_id,
      approx_qty: lead.approx_qty, budget_paise: lead.budget_paise, required_by: lead.required_by, occasion: lead.occasion,
      requirements: JSON.stringify(requirements), created_at: now, updated_at: now,
    });
    run(ctx.db, "UPDATE leads SET stage='converted', opportunity_id=?, company_id=?, contact_id=?, updated_at=?, version=version+1 WHERE id=?", oppId, companyId, contactId, now, id);
    // Move open follow-ups to the opportunity; activity history stays on the lead and is shown on the opportunity.
    run(ctx.db, "UPDATE tasks SET entity_type='opportunity', entity_id=? WHERE entity_type='lead' AND entity_id=? AND status='open'", oppId, id);
    run(ctx.db, "UPDATE attachments SET entity_type='opportunity', entity_id=? WHERE entity_type='lead' AND entity_id=?", oppId, id);
    audit(ctx.db, now, req.user.id, 'convert', 'lead', id, `Converted to opportunity #${oppId}`);
    audit(ctx.db, now, req.user.id, 'create', 'opportunity', oppId, `Opportunity created from lead #${id}`);
    return oppId;
  });
  res.status(201).json({ opportunity_id: oppId });
});

// ---------------------------------------------------------------- companies + contacts
r.get('/companies', requirePerm('sales.write', 'sales.all', 'orders.view_all'), (req, res) => {
  const ctx = req.ctx; const { limit, offset, page, pageSize } = pageParams(req);
  const s = companyScope(req.user); const where = ['c.archived_at IS NULL', s.sql]; const p: unknown[] = [...s.params];
  const q = qstr(req.query.q);
  if (q) { where.push('(c.name LIKE ? OR c.city LIKE ? OR EXISTS (SELECT 1 FROM contacts ct WHERE ct.company_id=c.id AND (ct.name LIKE ? OR ct.email LIKE ?)))'); p.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const w = where.join(' AND ');
  const total = one<{ n: number }>(ctx.db, `SELECT COUNT(*) n FROM companies c WHERE ${w}`, ...p)!.n;
  const rows = many(ctx.db, `SELECT c.*, u.name owner_name,
      (SELECT COUNT(*) FROM contacts ct WHERE ct.company_id=c.id AND ct.archived_at IS NULL) contacts,
      (SELECT COUNT(*) FROM opportunities op WHERE op.company_id=c.id AND op.stage NOT IN ('won','lost')) open_opps,
      (SELECT COUNT(*) FROM orders o WHERE o.company_id=c.id AND o.archived_at IS NULL) orders
    FROM companies c LEFT JOIN users u ON u.id=c.owner_id WHERE ${w} ORDER BY c.name COLLATE NOCASE LIMIT ? OFFSET ?`, ...p, limit, offset);
  res.json({ rows, total, page, pageSize });
});
r.post('/companies', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const v = parse(companyInput.extend({ confirm_duplicate: z.boolean().optional() }), req.body);
  const dup = many(ctx.db, 'SELECT id, name FROM companies WHERE archived_at IS NULL').filter((c) => normName(c.name) === normName(v.name));
  if (dup.length && !v.confirm_duplicate) throw new HttpError(409, 'duplicate', 'A company with this name already exists.', { duplicates: dup.map((d) => ({ type: 'company', id: d.id, label: d.name, reason: 'same name' })) });
  const now = ctx.now();
  const id = insert(ctx.db, 'companies', { name: v.name, gst_number: v.gst_number, industry: v.industry, address: v.address, city: v.city, owner_id: v.owner_id ?? req.user.id, notes: v.notes, created_at: now, updated_at: now });
  audit(ctx.db, now, req.user.id, 'create', 'company', id, `Company ${v.name} created`);
  res.status(201).json({ id });
});
r.get('/companies/:id', requirePerm('sales.write', 'sales.all', 'orders.view_all'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertCompanyAccess(ctx, req.user, id);
  const os = oppScope(req.user);
  res.json({
    company: one(ctx.db, 'SELECT c.*, u.name owner_name FROM companies c LEFT JOIN users u ON u.id=c.owner_id WHERE c.id=?', id),
    contacts: many(ctx.db, 'SELECT * FROM contacts WHERE company_id=? AND archived_at IS NULL ORDER BY is_primary DESC, name', id),
    opportunities: many(ctx.db, `SELECT op.id, op.title, op.stage, op.required_by, u.name owner_name FROM opportunities op JOIN users u ON u.id=op.owner_id WHERE op.company_id=? AND ${os.sql} ORDER BY op.created_at DESC`, id, ...os.params),
    orders: many(ctx.db, 'SELECT id, number, title, stage, due_date FROM orders WHERE company_id=? AND archived_at IS NULL ORDER BY created_at DESC', id),
    activities: activitiesFor(ctx, [['company', id]]),
  });
});
r.patch('/companies/:id', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertCompanyAccess(ctx, req.user, id);
  const v = parse(companyInput.partial().extend({ expected_version: z.number().int().optional() }), req.body);
  checkVersion(ctx, 'companies', id, v.expected_version);
  const patch: Record<string, unknown> = {};
  for (const f of ['name', 'gst_number', 'industry', 'address', 'city', 'notes', 'owner_id'] as const) if (f in req.body) patch[f] = v[f];
  if ('owner_id' in patch && !can(req.user, 'sales.assign')) throw forbidden('Only a sales manager can change the account owner.');
  update(ctx.db, 'companies', id, { ...patch, updated_at: ctx.now(), version: (one<{ version: number }>(ctx.db, 'SELECT version FROM companies WHERE id=?', id)!.version) + 1 });
  audit(ctx.db, ctx.now(), req.user.id, 'update', 'company', id, `Company updated (${Object.keys(patch).join(', ')})`);
  res.json({ ok: true });
});
r.post('/companies/:id/contacts', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertCompanyAccess(ctx, req.user, id);
  const v = parse(contactInput, req.body);
  const cid = tx(ctx.db, () => {
    if (v.is_primary) run(ctx.db, 'UPDATE contacts SET is_primary=0 WHERE company_id=?', id);
    const cid = insert(ctx.db, 'contacts', { company_id: id, name: v.name, email: v.email, phone: v.phone, designation: v.designation, is_primary: v.is_primary ? 1 : 0, created_at: ctx.now() });
    audit(ctx.db, ctx.now(), req.user.id, 'create', 'company', id, `Contact ${v.name} added`);
    return cid;
  });
  res.status(201).json({ id: cid });
});
r.patch('/contacts/:id', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const c = one(ctx.db, 'SELECT * FROM contacts WHERE id=?', id); if (!c) throw notFound('Contact');
  assertCompanyAccess(ctx, req.user, c.company_id);
  const v = parse(contactInput.partial().extend({ archived: z.boolean().optional() }), req.body);
  tx(ctx.db, () => {
    if (v.is_primary) run(ctx.db, 'UPDATE contacts SET is_primary=0 WHERE company_id=?', c.company_id);
    const patch: Record<string, unknown> = {};
    for (const f of ['name', 'email', 'phone', 'designation'] as const) if (f in req.body) patch[f] = v[f];
    if ('is_primary' in req.body) patch.is_primary = v.is_primary ? 1 : 0;
    if (v.archived) patch.archived_at = ctx.now();
    update(ctx.db, 'contacts', id, patch);
    audit(ctx.db, ctx.now(), req.user.id, 'update', 'company', c.company_id, `Contact ${c.name} ${v.archived ? 'archived' : 'updated'}`);
  });
  res.json({ ok: true });
});
r.post('/companies/:id/activities', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertCompanyAccess(ctx, req.user, id);
  logActivity(ctx, req.user.id, 'company', id, parse(activityInput, req.body));
  res.status(201).json({ ok: true });
});

// ---------------------------------------------------------------- opportunities
r.get('/opportunities', requirePerm('sales.write', 'sales.all', 'feasibility.write'), (req, res) => {
  const ctx = req.ctx; const { limit, offset, page, pageSize } = pageParams(req);
  const s = oppScope(req.user); const where = ['op.archived_at IS NULL', s.sql]; const p: unknown[] = [...s.params];
  const q = qstr(req.query.q);
  if (q) { where.push('(op.title LIKE ? OR c.name LIKE ?)'); p.push(`%${q}%`, `%${q}%`); }
  const stage = qstr(req.query.stage);
  if (stage === 'open') where.push("op.stage NOT IN ('won','lost')"); else if (stage) { where.push('op.stage=?'); p.push(stage); }
  const owner = qstr(req.query.owner); if (owner) { where.push('op.owner_id=?'); p.push(Number(owner)); }
  const w = where.join(' AND ');
  const total = one<{ n: number }>(ctx.db, `SELECT COUNT(*) n FROM opportunities op JOIN companies c ON c.id=op.company_id WHERE ${w}`, ...p)!.n;
  const rows = many(ctx.db, `SELECT op.*, c.name company_name, u.name owner_name,
      (SELECT f.status || ':' || COALESCE(f.result,'') FROM feasibility_checks f WHERE f.opportunity_id=op.id ORDER BY f.id DESC LIMIT 1) feasibility,
      (SELECT q.status FROM quotations q WHERE q.opportunity_id=op.id AND q.archived_at IS NULL ORDER BY q.id DESC LIMIT 1) quote_status,
      (SELECT qv.total_paise FROM quotations q JOIN quote_versions qv ON qv.quotation_id=q.id AND qv.version=q.current_version WHERE q.opportunity_id=op.id ORDER BY q.id DESC LIMIT 1) quote_total_paise
    FROM opportunities op JOIN companies c ON c.id=op.company_id JOIN users u ON u.id=op.owner_id WHERE ${w}
    ORDER BY op.required_by IS NULL, op.required_by LIMIT ? OFFSET ?`, ...p, limit, offset);
  res.json({ rows, total, page, pageSize });
});
r.post('/opportunities', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx;
  const v = parse(z.object({ company_id: z.number().int().positive(), contact_id: z.number().int().positive().optional().nullable(), title: z.string().trim().min(1, 'Title is required'), owner_id: z.number().int().positive(), approx_qty: z.number().int().positive().optional().nullable(), required_by: z.string().optional().nullable(), occasion: z.string().optional().nullable() }), req.body);
  assertCompanyAccess(ctx, req.user, v.company_id); assertUser(ctx, v.owner_id);
  if (v.owner_id !== req.user.id && !can(req.user, 'sales.assign')) throw forbidden('Only a sales manager can create opportunities for someone else.');
  const now = ctx.now();
  const id = insert(ctx.db, 'opportunities', { ...v, requirements: JSON.stringify({ occasion: v.occasion, recipients: v.approx_qty, delivery_by: v.required_by }), created_at: now, updated_at: now });
  audit(ctx.db, now, req.user.id, 'create', 'opportunity', id, `Opportunity “${v.title}” created`);
  if (v.owner_id !== req.user.id) notify(ctx.db, now, v.owner_id, 'opportunity_assigned', `Opportunity assigned: ${v.title}`, null, `/sales/opportunities/${id}`, `opp_assigned:${id}:${v.owner_id}`);
  res.status(201).json({ id });
});
r.get('/opportunities/:id', requirePerm('sales.write', 'sales.all', 'feasibility.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOppAccess(ctx, req.user, id);
  const opp = one(ctx.db, `SELECT op.*, c.name company_name, u.name owner_name, ct.name contact_name, ct.email contact_email, ct.phone contact_phone
    FROM opportunities op JOIN companies c ON c.id=op.company_id JOIN users u ON u.id=op.owner_id LEFT JOIN contacts ct ON ct.id=op.contact_id WHERE op.id=?`, id)!;
  opp.requirements = JSON.parse(opp.requirements);
  const quotes = many(ctx.db, 'SELECT q.*, qv.total_paise, qv.margin_bp, qv.validity_date, qv.delivery_date FROM quotations q JOIN quote_versions qv ON qv.quotation_id=q.id AND qv.version=q.current_version WHERE q.opportunity_id=? AND q.archived_at IS NULL ORDER BY q.id DESC', id);
  res.json({
    opportunity: opp,
    contacts: many(ctx.db, 'SELECT id, name, email, phone, designation FROM contacts WHERE company_id=? AND archived_at IS NULL', opp.company_id),
    feasibility: many(ctx.db, 'SELECT f.*, a.name assigned_name, r.name requested_name, cb.name completed_name FROM feasibility_checks f LEFT JOIN users a ON a.id=f.assigned_to JOIN users r ON r.id=f.requested_by LEFT JOIN users cb ON cb.id=f.completed_by WHERE f.opportunity_id=? ORDER BY f.id DESC', id),
    quotations: can(req.user, 'costing.view') ? quotes : quotes.map(({ margin_bp: _m, ...q }) => q),
    activities: activitiesFor(ctx, [['opportunity', id], ['lead', opp.lead_id]]),
    tasks: many(ctx.db, "SELECT t.*, u.name owner_name FROM tasks t JOIN users u ON u.id=t.owner_id WHERE entity_type='opportunity' AND entity_id=? ORDER BY status='open' DESC, due_at", id),
    history: many(ctx.db, "SELECT a.*, u.name user_name FROM audit_events a LEFT JOIN users u ON u.id=a.user_id WHERE (entity_type='opportunity' AND entity_id=?) OR (entity_type='lead' AND entity_id=?) ORDER BY a.id DESC", id, opp.lead_id ?? 0),
    lostReasons: getSetting(ctx.db, 'sales.lost_reasons'),
  });
});
r.patch('/opportunities/:id', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOppAccess(ctx, req.user, id);
  const v = parse(z.object({
    title: z.string().trim().min(1).optional(), owner_id: z.number().int().positive().optional(), contact_id: z.number().int().positive().optional().nullable(),
    approx_qty: z.number().int().positive().optional().nullable(), budget_paise: z.number().int().min(0).optional().nullable(), required_by: z.string().optional().nullable(),
    requirements: requirementsInput.optional(), expected_version: z.number().int().optional(),
  }), req.body);
  checkVersion(ctx, 'opportunities', id, v.expected_version);
  const opp = one(ctx.db, 'SELECT * FROM opportunities WHERE id=?', id)!;
  if (['won', 'lost'].includes(opp.stage)) throw badRequest('This opportunity is closed.');
  if (v.owner_id && v.owner_id !== opp.owner_id && !can(req.user, 'sales.assign')) throw forbidden('Only a sales manager can reassign opportunities.');
  const patch: Record<string, unknown> = {};
  for (const f of ['title', 'owner_id', 'contact_id', 'approx_qty', 'budget_paise', 'required_by'] as const) if (f in req.body) patch[f] = v[f];
  if (v.requirements) patch.requirements = JSON.stringify(v.requirements);
  tx(ctx.db, () => {
    update(ctx.db, 'opportunities', id, { ...patch, updated_at: ctx.now(), version: opp.version + 1 });
    if (v.owner_id && v.owner_id !== opp.owner_id) {
      run(ctx.db, "UPDATE tasks SET owner_id=? WHERE entity_type='opportunity' AND entity_id=? AND status='open' AND owner_id=?", v.owner_id, id, opp.owner_id);
      notify(ctx.db, ctx.now(), v.owner_id, 'opportunity_assigned', `Opportunity assigned: ${opp.title}`, null, `/sales/opportunities/${id}`, `opp_assigned:${id}:${v.owner_id}`);
    }
    audit(ctx.db, ctx.now(), req.user.id, 'update', 'opportunity', id, v.requirements ? 'Customer requirements updated' : `Opportunity updated (${Object.keys(patch).join(', ')})`, { details: v.requirements });
  });
  res.json({ ok: true });
});
r.post('/opportunities/:id/activities', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOppAccess(ctx, req.user, id);
  const v = parse(activityInput, req.body);
  const opp = one(ctx.db, 'SELECT * FROM opportunities WHERE id=?', id)!;
  tx(ctx.db, () => {
    logActivity(ctx, req.user.id, 'opportunity', id, v);
    if ('next_follow_up' in req.body) upsertFollowUp(ctx, 'opportunity', id, opp.owner_id, v.next_follow_up, `Follow up: ${opp.title}`, req.user.id);
  });
  res.status(201).json({ ok: true });
});
r.post('/opportunities/:id/lose', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOppAccess(ctx, req.user, id);
  const reasons = getSetting(ctx.db, 'sales.lost_reasons') as readonly string[];
  const { reason, detail } = parse(z.object({ reason: z.string().refine((x) => reasons.includes(x), 'Choose a reason'), detail: z.string().trim().optional() }), req.body);
  const opp = one(ctx.db, 'SELECT * FROM opportunities WHERE id=?', id)!;
  if (opp.stage === 'won') throw badRequest('This opportunity already became an order.');
  tx(ctx.db, () => {
    run(ctx.db, "UPDATE opportunities SET stage='lost', lost_reason=?, updated_at=?, version=version+1 WHERE id=?", reason + (detail ? ` — ${detail}` : ''), ctx.now(), id);
    run(ctx.db, "UPDATE quotations SET status='rejected' WHERE opportunity_id=? AND status NOT IN ('customer_approved')", id);
    run(ctx.db, "UPDATE tasks SET status='cancelled', completed_at=? WHERE entity_type='opportunity' AND entity_id=? AND status='open'", ctx.now(), id);
    audit(ctx.db, ctx.now(), req.user.id, 'stage', 'opportunity', id, `Marked lost: ${reason}${detail ? ` — ${detail}` : ''}`);
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- feasibility
r.post('/opportunities/:id/feasibility', requirePerm('sales.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOppAccess(ctx, req.user, id);
  const v = parse(z.object({ assigned_to: z.number({ error: 'Choose who should check feasibility' }).int().positive(), notes: z.string().trim().optional() }), req.body);
  assertUser(ctx, v.assigned_to);
  const assignee = one<{ roles: string }>(ctx.db, 'SELECT roles FROM users WHERE id=?', v.assigned_to)!;
  if (!(JSON.parse(assignee.roles) as string[]).some((x) => ['procurement_manager', 'procurement_exec', 'admin'].includes(x))) throw badRequest('Feasibility must be checked by someone in procurement.');
  const opp = one(ctx.db, 'SELECT * FROM opportunities WHERE id=?', id)!;
  if (['won', 'lost'].includes(opp.stage)) throw badRequest('This opportunity is closed.');
  if (one(ctx.db, "SELECT id FROM feasibility_checks WHERE opportunity_id=? AND status='requested'", id)) throw new HttpError(409, 'conflict', 'A feasibility check is already open for this opportunity.');
  const fid = tx(ctx.db, () => {
    const fid = insert(ctx.db, 'feasibility_checks', { opportunity_id: id, requested_by: req.user.id, assigned_to: v.assigned_to, notes: v.notes ?? null, requested_at: ctx.now() });
    if (opp.stage === 'requirements') run(ctx.db, "UPDATE opportunities SET stage='feasibility', updated_at=? WHERE id=?", ctx.now(), id);
    insert(ctx.db, 'tasks', { title: `Feasibility check: ${opp.title}`, owner_id: v.assigned_to, due_at: ctx.now().slice(0, 10), kind: 'feasibility', entity_type: 'opportunity', entity_id: id, created_by: req.user.id, created_at: ctx.now() });
    notify(ctx.db, ctx.now(), v.assigned_to, 'feasibility_request', `Feasibility check requested: ${opp.title}`, v.notes ?? null, `/sales/opportunities/${id}`, `feasibility:${fid}`);
    audit(ctx.db, ctx.now(), req.user.id, 'feasibility', 'opportunity', id, `Feasibility check requested from ${userName(ctx, v.assigned_to)}`);
    return fid;
  });
  res.status(201).json({ id: fid });
});
r.get('/feasibility', requirePerm('feasibility.write'), (req, res) => {
  const ctx = req.ctx;
  const mine = !can(req.user, 'procurement.all') || req.query.scope === 'mine';
  res.json({ rows: many(ctx.db, `SELECT f.*, op.title, op.approx_qty, op.required_by, c.name company_name, u.name requested_name, a.name assigned_name
    FROM feasibility_checks f JOIN opportunities op ON op.id=f.opportunity_id JOIN companies c ON c.id=op.company_id JOIN users u ON u.id=f.requested_by LEFT JOIN users a ON a.id=f.assigned_to
    WHERE f.status='requested' ${mine ? 'AND f.assigned_to=?' : ''} ORDER BY f.requested_at`, ...(mine ? [req.user.id] : [])) });
});
r.post('/feasibility/:id/complete', requirePerm('feasibility.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const f = one(ctx.db, 'SELECT * FROM feasibility_checks WHERE id=?', id); if (!f) throw notFound('Feasibility check');
  if (f.assigned_to !== req.user.id && !can(req.user, 'procurement.all')) throw forbidden('This check is assigned to someone else.');
  if (f.status !== 'requested') throw new HttpError(409, 'conflict', 'This check was already completed.');
  const v = parse(feasibilityResultInput, req.body);
  const opp = one(ctx.db, 'SELECT * FROM opportunities WHERE id=?', f.opportunity_id)!;
  tx(ctx.db, () => {
    update(ctx.db, 'feasibility_checks', id, { status: 'completed', result: v.result, earliest_delivery: v.earliest_delivery, est_cost_paise: v.est_cost_paise, max_quantity: v.max_quantity, notes: v.notes, completed_at: ctx.now(), completed_by: req.user.id });
    if (['requirements', 'feasibility'].includes(opp.stage)) run(ctx.db, "UPDATE opportunities SET stage='quotation', updated_at=? WHERE id=?", ctx.now(), opp.id);
    run(ctx.db, "UPDATE tasks SET status='done', completed_at=? WHERE kind='feasibility' AND entity_type='opportunity' AND entity_id=? AND status='open'", ctx.now(), opp.id);
    notify(ctx.db, ctx.now(), opp.owner_id, 'feasibility_done', `Feasibility ${v.result.replace('_', ' ')}: ${opp.title}`, `Earliest delivery ${v.earliest_delivery}. ${v.notes}`, `/sales/opportunities/${opp.id}`, `feasibility_done:${id}`);
    audit(ctx.db, ctx.now(), req.user.id, 'feasibility', 'opportunity', opp.id, `Feasibility recorded: ${v.result}, earliest delivery ${v.earliest_delivery}${v.max_quantity ? `, max ${v.max_quantity} units` : ''}`);
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- tasks
r.get('/tasks', (req, res) => {
  const ctx = req.ctx; const { limit, offset, page, pageSize } = pageParams(req);
  const where: string[] = []; const p: unknown[] = [];
  const scope = req.query.scope === 'team' && can(req.user, 'tasks.assign') ? 'team' : 'mine';
  if (scope === 'mine') { where.push('t.owner_id=?'); p.push(req.user.id); } else { where.push('(t.owner_id=? OR t.created_by=? OR ?)'); p.push(req.user.id, req.user.id, can(req.user, 'sales.all') || can(req.user, 'procurement.all') ? 1 : 0); }
  const status = qstr(req.query.status) ?? 'open';
  if (status !== 'all') { where.push('t.status=?'); p.push(status); }
  if (req.query.due === 'overdue') { where.push('t.due_at < ?'); p.push(ctx.now().slice(0, 10)); }
  if (req.query.due === 'today') { where.push('t.due_at <= ?'); p.push(ctx.now().slice(0, 10)); }
  const w = where.join(' AND ');
  const total = one<{ n: number }>(ctx.db, `SELECT COUNT(*) n FROM tasks t WHERE ${w}`, ...p)!.n;
  const rows = many(ctx.db, `SELECT t.*, u.name owner_name FROM tasks t JOIN users u ON u.id=t.owner_id WHERE ${w} ORDER BY t.status='open' DESC, t.due_at IS NULL, t.due_at LIMIT ? OFFSET ?`, ...p, limit, offset);
  res.json({ rows: rows.map((t) => ({ ...t, link: taskLink(t) })), total, page, pageSize });
});
export function taskLink(t: { entity_type: string | null; entity_id: number | null; order_id?: number | null }) {
  if (t.order_id) return `/orders/${t.order_id}`;
  switch (t.entity_type) {
    case 'lead': return `/sales/leads/${t.entity_id}`;
    case 'opportunity': return `/sales/opportunities/${t.entity_id}`;
    case 'order': return `/orders/${t.entity_id}`;
    case 'vendor': return `/procurement/vendors/${t.entity_id}`;
    case 'purchase_order': return `/procurement/purchase-orders/${t.entity_id}`;
    case 'company': return `/sales/companies/${t.entity_id}`;
    default: return null;
  }
}
r.post('/tasks', (req, res) => {
  const ctx = req.ctx; const v = parse(taskInput, req.body);
  assertUser(ctx, v.owner_id);
  if (v.owner_id !== req.user.id && !can(req.user, 'tasks.assign')) throw forbidden('You can only create tasks for yourself.');
  const id = insert(ctx.db, 'tasks', { title: v.title, description: v.description, owner_id: v.owner_id, due_at: v.due_at, kind: 'manual', entity_type: v.entity_type ?? null, entity_id: v.entity_id ?? null, order_id: v.entity_type === 'order' ? v.entity_id : null, created_by: req.user.id, created_at: ctx.now() });
  if (v.owner_id !== req.user.id) notify(ctx.db, ctx.now(), v.owner_id, 'task_assigned', `Task from ${req.user.name}: ${v.title}`, v.description, '/', `task_assigned:${id}`);
  audit(ctx.db, ctx.now(), req.user.id, 'create', 'task', id, `Task “${v.title}” for ${userName(ctx, v.owner_id)}`, { orderId: v.entity_type === 'order' ? v.entity_id : null });
  res.status(201).json({ id });
});
r.post('/tasks/:id/complete', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const t = one(ctx.db, 'SELECT * FROM tasks WHERE id=?', id); if (!t) throw notFound('Task');
  if (t.owner_id !== req.user.id && t.created_by !== req.user.id && !can(req.user, 'tasks.assign')) throw forbidden('This task belongs to someone else.');
  if (t.status !== 'open') throw new HttpError(409, 'conflict', 'This task is already closed.');
  const { note } = parse(z.object({ note: z.string().trim().optional() }), req.body);
  run(ctx.db, "UPDATE tasks SET status='done', completed_at=? WHERE id=?", ctx.now(), id);
  audit(ctx.db, ctx.now(), req.user.id, 'complete', 'task', id, `Task done: ${t.title}${note ? ` — ${note}` : ''}`, { orderId: t.order_id });
  res.json({ ok: true });
});
r.patch('/tasks/:id', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const t = one(ctx.db, 'SELECT * FROM tasks WHERE id=?', id); if (!t) throw notFound('Task');
  if (t.owner_id !== req.user.id && !can(req.user, 'tasks.assign')) throw forbidden();
  const v = parse(z.object({ due_at: z.string().optional().nullable(), owner_id: z.number().int().positive().optional(), title: z.string().trim().min(1).optional(), cancel: z.boolean().optional() }), req.body);
  if (v.owner_id && v.owner_id !== t.owner_id) { assertUser(ctx, v.owner_id); if (!can(req.user, 'tasks.assign')) throw forbidden('Only managers can reassign tasks.'); }
  update(ctx.db, 'tasks', id, { ...(v.due_at !== undefined ? { due_at: v.due_at } : {}), ...(v.owner_id ? { owner_id: v.owner_id } : {}), ...(v.title ? { title: v.title } : {}), ...(v.cancel ? { status: 'cancelled', completed_at: ctx.now() } : {}) });
  if (v.owner_id && v.owner_id !== t.owner_id) notify(ctx.db, ctx.now(), v.owner_id, 'task_assigned', `Task assigned to you: ${t.title}`, null, taskLink(t) ?? '/', `task_assigned:${id}:${v.owner_id}`);
  audit(ctx.db, ctx.now(), req.user.id, 'update', 'task', id, `Task updated: ${t.title}`, { orderId: t.order_id });
  res.json({ ok: true });
});

// Users list for pickers (names and roles only).
r.get('/users', (req, res) => {
  res.json({ rows: many(req.ctx.db, 'SELECT id, name, roles FROM users WHERE active=1 ORDER BY name').map((u) => ({ ...u, roles: JSON.parse(u.roles) })) });
});
export { usersWithRole, LEAD_STAGES };
export default r;
