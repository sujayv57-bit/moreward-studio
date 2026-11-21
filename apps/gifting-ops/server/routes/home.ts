import { Router } from 'express';
import { z } from 'zod';
import { assertEntityAccess, companyScope, leadScope, oppScope, orderScope, stripCosts } from '../access.ts';
import { audit } from '../audit.ts';
import { requirePerm } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { addDays, today } from '../context.ts';
import { insert, many, one, run } from '../db.ts';
import { badRequest, notFound } from '../http.ts';
import { can, canAny, hasRole, type AuthUser } from '../permissions.ts';
import { runAutomations } from '../rules/automations.ts';
import { pageParams, qstr } from '../rules/common.ts';
import { componentStatus, deliveryRisk, orderFinance, orderStatus, STAGES } from '../rules/orders.ts';
import { vendorChecklist, vendorPerformance } from '../rules/vendors.ts';
import { getSetting } from '../settings.ts';
import { parse } from '../validate.ts';
import { payables, receivables } from './finance.ts';
import { approvalLink } from './quotes.ts';
import { taskLink } from './sales.ts';

const r = Router();

function scopedOrders(ctx: Ctx, user: AuthUser, extra = '') {
  const s = orderScope(user);
  return many(ctx.db, `SELECT o.*, c.name company_name FROM orders o JOIN companies c ON c.id=o.company_id WHERE o.archived_at IS NULL AND ${s.sql} ${extra}`, ...s.params);
}

// ---------------------------------------------------------------- home dashboard
r.get('/home', (req, res) => {
  const ctx = req.ctx; const u = req.user; const t = today(ctx);
  const tasks = many(ctx.db, "SELECT t.* FROM tasks t WHERE t.owner_id=? AND t.status='open' ORDER BY t.due_at IS NULL, t.due_at LIMIT 30", u.id).map((x) => ({ ...x, overdue: !!x.due_at && x.due_at < t, due_today: x.due_at === t, link: taskLink(x) }));
  const approvals = many(ctx.db, "SELECT a.*, rq.name requested_name FROM approvals a JOIN users rq ON rq.id=a.requested_by WHERE a.status='pending' ORDER BY a.id").filter((a) => can(u, a.required_permission) && (a.requested_by !== u.id || can(u, '*'))).map((a) => ({ ...a, link: approvalLink(a) }));
  const active = scopedOrders(ctx, u, "AND o.stage NOT IN ('delivered','closed')").map((o) => { const risk = deliveryRisk(ctx, o); return { ...o, risk, status: orderStatus(ctx, o, risk) }; });
  const attention = active.filter((o) => o.status.blocked || o.risk.level === 'at_risk' || o.risk.level === 'late')
    .map((o) => ({ id: o.id, number: o.number, title: o.title, company_name: o.company_name, stage: o.stage, due_date: o.due_date, risk: o.risk, status: { ...o.status, owner_name: one<{ name: string }>(ctx.db, 'SELECT name FROM users WHERE id=?', o.status.owner_id)?.name } }))
    .sort((a, b) => (a.risk.level === 'late' ? 0 : 1) - (b.risk.level === 'late' ? 0 : 1) || String(a.due_date).localeCompare(String(b.due_date)));
  const myIssues = many(ctx.db, "SELECT i.*, o.number order_number FROM issues i LEFT JOIN orders o ON o.id=i.order_id WHERE i.owner_id=? AND i.status<>'resolved' ORDER BY i.due_date", u.id).map((i) => ({ ...i, overdue: !!i.due_date && i.due_date < t }));

  const summary: { key: string; label: string; value: number | string; link: string; tone?: string }[] = [];
  if (canAny(u, 'sales.write', 'sales.all')) {
    const ls = leadScope(u); const os = oppScope(u);
    summary.push(
      { key: 'leads_open', label: 'Open leads', value: one<{ n: number }>(ctx.db, `SELECT COUNT(*) n FROM leads l WHERE l.archived_at IS NULL AND l.stage IN ('new','contacted','qualified') AND ${ls.sql}`, ...ls.params)!.n, link: '/sales/leads?stage=open' },
      { key: 'followups', label: 'Follow-ups overdue', value: one<{ n: number }>(ctx.db, `SELECT COUNT(*) n FROM leads l WHERE l.archived_at IS NULL AND l.stage IN ('new','contacted','qualified') AND l.next_follow_up < ? AND ${ls.sql}`, t, ...ls.params)!.n, link: '/sales/leads?followup=overdue', tone: 'warn' },
      { key: 'awaiting_customer', label: 'Quotes awaiting customer', value: one<{ n: number }>(ctx.db, `SELECT COUNT(*) n FROM opportunities op WHERE op.stage='awaiting_approval' AND ${os.sql}`, ...os.params)!.n, link: '/sales/opportunities?stage=awaiting_approval' },
    );
  }
  if (canAny(u, 'procurement.write', 'feasibility.write')) {
    const procOrders = active.filter((o) => ['confirmed', 'procurement'].includes(o.stage));
    summary.push(
      { key: 'feasibility', label: 'Feasibility requests', value: one<{ n: number }>(ctx.db, `SELECT COUNT(*) n FROM feasibility_checks WHERE status='requested' ${can(u, 'procurement.all') ? '' : 'AND assigned_to=?'}`, ...(can(u, 'procurement.all') ? [] : [u.id]))!.n, link: '/procurement' },
      { key: 'not_ordered', label: 'Components not yet ordered', value: procOrders.reduce((a, o) => a + componentStatus(ctx, o.id).filter((c) => c.state === 'not_ordered').length, 0), link: '/procurement', tone: 'warn' },
      { key: 'po_unconfirmed', label: 'POs awaiting vendor confirmation', value: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM purchase_orders WHERE status='issued' AND archived_at IS NULL")!.n, link: '/procurement/purchase-orders?status=issued' },
      { key: 'vendors_onboarding', label: 'Vendors in onboarding', value: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM vendors WHERE status IN ('draft','info_requested','documents_pending','under_review') AND archived_at IS NULL")!.n, link: '/procurement/vendors?status=onboarding' },
    );
  }
  if (canAny(u, 'receiving.write', 'packing.write')) {
    summary.push(
      { key: 'arrivals', label: 'Arrivals due in 7 days', value: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM purchase_orders WHERE status IN ('issued','confirmed','partially_received') AND promised_date <= ? AND archived_at IS NULL", addDays(t, 7))!.n, link: '/procurement/receiving' },
      { key: 'awaiting_qc', label: 'PO lines awaiting quality check', value: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id WHERE po.status<>'cancelled' AND pl.qty_received > pl.qty_accepted + pl.qty_rejected")!.n, link: '/procurement/receiving' },
    );
  }
  if (can(u, 'packing.write')) summary.push({ key: 'to_check', label: 'Packed batches to check', value: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM packing_batches WHERE status='packed'")!.n, link: '/fulfilment/packing' });
  if (can(u, 'shipments.write')) summary.push(
    { key: 'in_transit', label: 'Shipments in transit', value: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM shipments WHERE status IN ('dispatched','in_transit','delayed')")!.n, link: '/fulfilment/dispatch' },
    { key: 'ship_overdue', label: 'Shipments past expected date', value: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM shipments WHERE status IN ('dispatched','in_transit','delayed') AND expected_on < ?", t)!.n, link: '/fulfilment/dispatch', tone: 'warn' },
  );
  if (can(u, 'finance.view')) {
    const rec = receivables(ctx);
    summary.push(
      { key: 'receivable', label: 'Customer balances open', value: rec.reduce((a, x) => a + Math.max(0, x.balance_paise), 0), link: '/finance', tone: 'money' },
      { key: 'overdue_receivable', label: 'Overdue customer balances', value: rec.filter((x) => x.overdue).reduce((a, x) => a + x.balance_paise, 0), link: '/finance?tab=overdue', tone: 'money-warn' },
      { key: 'payable', label: 'Vendor balances open', value: payables(ctx).reduce((a, x) => a + x.balance_paise, 0), link: '/finance?tab=payables', tone: 'money' },
    );
  }

  let management = null;
  if (can(u, '*') || hasRole(u, 'sales_manager', 'procurement_manager')) {
    const all = scopedOrders(ctx, u);
    const activeAll = all.filter((o) => !['delivered', 'closed'].includes(o.stage));
    const byStage = STAGES.map((s) => ({ stage: s, count: all.filter((o) => o.stage === s).length }));
    const since = addDays(t, -30);
    const delivered30 = many(ctx.db, "SELECT o.id, o.due_date, MAX(s.delivered_on) d FROM orders o JOIN shipments s ON s.order_id=o.id AND s.status='delivered' WHERE o.stage IN ('delivered','closed') GROUP BY o.id HAVING d >= ?", since);
    management = {
      by_stage: byStage,
      active_orders: activeAll.length,
      active_value_paise: can(u, 'margin.view') ? activeAll.reduce((a, o) => a + o.total_paise, 0) : null,
      blocked: active.filter((o) => o.status.blocked).length, late: active.filter((o) => o.risk.level === 'late').length, at_risk: active.filter((o) => o.risk.level === 'at_risk').length,
      overdue_tasks: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM tasks WHERE status='open' AND due_at < ?", t)!.n,
      open_issues: one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM issues WHERE status<>'resolved'")!.n,
      overrides_30d: many(ctx.db, "SELECT a.at, a.summary, u.name user_name, a.order_id FROM audit_events a LEFT JOIN users u ON u.id=a.user_id WHERE a.at >= ? AND (a.action='override' OR a.summary LIKE '%OVERRIDE%') ORDER BY a.id DESC LIMIT 10", since),
      delivered_30d: delivered30.length, delivered_on_time_30d: delivered30.filter((x) => !x.due_date || x.d <= x.due_date).length,
      confirmed_30d: one<{ n: number }>(ctx.db, 'SELECT COUNT(*) n FROM orders WHERE created_at >= ?', since)!.n,
      workload: many(ctx.db, "SELECT u.id, u.name, (SELECT COUNT(*) FROM tasks t WHERE t.owner_id=u.id AND t.status='open') open_tasks, (SELECT COUNT(*) FROM tasks t WHERE t.owner_id=u.id AND t.status='open' AND t.due_at < ?) overdue_tasks, (SELECT COUNT(*) FROM issues i WHERE i.owner_id=u.id AND i.status<>'resolved') open_issues FROM users u WHERE u.active=1 ORDER BY overdue_tasks DESC, open_tasks DESC", t),
    };
  }
  res.json({ today: t, tasks, approvals, attention: attention.slice(0, 15), attention_total: attention.length, issues: myIssues, summary, management });
});

// ---------------------------------------------------------------- notifications
r.get('/notifications', (req, res) => {
  const ctx = req.ctx; const { limit, offset, page, pageSize } = pageParams(req);
  const unread = req.query.filter === 'unread';
  const where = `user_id=? ${unread ? 'AND read_at IS NULL' : ''}`;
  res.json({
    rows: many(ctx.db, `SELECT * FROM notifications WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, req.user.id, limit, offset),
    total: one<{ n: number }>(ctx.db, `SELECT COUNT(*) n FROM notifications WHERE ${where}`, req.user.id)!.n,
    unread: one<{ n: number }>(ctx.db, 'SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', req.user.id)!.n, page, pageSize,
  });
});
r.post('/notifications/read', (req, res) => {
  const ctx = req.ctx; const { ids, all } = parse(z.object({ ids: z.array(z.number().int()).optional(), all: z.boolean().optional() }), req.body);
  if (all) run(ctx.db, 'UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL', ctx.now(), req.user.id);
  else for (const id of ids ?? []) run(ctx.db, 'UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL', ctx.now(), id, req.user.id);
  res.json({ ok: true });
});
r.post('/automations/run', requirePerm('*', 'sales.all', 'procurement.all'), (req, res) => {
  const out = runAutomations(req.ctx);
  audit(req.ctx.db, req.ctx.now(), req.user.id, 'automations', 'system', null, `Scheduled checks run manually: ${out.created} notification(s) created`);
  res.json(out);
});

// ---------------------------------------------------------------- global search (only permitted records)
r.get('/search', (req, res) => {
  const ctx = req.ctx; const u = req.user; const q = qstr(req.query.q);
  if (!q || q.length < 2) return res.json({ results: [] });
  const like = `%${q}%`; const results: { type: string; id: number; title: string; subtitle: string; link: string }[] = [];
  if (canAny(u, 'sales.write', 'sales.all', 'orders.view_all')) {
    const s = companyScope(u);
    for (const c of many(ctx.db, `SELECT c.id, c.name, c.city FROM companies c WHERE c.archived_at IS NULL AND ${s.sql} AND (c.name LIKE ? OR c.gst_number LIKE ? OR EXISTS (SELECT 1 FROM contacts ct WHERE ct.company_id=c.id AND (ct.name LIKE ? OR ct.email LIKE ? OR ct.phone LIKE ?))) LIMIT 8`, ...s.params, like, like, like, like, like)) results.push({ type: 'Customer', id: c.id, title: c.name, subtitle: c.city ?? '', link: `/sales/companies/${c.id}` });
  }
  if (canAny(u, 'sales.write', 'sales.all')) {
    const s = leadScope(u);
    for (const l of many(ctx.db, `SELECT l.id, l.company_name, l.contact_name, l.stage FROM leads l WHERE l.archived_at IS NULL AND ${s.sql} AND (l.company_name LIKE ? OR l.contact_name LIKE ? OR l.email LIKE ? OR l.phone LIKE ?) LIMIT 8`, ...s.params, like, like, like, like)) results.push({ type: 'Lead', id: l.id, title: l.company_name, subtitle: `${l.contact_name} · ${l.stage}`, link: `/sales/leads/${l.id}` });
    const os = oppScope(u);
    for (const o of many(ctx.db, `SELECT op.id, op.title, op.stage FROM opportunities op WHERE op.archived_at IS NULL AND ${os.sql} AND op.title LIKE ? LIMIT 8`, ...os.params, like)) results.push({ type: 'Opportunity', id: o.id, title: o.title, subtitle: o.stage, link: `/sales/opportunities/${o.id}` });
    for (const qn of many(ctx.db, `SELECT q.id, q.number, op.title FROM quotations q JOIN opportunities op ON op.id=q.opportunity_id WHERE ${os.sql} AND q.number LIKE ? LIMIT 5`, ...os.params, like)) results.push({ type: 'Quotation', id: qn.id, title: qn.number, subtitle: qn.title, link: `/sales/quotations/${qn.id}` });
  }
  const s = orderScope(u);
  for (const o of many(ctx.db, `SELECT o.id, o.number, o.title, o.stage, c.name company FROM orders o JOIN companies c ON c.id=o.company_id WHERE o.archived_at IS NULL AND ${s.sql} AND (o.number LIKE ? OR o.title LIKE ? OR c.name LIKE ? OR o.customer_po_ref LIKE ?) LIMIT 8`, ...s.params, like, like, like, like)) results.push({ type: 'Order', id: o.id, title: `${o.number} · ${o.title}`, subtitle: `${o.company} · ${o.stage.replace('_', ' ')}`, link: `/orders/${o.id}` });
  if (canAny(u, 'vendors.view', 'vendors.view.basic')) {
    for (const v of many(ctx.db, 'SELECT id, display_name, legal_name, status, city FROM vendors WHERE archived_at IS NULL AND (display_name LIKE ? OR legal_name LIKE ? OR phone LIKE ? OR email LIKE ? OR categories LIKE ?) LIMIT 8', like, like, like, like, like)) results.push({ type: 'Vendor', id: v.id, title: v.display_name, subtitle: `${v.status.replace('_', ' ')}${v.city ? ` · ${v.city}` : ''}`, link: `/procurement/vendors/${v.id}` });
  }
  if (canAny(u, 'procurement.write', 'receiving.write', 'finance.view')) {
    const all = canAny(u, 'procurement.all', 'finance.view');
    for (const p of many(ctx.db, `SELECT po.id, po.number, po.status, v.display_name vendor FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id WHERE po.archived_at IS NULL AND po.number LIKE ? ${all ? '' : `AND (po.owner_id=? OR po.created_by=? OR po.order_id IN (SELECT o.id FROM orders o WHERE ${s.sql}))`} LIMIT 8`, like, ...(all ? [] : [u.id, u.id, ...s.params]))) results.push({ type: 'Purchase order', id: p.id, title: p.number, subtitle: `${p.vendor} · ${p.status.replace('_', ' ')}`, link: `/procurement/purchase-orders/${p.id}` });
  }
  res.json({ results });
});

// ---------------------------------------------------------------- contact log + message drafts (no provider: manual only)
r.post('/contact-log', (req, res) => {
  const ctx = req.ctx;
  const v = parse(z.object({ party: z.enum(['customer', 'vendor']), entity_type: z.enum(['order', 'lead', 'opportunity', 'company', 'vendor', 'purchase_order']), entity_id: z.number().int().positive(), channel: z.enum(['phone', 'email', 'whatsapp', 'meeting', 'visit']), summary: z.string().trim().min(3, 'Summarise what was said') }), req.body);
  assertEntityAccess(ctx, req.user, v.entity_type, v.entity_id);
  const orderId = v.entity_type === 'order' ? v.entity_id : v.entity_type === 'purchase_order' ? one<{ order_id: number | null }>(ctx.db, 'SELECT order_id FROM purchase_orders WHERE id=?', v.entity_id)?.order_id ?? null : null;
  const id = insert(ctx.db, 'contact_log', { ...v, order_id: orderId, by_user: req.user.id, at: ctx.now(), delivery: 'manual' });
  audit(ctx.db, ctx.now(), req.user.id, 'contacted', v.entity_type, v.entity_id, `Contacted ${v.party} by ${v.channel}: ${v.summary.slice(0, 200)}`, { orderId });
  res.status(201).json({ id });
});
r.get('/message-templates', (req, res) => { res.json({ rows: many(req.ctx.db, 'SELECT * FROM message_templates ORDER BY party, name'), providers: req.ctx.providers }); });
r.post('/message-templates/render', (req, res) => {
  const ctx = req.ctx;
  const v = parse(z.object({ template_id: z.number().int().positive(), entity_type: z.enum(['order', 'vendor', 'purchase_order', 'opportunity']), entity_id: z.number().int().positive() }), req.body);
  assertEntityAccess(ctx, req.user, v.entity_type, v.entity_id);
  const tpl = one(ctx.db, 'SELECT * FROM message_templates WHERE id=?', v.template_id); if (!tpl) throw notFound('Template');
  const vars: Record<string, string> = { sender_name: req.user.name, today: today(ctx) };
  if (v.entity_type === 'order') {
    const o = one(ctx.db, 'SELECT o.*, c.name company, ct.name contact FROM orders o JOIN companies c ON c.id=o.company_id LEFT JOIN contacts ct ON ct.id=o.contact_id WHERE o.id=?', v.entity_id)!;
    const ships = many(ctx.db, "SELECT s.courier, s.tracking_no, s.expected_on, d.label FROM shipments s JOIN destinations d ON d.id=s.destination_id WHERE s.order_id=? AND s.status<>'planned'", o.id);
    Object.assign(vars, { order_number: o.number, order_title: o.title, customer: o.company, contact_name: o.contact ?? 'there', due_date: o.due_date ?? '', tracking: ships.map((s) => `${s.label}: ${s.courier} ${s.tracking_no} (expected ${s.expected_on})`).join('\n') || 'Not dispatched yet' });
    if (can(req.user, 'finance.view')) vars.balance = `₹${orderFinance(ctx, o.id).balance_paise / 100}`;
  }
  if (v.entity_type === 'vendor' || v.entity_type === 'purchase_order') {
    const po = v.entity_type === 'purchase_order' ? one(ctx.db, 'SELECT * FROM purchase_orders WHERE id=?', v.entity_id) : null;
    const vendor = one(ctx.db, 'SELECT * FROM vendors WHERE id=?', po?.vendor_id ?? v.entity_id)!;
    const contact = one<{ name: string }>(ctx.db, 'SELECT name FROM vendor_contacts WHERE vendor_id=? ORDER BY is_primary DESC LIMIT 1', vendor.id);
    Object.assign(vars, { vendor_name: vendor.display_name, contact_name: contact?.name ?? 'there', po_number: po?.number ?? '', promised_date: po?.promised_date ?? '' });
    if (v.entity_type === 'vendor') {
      vars.missing_items = vendorChecklist(ctx, vendor.id).filter((c) => !c.done && c.group !== 'verification').map((c) => `- ${c.label}`).join('\n') || '- Nothing outstanding';
    }
  }
  if (v.entity_type === 'opportunity') {
    const op = one(ctx.db, 'SELECT op.*, ct.name contact FROM opportunities op LEFT JOIN contacts ct ON ct.id=op.contact_id WHERE op.id=?', v.entity_id)!;
    const qn = one(ctx.db, 'SELECT q.number, q.current_version, qv.validity_date FROM quotations q JOIN quote_versions qv ON qv.quotation_id=q.id AND qv.version=q.current_version WHERE q.opportunity_id=? ORDER BY q.id DESC LIMIT 1', op.id);
    Object.assign(vars, { contact_name: op.contact ?? 'there', opportunity: op.title, quote_number: qn ? `${qn.number} v${qn.current_version}` : '', valid_until: qn?.validity_date ?? '' });
  }
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? `{{${k}}}`);
  res.json({ subject: fill(tpl.subject), body: fill(tpl.body), channel: tpl.channel, provider_configured: tpl.channel === 'email' ? ctx.providers.email : ctx.providers.whatsapp });
});

// ---------------------------------------------------------------- reports
function periodFrom(req: { query: Record<string, unknown> }, ctx: Ctx) {
  const from = typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : addDays(today(ctx), -90);
  const to = typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : today(ctx);
  if (from > to) throw badRequest('“From” must be before “To”.');
  return { from, to, toEnd: `${to}T23:59:59.999Z` };
}
r.get('/reports/pipeline', requirePerm('reports.view', 'reports.sales'), (req, res) => {
  const ctx = req.ctx; const { from, to, toEnd } = periodFrom(req, ctx);
  const ls = leadScope(req.user); const os = oppScope(req.user);
  const leads = many(ctx.db, `SELECT l.stage, l.source, l.lost_reason FROM leads l WHERE l.archived_at IS NULL AND l.created_at BETWEEN ? AND ? AND ${ls.sql}`, from, toEnd, ...ls.params);
  const opps = many(ctx.db, `SELECT op.id, op.stage, op.lost_reason, (SELECT qv.total_paise FROM quotations q JOIN quote_versions qv ON qv.quotation_id=q.id AND qv.version=q.current_version WHERE q.opportunity_id=op.id ORDER BY q.id DESC LIMIT 1) value FROM opportunities op WHERE op.archived_at IS NULL AND op.created_at BETWEEN ? AND ? AND ${os.sql}`, from, toEnd, ...os.params);
  const count = <T,>(arr: T[], f: (x: T) => string | null) => { const m = new Map<string, number>(); for (const x of arr) { const k = f(x); if (k) m.set(k, (m.get(k) ?? 0) + 1); } return [...m].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n); };
  const won = opps.filter((o) => o.stage === 'won').length; const lost = opps.filter((o) => o.stage === 'lost').length;
  res.json({
    from, to, leads_total: leads.length, leads_by_stage: count(leads, (l) => l.stage),
    lead_conversion_pct: leads.length ? Math.round((leads.filter((l) => l.stage === 'converted').length / leads.length) * 100) : null,
    by_source: count(leads, (l) => l.source).map((s) => ({ ...s, converted: leads.filter((l) => l.source === s.key && l.stage === 'converted').length })),
    opps_total: opps.length, opps_by_stage: count(opps, (o) => o.stage).map((s) => ({ ...s, value_paise: can(req.user, 'costing.view') ? opps.filter((o) => o.stage === s.key).reduce((a, o) => a + (o.value ?? 0), 0) : null })),
    win_rate_pct: won + lost ? Math.round((won / (won + lost)) * 100) : null, won, lost,
    lost_reasons: count([...leads.filter((l) => l.stage === 'lost'), ...opps.filter((o) => o.stage === 'lost')], (x) => (x.lost_reason ?? '').split(' — ')[0] || 'Not recorded'),
  });
});
r.get('/reports/orders', requirePerm('reports.view'), (req, res) => {
  const ctx = req.ctx; const t = today(ctx);
  const orders = scopedOrders(ctx, req.user).map((o) => ({ ...o, risk: deliveryRisk(ctx, o) }));
  const active = orders.filter((o) => !['delivered', 'closed'].includes(o.stage));
  const bucket = (d: string | null) => (!d ? 'No due date' : d < t ? 'Overdue' : d <= addDays(t, 7) ? 'Due in 7 days' : d <= addDays(t, 30) ? 'Due in 8–30 days' : 'Later');
  const labels = getSetting(ctx.db, 'order.stage_labels') as Record<string, string>;
  res.json({
    by_stage: STAGES.map((s) => ({ stage: s, label: labels[s] ?? s, count: orders.filter((o) => o.stage === s).length, late: orders.filter((o) => o.stage === s && o.risk.level === 'late').length })),
    by_due: ['Overdue', 'Due in 7 days', 'Due in 8–30 days', 'Later', 'No due date'].map((b) => ({ bucket: b, count: active.filter((o) => bucket(o.due_date) === b).length })),
    rows: stripCosts(req.user, active.map((o) => ({ id: o.id, number: o.number, title: o.title, company_name: o.company_name, stage: o.stage, due_date: o.due_date, risk: o.risk.level, projected: o.risk.projected_delivery }))),
  });
});
r.get('/reports/delays', requirePerm('reports.view'), (req, res) => {
  const ctx = req.ctx; const { from, to, toEnd } = periodFrom(req, ctx);
  res.json({
    from, to,
    vendor_delays: many(ctx.db, 'SELECT d.*, po.number po_number, v.display_name vendor, o.number order_number FROM po_delay_log d JOIN purchase_orders po ON po.id=d.po_id JOIN vendors v ON v.id=po.vendor_id LEFT JOIN orders o ON o.id=po.order_id WHERE d.at BETWEEN ? AND ? ORDER BY d.at DESC', from, toEnd),
    delays_by_vendor: many(ctx.db, 'SELECT v.display_name vendor, COUNT(*) n, SUM(julianday(d.new_date) - julianday(d.old_date)) days FROM po_delay_log d JOIN purchase_orders po ON po.id=d.po_id JOIN vendors v ON v.id=po.vendor_id WHERE d.at BETWEEN ? AND ? GROUP BY v.id ORDER BY n DESC', from, toEnd),
    issues_by_kind: many(ctx.db, 'SELECT kind, COUNT(*) n, SUM(status<>\'resolved\') open FROM issues WHERE created_at BETWEEN ? AND ? GROUP BY kind ORDER BY n DESC', from, toEnd),
    blockers: scopedOrders(ctx, req.user, "AND o.stage NOT IN ('delivered','closed')").map((o) => ({ o, s: orderStatus(ctx, o) })).filter((x) => x.s.blocked).map(({ o, s }) => ({ id: o.id, number: o.number, reason: s.reason, source: s.source, next_action: s.next_action })),
  });
});
r.get('/reports/vendors', requirePerm('reports.view'), (req, res) => {
  const ctx = req.ctx;
  res.json({ rows: many(ctx.db, "SELECT id, display_name, status FROM vendors WHERE archived_at IS NULL AND status NOT IN ('draft','rejected') ORDER BY display_name").map((v) => ({ ...v, ...vendorPerformance(ctx, v.id) })) });
});
r.get('/reports/profitability', requirePerm('margin.view'), (req, res) => {
  const ctx = req.ctx;
  const rows = scopedOrders(ctx, req.user).map((o) => { const f = orderFinance(ctx, o.id); return { id: o.id, number: o.number, title: o.title, company_name: o.company_name, stage: o.stage, revenue_paise: f.revenue_paise, est_cost_paise: f.est_cost_paise, est_margin_bp: f.est_margin_bp, actual_cost_paise: f.actual_cost_paise, actual_margin_bp: f.actual_margin_bp, provisional: f.margin_provisional }; });
  const final = rows.filter((x) => !x.provisional);
  const rev = final.reduce((a, x) => a + x.revenue_paise, 0); const cost = final.reduce((a, x) => a + x.actual_cost_paise, 0);
  res.json({ rows, completed_revenue_paise: rev, completed_cost_paise: cost, completed_margin_bp: rev ? Math.round(((rev - cost) / rev) * 10000) : null, min_margin_bp: getSetting(ctx.db, 'approval.margin_min_bp') });
});
r.get('/reports/receivables-payables', requirePerm('finance.view'), (req, res) => {
  const ctx = req.ctx; const t = today(ctx);
  const rec = receivables(ctx).filter((x) => x.balance_paise > 0); const pay = payables(ctx).filter((x) => x.balance_paise > 0);
  const age = (d: string | null) => { if (!d || d >= t) return 'Not yet due'; const days = Math.round((Date.parse(t) - Date.parse(d)) / 86400000); return days <= 30 ? '1–30 days overdue' : days <= 60 ? '31–60 days overdue' : 'Over 60 days overdue'; };
  const buckets = ['Not yet due', '1–30 days overdue', '31–60 days overdue', 'Over 60 days overdue'];
  res.json({
    receivables: buckets.map((b) => ({ bucket: b, count: rec.filter((x) => age(x.due_on) === b).length, amount_paise: rec.filter((x) => age(x.due_on) === b).reduce((a, x) => a + x.balance_paise, 0) })),
    receivables_total_paise: rec.reduce((a, x) => a + x.balance_paise, 0),
    payables: pay, payables_total_paise: pay.reduce((a, x) => a + x.balance_paise, 0),
  });
});

export default r;
