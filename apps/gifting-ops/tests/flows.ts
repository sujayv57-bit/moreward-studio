// Shared workflow builders for the acceptance tests. Every step goes through the HTTP API.
import { afterAll, beforeAll } from 'vitest';
import { seedBase, DEMO_USERS, type UserKey } from '../server/seed-base.ts';
import { client, makeClock, startTestServer, tinyPdf, type Client } from '../server/testkit.ts';

export type Env = Awaited<ReturnType<typeof setup>>;
export async function setup(start = '2026-11-02T05:00:00.000Z') {
  const clock = makeClock(start);
  const srv = await startTestServer({ clock });
  const ids = seedBase(srv.db, clock.now);
  const as = {} as Record<UserKey, Client>;
  for (const u of DEMO_USERS) { as[u.key] = client(srv.base); await as[u.key].login(u.email); }
  return { ...srv, ids, as, today: () => clock.now.slice(0, 10), addDays: (n: number) => { const d = new Date(clock.now); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); } };
}
export function useEnv() {
  const box = {} as { env: Env };
  beforeAll(async () => { box.env = await setup(); });
  afterAll(async () => { await box.env?.close(); });
  return box;
}
let seq = 0;
const uniq = () => ++seq;

/** Lead → qualified → opportunity → feasibility → costed, approved, sent, customer-approved quotation → order. */
export async function confirmedOrder(env: Env, opts: { lines?: { description: string; qty: number; unit_price_paise: number; customisation?: string | null }[]; destinations?: { label: string; address: string; city: string; pincode: string }[]; cost_paise?: number; due?: string } = {}) {
  const { as, ids } = env; const n = uniq();
  const lines = opts.lines ?? [{ description: 'Classic Diwali box', qty: 50, unit_price_paise: 200000, customisation: null }];
  const qty = lines.reduce((a, l) => a + l.qty, 0);
  const due = opts.due ?? env.addDays(30);
  const lead = await as.sales1.post('/api/leads', { company_name: `Test Co ${n}`, contact_name: `Contact ${n}`, phone: `98450${String(10000 + n).slice(-5)}`, email: `buyer${n}@testco${n}.example`, source: 'Referral', occasion: 'Diwali', approx_qty: qty, budget_paise: qty * 200000, required_by: due, owner_id: ids.sales1, confirm_duplicate: true });
  await as.sales1.post(`/api/leads/${lead.id}/activities`, { kind: 'call', summary: 'Discussed requirement' });
  await as.sales1.post(`/api/leads/${lead.id}/qualify`);
  const { opportunity_id: oppId } = await as.sales1.post(`/api/leads/${lead.id}/convert`);
  await as.sales1.post(`/api/opportunities/${oppId}/feasibility`, { assigned_to: ids.proc1 });
  const f = (await as.proc1.get('/api/feasibility')).rows.find((x: any) => x.opportunity_id === oppId);
  await as.proc1.post(`/api/feasibility/${f.id}/complete`, { result: 'feasible', earliest_delivery: env.addDays(5), notes: 'Stock available with two vendors' });
  const q = await as.sales1.post(`/api/opportunities/${oppId}/quotations`, { lines, shipping_paise: 0, tax_bp: 1800, validity_date: env.addDays(15), delivery_date: due });
  const qd = await as.sales1.get(`/api/quotations/${q.id}`);
  await as.proc1.put(`/api/quotations/${q.id}/costs`, { lines: qd.versions[0].lines.map((l: any) => ({ id: l.id, unit_cost_paise: opts.cost_paise ?? Math.round(l.unit_price_paise * 0.6) })) });
  const sub = await as.sales1.post(`/api/quotations/${q.id}/submit`);
  if (sub.status !== 'approved') throw new Error('expected auto approval');
  await as.sales1.post(`/api/quotations/${q.id}/send`);
  await as.sales1.post(`/api/quotations/${q.id}/customer-approval`, { version: 1, approver_name: 'Head of HR', approved_on: env.today(), reference: `Email ${n}` });
  const destinations = opts.destinations ?? [{ label: 'Head office', address: '12 MG Road', city: 'Bengaluru', pincode: '560001' }];
  const order = await as.sales1.post(`/api/quotations/${q.id}/convert`, { procurement_owner_id: ids.proc1, due_date: due, destinations });
  return { orderId: order.id as number, number: order.number as string, oppId, quotationId: q.id as number };
}

/** A fully onboarded, verified and approved vendor. */
export async function approvedVendor(env: Env, name: string, extra: Record<string, unknown> = {}) {
  const { as, ids } = env; const n = uniq();
  const gst = extra.gst_number ?? `29AAAC${String.fromCharCode(65 + (n % 26))}${String(1000 + n).slice(-4)}A1Z${n % 10}`;
  const v = await as.proc1.post('/api/vendors', { legal_name: `${name} Pvt Ltd`, display_name: name, phone: `90000${String(10000 + n).slice(-5)}`, email: `sales@vendor${n}.example`, address: `${n} Industrial Area`, city: 'Bengaluru', categories: ['Dry fruits & nuts'], lead_time_days: 7, payment_terms: '30% advance, balance on delivery', onboarding_owner_id: ids.proc1, confirm_duplicate: true, ...extra, gst_number: gst });
  await as.proc1.post(`/api/vendors/${v.id}/contacts`, { name: `Owner ${n}`, phone: '9000000000', is_primary: true });
  for (const kind of ['GST certificate', 'PAN card', 'Cancelled cheque']) {
    const f = await as.proc1.upload('vendor', v.id, `${kind}.pdf`, tinyPdf, 'application/pdf');
    await as.proc1.post(`/api/vendors/${v.id}/documents`, { kind, attachment_id: f.id, expires_on: kind === 'GST certificate' ? env.addDays(365) : null });
  }
  await as.finance.put(`/api/vendors/${v.id}/bank`, { account_name: `${name} Pvt Ltd`, account_number: `50100${String(100000 + n)}`, ifsc: 'HDFC0001234', bank_name: 'HDFC Bank' });
  await as.proc1.post(`/api/vendors/${v.id}/transition`, { to: 'under_review' });
  const detail = await as.finance.get(`/api/vendors/${v.id}`);
  for (const d of detail.documents) await as.finance.post(`/api/vendor-documents/${d.id}/verify`);
  await as.founder.post(`/api/vendors/${v.id}/bank/verify`, { method: 'Called vendor on known number; matched cheque' });
  await as.procManager.post(`/api/vendors/${v.id}/transition`, { to: 'approved' });
  return v.id as number;
}

/** Add one BOM component to every variant and move the order to procurement. */
export async function readyForProcurement(env: Env, orderId: number, components: { component_name: string; qty_per_box: number; lead_time_days?: number }[] = [{ component_name: 'Almonds 200g', qty_per_box: 1 }]) {
  const { as } = env;
  const c = await as.proc1.get(`/api/orders/${orderId}/contents`);
  for (const v of c.variants) for (const comp of components) await as.proc1.post(`/api/variants/${v.id}/bom`, { ...comp, unit: 'pc' });
  const o = await as.proc1.get(`/api/orders/${orderId}`);
  await as.proc1.post(`/api/orders/${orderId}/advance`, { to: 'procurement', expected_version: o.order.version });
  return (await as.proc1.get(`/api/orders/${orderId}/contents`)).variants as any[];
}
/** Raise and issue a PO for each BOM item at the exact required quantity. */
export async function buyEverything(env: Env, orderId: number, vendorId: number, promised: string) {
  const { as } = env;
  const comps = (await as.proc1.get(`/api/orders/${orderId}/components`)).rows;
  const po = await as.procManager.post('/api/purchase-orders', { order_id: orderId, vendor_id: vendorId, promised_date: promised, shipping_paise: 0, lines: comps.map((c: any) => ({ bom_item_id: c.id, description: c.component_name, qty_ordered: c.required, unit_price_paise: 50000, tax_bp: 1200 })) });
  await as.procManager.post(`/api/purchase-orders/${po.id}/issue`);
  return po.id as number;
}
/** Sessions last 12 hours of (test) clock time; sign everyone in again after moving the clock. */
export async function relogin(env: Env) {
  for (const u of DEMO_USERS) await env.as[u.key].login(u.email);
}
