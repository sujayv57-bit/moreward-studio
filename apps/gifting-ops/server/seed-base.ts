import { hashPassword } from './auth.ts';
import type { DB } from './db.ts';
import { insert, one } from './db.ts';

/** DEMO DATA — fictional people. Never run against production (the CLI refuses when NODE_ENV=production). */
export const DEMO_USERS = [
  { key: 'founder', name: 'Aarav Mehta', email: 'founder@example.com', roles: ['admin'] },
  { key: 'salesManager', name: 'Priya Nair', email: 'priya.sales@example.com', roles: ['sales_manager'] },
  { key: 'sales1', name: 'Rohan Kapoor', email: 'rohan.sales@example.com', roles: ['sales_exec'] },
  { key: 'sales2', name: 'Sneha Iyer', email: 'sneha.sales@example.com', roles: ['sales_exec'] },
  { key: 'procManager', name: 'Vikram Singh', email: 'vikram.procurement@example.com', roles: ['procurement_manager'] },
  { key: 'proc1', name: 'Anjali Desai', email: 'anjali.procurement@example.com', roles: ['procurement_exec'] },
  { key: 'proc2', name: 'Karan Joshi', email: 'karan.procurement@example.com', roles: ['procurement_exec', 'packing_quality'] },
  { key: 'packer1', name: 'Meera Pillai', email: 'meera.warehouse@example.com', roles: ['packing_quality'] },
  { key: 'packer2', name: 'Suresh Yadav', email: 'suresh.warehouse@example.com', roles: ['packing_quality'] },
  { key: 'dispatch', name: 'Imran Khan', email: 'imran.dispatch@example.com', roles: ['dispatch'] },
  { key: 'finance', name: 'Kavya Reddy', email: 'kavya.finance@example.com', roles: ['finance'] },
] as const;
export type UserKey = (typeof DEMO_USERS)[number]['key'];
export const DEMO_PASSWORD = 'demo-password-2026';

export const CATEGORIES = ['Dry fruits & nuts', 'Sweets & confectionery', 'Tea & coffee', 'Drinkware', 'Stationery', 'Tech accessories', 'Apparel', 'Home décor', 'Packaging', 'Printing & branding', 'Gourmet & hampers', 'Wellness'];

export function seedBase(db: DB, now: string, password = DEMO_PASSWORD): Record<UserKey, number> {
  const ids = {} as Record<UserKey, number>;
  const hash = hashPassword(password);
  for (const u of DEMO_USERS) {
    const existing = one<{ id: number }>(db, 'SELECT id FROM users WHERE email=?', u.email);
    ids[u.key] = existing?.id ?? insert(db, 'users', { name: u.name, email: u.email, roles: JSON.stringify(u.roles), password_hash: hash, created_at: now });
  }
  for (const c of CATEGORIES) db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(c);
  if (!one(db, 'SELECT id FROM checklist_templates')) {
    insert(db, 'checklist_templates', { name: 'Standard gift box', kind: 'packing', items: JSON.stringify(['Box assembled, clean and undamaged', 'Filler / tissue placed', 'Greeting card inserted and spelled correctly', 'Box sealed', 'Address / variant label attached']) });
  }
  if (!one(db, 'SELECT id FROM message_templates')) {
    const t = (key: string, name: string, channel: string, party: string, subject: string, body: string) => insert(db, 'message_templates', { key, name, channel, party, subject, body });
    t('quote_follow_up', 'Quotation follow-up', 'email', 'customer', 'Your gifting quotation {{quote_number}}', 'Hi {{contact_name}},\n\nFollowing up on quotation {{quote_number}} for {{opportunity}}. It is valid until {{valid_until}}. Happy to adjust quantities or contents — just reply here.\n\nRegards,\n{{sender_name}}');
    t('dispatch_tracking', 'Dispatch and tracking', 'whatsapp', 'customer', '', 'Hi {{contact_name}}, your order {{order_number}} ({{order_title}}) has been dispatched.\n{{tracking}}\n— {{sender_name}}');
    t('payment_reminder', 'Payment reminder', 'email', 'customer', 'Payment for order {{order_number}}', 'Hi {{contact_name}},\n\nA gentle reminder that the balance of {{balance}} for order {{order_number}} is now due. Please share the payment reference once done.\n\nThank you,\n{{sender_name}}');
    t('vendor_info_request', 'Vendor: information request', 'email', 'vendor', 'Documents needed to complete vendor registration', 'Hi {{contact_name}},\n\nTo complete {{vendor_name}}\'s registration with us we still need:\n{{missing_items}}\n\nThank you,\n{{sender_name}}');
    t('vendor_po_confirm', 'Vendor: confirm purchase order', 'whatsapp', 'vendor', '', 'Hi {{contact_name}}, please confirm PO {{po_number}} and the delivery date. — {{sender_name}}');
    t('vendor_delivery_chase', 'Vendor: delivery chase', 'whatsapp', 'vendor', '', 'Hi {{contact_name}}, PO {{po_number}} was due {{promised_date}}. Can you share the dispatch status and a firm date today? — {{sender_name}}');
  }
  return ids;
}
