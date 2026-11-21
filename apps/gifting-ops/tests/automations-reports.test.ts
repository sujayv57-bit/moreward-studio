import { describe, expect, it } from 'vitest';
import { runAutomations } from '../server/rules/automations.ts';
import { approvedVendor, buyEverything, confirmedOrder, readyForProcurement, relogin, useEnv } from './flows.ts';

const box = useEnv();

describe('Scenario 11 — overdue work and delivery risk notify the right person once', () => {
  it('creates follow-up and arrival notifications without duplicates', async () => {
    const { as, ids, ctx, clock, db } = box.env;
    const lead = await as.sales2.post('/api/leads', { company_name: 'Peak Motors', contact_name: 'Dev', source: 'Website', owner_id: ids.sales2, next_follow_up: box.env.addDays(1) });
    const vendor = await approvedVendor(box.env, 'Slow Supplier');
    const { orderId, number } = await confirmedOrder(box.env, { due: box.env.addDays(9) });
    await readyForProcurement(box.env, orderId);
    const poId = await buyEverything(box.env, orderId, vendor, box.env.addDays(2));
    const count = (uid: number, kind: string) => (db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND kind=?').get(uid, kind) as { n: number }).n;
    runAutomations(ctx);
    expect(count(ids.sales2, 'follow_up_due')).toBe(0);
    clock.addDays(3); // follow-up is now overdue, PO arrival has been missed
    await relogin(box.env);
    const first = runAutomations(ctx);
    expect(first.byRule.follow_up_due).toBeGreaterThanOrEqual(1);
    expect(count(ids.sales2, 'follow_up_due')).toBe(1);
    expect(count(ids.sales1, 'follow_up_due')).toBe(0); // only the owner
    for (const uid of [ids.proc1, ids.sales1]) expect(count(uid, 'arrival_missed')).toBe(1);
    expect(count(ids.proc1, 'delivery_risk')).toBe(1);
    const n = (await as.sales1.get('/api/notifications')).rows.find((x: any) => x.kind === 'arrival_missed');
    expect(n.body).toContain(number);
    // Re-running is idempotent.
    const again = runAutomations(ctx);
    expect(again.byRule.follow_up_due ?? 0).toBe(0);
    expect(again.byRule.arrival_missed ?? 0).toBe(0);
    expect(count(ids.sales2, 'follow_up_due')).toBe(1);
    expect(count(ids.proc1, 'arrival_missed')).toBe(1);
    // A new date that is also missed is a new situation → one new notice.
    await as.proc1.post(`/api/purchase-orders/${poId}/reschedule`, { new_date: box.env.addDays(1), reason: 'Truck breakdown' });
    clock.addDays(2); await relogin(box.env);
    runAutomations(ctx); runAutomations(ctx);
    expect(count(ids.proc1, 'arrival_missed')).toBe(2);
    // Notification history is visible and can be marked read.
    const list = await as.sales2.get('/api/notifications?filter=unread');
    expect(list.unread).toBeGreaterThan(0);
    await as.sales2.post('/api/notifications/read', { all: true });
    expect((await as.sales2.get('/api/notifications')).unread).toBe(0);
    expect((await as.sales2.get('/api/notifications')).total).toBeGreaterThan(0);
    void lead;
  });
});

describe('Scenario 12 — search, filters, pagination, exports and dashboard reflect real records', () => {
  it('returns only permitted records and accurate counts', async () => {
    const { as, ids, db } = box.env;
    await relogin(box.env);
    await as.sales1.post('/api/leads', { company_name: 'Zephyr Searchable Ltd', contact_name: 'Asha', source: 'Referral', owner_id: ids.sales1, confirm_duplicate: true });
    // Search is permission-aware.
    expect((await as.sales1.get('/api/search?q=Zephyr')).results.some((r: any) => r.type === 'Lead')).toBe(true);
    expect((await as.sales2.get('/api/search?q=Zephyr')).results).toEqual([]);
    expect((await as.salesManager.get('/api/search?q=Zephyr')).results.some((r: any) => r.type === 'Lead')).toBe(true);
    expect((await as.dispatch.get('/api/search?q=Zephyr')).results).toEqual([]);
    const vres = (await as.proc1.get('/api/search?q=Slow')).results;
    expect(vres.some((r: any) => r.type === 'Vendor')).toBe(true);
    expect(vres.some((r: any) => r.type === 'Purchase order')).toBe(false); // PO numbers, not vendor names
    const poNum = (db.prepare('SELECT number FROM purchase_orders LIMIT 1').get() as any).number;
    expect((await as.procManager.get(`/api/search?q=${poNum}`)).results[0]).toMatchObject({ type: 'Purchase order', title: poNum });
    expect((await as.sales1.get(`/api/search?q=${poNum}`)).results).toEqual([]);
    // Filters and pagination agree with the database.
    for (let i = 0; i < 3; i++) await confirmedOrder(box.env);
    const total = (db.prepare("SELECT COUNT(*) n FROM orders WHERE archived_at IS NULL").get() as any).n;
    const p1 = await as.founder.get('/api/orders?pageSize=5&page=1&sort=number');
    const p2 = await as.founder.get('/api/orders?pageSize=5&page=2&sort=number');
    expect(p1.total).toBe(total);
    expect(p1.rows).toHaveLength(Math.min(5, total));
    expect(new Set([...p1.rows, ...p2.rows].map((r: any) => r.id)).size).toBe(p1.rows.length + p2.rows.length);
    const confirmed = (db.prepare("SELECT COUNT(*) n FROM orders WHERE stage='confirmed' AND archived_at IS NULL").get() as any).n;
    expect((await as.founder.get('/api/orders?stage=confirmed')).total).toBe(confirmed);
    const mine = (db.prepare('SELECT COUNT(*) n FROM orders WHERE sales_owner_id=? OR procurement_owner_id=?').get(ids.sales2, ids.sales2) as any).n;
    expect((await as.sales2.get('/api/orders')).total).toBe(mine);
    const lateCount = (await as.founder.get('/api/orders?risk=late&pageSize=100')).rows.every((r: any) => r.risk.level === 'late');
    expect(lateCount).toBe(true);
    // Leads pagination + stage filter.
    const open = (db.prepare("SELECT COUNT(*) n FROM leads WHERE stage IN ('new','contacted','qualified') AND owner_id=?").get(ids.sales1) as any).n;
    expect((await as.sales1.get('/api/leads?stage=open')).total).toBe(open);
    // Dashboard numbers come from the same records.
    const home = await as.founder.get('/api/home');
    expect(home.management.by_stage.reduce((a: number, s: any) => a + s.count, 0)).toBe(total);
    expect(home.management.active_orders).toBe((db.prepare("SELECT COUNT(*) n FROM orders WHERE archived_at IS NULL AND stage NOT IN ('delivered','closed')").get() as any).n);
    const procHome = await as.procManager.get('/api/home');
    expect(procHome.summary.find((s: any) => s.key === 'po_unconfirmed').value).toBe((db.prepare("SELECT COUNT(*) n FROM purchase_orders WHERE status='issued'").get() as any).n);
    const myTasks = (db.prepare("SELECT COUNT(*) n FROM tasks WHERE owner_id=? AND status='open'").get(ids.proc1) as any).n;
    expect((await as.proc1.get('/api/home')).tasks).toHaveLength(Math.min(30, myTasks));
    // Exports: every export works for finance and is audited.
    const kinds = (await as.finance.get('/api/meta')).exports as string[];
    for (const k of kinds) {
      const r = await as.finance.raw('GET', `/api/exports/${k}`);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toContain('text/csv');
    }
    const payCsv = (await as.finance.raw('GET', '/api/exports/payables')).data as string;
    const pos = (db.prepare("SELECT COUNT(*) n FROM purchase_orders WHERE status NOT IN ('draft','pending_approval','cancelled')").get() as any).n;
    expect(payCsv.trim().split('\r\n')).toHaveLength(pos + 1);
    expect((db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='export'").get() as any).n).toBeGreaterThanOrEqual(kinds.length);
    // Reports.
    const pipe = await as.salesManager.get('/api/reports/pipeline');
    expect(pipe.leads_total).toBe((db.prepare('SELECT COUNT(*) n FROM leads').get() as any).n);
    const ord = await as.founder.get('/api/reports/orders');
    expect(ord.by_stage.reduce((a: number, s: any) => a + s.count, 0)).toBe(total);
    expect((await as.procManager.get('/api/reports/vendors')).rows[0]).toHaveProperty('method');
  });
});
