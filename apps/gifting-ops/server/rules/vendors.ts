import type { Ctx } from '../context.ts';
import { daysBetween, today } from '../context.ts';
import { many, one } from '../db.ts';
import { getSetting } from '../settings.ts';
import { normEmail, normName, normPhone } from './common.ts';
import { poTotals } from './orders.ts';

export const VENDOR_STATES = ['draft', 'info_requested', 'documents_pending', 'under_review', 'approved', 'active', 'rejected', 'suspended', 'inactive'] as const;
export type VendorState = (typeof VENDOR_STATES)[number];
export const PURCHASABLE: VendorState[] = ['approved', 'active'];

/** Allowed moves. Every move is recorded with who/when/why in vendor_events + audit. */
export const TRANSITIONS: Record<VendorState, VendorState[]> = {
  draft: ['info_requested', 'documents_pending', 'under_review', 'rejected'],
  info_requested: ['documents_pending', 'under_review', 'rejected', 'draft'],
  documents_pending: ['info_requested', 'under_review', 'rejected'],
  under_review: ['approved', 'info_requested', 'documents_pending', 'rejected'],
  approved: ['active', 'suspended', 'inactive'],
  active: ['suspended', 'inactive'],
  suspended: ['active', 'inactive', 'under_review'],
  inactive: ['under_review'],
  rejected: ['draft'],
};
export const REASON_REQUIRED: VendorState[] = ['rejected', 'suspended', 'inactive', 'info_requested'];

const FIELD_LABELS: Record<string, string> = { phone: 'Phone', email: 'Email', address: 'Address', categories: 'Product categories', lead_time_days: 'Normal lead time', payment_terms: 'Payment terms', gst_number: 'GSTIN', pan_number: 'PAN', serviceable_locations: 'Serviceable locations', moq: 'Minimum order quantity', capacity_per_week: 'Production capacity' };

export interface CheckItem { key: string; label: string; done: boolean; group: 'information' | 'documents' | 'bank' | 'verification'; detail?: string }
export function vendorChecklist(ctx: Ctx, vendorId: number): CheckItem[] {
  const v = one(ctx.db, 'SELECT * FROM vendors WHERE id=?', vendorId)!;
  const t = today(ctx);
  const items: CheckItem[] = [];
  for (const f of getSetting(ctx.db, 'vendor.required_fields') as readonly string[]) {
    const val = v[f]; const done = f === 'categories' ? JSON.parse(v.categories || '[]').length > 0 : val != null && String(val).trim() !== '';
    items.push({ key: `field:${f}`, label: FIELD_LABELS[f] ?? f, done, group: 'information' });
  }
  if (!one(ctx.db, 'SELECT id FROM vendor_contacts WHERE vendor_id=?', vendorId)) items.push({ key: 'contact', label: 'At least one named contact', done: false, group: 'information' });
  else items.push({ key: 'contact', label: 'At least one named contact', done: true, group: 'information' });
  const docs = many(ctx.db, 'SELECT * FROM vendor_documents WHERE vendor_id=? AND archived_at IS NULL', vendorId);
  for (const kind of getSetting(ctx.db, 'vendor.required_docs') as readonly string[]) {
    const d = docs.filter((x) => x.kind === kind && (!x.expires_on || x.expires_on >= t)).sort((a, b) => b.id - a.id)[0];
    const expired = !d && docs.some((x) => x.kind === kind);
    items.push({ key: `doc:${kind}`, label: kind, done: !!d, group: 'documents', detail: expired ? 'Expired — upload a current copy' : undefined });
    if (d) items.push({ key: `verify:${kind}`, label: `${kind} checked by finance/admin`, done: !!d.verified_at, group: 'verification' });
  }
  if (getSetting(ctx.db, 'vendor.require_bank')) {
    const b = one(ctx.db, 'SELECT * FROM vendor_bank WHERE vendor_id=?', vendorId);
    items.push({ key: 'bank', label: 'Bank details on file', done: !!b?.account_number, group: 'bank' });
    items.push({ key: 'verify:bank', label: 'Bank details verified by finance/admin', done: !!(b?.verified_at && !b.review_required), group: 'verification', detail: b?.review_required ? 'Changed since last verification' : undefined });
  }
  return items;
}

export function vendorDuplicates(ctx: Ctx, v: { legal_name?: string | null; display_name?: string | null; gst_number?: string | null; pan_number?: string | null; phone?: string | null; email?: string | null }, excludeId = 0) {
  const names = [normName(v.legal_name), normName(v.display_name)].filter(Boolean);
  const phone = normPhone(v.phone); const email = normEmail(v.email);
  const out: { id: number; label: string; status: string; reason: string }[] = [];
  for (const x of many(ctx.db, 'SELECT id, legal_name, display_name, gst_number, pan_number, phone, email, status FROM vendors WHERE id<>? AND archived_at IS NULL', excludeId)) {
    const reasons: string[] = [];
    if (names.length && (names.includes(normName(x.legal_name)) || names.includes(normName(x.display_name)))) reasons.push('same name');
    if (v.gst_number && x.gst_number && v.gst_number.toUpperCase() === x.gst_number.toUpperCase()) reasons.push('same GSTIN');
    if (v.pan_number && x.pan_number && v.pan_number.toUpperCase() === x.pan_number.toUpperCase()) reasons.push('same PAN');
    if (phone && (normPhone(x.phone) === phone || many(ctx.db, 'SELECT phone FROM vendor_contacts WHERE vendor_id=?', x.id).some((c) => normPhone(c.phone) === phone))) reasons.push('same phone');
    if (email && (normEmail(x.email) === email || many(ctx.db, 'SELECT email FROM vendor_contacts WHERE vendor_id=?', x.id).some((c) => normEmail(c.email) === email))) reasons.push('same email');
    if (reasons.length) out.push({ id: x.id, label: `${x.display_name} (${x.legal_name})`, status: x.status, reason: reasons.join(', ') });
  }
  return out;
}

/**
 * Vendor performance with the calculation shown. On-time = completed POs whose final receipt date
 * was on or before the ORIGINAL promised date. Below the configured minimum we report counts only.
 */
export function vendorPerformance(ctx: Ctx, vendorId: number) {
  const min = getSetting(ctx.db, 'vendor.min_orders_for_score');
  const t = today(ctx);
  const pos = many(ctx.db, "SELECT * FROM purchase_orders WHERE vendor_id=? AND status NOT IN ('draft','pending_approval','cancelled') AND archived_at IS NULL", vendorId);
  let completed = 0; let onTime = 0; let lateDays = 0; let lateCount = 0; let overdueOpen = 0; let value = 0;
  for (const po of pos) {
    value += poTotals(ctx, po.id).total_paise;
    const last = one<{ d: string | null }>(ctx.db, 'SELECT MAX(received_on) d FROM goods_receipts WHERE po_id=?', po.id)!.d;
    if (po.status === 'received' && last) {
      completed++;
      const promised = po.original_promised_date ?? po.promised_date;
      if (!promised || last <= promised) onTime++; else { lateCount++; lateDays += daysBetween(promised, last); }
    } else if ((po.original_promised_date ?? po.promised_date) && (po.original_promised_date ?? po.promised_date) < t) overdueOpen++;
  }
  const q = one<{ rec: number; rej: number }>(ctx.db, "SELECT COALESCE(SUM(pl.qty_received),0) rec, COALESCE(SUM(pl.qty_rejected),0) rej FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id WHERE po.vendor_id=? AND po.status<>'cancelled'", vendorId)!;
  const incidents = one<{ n: number }>(ctx.db, "SELECT COUNT(*) n FROM vendor_events WHERE vendor_id=? AND kind='quality_incident'", vendorId)!.n;
  const delays = one<{ n: number }>(ctx.db, 'SELECT COUNT(*) n FROM po_delay_log d JOIN purchase_orders po ON po.id=d.po_id WHERE po.vendor_id=?', vendorId)!.n;
  const enough = completed >= min;
  return {
    purchase_orders: pos.length, completed_pos: completed, on_time_pos: onTime, late_pos: lateCount, open_overdue_pos: overdueOpen,
    avg_days_late: lateCount ? Math.round((lateDays / lateCount) * 10) / 10 : null,
    on_time_rate_pct: enough ? Math.round((onTime / completed) * 100) : null,
    units_received: q.rec, units_rejected: q.rej, rejection_rate_pct: q.rec >= 1 && enough ? Math.round((q.rej / q.rec) * 1000) / 10 : null,
    quality_incidents: incidents, delay_notices: delays, purchase_value_paise: value,
    enough_data: enough, min_orders_for_score: min,
    method: `On-time rate = completed POs fully received on or before the vendor's original promised date ÷ completed POs. Rejection rate = units rejected at quality check ÷ units received. Shown only after ${min} completed POs; until then, counts only.`,
  };
}
