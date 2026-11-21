import type { DB } from './db.ts';

/** Business values that may change live here (editable in Settings), never hard-coded in rules. */
export const DEFAULT_SETTINGS = {
  'approval.margin_min_bp': 2000,            // quotes below this margin need sales-manager approval
  'approval.margin_floor_bp': 1000,          // quotes below this need founder/admin approval
  'approval.po_value_threshold_paise': 5000000, // POs above ₹50,000 issued by an executive need manager approval
  'approval.vendor_approver_roles': ['procurement_manager', 'admin'],
  'tax.rates': [ { name: 'GST 18%', bp: 1800 }, { name: 'GST 12%', bp: 1200 }, { name: 'GST 5%', bp: 500 }, { name: 'No tax', bp: 0 } ],
  'tax.default_bp': 1800,
  'vendor.required_fields': ['phone', 'email', 'address', 'categories', 'lead_time_days', 'payment_terms'],
  'vendor.required_docs': ['GST certificate', 'PAN card', 'Cancelled cheque'],
  'vendor.doc_expiry_warn_days': 30,
  'vendor.require_bank': true,
  'vendor.min_orders_for_score': 3,           // below this many completed POs we show "not enough data" instead of a score
  'order.stage_labels': { confirmed: 'Confirmed', procurement: 'Procurement', goods_received: 'Goods received', quality_check: 'Quality check', packing: 'Packing', dispatch: 'Dispatch', delivered: 'Delivered', closed: 'Payment closure' },
  'order.stage_target_days': { confirmed: 2, procurement: 7, goods_received: 2, quality_check: 1, packing: 3, dispatch: 3, delivered: 1, closed: 15 },
  'risk.buffer_days': 3,                      // days needed after last component arrives to check, pack and ship
  'packing.require_all_components': true,
  'notify.follow_up_overdue': true, 'notify.vendor_quote_overdue_days': 3, 'notify.po_confirmation_overdue_days': 2,
  'notify.arrival_warning_days': 2, 'notify.balance_overdue': true, 'notify.packing_due_days': 2, 'notify.dispatch_due_days': 1,
  'notify.shipment_delay': true, 'notify.vendor_doc_expiry': true, 'notify.vendor_onboarding_overdue': true,
  'sales.quote_validity_days': 15,
  'customer.payment_terms_days': 30,
  'sales.lost_reasons': ['Price too high', 'Chose a competitor', 'Budget cut or postponed', 'Timeline not feasible', 'No response', 'Requirement changed', 'Other'],
  'packing.checker_must_differ': true,        // a batch must be checked by someone other than the packer
  'costing.vendor_tax_in_cost': false,        // whether vendor tax counts as cost in actual margin (depends on the company's GST treatment; confirm with accountants)
  'tasks.followup_days_after_quote': 3,
} as const;
export type SettingKey = keyof typeof DEFAULT_SETTINGS;

export function getSetting<K extends SettingKey>(db: DB, key: K): (typeof DEFAULT_SETTINGS)[K] {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : DEFAULT_SETTINGS[key];
}
export function allSettings(db: DB): Record<string, unknown> {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key,value FROM settings').all() as { key: string; value: string }[]) out[r.key] = JSON.parse(r.value);
  return out;
}
export function setSetting(db: DB, key: string, value: unknown, userId: number, at: string) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`Unknown setting ${key}`);
  db.prepare('INSERT INTO settings (key,value,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at').run(key, JSON.stringify(value), userId, at);
}
