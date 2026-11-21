import { describe, expect, it } from 'vitest';
import { ApiError } from '../server/testkit.ts';
import { useEnv } from './flows.ts';

const box = useEnv();
const expectApi = async (p: Promise<unknown>, status: number, code?: string) => {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(ApiError); expect((e as ApiError).status).toBe(status); if (code) expect((e as ApiError).body.error.code).toBe(code); return (e as ApiError).body; }
  throw new Error(`expected ${status}`);
};

describe('Scenario 1 — lead, follow-up, qualify, quotation', () => {
  it('runs the sales flow with duplicate detection and history preserved', async () => {
    const { as, ids, db } = box.env;
    const lead = await as.sales1.post('/api/leads', { company_name: 'Kestrel Analytics Pvt Ltd', contact_name: 'Nisha Rao', phone: '+91 98450 11111', email: 'nisha@kestrel.example', source: 'Founder network', occasion: 'Diwali 2026', approx_qty: 200, owner_id: ids.sales1, next_follow_up: box.env.addDays(2) });
    // Follow-up scheduled as a task for the owner.
    const tasks = await as.sales1.get('/api/tasks');
    expect(tasks.rows.some((t: any) => t.entity_type === 'lead' && t.entity_id === lead.id && t.kind === 'follow_up' && t.due_at === box.env.addDays(2))).toBe(true);
    // Same company again (different legal suffix) is flagged as a duplicate.
    const dup = await expectApi(as.sales2.post('/api/leads', { company_name: 'Kestrel Analytics', contact_name: 'Someone', source: 'Website', owner_id: ids.sales2 }), 409, 'duplicate');
    expect(dup.error.details.duplicates[0].reason).toContain('same company name');
    // Another executive cannot see this lead.
    await expectApi(as.sales2.get(`/api/leads/${lead.id}`), 404);
    // Qualification shows exactly what is missing.
    const blocked = await expectApi(as.sales1.post(`/api/leads/${lead.id}/qualify`), 422, 'blocked');
    expect(blocked.error.details.missing.map((m: any) => m.code).sort()).toEqual(['budget', 'contact', 'date']);
    await as.sales1.post(`/api/leads/${lead.id}/activities`, { kind: 'call', summary: 'Confirmed 200 boxes, ₹1,800 per box budget', next_follow_up: box.env.addDays(3) });
    await as.sales1.patch(`/api/leads/${lead.id}`, { budget_paise: 200 * 180000, required_by: box.env.addDays(40) });
    await as.sales1.post(`/api/leads/${lead.id}/qualify`);
    const { opportunity_id } = await as.sales1.post(`/api/leads/${lead.id}/convert`);
    const opp = await as.sales1.get(`/api/opportunities/${opportunity_id}`);
    expect(opp.opportunity.company_name).toBe('Kestrel Analytics Pvt Ltd');
    expect(opp.activities.some((a: any) => a.summary.includes('Confirmed 200 boxes'))).toBe(true); // lead history carried over
    expect(opp.tasks.some((t: any) => t.kind === 'follow_up')).toBe(true);                       // follow-up moved with it
    const q = await as.sales1.post(`/api/opportunities/${opportunity_id}/quotations`, { lines: [{ description: 'Premium dry fruit box', qty: 200, unit_price_paise: 175000, customisation: 'Logo sleeve' }], shipping_paise: 1000000, tax_bp: 1800, validity_date: box.env.addDays(15), delivery_date: box.env.addDays(40) });
    expect(q.number).toMatch(/^Q-26-\d{4}$/);
    const lead2 = db.prepare('SELECT stage, opportunity_id FROM leads WHERE id=?').get(lead.id) as any;
    expect(lead2).toEqual({ stage: 'converted', opportunity_id });
  });
});

describe('Scenario 2 — procurement costs and the feasibility gate', () => {
  it('blocks firm commitments without a supporting feasibility check, except by authorised override', async () => {
    const { as, ids, db } = box.env;
    const co = await as.sales1.post('/api/companies', { name: 'Banyan Health Labs' });
    const opp = await as.sales1.post('/api/opportunities', { company_id: co.id, title: 'Banyan — Year-end hampers', owner_id: ids.sales1, approx_qty: 500 });
    const q = await as.sales1.post(`/api/opportunities/${opp.id}/quotations`, { lines: [{ description: 'Wellness hamper', qty: 500, unit_price_paise: 250000 }], shipping_paise: 0, tax_bp: 1800, validity_date: box.env.addDays(10), delivery_date: box.env.addDays(12) });
    // Margin cannot be checked without procurement costs.
    const noCost = await expectApi(as.sales1.post(`/api/quotations/${q.id}/submit`), 422, 'blocked');
    expect(noCost.error.details.missing[0].code).toBe('cost');
    // Sales executives cannot enter costs; procurement can.
    const qd = await as.sales1.get(`/api/quotations/${q.id}`);
    await expectApi(as.sales1.put(`/api/quotations/${q.id}/costs`, { lines: [{ id: qd.versions[0].lines[0].id, unit_cost_paise: 1 }] }), 403);
    await as.sales1.post(`/api/opportunities/${opp.id}/feasibility`, { assigned_to: ids.proc1, notes: '500 hampers in 12 days?' });
    await as.proc1.put(`/api/quotations/${q.id}/costs`, { lines: [{ id: qd.versions[0].lines[0].id, unit_cost_paise: 160000 }] });
    const f = (await as.proc1.get('/api/feasibility')).rows.find((x: any) => x.opportunity_id === opp.id);
    await as.proc1.post(`/api/feasibility/${f.id}/complete`, { result: 'feasible', earliest_delivery: box.env.addDays(21), max_quantity: 400, est_cost_paise: 500 * 160000, notes: 'Honey jars need 3 weeks; one vendor caps at 400' });
    const costed = await as.sales1.get(`/api/quotations/${q.id}`);
    expect(costed.versions[0].margin_bp).toBe(3600); // (2500-1600)/2500
    expect((await as.sales1.post(`/api/quotations/${q.id}/submit`)).status).toBe('approved');
    // Quoted date (12 days) is earlier than feasible (21) and qty 500 > 400: sales cannot commit.
    const gate = await expectApi(as.sales1.post(`/api/quotations/${q.id}/send`), 422, 'blocked');
    expect(gate.error.details.missing.map((m: any) => m.code).sort()).toEqual(['date', 'qty']);
    // An executive cannot override; a sales manager can, with a reason that is recorded.
    await expectApi(as.sales1.post(`/api/quotations/${q.id}/send`, { override_reason: 'Customer insists on date' }), 403);
    await as.salesManager.post(`/api/quotations/${q.id}/send`, { override_reason: 'Founder agreed to air-freight honey; split 400 + 100 with second vendor' });
    const v = db.prepare('SELECT commitment_override_by, commitment_override_reason, sent_at FROM quote_versions WHERE quotation_id=?').get(q.id) as any;
    expect(v.commitment_override_by).toBe(ids.salesManager);
    expect(v.commitment_override_reason).toContain('air-freight');
    const hist = await as.salesManager.get(`/api/opportunities/${opp.id}`);
    expect(hist.history.some((h: any) => h.summary.includes('FEASIBILITY OVERRIDE'))).toBe(true);
  });

  it('sends low-margin quotations for approval at the configured threshold', async () => {
    const { as, ids } = box.env;
    const co = await as.sales2.post('/api/companies', { name: 'Coastal Logistics' });
    const opp = await as.sales2.post('/api/opportunities', { company_id: co.id, title: 'Coastal — client gifts', owner_id: ids.sales2 });
    const q = await as.sales2.post(`/api/opportunities/${opp.id}/quotations`, { lines: [{ description: 'Desk set', qty: 100, unit_price_paise: 100000 }], shipping_paise: 0, tax_bp: 1800, validity_date: box.env.addDays(10), delivery_date: box.env.addDays(30) });
    const qd = await as.sales2.get(`/api/quotations/${q.id}`);
    await as.procManager.put(`/api/quotations/${q.id}/costs`, { lines: [{ id: qd.versions[0].lines[0].id, unit_cost_paise: 85000 }] }); // 15% margin: below 20% minimum, above 10% floor
    expect((await as.sales2.post(`/api/quotations/${q.id}/submit`)).status).toBe('pending_approval');
    const inbox = await as.salesManager.get('/api/approvals');
    const a = inbox.rows.find((x: any) => x.entity_id === q.id && x.kind === 'quote_margin');
    expect(a.can_decide).toBe(true);
    await expectApi(as.sales2.post(`/api/approvals/${a.id}/decide`, { decision: 'approved' }), 403);
    await as.salesManager.post(`/api/approvals/${a.id}/decide`, { decision: 'approved', note: 'Strategic account' });
    expect((await as.sales2.get(`/api/quotations/${q.id}`)).quotation.status).toBe('approved');
    // Threshold is a setting: raising it changes the outcome for the next submission.
    await as.founder.put('/api/settings/approval.margin_min_bp', { value: 1000 });
    const q2 = await as.sales2.post(`/api/opportunities/${opp.id}/quotations`, { lines: [{ description: 'Desk set', qty: 100, unit_price_paise: 100000 }], shipping_paise: 0, tax_bp: 1800, validity_date: box.env.addDays(10), delivery_date: box.env.addDays(30) });
    const q2d = await as.sales2.get(`/api/quotations/${q2.id}`);
    await as.procManager.put(`/api/quotations/${q2.id}/costs`, { lines: [{ id: q2d.versions[0].lines[0].id, unit_cost_paise: 85000 }] });
    expect((await as.sales2.post(`/api/quotations/${q2.id}/submit`)).status).toBe('approved');
    await as.founder.put('/api/settings/approval.margin_min_bp', { value: 2000 });
  });
});

describe('Scenario 3 — customer approves an exact version; order with a complete handoff', () => {
  it('converts only the approved version and hands off to procurement', async () => {
    const { as, ids, db } = box.env;
    const co = await as.sales1.post('/api/companies', { name: 'Saffron Hotels' });
    const opp = await as.sales1.post('/api/opportunities', { company_id: co.id, title: 'Saffron — staff Diwali boxes', owner_id: ids.sales1, approx_qty: 120 });
    await as.sales1.post(`/api/opportunities/${opp.id}/feasibility`, { assigned_to: ids.proc1 });
    const f = (await as.proc1.get('/api/feasibility')).rows.find((x: any) => x.opportunity_id === opp.id);
    await as.proc1.post(`/api/feasibility/${f.id}/complete`, { result: 'feasible', earliest_delivery: box.env.addDays(14), notes: 'OK' });
    const q = await as.sales1.post(`/api/opportunities/${opp.id}/quotations`, { lines: [{ description: 'Staff box', qty: 120, unit_price_paise: 120000 }], shipping_paise: 0, tax_bp: 1800, validity_date: box.env.addDays(10), delivery_date: box.env.addDays(25) });
    let qd = await as.sales1.get(`/api/quotations/${q.id}`);
    await as.proc1.put(`/api/quotations/${q.id}/costs`, { lines: [{ id: qd.versions[0].lines[0].id, unit_cost_paise: 70000 }] });
    await as.sales1.post(`/api/quotations/${q.id}/submit`);
    await as.sales1.post(`/api/quotations/${q.id}/send`);
    // Converting before the customer approves is refused.
    await expectApi(as.sales1.post(`/api/quotations/${q.id}/convert`, { procurement_owner_id: ids.proc1, due_date: box.env.addDays(25), destinations: [{ label: 'HQ', address: 'x' }] }), 422, 'blocked');
    // Customer asks for 150 boxes: revision v2 keeps v1 and shows what changed.
    await as.sales1.post(`/api/quotations/${q.id}/revise`, { lines: [{ description: 'Staff box', qty: 150, unit_price_paise: 115000 }], shipping_paise: 0, tax_bp: 1800, validity_date: box.env.addDays(10), delivery_date: box.env.addDays(25), change_note: 'Customer increased to 150, volume price', expected_version: 1 });
    qd = await as.sales1.get(`/api/quotations/${q.id}`);
    expect(qd.versions).toHaveLength(2);
    expect(qd.versions[0].changes).toEqual(expect.arrayContaining(['“Staff box” quantity 120 → 150', '“Staff box” unit price ₹1200 → ₹1150']));
    expect(qd.versions[0].lines[0].unit_cost_paise).toBe(70000); // cost carried forward
    // v2 has not been sent, so the customer cannot have approved it yet.
    await as.sales1.post(`/api/quotations/${q.id}/submit`);
    await as.sales1.post(`/api/quotations/${q.id}/send`);
    await expectApi(as.sales1.post(`/api/quotations/${q.id}/customer-approval`, { version: 3, approver_name: 'GM', approved_on: box.env.today(), reference: 'x' }), 400);
    const po = await as.sales1.upload('quotation', q.id, 'customer-po.pdf', Buffer.from('%PDF-1.4 test'), 'application/pdf');
    await as.sales1.post(`/api/quotations/${q.id}/customer-approval`, { version: 2, approver_name: 'Ritu Sharma, GM', approved_on: box.env.today(), attachment_id: po.id });
    const order = await as.sales1.post(`/api/quotations/${q.id}/convert`, { procurement_owner_id: ids.proc1, due_date: box.env.addDays(25), customer_po_ref: 'SH/PO/2211', destinations: [{ label: 'Saffron Mumbai', address: '1 Marine Drive', city: 'Mumbai', pincode: '400020' }] });
    const o = await as.proc1.get(`/api/orders/${order.id}`);
    expect(o.order.stage).toBe('confirmed');
    expect(o.order.sales_owner_id).toBe(ids.sales1);
    expect(o.order.procurement_owner_id).toBe(ids.proc1);
    expect(o.quotation.version).toBe(2);
    expect(o.customer_approval.approver_name).toBe('Ritu Sharma, GM');
    expect(o.order.next_action).toMatch(/bill of materials/);
    expect(o.counts.files).toBe(1); // customer PO travelled with the order
    const contents = await as.proc1.get(`/api/orders/${order.id}/contents`);
    expect(contents.variants[0]).toMatchObject({ name: 'Staff box', qty: 150 });
    expect(contents.allocations[0].qty).toBe(150);
    const notes = await as.proc1.get('/api/notifications');
    expect(notes.rows.some((n: any) => n.kind === 'handoff' && n.link === `/orders/${order.id}`)).toBe(true);
    expect(db.prepare("SELECT COUNT(*) n FROM tasks WHERE kind='handoff' AND order_id=? AND owner_id=?").get(order.id, ids.proc1)).toEqual({ n: 1 });
    // Moving to procurement shows exactly what is missing (BOM).
    const miss = await expectApi(as.proc1.post(`/api/orders/${order.id}/advance`, { to: 'procurement' }), 422, 'blocked');
    expect(miss.error.details.missing[0]).toMatchObject({ code: 'bom', tab: 'contents' });
    // Converting twice is refused.
    await expectApi(as.sales1.post(`/api/quotations/${q.id}/convert`, { procurement_owner_id: ids.proc1, due_date: box.env.addDays(25), destinations: [{ label: 'x', address: 'y' }] }), 409);
  });
});
