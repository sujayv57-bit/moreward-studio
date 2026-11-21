import { describe, expect, it } from 'vitest';
import { ApiError } from '../server/testkit.ts';
import { approvedVendor, buyEverything, confirmedOrder, readyForProcurement, useEnv } from './flows.ts';

const box = useEnv();
const expectApi = async (p: Promise<unknown>, status: number, code?: string) => {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(ApiError); expect((e as ApiError).status).toBe(status); if (code) expect((e as ApiError).body.error.code).toBe(code); return (e as ApiError).body; }
  throw new Error(`expected ${status}`);
};
const lineOf = async (poId: number) => (await box.env.as.proc1.get(`/api/purchase-orders/${poId}`)).lines[0];

describe('Scenario 6 — short delivery updates remaining quantities and delivery risk', () => {
  it('reconciles ordered/received/still-needed and propagates vendor delay to the customer date', async () => {
    const { as, ids } = box.env;
    const vendor = await approvedVendor(box.env, 'Tea Estates Direct');
    const { orderId } = await confirmedOrder(box.env, { lines: [{ description: 'Tea box', qty: 100, unit_price_paise: 90000 }], due: box.env.addDays(12) });
    await readyForProcurement(box.env, orderId, [{ component_name: 'Assam tea tin', qty_per_box: 1 }]);
    const poId = await buyEverything(box.env, orderId, vendor, box.env.addDays(5));
    let comp = (await as.proc1.get(`/api/orders/${orderId}/components`)).rows[0];
    expect(comp).toMatchObject({ required: 100, ordered: 100, received: 0, incoming: 100, still_needed: 100, uncovered: 0, state: 'incoming' });
    expect((await as.proc1.get(`/api/orders/${orderId}`)).risk.level).toBe('on_track');
    // Vendor delivers 60 of 100.
    const l = await lineOf(poId);
    await expectApi(as.packer1.post(`/api/purchase-orders/${poId}/receipts`, { received_on: box.env.today(), lines: [{ po_line_id: l.id, qty_received: 120 }] }), 400);
    await as.packer1.post(`/api/purchase-orders/${poId}/receipts`, { received_on: box.env.today(), lines: [{ po_line_id: l.id, qty_received: 60, discrepancy: 'Vendor short-shipped, 40 to follow' }] });
    expect((await lineOf(poId))).toMatchObject({ qty_received: 60, outstanding: 40, awaiting_qc: 60 });
    expect((await as.proc1.get(`/api/purchase-orders/${poId}`)).po.status).toBe('partially_received');
    comp = (await as.proc1.get(`/api/orders/${orderId}/components`)).rows[0];
    expect(comp).toMatchObject({ received: 60, awaiting_qc: 60, incoming: 40, still_needed: 100, uncovered: 0 });
    // The procurement owner is told about the partial delivery.
    expect((await as.proc1.get('/api/notifications')).rows.some((n: any) => n.kind === 'partial_receipt')).toBe(true);
    // Vendor pushes the remaining 40 out past the customer's due date → late, both owners notified with the impact.
    await as.proc1.post(`/api/purchase-orders/${poId}/reschedule`, { new_date: box.env.addDays(11), reason: 'Tins stuck at printer' });
    const o = await as.sales1.get(`/api/orders/${orderId}`);
    expect(o.risk.level).toBe('late');
    expect(o.risk.projected_delivery).toBe(box.env.addDays(14));
    expect(o.status.blocked).toBe(true);
    expect(o.status.next_action).toMatch(/vendor|backup/i);
    for (const who of ['sales1', 'proc1'] as const) {
      const n = (await as[who].get('/api/notifications')).rows.find((x: any) => x.kind === 'vendor_delay');
      expect(n.body).toContain(`Projected customer delivery ${box.env.addDays(14)}`);
    }
    // Delay is recorded for vendor performance.
    expect((await as.procManager.get('/api/reports/delays')).vendor_delays.some((d: any) => d.reason === 'Tins stuck at printer')).toBe(true);
    void ids;
  });
});

describe('Scenario 7 — failed quality check blocks packing and alerts the responsible people', () => {
  it('rejects goods, opens an issue, notifies owners and blocks packing', async () => {
    const { as, ids, db } = box.env;
    const vendor = await approvedVendor(box.env, 'Ceramic Mugs Co');
    const { orderId, number } = await confirmedOrder(box.env, { lines: [{ description: 'Mug box', qty: 40, unit_price_paise: 80000 }] });
    await as.procManager.post(`/api/orders/${orderId}/team`, { user_id: ids.packer1, duty: 'packing' });
    await readyForProcurement(box.env, orderId, [{ component_name: 'Branded mug', qty_per_box: 1 }]);
    const poId = await buyEverything(box.env, orderId, vendor, box.env.addDays(4));
    const l = await lineOf(poId);
    await as.packer1.post(`/api/purchase-orders/${poId}/receipts`, { received_on: box.env.today(), lines: [{ po_line_id: l.id, qty_received: 40 }] });
    await as.proc1.post(`/api/orders/${orderId}/advance`, { to: 'goods_received' });
    await as.proc1.post(`/api/orders/${orderId}/advance`, { to: 'quality_check' });
    // Dispatch staff cannot record quality checks.
    await expectApi(as.dispatch.post(`/api/po-lines/${l.id}/quality`, { qty_accepted: 40, qty_rejected: 0 }), 403);
    await expectApi(as.packer1.post(`/api/po-lines/${l.id}/quality`, { qty_accepted: 32, qty_rejected: 8 }), 400); // reason + action required
    const qc = await as.packer1.post(`/api/po-lines/${l.id}/quality`, { qty_accepted: 32, qty_rejected: 8, reason: 'Logo print smudged', action: 'replace' });
    expect(qc.outcome).toBe('partial');
    expect((await lineOf(poId))).toMatchObject({ qty_accepted: 32, qty_rejected: 8, outstanding: 8 }); // 8 replacements now owed
    const issue = db.prepare('SELECT * FROM issues WHERE id=?').get(qc.issue_id) as any;
    expect(issue).toMatchObject({ kind: 'quality', priority: 'high', owner_id: ids.proc1, order_id: orderId });
    for (const who of ['proc1', 'sales1', 'packer1'] as const) {
      expect((await as[who].get('/api/notifications')).rows.some((n: any) => n.kind === 'quality_failed' && n.title.includes(number))).toBe(true);
    }
    // Packing is blocked with the exact reasons.
    const b = await expectApi(as.proc1.post(`/api/orders/${orderId}/advance`, { to: 'packing' }), 422, 'blocked');
    expect(b.error.details.missing.map((m: any) => m.code)).toEqual(expect.arrayContaining(['components', 'issues']));
    await expectApi(as.packer1.post(`/api/orders/${orderId}/packing-batches`, { variant_id: (await as.packer1.get(`/api/orders/${orderId}/contents`)).variants[0].id, qty: 10 }), 422, 'blocked');
    const o = await as.founder.get(`/api/orders/${orderId}`);
    expect(o.status).toMatchObject({ blocked: true, source: 'issue', owner_id: ids.proc1 });
    // Replacements arrive and pass; issue resolved; packing can start.
    await as.packer1.post(`/api/purchase-orders/${poId}/receipts`, { received_on: box.env.today(), lines: [{ po_line_id: l.id, qty_received: 8 }] });
    await as.packer1.post(`/api/po-lines/${l.id}/quality`, { qty_accepted: 8, qty_rejected: 0 });
    await expectApi(as.proc1.patch(`/api/issues/${issue.id}`, { status: 'resolved' }), 400);
    await as.proc1.patch(`/api/issues/${issue.id}`, { status: 'resolved', resolution: 'Vendor replaced 8 mugs' });
    await as.proc1.post(`/api/orders/${orderId}/advance`, { to: 'packing' });
    expect((await as.proc1.get(`/api/purchase-orders/${poId}`)).po.status).toBe('received');
  });
});

describe('Scenario 8 — two shipments to two destinations; delivered only when both are complete', () => {
  it('packs, checks and ships partially without completing the order early', async () => {
    const { as } = box.env;
    const vendor = await approvedVendor(box.env, 'Hamper Supplies');
    const { orderId } = await confirmedOrder(box.env, {
      lines: [{ description: 'Gourmet hamper', qty: 50, unit_price_paise: 300000 }],
      destinations: [{ label: 'Bengaluru office', address: '12 MG Road', city: 'Bengaluru', pincode: '560001' }, { label: 'Pune office', address: '7 FC Road', city: 'Pune', pincode: '411004' }],
    });
    const variants = await readyForProcurement(box.env, orderId, [{ component_name: 'Hamper basket', qty_per_box: 1 }, { component_name: 'Chocolate bar', qty_per_box: 2 }]).catch(async (e) => {
      // Two destinations: allocations must be set before procurement.
      expect(e.body.error.details.missing.some((m: any) => m.code === 'alloc')).toBe(true);
      const c = await as.proc1.get(`/api/orders/${orderId}/contents`);
      await expectApi(as.proc1.put(`/api/orders/${orderId}/allocations`, { rows: [{ variant_id: c.variants[0].id, destination_id: c.destinations[0].id, qty: 40 }, { variant_id: c.variants[0].id, destination_id: c.destinations[1].id, qty: 20 }] }), 400);
      await as.proc1.put(`/api/orders/${orderId}/allocations`, { rows: [{ variant_id: c.variants[0].id, destination_id: c.destinations[0].id, qty: 30 }, { variant_id: c.variants[0].id, destination_id: c.destinations[1].id, qty: 20 }] });
      await as.proc1.post(`/api/orders/${orderId}/advance`, { to: 'procurement' });
      return c.variants;
    });
    const poId = await buyEverything(box.env, orderId, vendor, box.env.addDays(3));
    const lines = (await as.proc1.get(`/api/purchase-orders/${poId}`)).lines;
    await as.packer1.post(`/api/purchase-orders/${poId}/receipts`, { received_on: box.env.today(), lines: lines.map((l: any) => ({ po_line_id: l.id, qty_received: l.qty_ordered })) });
    for (const l of lines) await as.packer1.post(`/api/po-lines/${l.id}/quality`, { qty_accepted: l.qty_ordered, qty_rejected: 0 });
    for (const to of ['goods_received', 'quality_check', 'packing']) await as.proc1.post(`/api/orders/${orderId}/advance`, { to });
    const vid = variants[0].id;
    // Batch 1: 30 boxes. The checklist comes from the BOM (basket ×30, chocolate ×60) plus template steps.
    const b1 = await as.packer1.post(`/api/orders/${orderId}/packing-batches`, { variant_id: vid, qty: 30 });
    let pk = await as.packer1.get(`/api/orders/${orderId}/packing`);
    const batch1 = pk.batches.find((b: any) => b.id === b1.id);
    expect(batch1.items.some((i: any) => i.label.startsWith('Chocolate bar') && i.required_qty === 60)).toBe(true);
    await expectApi(as.packer1.post(`/api/packing-batches/${b1.id}/packed`), 422, 'blocked'); // checklist not ticked
    for (const it of batch1.items) await as.packer1.post(`/api/checklist-items/${it.id}/toggle`, { done: true });
    await as.packer1.post(`/api/packing-batches/${b1.id}/packed`);
    await expectApi(as.packer1.post(`/api/packing-batches/${b1.id}/check`, { result: 'pass' }), 403); // packer cannot check own batch
    await as.packer2.post(`/api/packing-batches/${b1.id}/check`, { result: 'pass' });
    // Cannot pack more than ordered.
    await expectApi(as.packer1.post(`/api/orders/${orderId}/packing-batches`, { variant_id: vid, qty: 21 }), 400);
    // Ship 30 to Bengaluru. Shipping more than is checked, or more than is allocated there, is refused.
    let sh = await as.dispatch.get(`/api/orders/${orderId}/shipments`);
    const [blr, pune] = sh.destinations;
    await expectApi(as.dispatch.post(`/api/orders/${orderId}/shipments`, { destination_id: pune.id, items: [{ variant_id: vid, qty: 21 }] }), 400);
    const s1 = await as.dispatch.post(`/api/orders/${orderId}/shipments`, { destination_id: blr.id, items: [{ variant_id: vid, qty: 30 }] });
    await expectApi(as.dispatch.post(`/api/orders/${orderId}/shipments`, { destination_id: pune.id, items: [{ variant_id: vid, qty: 1 }] }), 400); // nothing checked left
    await as.dispatch.post(`/api/shipments/${s1.id}/dispatch`, { courier: 'BlueDart', tracking_no: 'BD123456', dispatched_on: box.env.today(), expected_on: box.env.addDays(2) });
    expect((await as.dispatch.get(`/api/orders/${orderId}`)).order.stage).toBe('dispatch');
    // Batch 2: remaining 20, then ship to Pune.
    const b2 = await as.packer1.post(`/api/orders/${orderId}/packing-batches`, { variant_id: vid, qty: 20 });
    pk = await as.packer1.get(`/api/orders/${orderId}/packing`);
    for (const it of pk.batches.find((b: any) => b.id === b2.id).items) await as.packer1.post(`/api/checklist-items/${it.id}/toggle`, { done: true });
    await as.packer1.post(`/api/packing-batches/${b2.id}/packed`);
    await as.proc2.post(`/api/packing-batches/${b2.id}/check`, { result: 'pass' });
    const s2 = await as.dispatch.post(`/api/orders/${orderId}/shipments`, { destination_id: pune.id, items: [{ variant_id: vid, qty: 20 }] });
    await as.dispatch.post(`/api/shipments/${s2.id}/dispatch`, { courier: 'Delhivery', tracking_no: 'DL998877', dispatched_on: box.env.today(), expected_on: box.env.addDays(3) });
    // First delivery: order is NOT delivered.
    await expectApi(as.dispatch.post(`/api/shipments/${s1.id}/deliver`, { delivered_on: box.env.today() }), 400); // needs receiver or POD
    const d1 = await as.dispatch.post(`/api/shipments/${s1.id}/deliver`, { delivered_on: box.env.today(), received_by_name: 'Reception, Bengaluru' });
    expect(d1.order_delivered).toBe(false);
    expect(d1.remaining[0]).toContain('30 of 50');
    expect((await as.dispatch.get(`/api/orders/${orderId}`)).order.stage).toBe('dispatch');
    await expectApi(as.dispatch.post(`/api/orders/${orderId}/advance`, { to: 'delivered' }), 422, 'blocked');
    // Manual tracking update (no courier integration configured).
    await as.dispatch.post(`/api/shipments/${s2.id}/tracking`, { status: 'in_transit', note: 'At Pune hub' });
    const d2 = await as.dispatch.post(`/api/shipments/${s2.id}/deliver`, { delivered_on: box.env.today(), received_by_name: 'Admin desk, Pune' });
    expect(d2.order_delivered).toBe(true);
    expect((await as.sales1.get(`/api/orders/${orderId}`)).order.stage).toBe('delivered');
    sh = await as.dispatch.get(`/api/orders/${orderId}/shipments`);
    expect(sh.courier_integration).toBe(false);
  });
});
