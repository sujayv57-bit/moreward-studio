/**
 * DEMO WORKSPACE — fictional companies, people and vendors for local review only.
 * The data is created by driving the real API with a moving clock, so every record passed the same
 * business rules as in daily use. Never run this against a production database.
 */
import type { DB } from './db.ts';
import { seedBase, DEMO_USERS, type UserKey } from './seed-base.ts';
import { client, makeClock, tinyPdf, type Client } from './testkit.ts';
import { createApp } from './app.ts';
import type { Ctx } from './context.ts';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const P = (rupees: number) => Math.round(rupees * 100);

export async function seedDemo(db: DB, uploadsDir: string) {
  if ((db.prepare('SELECT COUNT(*) n FROM orders').get() as { n: number }).n > 0) throw new Error('Database already has orders; run db:reset first.');
  const real = new Date();
  const clock = makeClock(new Date(real.getTime() - 40 * 86400000).toISOString());
  const ctx: Ctx = { db, now: () => clock.now, uploadsDir, maxUploadBytes: 10 * 1024 * 1024, production: false, providers: { email: false, whatsapp: false, courier: false, payments: false, accounting: false } };
  const ids = seedBase(db, clock.now);
  const app = createApp(ctx);
  const server: Server = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const as = {} as Record<UserKey, Client>;
  const login = async () => { for (const u of DEMO_USERS) { as[u.key] ??= client(base); await as[u.key].login(u.email); } };
  const day = (n: number) => { const d = new Date(clock.now); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const advance = async (n: number) => { clock.addDays(n); await login(); };
  await login();

  try {
    // ------------------------------------------------------------ vendors
    const vendor = async (o: { name: string; legal: string; city: string; cats: string[]; lead: number; gst: string; pan: string; phone: string; status: 'approved' | 'active' | 'under_review' | 'documents_pending' | 'draft' | 'suspended'; moq?: number; cap?: number }) => {
      const v = await as.proc1.post('/api/vendors', { legal_name: o.legal, display_name: o.name, phone: o.phone, email: `orders@${o.name.toLowerCase().replace(/[^a-z]/g, '')}.example`, address: `Unit ${o.phone.slice(-2)}, Industrial Estate`, city: o.city, serviceable_locations: 'Pan-India via courier', categories: o.cats, capabilities: 'Bulk supply, custom branding on request', lead_time_days: o.lead, moq: o.moq ?? 50, capacity_per_week: o.cap ?? 1000, payment_terms: '30% advance, balance in 15 days', sample_available: true, preferred_comm: 'WhatsApp', gst_number: o.gst, pan_number: o.pan, onboarding_owner_id: ids.proc1, onboarding_due: day(o.status === 'documents_pending' ? -3 : 7), confirm_duplicate: true });
      if (o.status === 'draft') return v.id as number;
      await as.proc1.post(`/api/vendors/${v.id}/contacts`, { name: `${o.name.split(' ')[0]} Sales Desk`, phone: o.phone, email: `sales@${o.name.toLowerCase().replace(/[^a-z]/g, '')}.example`, role: 'Owner', is_primary: true });
      const docs = o.status === 'documents_pending' ? ['PAN card'] : ['GST certificate', 'PAN card', 'Cancelled cheque'];
      for (const kind of docs) {
        const f = await as.proc1.upload('vendor', v.id, `${kind} - ${o.name}.pdf`, tinyPdf, 'application/pdf');
        await as.proc1.post(`/api/vendors/${v.id}/documents`, { kind, attachment_id: f.id, reference: kind === 'GST certificate' ? o.gst : kind === 'PAN card' ? o.pan : null, expires_on: kind === 'GST certificate' ? day(o.name.startsWith('Mudra') ? 60 : 400) : null });
      }
      if (o.status === 'documents_pending') { await as.proc1.post(`/api/vendors/${v.id}/transition`, { to: 'documents_pending' }); return v.id as number; }
      await as.finance.put(`/api/vendors/${v.id}/bank`, { account_name: o.legal, account_number: `5010${o.phone.slice(-8)}`, ifsc: 'HDFC0001234', bank_name: 'HDFC Bank' });
      await as.proc1.post(`/api/vendors/${v.id}/transition`, { to: 'under_review' });
      if (o.status === 'under_review') return v.id as number;
      const d = await as.finance.get(`/api/vendors/${v.id}`);
      for (const doc of d.documents) await as.finance.post(`/api/vendor-documents/${doc.id}/verify`);
      await as.founder.post(`/api/vendors/${v.id}/bank/verify`, { method: 'Called vendor on GST-registered number; matched cancelled cheque' });
      await as.procManager.post(`/api/vendors/${v.id}/transition`, { to: 'approved' });
      if (o.status === 'active' || o.status === 'suspended') await as.procManager.post(`/api/vendors/${v.id}/transition`, { to: 'active' });
      if (o.status === 'suspended') {
        await as.packer1.post(`/api/vendors/${v.id}/events`, { kind: 'quality_incident', summary: 'Power banks arrived with dented casings (12 of 40)' });
        await as.procManager.post(`/api/vendors/${v.id}/transition`, { to: 'suspended', reason: 'Repeated damaged deliveries; review after root-cause report' });
      }
      return v.id as number;
    };
    const vKaju = await vendor({ name: 'Kaju Kraft Foods', legal: 'Kaju Kraft Foods Private Limited', city: 'Mangaluru', cats: ['Dry fruits & nuts', 'Gourmet & hampers'], lead: 6, gst: '29AAKCK1234A1Z5', pan: 'AAKCK1234A', phone: '9845011201', status: 'active' });
    const vTea = await vendor({ name: 'Assam Leaf Tea Co', legal: 'Assam Leaf Tea Company LLP', city: 'Guwahati', cats: ['Tea & coffee'], lead: 9, gst: '18AAJFA5678B1Z2', pan: 'AAJFA5678B', phone: '9435022302', status: 'approved' });
    const vPack = await vendor({ name: 'Mudra Packaging', legal: 'Mudra Packaging Works', city: 'Bengaluru', cats: ['Packaging', 'Printing & branding'], lead: 5, gst: '29ABMPM9012C1Z8', pan: 'ABMPM9012C', phone: '9886033403', status: 'active', cap: 3000 });
    const vClay = await vendor({ name: 'Clay & Kiln Studio', legal: 'Clay and Kiln Studio Private Limited', city: 'Jaipur', cats: ['Drinkware', 'Home décor'], lead: 12, gst: '08AAFCC3456D1Z1', pan: 'AAFCC3456D', phone: '9414044504', status: 'approved', cap: 400 });
    await vendor({ name: 'Inkpot Print House', legal: 'Inkpot Print House', city: 'Chennai', cats: ['Printing & branding', 'Stationery'], lead: 4, gst: '33AAGPI7890E1Z4', pan: 'AAGPI7890E', phone: '9444055605', status: 'under_review' });
    await vendor({ name: 'Silver Thread Apparel', legal: 'Silver Thread Apparel Pvt Ltd', city: 'Tiruppur', cats: ['Apparel'], lead: 14, gst: '33AAHCS2345F1Z6', pan: 'AAHCS2345F', phone: '9443066706', status: 'documents_pending' });
    const vGadget = await vendor({ name: 'Brightway Gadgets', legal: 'Brightway Gadgets India Pvt Ltd', city: 'Noida', cats: ['Tech accessories'], lead: 7, gst: '09AAICB6789G1Z3', pan: 'AAICB6789G', phone: '9810077807', status: 'suspended' });
    await vendor({ name: 'Sweet Route Mithai', legal: 'Sweet Route', city: 'Lucknow', cats: ['Sweets & confectionery'], lead: 3, gst: '09ABQPS1122H1Z9', pan: 'ABQPS1122H', phone: '9839088908', status: 'draft' });
    void vGadget;

    // ------------------------------------------------------------ sales helper: lead → order
    let n = 0;
    const win = async (o: { company: string; contact: string; email: string; phone: string; owner: UserKey; source: string; occasion: string; lines: { description: string; qty: number; price: number; cost: number; customisation?: string }[]; due: number; destinations: { label: string; address: string; city: string; pincode: string }[]; proc: UserKey; shipping?: number }) => {
      n++;
      const qty = o.lines.reduce((a, l) => a + l.qty, 0);
      const lead = await as[o.owner].post('/api/leads', { company_name: o.company, contact_name: o.contact, phone: o.phone, email: o.email, source: o.source, occasion: o.occasion, approx_qty: qty, budget_paise: P(o.lines.reduce((a, l) => a + l.qty * l.price, 0)), required_by: day(o.due), locations: o.destinations.map((d) => d.city).join(', '), owner_id: ids[o.owner], confirm_duplicate: true });
      await as[o.owner].post(`/api/leads/${lead.id}/activities`, { kind: 'call', summary: `Intro call with ${o.contact}: ${qty} boxes for ${o.occasion}`, outcome: 'Interested; send options' });
      await as[o.owner].post(`/api/leads/${lead.id}/activities`, { kind: 'meeting', summary: 'Shared sample box and catalogue at their office', outcome: 'Shortlisted contents' });
      await as[o.owner].post(`/api/leads/${lead.id}/qualify`);
      const { opportunity_id: opp } = await as[o.owner].post(`/api/leads/${lead.id}/convert`);
      await as[o.owner].patch(`/api/opportunities/${opp}`, { requirements: { occasion: o.occasion, recipients: qty, budget_per_box_paise: P(o.lines[0].price), gift_theme: 'Premium, eco-friendly', customisation: o.lines.find((l) => l.customisation)?.customisation ?? null, branding: 'Logo on sleeve and greeting card', packaging: 'Rigid box with magnetic lid', delivery_locations: o.destinations.map((d) => d.city).join(', '), delivery_by: day(o.due), notes: 'No alcohol. Include a personalised card from the CEO.' } });
      await as[o.owner].post(`/api/opportunities/${opp}/feasibility`, { assigned_to: ids[o.proc], notes: `${qty} boxes by ${day(o.due)}` });
      const f = (await as[o.proc].get('/api/feasibility')).rows.find((x: { opportunity_id: number }) => x.opportunity_id === opp);
      await as[o.proc].post(`/api/feasibility/${f.id}/complete`, { result: 'feasible', earliest_delivery: day(Math.min(o.due - 2, 14)), est_cost_paise: P(o.lines.reduce((a, l) => a + l.qty * l.cost, 0)), notes: 'Components available with approved vendors; packaging 5 days.' });
      const q = await as[o.owner].post(`/api/opportunities/${opp}/quotations`, { lines: o.lines.map((l) => ({ description: l.description, qty: l.qty, unit_price_paise: P(l.price), customisation: l.customisation ?? null, category: 'Gourmet & hampers' })), shipping_paise: P(o.shipping ?? 0), tax_bp: 1800, tax_name: 'GST 18%', validity_date: day(15), delivery_date: day(o.due), notes: 'Prices include custom sleeve printing.' });
      const qd = await as[o.owner].get(`/api/quotations/${q.id}`);
      await as[o.proc].put(`/api/quotations/${q.id}/costs`, { lines: qd.versions[0].lines.map((l: { id: number; description: string }) => ({ id: l.id, unit_cost_paise: P(o.lines.find((x) => x.description === l.description)!.cost) })) });
      await as[o.owner].post(`/api/quotations/${q.id}/submit`);
      await as[o.owner].post(`/api/quotations/${q.id}/send`);
      await advance(2);
      await as[o.owner].post(`/api/quotations/${q.id}/customer-approval`, { version: 1, approver_name: o.contact, approved_on: day(0), reference: `Email from ${o.contact} approving ${q.number}` });
      const ord = await as[o.owner].post(`/api/quotations/${q.id}/convert`, { procurement_owner_id: ids[o.proc], due_date: day(o.due - 2), customer_po_ref: `PO/${o.company.split(' ')[0].toUpperCase()}/${2600 + n}`, destinations: o.destinations });
      return ord.id as number;
    };
    const contents = (id: number) => as.procManager.get(`/api/orders/${id}/contents`);
    const bom = async (orderId: number, by: Record<string, { component_name: string; qty_per_box: number; category: string; is_packaging?: boolean; is_critical?: boolean; lead_time_days?: number; est_unit_cost_paise?: number }[]>) => {
      for (const v of (await contents(orderId)).variants) for (const b of by[v.name] ?? []) await as.procManager.post(`/api/variants/${v.id}/bom`, { ...b, unit: 'pc' });
    };
    const allocate = async (orderId: number, split: Record<string, number[]>) => {
      const c = await contents(orderId);
      await as.procManager.put(`/api/orders/${orderId}/allocations`, { rows: c.variants.flatMap((v: { id: number; name: string }) => (split[v.name] ?? []).map((qty, i) => ({ variant_id: v.id, destination_id: c.destinations[i].id, qty }))) });
    };
    const buy = async (orderId: number, vendorId: number, components: string[], price: number, promised: number, by: UserKey = 'procManager') => {
      const comps = (await as.procManager.get(`/api/orders/${orderId}/components`)).rows.filter((c: { component_name: string }) => components.includes(c.component_name));
      const po = await as[by].post('/api/purchase-orders', { order_id: orderId, vendor_id: vendorId, promised_date: day(promised), shipping_paise: P(1500), advance_required_paise: 0, lines: comps.map((c: { id: number; component_name: string; required: number }) => ({ bom_item_id: c.id, description: c.component_name, qty_ordered: c.required, unit_price_paise: P(price), tax_bp: 1200 })) });
      await as[by].post(`/api/purchase-orders/${po.id}/issue`);
      return po.id as number;
    };
    const receiveAll = async (poId: number, frac = 1, qc: 'pass' | { reject: number; reason: string } | null = 'pass') => {
      const lines = (await as.procManager.get(`/api/purchase-orders/${poId}`)).lines;
      await as.packer1.post(`/api/purchase-orders/${poId}/receipts`, { received_on: day(0), lines: lines.map((l: { id: number; qty_ordered: number }) => ({ po_line_id: l.id, qty_received: Math.floor(l.qty_ordered * frac) })), notes: frac < 1 ? 'Partial delivery; balance promised next week' : null });
      if (!qc) return;
      for (const l of lines) {
        const got = Math.floor(l.qty_ordered * frac);
        if (qc === 'pass') await as.packer2.post(`/api/po-lines/${l.id}/quality`, { qty_accepted: got, qty_rejected: 0 });
        else await as.packer2.post(`/api/po-lines/${l.id}/quality`, { qty_accepted: got - qc.reject, qty_rejected: qc.reject, reason: qc.reason, action: 'replace' });
      }
    };

    // ------------------------------------------------------------ Order C: delivered in two shipments, balance overdue
    const oC = await win({ company: 'Saffron Hotels', contact: 'Ritu Sharma', email: 'ritu.sharma@saffronhotels.example', phone: '9820012345', owner: 'sales1', source: 'Founder network', occasion: 'Guest welcome kits', due: 16, proc: 'proc1', shipping: 3000,
      lines: [{ description: 'Welcome tea box', qty: 60, price: 1450, cost: 880, customisation: 'Hotel crest on lid' }],
      destinations: [{ label: 'Saffron Mumbai', address: '1 Marine Drive', city: 'Mumbai', pincode: '400020' }, { label: 'Saffron Goa', address: 'Candolim Beach Road', city: 'Goa', pincode: '403515' }] });
    await bom(oC, { 'Welcome tea box': [{ component_name: 'Assam tea tin 100g', qty_per_box: 2, category: 'Tea & coffee', is_critical: true }, { component_name: 'Rigid box with crest', qty_per_box: 1, category: 'Packaging', is_packaging: true }] });
    await allocate(oC, { 'Welcome tea box': [40, 20] });
    const artC = await as.sales1.upload('order', oC, 'saffron-crest-v1.pdf', tinyPdf, 'application/pdf', { kind: 'artwork' });
    const aw = await as.sales1.post(`/api/orders/${oC}/artworks`, { attachment_id: artC.id, notes: 'Gold foil crest' });
    await as.sales1.post(`/api/artworks/${aw.id}/decision`, { decision: 'approved', approved_by_name: 'Ritu Sharma', approved_on: day(0) });
    await as.proc1.post(`/api/orders/${oC}/advance`, { to: 'procurement' });
    const poC1 = await buy(oC, vTea, ['Assam tea tin 100g'], 160, 6);
    const poC2 = await buy(oC, vPack, ['Rigid box with crest'], 210, 5);
    await as.finance.post(`/api/orders/${oC}/payments`, { kind: 'advance', amount_paise: P(40000), received_on: day(0), reference: 'NEFT SAFF0042' });
    await advance(5);
    await receiveAll(poC2); await advance(1); await receiveAll(poC1);
    for (const to of ['goods_received', 'quality_check', 'packing']) await as.proc1.post(`/api/orders/${oC}/advance`, { to });
    const vC = (await contents(oC)).variants[0].id;
    const packBatch = async (orderId: number, variantId: number, qty: number, packer: UserKey, checker: UserKey | null) => {
      const b = await as[packer].post(`/api/orders/${orderId}/packing-batches`, { variant_id: variantId, qty });
      const pk = await as[packer].get(`/api/orders/${orderId}/packing`);
      for (const it of pk.batches.find((x: { id: number }) => x.id === b.id).items) await as[packer].post(`/api/checklist-items/${it.id}/toggle`, { done: true });
      await as[packer].post(`/api/packing-batches/${b.id}/packed`);
      if (checker) await as[checker].post(`/api/packing-batches/${b.id}/check`, { result: 'pass' });
      return b.id as number;
    };
    await packBatch(oC, vC, 60, 'packer1', 'packer2');
    const shC = (await as.dispatch.get(`/api/orders/${oC}/shipments`)).destinations;
    const s1 = await as.dispatch.post(`/api/orders/${oC}/shipments`, { destination_id: shC[0].id, items: [{ variant_id: vC, qty: 40 }] });
    const s2 = await as.dispatch.post(`/api/orders/${oC}/shipments`, { destination_id: shC[1].id, items: [{ variant_id: vC, qty: 20 }] });
    await as.dispatch.post(`/api/shipments/${s1.id}/dispatch`, { courier: 'BlueDart', tracking_no: 'BD40021876', dispatched_on: day(0), expected_on: day(2) });
    await as.dispatch.post(`/api/shipments/${s2.id}/dispatch`, { courier: 'Delhivery', tracking_no: 'DLV7781203', dispatched_on: day(0), expected_on: day(3) });
    await advance(2);
    await as.dispatch.post(`/api/shipments/${s1.id}/deliver`, { delivered_on: day(0), received_by_name: 'Front office, Saffron Mumbai' });
    await advance(1);
    await as.dispatch.post(`/api/shipments/${s2.id}/tracking`, { status: 'in_transit', note: 'Out for delivery, Candolim' });
    await as.dispatch.post(`/api/shipments/${s2.id}/deliver`, { delivered_on: day(0), received_by_name: 'Security desk, Saffron Goa' });
    await as.finance.post(`/api/orders/${oC}/invoices`, { number: 'INV/26-27/0412', amount_paise: (await as.finance.get(`/api/orders/${oC}/payments`)).finance.total_paise, issued_on: day(0), due_on: day(10) });
    await as.finance.post(`/api/purchase-orders/${poC1}/payments`, { kind: 'balance', amount_paise: (await as.finance.get(`/api/purchase-orders/${poC1}`)).totals.balance_paise, paid_on: day(0), reference: 'IMPS ALT-5521' });

    // ------------------------------------------------------------ Order E: packing in progress
    await advance(2);
    const oE = await win({ company: 'Tidewater Finance', contact: 'Arjun Menon', email: 'arjun.menon@tidewater.example', phone: '9846012345', owner: 'sales2', source: 'Referral', occasion: 'Client year-end gifts', due: 14, proc: 'proc1',
      lines: [{ description: 'Executive desk set', qty: 40, price: 2400, cost: 1500, customisation: 'Name engraving' }],
      destinations: [{ label: 'Tidewater Kochi HQ', address: 'Marine Drive, Ernakulam', city: 'Kochi', pincode: '682031' }] });
    await bom(oE, { 'Executive desk set': [{ component_name: 'Ceramic mug (engraved)', qty_per_box: 1, category: 'Drinkware' }, { component_name: 'Premium cashews 150g', qty_per_box: 1, category: 'Dry fruits & nuts' }, { component_name: 'Kraft gift box', qty_per_box: 1, category: 'Packaging', is_packaging: true }] });
    const artE = await as.sales2.upload('order', oE, 'tidewater-engraving-list.pdf', tinyPdf, 'application/pdf', { kind: 'artwork' });
    const awE = await as.sales2.post(`/api/orders/${oE}/artworks`, { attachment_id: artE.id, notes: 'Engraving names list v1' });
    await as.sales2.post(`/api/artworks/${awE.id}/decision`, { decision: 'approved', approved_by_name: 'Arjun Menon', approved_on: day(0) });
    await as.proc1.post(`/api/orders/${oE}/advance`, { to: 'procurement' });
    const poE1 = await buy(oE, vClay, ['Ceramic mug (engraved)'], 420, 4);
    const poE2 = await buy(oE, vKaju, ['Premium cashews 150g'], 310, 3);
    const poE3 = await buy(oE, vPack, ['Kraft gift box'], 95, 3);
    await as.finance.post(`/api/orders/${oE}/payments`, { kind: 'advance', amount_paise: P(50000), received_on: day(0), reference: 'RTGS TDW-118' });
    await advance(4);
    for (const p of [poE1, poE2, poE3]) await receiveAll(p);
    for (const to of ['goods_received', 'quality_check', 'packing']) await as.proc1.post(`/api/orders/${oE}/advance`, { to });
    await as.procManager.post(`/api/orders/${oE}/team`, { user_id: ids.packer1, duty: 'packing' });
    const vE = (await contents(oE)).variants[0].id;
    await packBatch(oE, vE, 25, 'packer1', 'proc2');
    await packBatch(oE, vE, 10, 'packer1', null); // packed, waiting for a checker

    // ------------------------------------------------------------ Order B: QC failure blocks packing
    await advance(3);
    const oB = await win({ company: 'Banyan Health Labs', contact: 'Dr. Kavita Rao', email: 'kavita.rao@banyanhealth.example', phone: '9900112233', owner: 'sales2', source: 'Website', occasion: 'Year-end wellness hampers', due: 16, proc: 'proc2',
      lines: [{ description: 'Wellness hamper', qty: 80, price: 1850, cost: 1150 }],
      destinations: [{ label: 'Banyan Bengaluru', address: '22 Whitefield Main Road', city: 'Bengaluru', pincode: '560066' }] });
    await bom(oB, { 'Wellness hamper': [{ component_name: 'Green tea sampler', qty_per_box: 1, category: 'Tea & coffee' }, { component_name: 'Trail mix jar', qty_per_box: 2, category: 'Dry fruits & nuts', is_critical: true }, { component_name: 'Jute hamper basket', qty_per_box: 1, category: 'Packaging', is_packaging: true }] });
    await as.proc2.post(`/api/orders/${oB}/advance`, { to: 'procurement' });
    const poB1 = await buy(oB, vTea, ['Green tea sampler'], 140, 4);
    const poB2 = await buy(oB, vKaju, ['Trail mix jar'], 180, 4);
    const poB3 = await buy(oB, vPack, ['Jute hamper basket'], 260, 4);
    await advance(4);
    await receiveAll(poB1); await receiveAll(poB3);
    await receiveAll(poB2, 1, { reject: 24, reason: 'Jar lids cracked in transit; contents exposed' });
    await as.proc2.post(`/api/purchase-orders/${poB2}/reschedule`, { new_date: day(5), reason: 'Replacement jars being repacked with better cushioning' });

    // ------------------------------------------------------------ Order A: two variants, two cities, vendor late
    await advance(2);
    const oA = await win({ company: 'Kestrel Analytics', contact: 'Nisha Rao', email: 'nisha.rao@kestrel.example', phone: '9845098450', owner: 'sales1', source: 'Founder network', occasion: 'Diwali employee gifting', due: 18, proc: 'proc1', shipping: 6000,
      lines: [{ description: 'Premium Diwali box', qty: 50, price: 2600, cost: 1650, customisation: 'Logo sleeve + CEO card' }, { description: 'Classic Diwali box', qty: 150, price: 1350, cost: 820, customisation: 'Logo sleeve' }],
      destinations: [{ label: 'Kestrel Bengaluru', address: '5th Floor, Embassy Tech Village', city: 'Bengaluru', pincode: '560103' }, { label: 'Kestrel Hyderabad', address: 'Hitec City Phase 2', city: 'Hyderabad', pincode: '500081' }] });
    await bom(oA, {
      'Premium Diwali box': [{ component_name: 'Premium dry fruit tray', qty_per_box: 1, category: 'Dry fruits & nuts', is_critical: true }, { component_name: 'Hand-painted diya pair', qty_per_box: 1, category: 'Home décor', lead_time_days: 12 }, { component_name: 'Rigid box with logo sleeve', qty_per_box: 1, category: 'Packaging', is_packaging: true }],
      'Classic Diwali box': [{ component_name: 'Dry fruit pouch 200g', qty_per_box: 1, category: 'Dry fruits & nuts' }, { component_name: 'Ceramic mug', qty_per_box: 1, category: 'Drinkware', lead_time_days: 12 }, { component_name: 'Kraft box with logo sleeve', qty_per_box: 1, category: 'Packaging', is_packaging: true }],
    });
    await allocate(oA, { 'Premium Diwali box': [30, 20], 'Classic Diwali box': [100, 50] });
    const artA = await as.sales1.upload('order', oA, 'kestrel-sleeve-v1.pdf', tinyPdf, 'application/pdf', { kind: 'artwork' });
    await as.sales1.post(`/api/orders/${oA}/artworks`, { attachment_id: artA.id, notes: 'Sleeve artwork sent to Nisha for sign-off' });
    await as.proc1.post(`/api/orders/${oA}/advance`, { to: 'procurement' });
    // RFQ for the critical tray with a comparison and a backup vendor.
    const comps = (await as.proc1.get(`/api/orders/${oA}/components`)).rows;
    const tray = comps.find((c: { component_name: string }) => c.component_name === 'Premium dry fruit tray');
    const rfq = await as.proc1.post('/api/rfqs', { order_id: oA, bom_item_id: tray.id, title: 'Premium dry fruit tray (4 compartments)', qty: tray.required, needed_by: day(12), is_critical: true, vendor_ids: [vKaju, vPack], response_due: day(2) });
    const rq = (await as.proc1.get(`/api/rfqs/${rfq.id}`)).quotes;
    await as.proc1.put(`/api/vendor-quotes/${rq[0].id}`, { unit_price_paise: P(690), tax_bp: 500, shipping_paise: P(1200), lead_time_days: 6, valid_until: day(10), moq: 25, availability: 'In stock' });
    await as.proc1.put(`/api/vendor-quotes/${rq[1].id}`, { unit_price_paise: P(640), tax_bp: 500, shipping_paise: P(4500), lead_time_days: 10, valid_until: day(10), availability: 'Made to order' });
    await as.proc1.post(`/api/rfqs/${rfq.id}/award`, { quote_id: rq[0].id, reason: 'Lower landed cost, in stock, 6-day lead time', backup_quote_id: rq[1].id });
    const poA1 = await as.proc1.post(`/api/rfqs/${rfq.id}/create-po`, {});
    await as.proc1.post(`/api/purchase-orders/${poA1.id}/issue`);
    const poA2 = await buy(oA, vKaju, ['Dry fruit pouch 200g'], 240, 6);
    const poA3 = await buy(oA, vClay, ['Ceramic mug', 'Hand-painted diya pair'], 260, 4);
    await buy(oA, vPack, ['Rigid box with logo sleeve', 'Kraft box with logo sleeve'], 120, 7, 'proc1');
    await as.proc1.post(`/api/purchase-orders/${poA3}/confirm`, { promised_date: day(4), reference: 'WhatsApp from Clay & Kiln' });
    await as.finance.post(`/api/purchase-orders/${poA3}/payments`, { kind: 'advance', amount_paise: P(15000), paid_on: day(0), reference: 'IMPS CK-0091' });
    await as.finance.post(`/api/orders/${oA}/payments`, { kind: 'advance', amount_paise: P(150000), received_on: day(0), reference: 'NEFT KST-77812' });
    await advance(3);
    await receiveAll(poA2, 0.6, 'pass'); // short delivery
    await advance(3);
    // Clay & Kiln misses its date (now in the past, nothing received) → order late.

    // ------------------------------------------------------------ Order D: just handed off
    const oD = await win({ company: 'Coastal Logistics', contact: 'Farah Khan', email: 'farah.khan@coastallogistics.example', phone: '9930011223', owner: 'sales1', source: 'Inbound call', occasion: 'Driver appreciation kits', due: 25, proc: 'proc2',
      lines: [{ description: 'Driver care kit', qty: 300, price: 650, cost: 410 }],
      destinations: [{ label: 'Coastal Navi Mumbai hub', address: 'Plot 9, TTC Industrial Area', city: 'Navi Mumbai', pincode: '400705' }] });
    void oD;

    // ------------------------------------------------------------ pipeline: leads and opportunities
    const lead = (owner: UserKey, o: Record<string, unknown>) => as[owner].post('/api/leads', { owner_id: ids[owner], confirm_duplicate: true, ...o });
    const l1 = await lead('sales1', { company_name: 'Peak Motors', contact_name: 'Dev Malhotra', phone: '9811122233', email: 'dev@peakmotors.example', source: 'LinkedIn', occasion: 'Dealer meet giveaways', approx_qty: 400, budget_paise: P(400 * 900), required_by: day(35), locations: 'Delhi, Gurugram', next_follow_up: day(-2) });
    await as.sales1.post(`/api/leads/${l1.id}/activities`, { kind: 'call', summary: 'Left voicemail; asked for budget split', outcome: 'No answer' });
    await lead('sales2', { company_name: 'Lotus Design Studio', contact_name: 'Ira Sen', phone: '9830099887', email: 'ira@lotusdesign.example', source: 'Referral', occasion: 'Team anniversary', approx_qty: 35, required_by: day(20), next_follow_up: day(1) });
    const l3 = await lead('sales2', { company_name: 'Granite Infra Projects', contact_name: 'Manoj Pillai', phone: '9848011122', source: 'Trade show', occasion: 'Site safety awards', approx_qty: 120, budget_paise: P(120 * 1100), required_by: day(28), next_follow_up: day(3) });
    await as.sales2.post(`/api/leads/${l3.id}/activities`, { kind: 'meeting', summary: 'Met at Infra Expo; wants practical gifts (flasks, caps)', outcome: 'Send 3 options' });
    await as.sales2.post(`/api/leads/${l3.id}/qualify`);
    const l4 = await lead('sales1', { company_name: 'Orbit Media Network', contact_name: 'Tara Kapoor', source: 'Website', occasion: 'Festive hampers', approx_qty: 60 });
    await as.sales1.post(`/api/leads/${l4.id}/lose`, { reason: 'Price too high', detail: 'Budget ₹600/box, our floor ₹950' });
    await lead('sales1', { company_name: 'Northwind Software', contact_name: 'Kabir Shah', email: 'kabir@northwind.example', source: 'Founder network', occasion: 'New joiner kits', approx_qty: 25, next_follow_up: day(0) });
    // Opportunity with a low-margin quotation waiting for the sales manager.
    const coP = await as.sales2.post('/api/companies', { name: 'Meridian Pharma', city: 'Ahmedabad', industry: 'Pharmaceuticals' });
    await as.sales2.post(`/api/companies/${coP.id}/contacts`, { name: 'Sanjay Desai', email: 'sanjay.desai@meridianpharma.example', phone: '9825012345', designation: 'Admin Head', is_primary: true });
    const opP = await as.sales2.post('/api/opportunities', { company_id: coP.id, title: 'Meridian — Doctors’ Day gifts', owner_id: ids.sales2, approx_qty: 250, required_by: day(30) });
    const qP = await as.sales2.post(`/api/opportunities/${opP.id}/quotations`, { lines: [{ description: 'Doctor’s desk organiser', qty: 250, unit_price_paise: P(780) }], shipping_paise: P(2500), tax_bp: 1800, validity_date: day(12), delivery_date: day(30) });
    const qPd = await as.sales2.get(`/api/quotations/${qP.id}`);
    await as.procManager.put(`/api/quotations/${qP.id}/costs`, { lines: [{ id: qPd.versions[0].lines[0].id, unit_cost_paise: P(660) }] });
    await as.sales2.post(`/api/quotations/${qP.id}/submit`);
    // Opportunity waiting for feasibility.
    const coG = await as.sales1.post('/api/companies', { name: 'Greenfield Schools Trust', city: 'Pune', industry: 'Education' });
    const opG = await as.sales1.post('/api/opportunities', { company_id: coG.id, title: 'Greenfield — Teachers’ Day hampers', owner_id: ids.sales1, approx_qty: 180, required_by: day(21) });
    await as.sales1.post(`/api/opportunities/${opG.id}/feasibility`, { assigned_to: ids.proc1, notes: '180 hampers, need eco packaging' });

    // ------------------------------------------------------------ issues, comments, contact log
    await as.dispatch.post('/api/issues', { order_id: oC, kind: 'damage', title: 'Goa: 2 boxes with crushed corners', detail: 'Customer sent photos; replacement requested', priority: 'medium', owner_id: ids.sales1, due_date: day(2) });
    await as.sales1.post(`/api/orders/${oA}/comments`, { text: 'Nisha asked if the Hyderabad boxes can arrive two days earlier — checking with procurement.', mention: ids.proc1 });
    await as.proc1.post('/api/contact-log', { party: 'vendor', entity_type: 'purchase_order', entity_id: poA3, channel: 'phone', summary: 'Clay & Kiln: kiln firing delayed; promised update tomorrow' });
    await as.finance.post('/api/contact-log', { party: 'customer', entity_type: 'order', entity_id: oC, channel: 'email', summary: 'Sent invoice INV/26-27/0412 to accounts payable' });

    // ------------------------------------------------------------ bring the clock to today and run the scheduled checks
    clock.set(real.toISOString());
    const { runAutomations } = await import('./rules/automations.ts');
    runAutomations(ctx);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}
