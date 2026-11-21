import { describe, expect, it } from 'vitest';
import { ApiError, tinyPdf } from '../server/testkit.ts';
import { approvedVendor, buyEverything, confirmedOrder, readyForProcurement, useEnv } from './flows.ts';

const box = useEnv();
const expectApi = async (p: Promise<unknown>, status: number, code?: string) => {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(ApiError); expect((e as ApiError).status).toBe(status); if (code) expect((e as ApiError).body.error.code).toBe(code); return (e as ApiError).body; }
  throw new Error(`expected ${status}`);
};
const hasMoney = (v: unknown): boolean => JSON.stringify(v).match(/"[a-z_]*(_paise|cost|margin|price)[a-z_]*":/) !== null;

describe('Scenario 9 — customer and vendor advances update balances and margin', () => {
  it('keeps balances and margins consistent as money moves', async () => {
    const { as, db } = box.env;
    const vendor = await approvedVendor(box.env, 'Packaging Works');
    // 100 boxes × ₹1,000 = ₹1,00,000 + 18% GST = ₹1,18,000; estimated cost ₹600/box.
    const { orderId } = await confirmedOrder(box.env, { lines: [{ description: 'Corporate box', qty: 100, unit_price_paise: 100000 }], cost_paise: 60000 });
    let f = (await as.finance.get(`/api/orders/${orderId}/payments`)).finance;
    expect(f).toMatchObject({ total_paise: 11800000, revenue_paise: 10000000, received_paise: 0, balance_paise: 11800000, est_margin_bp: 4000, actual_cost_paise: 0, margin_provisional: true });
    // Customer advance of ₹50,000.
    await expectApi(as.sales1.post(`/api/orders/${orderId}/payments`, { kind: 'advance', amount_paise: 5000000, received_on: box.env.today(), reference: 'NEFT-1' }), 403);
    await as.finance.post(`/api/orders/${orderId}/payments`, { kind: 'advance', amount_paise: 5000000, received_on: box.env.today(), reference: 'NEFT UTR 2211' });
    await expectApi(as.finance.post(`/api/orders/${orderId}/payments`, { kind: 'payment', amount_paise: 6800001, received_on: box.env.today(), reference: 'x' }), 400); // more than balance
    f = (await as.finance.get(`/api/orders/${orderId}/payments`)).finance;
    expect(f).toMatchObject({ received_paise: 5000000, advance_paise: 5000000, balance_paise: 6800000 });
    // Procurement: PO for 100 × ₹500 + 12% tax + ₹2,000 shipping.
    await readyForProcurement(box.env, orderId, [{ component_name: 'Rigid box', qty_per_box: 1 }]);
    const poId = await buyEverything(box.env, orderId, vendor, box.env.addDays(5));
    await db.prepare('UPDATE purchase_orders SET shipping_paise=200000, advance_required_paise=2000000 WHERE id=?').run(poId);
    let pay = (await as.finance.get('/api/finance/payables')).rows.find((p: any) => p.id === poId);
    expect(pay).toMatchObject({ total_paise: 5000000 + 600000 + 200000, paid_paise: 0, advance_outstanding_paise: 2000000 });
    // Vendor advance needs verified bank details; after a bank change it is blocked until re-verified.
    await as.finance.put(`/api/vendors/${vendor}/bank`, { account_name: 'Packaging Works', account_number: '77770000123', ifsc: 'SBIN0000001', bank_name: 'SBI' });
    await expectApi(as.finance.post(`/api/purchase-orders/${poId}/payments`, { kind: 'advance', amount_paise: 2000000, paid_on: box.env.today(), reference: 'IMPS 1' }), 422, 'blocked');
    await as.founder.post(`/api/vendors/${vendor}/bank/verify`, { method: 'Called owner' });
    await as.finance.post(`/api/purchase-orders/${poId}/payments`, { kind: 'advance', amount_paise: 2000000, paid_on: box.env.today(), reference: 'IMPS 1' });
    pay = (await as.finance.get('/api/finance/payables')).rows.find((p: any) => p.id === poId);
    expect(pay).toMatchObject({ paid_paise: 2000000, advance_paid_paise: 2000000, balance_paise: 3800000, advance_outstanding_paise: 0 });
    // Actual margin: PO pre-tax value + shipping (vendor tax excluded by default setting) + packaging cost.
    await as.finance.post(`/api/orders/${orderId}/costs`, { kind: 'packaging', description: 'Tissue and ribbon', amount_paise: 300000, incurred_on: box.env.today() });
    f = (await as.finance.get(`/api/orders/${orderId}/payments`)).finance;
    expect(f.actual_cost_paise).toBe(5000000 + 200000 + 300000);
    expect(f.actual_margin_bp).toBe(4500); // (1,00,000 − 55,000) / 1,00,000
    expect(f.margin_provisional).toBe(false); // everything is on a PO now
    // If the company treats vendor GST as a cost, the setting changes the calculation.
    await as.founder.put('/api/settings/costing.vendor_tax_in_cost', { value: true });
    expect((await as.finance.get(`/api/orders/${orderId}/payments`)).finance.actual_cost_paise).toBe(5000000 + 600000 + 200000 + 300000);
    await as.founder.put('/api/settings/costing.vendor_tax_in_cost', { value: false });
    // Receivables export matches the API figures.
    const csv = (await as.finance.raw('GET', '/api/exports/receivables')).data as string;
    const orderNumber = String((await as.finance.get(`/api/orders/${orderId}`)).order.number);
    const row = csv.split('\r\n').find((l) => l.includes(orderNumber))!;
    expect(row).toContain('118000.00');
    expect(row).toContain('50000.00');
    expect(row).toContain('68000.00');
  });
});

describe('Scenario 10 — restricted users cannot reach bank details or finance data (UI and API)', () => {
  it('enforces server-side permissions and field redaction', async () => {
    const { as, ids } = box.env;
    const vendor = await approvedVendor(box.env, 'Secure Vendor');
    const { orderId } = await confirmedOrder(box.env);
    await as.proc1.post(`/api/orders/${orderId}/team`, { user_id: ids.packer1, duty: 'packing' }).catch(() => undefined);
    await as.procManager.post(`/api/orders/${orderId}/team`, { user_id: ids.packer1, duty: 'packing' });
    await as.procManager.post(`/api/orders/${orderId}/team`, { user_id: ids.dispatch, duty: 'dispatch' });
    // Bank details: finance sees them, procurement and warehouse see only "on file / verified".
    expect((await as.finance.get(`/api/vendors/${vendor}`)).bank.account_number).toMatch(/^\d+$/);
    for (const who of ['proc1', 'procManager', 'packer1'] as const) {
      const v = await as[who].get(`/api/vendors/${vendor}`);
      expect(v.bank).toEqual({ restricted: true, on_file: true, verified: true, review_required: false });
      expect(JSON.stringify(v)).not.toMatch(/50100\d+|HDFC0001234/);
    }
    await expectApi(as.dispatch.get(`/api/vendors/${vendor}`), 403);
    await expectApi(as.procManager.put(`/api/vendors/${vendor}/bank`, { account_name: 'x', account_number: '123456', ifsc: 'HDFC0001234', bank_name: 'x' }), 403);
    await expectApi(as.packer1.post(`/api/vendors/${vendor}/bank/verify`, { method: 'trust me' }), 403);
    // Sensitive vendor documents (e.g. cancelled cheque) cannot be downloaded by procurement.
    const docs = (await as.finance.get(`/api/vendors/${vendor}`)).documents;
    const cheque = docs.find((d: any) => d.kind === 'Cancelled cheque');
    expect((await as.finance.raw('GET', `/api/attachments/${cheque.attachment_id}/download`)).status).toBe(200);
    expect((await as.proc1.raw('GET', `/api/attachments/${cheque.attachment_id}/download`)).status).toBe(403);
    expect((await as.proc1.get(`/api/vendors/${vendor}`)).documents.find((d: any) => d.kind === 'Cancelled cheque').attachment_id).toBeNull();
    // Finance endpoints.
    for (const who of ['packer1', 'dispatch', 'sales1', 'proc1'] as const) {
      await expectApi(as[who].get('/api/finance/receivables'), 403);
      await expectApi(as[who].get(`/api/orders/${orderId}/payments`), 403);
      await expectApi(as[who].post(`/api/orders/${orderId}/payments`, { kind: 'payment', amount_paise: 100, received_on: box.env.today(), reference: 'x' }), 403);
      expect((await as[who].raw('GET', '/api/exports/receivables')).status).toBe(403);
    }
    // Packing/dispatch see the order they work on, with every money field removed.
    const packView = await as.packer1.get(`/api/orders/${orderId}`);
    expect(packView.order.number).toBeTruthy();
    expect(hasMoney(packView)).toBe(false);
    expect(hasMoney(await as.packer1.get(`/api/orders/${orderId}/contents`))).toBe(false);
    expect(hasMoney(await as.packer1.get('/api/orders'))).toBe(false);
    await expectApi(as.packer1.get(`/api/orders/${orderId}/costing`), 403);
    // Direct URLs to records outside scope look like "not found".
    const other = await confirmedOrder(box.env);
    await expectApi(as.sales2.get(`/api/orders/${other.orderId}`), 404);
    await expectApi(as.sales2.get(`/api/opportunities/${other.oppId}`), 404);
    await expectApi(as.sales2.get(`/api/quotations/${other.quotationId}`), 404);
    // Admin-only areas.
    for (const who of ['salesManager', 'finance', 'procManager'] as const) {
      await expectApi(as[who].get('/api/admin/users'), 403);
      await expectApi(as[who].get('/api/audit'), 403);
      await expectApi(as[who].put('/api/settings/approval.margin_min_bp', { value: 0 }), 403);
    }
    // Missing CSRF header is rejected even with a valid session.
    const r = await as.finance.raw('POST', `/api/orders/${orderId}/comments`, { text: 'x' }, { 'x-requested-with': '' });
    expect(r.status).toBe(403);
    // Unauthenticated.
    expect((await fetch(`${box.env.base}/api/orders`)).status).toBe(401);
    // Uploads: wrong type and mismatched content are rejected.
    await expectApi(as.sales1.upload('order', orderId, 'evil.svg', Buffer.from('<svg/>'), 'image/svg+xml'), 400);
    await expectApi(as.sales1.upload('order', orderId, 'fake.pdf', Buffer.from('MZ not a pdf'), 'application/pdf'), 400);
    expect((await as.sales1.upload('order', orderId, 'brief.pdf', tinyPdf, 'application/pdf')).id).toBeGreaterThan(0);
  });
});
