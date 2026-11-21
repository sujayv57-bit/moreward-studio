import { Router } from 'express';
import { invoiceInput, paymentInput } from '../../shared/schemas.ts';
import { assertOrderAccess } from '../access.ts';
import { audit } from '../audit.ts';
import { requirePerm } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { addDays, daysBetween, today } from '../context.ts';
import { insert, many, one } from '../db.ts';
import { HttpError, badRequest, notFound } from '../http.ts';
import { csv, rupees } from '../rules/common.ts';
import { orderFinance, poTotals } from '../rules/orders.ts';
import { getSetting } from '../settings.ts';
import { intParam, parse } from '../validate.ts';

const r = Router();

/** When the customer balance becomes due: earliest invoice due date, else delivery + standard terms. */
export function receivableDue(ctx: Ctx, order: Record<string, any>): string | null {
  const inv = one<{ d: string | null }>(ctx.db, 'SELECT MIN(due_on) d FROM invoices WHERE order_id=? AND due_on IS NOT NULL', order.id)!.d;
  if (inv) return inv;
  if (['delivered', 'closed'].includes(order.stage)) {
    const delivered = one<{ d: string | null }>(ctx.db, "SELECT MAX(delivered_on) d FROM shipments WHERE order_id=? AND status='delivered'", order.id)!.d;
    if (delivered) return addDays(delivered, getSetting(ctx.db, 'customer.payment_terms_days'));
  }
  return null;
}
export function receivables(ctx: Ctx) {
  const t = today(ctx);
  return many(ctx.db, 'SELECT o.id, o.number, o.title, o.stage, o.total_paise, o.currency, o.sales_owner_id, c.name company_name FROM orders o JOIN companies c ON c.id=o.company_id WHERE o.archived_at IS NULL ORDER BY o.id DESC').map((o) => {
    const f = orderFinance(ctx, o.id);
    const due = receivableDue(ctx, o);
    const invoices = many<{ number: string }>(ctx.db, 'SELECT number FROM invoices WHERE order_id=? ORDER BY issued_on', o.id).map((i) => i.number);
    return { ...o, received_paise: f.received_paise, advance_paise: f.advance_paise, invoiced_paise: f.invoiced_paise, balance_paise: f.balance_paise, due_on: due, invoices, overdue: f.balance_paise > 0 && !!due && due < t, days_overdue: f.balance_paise > 0 && due && due < t ? daysBetween(due, t) : 0 };
  });
}
export function payables(ctx: Ctx) {
  return many(ctx.db, "SELECT po.id, po.number, po.status, po.promised_date, po.advance_required_paise, v.display_name vendor, o.number order_number, o.id order_id FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id LEFT JOIN orders o ON o.id=po.order_id WHERE po.archived_at IS NULL AND po.status NOT IN ('draft','pending_approval','cancelled') ORDER BY po.id DESC")
    .map((po) => { const t = poTotals(ctx, po.id); return { ...po, total_paise: t.total_paise, paid_paise: t.paid_paise, advance_paid_paise: t.advance_paise, balance_paise: t.balance_paise, advance_outstanding_paise: Math.max(0, po.advance_required_paise - t.advance_paise) }; });
}

r.get('/finance/receivables', requirePerm('finance.view'), (req, res) => {
  const rows = receivables(req.ctx).filter((x) => req.query.filter === 'overdue' ? x.overdue : req.query.filter === 'open' ? x.balance_paise > 0 : true);
  res.json({ rows, totals: { balance_paise: rows.reduce((a, x) => a + Math.max(0, x.balance_paise), 0), overdue_paise: rows.filter((x) => x.overdue).reduce((a, x) => a + x.balance_paise, 0), received_paise: rows.reduce((a, x) => a + x.received_paise, 0) } });
});
r.get('/finance/payables', requirePerm('finance.view'), (req, res) => {
  const rows = payables(req.ctx).filter((x) => req.query.filter === 'open' ? x.balance_paise > 0 : true);
  res.json({ rows, totals: { balance_paise: rows.reduce((a, x) => a + x.balance_paise, 0), paid_paise: rows.reduce((a, x) => a + x.paid_paise, 0), advances_due_paise: rows.reduce((a, x) => a + x.advance_outstanding_paise, 0) } });
});
r.get('/finance/margins', requirePerm('margin.view'), (req, res) => {
  const ctx = req.ctx;
  res.json({ rows: many(ctx.db, 'SELECT o.id, o.number, o.title, o.stage, c.name company_name FROM orders o JOIN companies c ON c.id=o.company_id WHERE o.archived_at IS NULL ORDER BY o.id DESC').map((o) => {
    const f = orderFinance(ctx, o.id);
    return { ...o, revenue_paise: f.revenue_paise, est_cost_paise: f.est_cost_paise, est_margin_bp: f.est_margin_bp, actual_cost_paise: f.actual_cost_paise, actual_margin_bp: f.actual_margin_bp, provisional: f.margin_provisional };
  }), vendor_tax_in_cost: getSetting(ctx.db, 'costing.vendor_tax_in_cost') });
});

r.get('/orders/:id/payments', requirePerm('finance.view'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOrderAccess(ctx, req.user, id);
  const o = one(ctx.db, 'SELECT * FROM orders WHERE id=?', id)!;
  res.json({
    finance: orderFinance(ctx, id), due_on: receivableDue(ctx, o),
    payments: many(ctx.db, 'SELECT p.*, u.name recorded_name, a.filename FROM customer_payments p LEFT JOIN users u ON u.id=p.recorded_by LEFT JOIN attachments a ON a.id=p.attachment_id WHERE order_id=? ORDER BY received_on', id),
    invoices: many(ctx.db, 'SELECT i.*, u.name recorded_name FROM invoices i LEFT JOIN users u ON u.id=i.recorded_by WHERE order_id=? ORDER BY issued_on', id),
    vendor: many(ctx.db, "SELECT po.id, po.number, po.status, v.display_name vendor FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id WHERE po.order_id=? AND po.status NOT IN ('draft','pending_approval','cancelled')", id).map((po) => ({ ...po, ...poTotals(ctx, po.id) })),
    payments_integration: ctx.providers.payments, accounting_integration: ctx.providers.accounting,
  });
});
r.post('/orders/:id/payments', requirePerm('finance.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOrderAccess(ctx, req.user, id);
  const o = one(ctx.db, 'SELECT * FROM orders WHERE id=?', id); if (!o) throw notFound('Order');
  const v = parse(paymentInput, req.body);
  if (v.received_on > today(ctx)) throw new HttpError(400, 'validation', 'Payment date cannot be in the future.', { fields: { received_on: 'Cannot be in the future' } });
  const f = orderFinance(ctx, id);
  if (v.amount_paise > f.balance_paise) throw new HttpError(400, 'validation', `Payment is more than the balance of ₹${f.balance_paise / 100}. Record any excess in the accounting system.`, { fields: { amount_paise: 'More than the balance' } });
  if (v.attachment_id && !one(ctx.db, 'SELECT id FROM attachments WHERE id=? AND order_id=?', v.attachment_id, id)) throw badRequest('Upload the remittance to this order first.');
  const pid = insert(ctx.db, 'customer_payments', { order_id: id, ...v, currency: o.currency, recorded_by: req.user.id, created_at: ctx.now() });
  audit(ctx.db, ctx.now(), req.user.id, 'payment', 'order', id, `Customer ${v.kind} recorded: ₹${v.amount_paise / 100} on ${v.received_on} (ref ${v.reference}). Recorded only — reconcile in the accounting system.`, { orderId: id });
  res.status(201).json({ id: pid });
});
r.post('/orders/:id/invoices', requirePerm('finance.write'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); assertOrderAccess(ctx, req.user, id);
  const v = parse(invoiceInput, req.body);
  if (one(ctx.db, 'SELECT id FROM invoices WHERE number=?', v.number)) throw new HttpError(409, 'conflict', `Invoice ${v.number} is already recorded.`);
  const iid = insert(ctx.db, 'invoices', { order_id: id, ...v, recorded_by: req.user.id, created_at: ctx.now() });
  audit(ctx.db, ctx.now(), req.user.id, 'invoice', 'order', id, `Invoice reference ${v.number} recorded (₹${v.amount_paise / 100}${v.due_on ? `, due ${v.due_on}` : ''})`, { orderId: id });
  res.status(201).json({ id: iid });
});

// ---------------------------------------------------------------- exports for the accounting team
const EXPORTS: Record<string, (ctx: Ctx) => { rows: Record<string, unknown>[]; columns: { key: string; label: string }[] }> = {
  receivables: (ctx) => ({ rows: receivables(ctx).map((x) => ({ ...x, invoices: x.invoices.join(' / '), total: rupees(x.total_paise), received: rupees(x.received_paise), balance: rupees(x.balance_paise) })),
    columns: [{ key: 'number', label: 'Order' }, { key: 'company_name', label: 'Customer' }, { key: 'stage', label: 'Stage' }, { key: 'currency', label: 'Currency' }, { key: 'total', label: 'Order total' }, { key: 'received', label: 'Received' }, { key: 'balance', label: 'Balance' }, { key: 'invoices', label: 'Invoice refs' }, { key: 'due_on', label: 'Due on' }, { key: 'days_overdue', label: 'Days overdue' }] }),
  payables: (ctx) => ({ rows: payables(ctx).map((x) => ({ ...x, total: rupees(x.total_paise), paid: rupees(x.paid_paise), balance: rupees(x.balance_paise), advance_required: rupees(x.advance_required_paise) })),
    columns: [{ key: 'number', label: 'PO' }, { key: 'vendor', label: 'Vendor' }, { key: 'order_number', label: 'Order' }, { key: 'status', label: 'Status' }, { key: 'total', label: 'PO total' }, { key: 'advance_required', label: 'Advance required' }, { key: 'paid', label: 'Paid' }, { key: 'balance', label: 'Balance' }] }),
  'customer-payments': (ctx) => ({ rows: many(ctx.db, 'SELECT p.*, o.number order_number, c.name company_name FROM customer_payments p JOIN orders o ON o.id=p.order_id JOIN companies c ON c.id=o.company_id ORDER BY received_on').map((x) => ({ ...x, amount: rupees(x.amount_paise) })),
    columns: [{ key: 'received_on', label: 'Date' }, { key: 'order_number', label: 'Order' }, { key: 'company_name', label: 'Customer' }, { key: 'kind', label: 'Type' }, { key: 'currency', label: 'Currency' }, { key: 'amount', label: 'Amount' }, { key: 'reference', label: 'Reference' }] }),
  'vendor-payments': (ctx) => ({ rows: many(ctx.db, 'SELECT vp.*, po.number po_number, v.display_name vendor FROM vendor_payments vp JOIN purchase_orders po ON po.id=vp.po_id JOIN vendors v ON v.id=po.vendor_id ORDER BY paid_on').map((x) => ({ ...x, amount: rupees(x.amount_paise) })),
    columns: [{ key: 'paid_on', label: 'Date' }, { key: 'po_number', label: 'PO' }, { key: 'vendor', label: 'Vendor' }, { key: 'kind', label: 'Type' }, { key: 'amount', label: 'Amount' }, { key: 'reference', label: 'Reference' }] }),
  invoices: (ctx) => ({ rows: many(ctx.db, 'SELECT i.*, o.number order_number, c.name company_name FROM invoices i JOIN orders o ON o.id=i.order_id JOIN companies c ON c.id=o.company_id ORDER BY issued_on').map((x) => ({ ...x, amount: rupees(x.amount_paise) })),
    columns: [{ key: 'number', label: 'Invoice' }, { key: 'issued_on', label: 'Issued' }, { key: 'due_on', label: 'Due' }, { key: 'order_number', label: 'Order' }, { key: 'company_name', label: 'Customer' }, { key: 'amount', label: 'Amount' }] }),
  margins: (ctx) => ({ rows: many(ctx.db, 'SELECT o.id, o.number, c.name company_name, o.stage FROM orders o JOIN companies c ON c.id=o.company_id WHERE o.archived_at IS NULL').map((o) => { const f = orderFinance(ctx, o.id); return { ...o, revenue: rupees(f.revenue_paise), est_cost: rupees(f.est_cost_paise), est_margin_pct: f.est_margin_bp == null ? '' : (f.est_margin_bp / 100).toFixed(2), actual_cost: rupees(f.actual_cost_paise), actual_margin_pct: f.actual_margin_bp == null ? '' : (f.actual_margin_bp / 100).toFixed(2), provisional: f.margin_provisional ? 'yes' : 'no' }; }),
    columns: [{ key: 'number', label: 'Order' }, { key: 'company_name', label: 'Customer' }, { key: 'stage', label: 'Stage' }, { key: 'revenue', label: 'Revenue (pre-tax)' }, { key: 'est_cost', label: 'Estimated cost' }, { key: 'est_margin_pct', label: 'Estimated margin %' }, { key: 'actual_cost', label: 'Actual cost so far' }, { key: 'actual_margin_pct', label: 'Actual margin %' }, { key: 'provisional', label: 'Provisional (costs still to come)' }] }),
};
r.get('/exports/:kind', requirePerm('export'), (req, res) => {
  const ctx = req.ctx; const kind = String(req.params.kind).replace(/\.csv$/, '');
  const fn = EXPORTS[kind]; if (!fn) throw notFound('Export');
  const { rows, columns } = fn(ctx);
  audit(ctx.db, ctx.now(), req.user.id, 'export', 'export', null, `Exported ${kind} (${rows.length} rows)`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${kind}-${today(ctx)}.csv"`);
  res.send('﻿' + csv(rows, columns));
});
export const EXPORT_KINDS = Object.keys(EXPORTS);
export default r;
