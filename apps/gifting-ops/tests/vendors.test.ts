import { describe, expect, it } from 'vitest';
import { ApiError, tinyPdf } from '../server/testkit.ts';
import { approvedVendor, confirmedOrder, readyForProcurement, setupEnv } from './flows.ts';

const box = setupEnv();
const expectApi = async (p: Promise<unknown>, status: number, code?: string) => {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(ApiError); expect((e as ApiError).status).toBe(status); if (code) expect((e as ApiError).body.error.code).toBe(code); return (e as ApiError).body; }
  throw new Error(`expected ${status}`);
};

describe('Scenario 4 — onboard, review, approve, compare and select a vendor', () => {
  it('runs onboarding with checklist, duplicate detection, separation of duties and a recorded approver', async () => {
    const { as, ids, db } = box.env;
    const v = await as.proc1.post('/api/vendors', { legal_name: 'Nutty Delights Private Limited', display_name: 'Nutty Delights', phone: '9876543210', email: 'orders@nutty.example', gst_number: '29ABCDE1234F1Z5', pan_number: 'ABCDE1234F', categories: ['Dry fruits & nuts'] });
    // Duplicate by GSTIN (and name) is caught.
    const dup = await expectApi(as.proc2.post('/api/vendors', { legal_name: 'Nutty Delights Pvt. Ltd.', display_name: 'ND Foods', gst_number: '29ABCDE1234F1Z5' }), 409, 'duplicate');
    expect(dup.error.details.duplicates[0].reason).toMatch(/same name.*same GSTIN|same GSTIN/);
    // Review needs a complete record; the checklist says what is missing.
    let detail = await as.proc1.get(`/api/vendors/${v.id}`);
    expect(detail.checklist.filter((c: any) => !c.done).map((c: any) => c.key)).toEqual(expect.arrayContaining(['field:address', 'field:lead_time_days', 'contact', 'doc:GST certificate', 'bank']));
    const notReady = await expectApi(as.proc1.post(`/api/vendors/${v.id}/transition`, { to: 'under_review' }), 422, 'blocked');
    expect(notReady.error.details.missing.length).toBeGreaterThan(4);
    await as.proc1.post(`/api/vendors/${v.id}/transition`, { to: 'info_requested', reason: 'Asked for address, lead times and documents' });
    await as.proc1.patch(`/api/vendors/${v.id}`, { address: 'Plot 4, KIADB', lead_time_days: 6, payment_terms: '50% advance', expected_version: detail.vendor.version + 1 });
    await as.proc1.post(`/api/vendors/${v.id}/contacts`, { name: 'Farhan', phone: '9876543210', is_primary: true });
    for (const kind of ['GST certificate', 'PAN card', 'Cancelled cheque']) {
      const f = await as.proc1.upload('vendor', v.id, `${kind}.pdf`, tinyPdf, 'application/pdf');
      await as.proc1.post(`/api/vendors/${v.id}/documents`, { kind, attachment_id: f.id, expires_on: kind === 'GST certificate' ? box.env.addDays(20) : null });
    }
    // Procurement cannot enter bank details; finance can.
    await expectApi(as.proc1.put(`/api/vendors/${v.id}/bank`, { account_name: 'Nutty', account_number: '123456789', ifsc: 'HDFC0001234', bank_name: 'HDFC' }), 403);
    await as.finance.put(`/api/vendors/${v.id}/bank`, { account_name: 'Nutty Delights Pvt Ltd', account_number: '50100123456789', ifsc: 'HDFC0001234', bank_name: 'HDFC Bank' });
    await as.proc1.post(`/api/vendors/${v.id}/transition`, { to: 'under_review' });
    // An executive cannot approve; the manager is blocked until finance/admin verification is done.
    await expectApi(as.proc1.post(`/api/vendors/${v.id}/transition`, { to: 'approved' }), 403);
    const unverified = await expectApi(as.procManager.post(`/api/vendors/${v.id}/transition`, { to: 'approved' }), 422, 'blocked');
    expect(unverified.error.details.missing.every((m: any) => m.code.startsWith('verify:'))).toBe(true);
    detail = await as.finance.get(`/api/vendors/${v.id}`);
    for (const d of detail.documents) await as.finance.post(`/api/vendor-documents/${d.id}/verify`);
    // Finance entered the bank details, so finance cannot also verify them.
    await expectApi(as.finance.post(`/api/vendors/${v.id}/bank/verify`, { method: 'Checked cheque' }), 403);
    await as.founder.post(`/api/vendors/${v.id}/bank/verify`, { method: 'Called vendor on number from GST certificate' });
    await as.procManager.post(`/api/vendors/${v.id}/transition`, { to: 'approved' });
    const approved = db.prepare('SELECT status, approved_by, approved_at FROM vendors WHERE id=?').get(v.id) as any;
    expect(approved.status).toBe('approved');
    expect(approved.approved_by).toBe(ids.procManager);
    expect(approved.approved_at).toBeTruthy();
    detail = await as.procManager.get(`/api/vendors/${v.id}`);
    expect(detail.events.some((e: any) => e.kind === 'status_change' && e.summary.includes('under review → approved'))).toBe(true);
    // Changing bank details after approval is flagged for review and notifies finance/admin.
    await as.finance.put(`/api/vendors/${v.id}/bank`, { account_name: 'Nutty Delights Pvt Ltd', account_number: '99990000111122', ifsc: 'ICIC0000001', bank_name: 'ICICI' });
    const bank = db.prepare('SELECT review_required, verified_at FROM vendor_bank WHERE vendor_id=?').get(v.id) as any;
    expect(bank).toEqual({ review_required: 1, verified_at: null });
    expect((await as.founder.get('/api/notifications')).rows.some((n: any) => n.kind === 'vendor_sensitive_change')).toBe(true);
    await as.founder.post(`/api/vendors/${v.id}/bank/verify`, { method: 'Confirmed change by phone with owner' });

    // Compare against a second vendor and select.
    const other = await approvedVendor(box.env, 'Royal Dry Fruits');
    const { orderId } = await confirmedOrder(box.env, { lines: [{ description: 'Dry fruit box', qty: 300, unit_price_paise: 150000 }], due: box.env.addDays(20) });
    await readyForProcurement(box.env, orderId, [{ component_name: 'Cashews 250g', qty_per_box: 1 }]);
    const comp = (await as.proc1.get(`/api/orders/${orderId}/components`)).rows[0];
    const rfq = await as.proc1.post('/api/rfqs', { order_id: orderId, bom_item_id: comp.id, title: 'Cashews 250g W320', qty: 300, needed_by: box.env.addDays(14), is_critical: true, vendor_ids: [v.id, other], response_due: box.env.addDays(2) });
    let r = await as.proc1.get(`/api/rfqs/${rfq.id}`);
    const qA = r.quotes.find((q: any) => q.vendor_id === v.id); const qB = r.quotes.find((q: any) => q.vendor_id === other);
    await as.proc1.put(`/api/vendor-quotes/${qA.id}`, { unit_price_paise: 42000, tax_bp: 500, shipping_paise: 300000, lead_time_days: 6, valid_until: box.env.addDays(10), moq: 100 });
    await as.proc1.put(`/api/vendor-quotes/${qB.id}`, { unit_price_paise: 40000, tax_bp: 500, shipping_paise: 1200000, lead_time_days: 13, valid_until: box.env.addDays(10) });
    r = await as.proc1.get(`/api/rfqs/${rfq.id}`);
    const A = r.quotes.find((q: any) => q.vendor_id === v.id); const B = r.quotes.find((q: any) => q.vendor_id === other);
    expect(A.landed_paise).toBe(300 * 42000 + 630000 + 300000);   // goods + 5% tax + shipping
    expect(B.landed_paise).toBe(300 * 40000 + 600000 + 1200000);
    expect(A.cheapest).toBe(true);                                // lower landed cost despite higher unit price
    expect(A.fastest).toBe(true);
    expect(B.delivery_risk).toBe('tight');                        // arrives with less than the 3-day buffer
    await expectApi(as.proc1.post(`/api/rfqs/${rfq.id}/award`, { quote_id: A.id, reason: '' }), 400);
    const award = await as.proc1.post(`/api/rfqs/${rfq.id}/award`, { quote_id: A.id, reason: 'Lowest landed cost and fastest', backup_quote_id: B.id });
    expect(award.warnings).toEqual([]);
    const po = await as.proc1.post(`/api/rfqs/${rfq.id}/create-po`, {});
    const pod = await as.proc1.get(`/api/purchase-orders/${po.id}`);
    expect(pod.po).toMatchObject({ vendor_id: v.id, vendor_quote_id: A.id, status: 'draft', order_id: orderId });
    expect(pod.lines[0]).toMatchObject({ bom_item_id: comp.id, qty_ordered: 300, unit_price_paise: 42000 });
    // ₹1.26 lakh + tax + shipping is above the ₹50,000 executive limit → manager approval.
    expect((await as.proc1.post(`/api/purchase-orders/${po.id}/issue`)).status).toBe('pending_approval');
    const ap = (await as.procManager.get('/api/approvals')).rows.find((a: any) => a.kind === 'po_value' && a.entity_id === po.id);
    await as.procManager.post(`/api/approvals/${ap.id}/decide`, { decision: 'approved' });
    expect((await as.proc1.get(`/api/purchase-orders/${po.id}`)).po.status).toBe('issued');
  });
});

describe('Scenario 5 — unapproved or suspended vendors cannot receive a normal PO', () => {
  it('blocks the PO and allows only a logged override by an authorised person', async () => {
    const { as, db } = box.env;
    const suspended = await approvedVendor(box.env, 'Glassworks Co');
    await expectApi(as.proc1.post(`/api/vendors/${suspended}/transition`, { to: 'suspended', reason: 'Broken glass twice' }), 403);
    await as.procManager.post(`/api/vendors/${suspended}/transition`, { to: 'suspended', reason: 'Two broken-glass incidents in October' });
    const draft = await as.proc1.post('/api/vendors', { legal_name: 'New Prints LLP', display_name: 'New Prints', confirm_duplicate: true });
    const body = (vendor_id: number, extra = {}) => ({ vendor_id, promised_date: box.env.addDays(7), lines: [{ description: 'Mugs', qty_ordered: 10, unit_price_paise: 10000, tax_bp: 1800 }], ...extra });
    const b1 = await expectApi(as.proc1.post('/api/purchase-orders', body(suspended)), 422, 'blocked');
    expect(b1.error.message).toContain('suspended');
    await expectApi(as.proc1.post('/api/purchase-orders', body(draft.id)), 422, 'blocked');
    // An executive cannot override.
    await expectApi(as.proc1.post('/api/purchase-orders', body(suspended, { override_reason: 'Only vendor with stock this week' })), 403);
    // A manager can, and it is logged on the PO, the vendor and the audit trail.
    const po = await as.procManager.post('/api/purchase-orders', body(suspended, { override_reason: 'Only vendor with stock this week; 100% inspection agreed' }));
    expect(db.prepare('SELECT override_by, override_reason FROM purchase_orders WHERE id=?').get(po.id)).toMatchObject({ override_reason: expect.stringContaining('100% inspection') });
    expect(db.prepare("SELECT COUNT(*) n FROM vendor_events WHERE vendor_id=? AND kind='override'").get(suspended)).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE entity_type='purchase_order' AND entity_id=? AND action='override'").get(po.id)).toEqual({ n: 1 });
    // Issuing a draft re-checks the vendor if it was suspended after drafting.
    const ok = await approvedVendor(box.env, 'Late Suspension Ltd');
    const po2 = await as.proc1.post('/api/purchase-orders', body(ok));
    await as.procManager.post(`/api/vendors/${ok}/transition`, { to: 'suspended', reason: 'Bank dispute' });
    await expectApi(as.proc1.post(`/api/purchase-orders/${po2.id}/issue`), 422, 'blocked');
    // Quotes cannot be requested from suspended vendors either.
    await expectApi(as.proc1.post('/api/rfqs', { title: 'x', qty: 1, vendor_ids: [suspended], response_due: box.env.addDays(1) }), 400);
  });
});
