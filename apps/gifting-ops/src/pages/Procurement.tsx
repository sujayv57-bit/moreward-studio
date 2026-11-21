import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { vendorInput, vendorQuoteInput } from '../../shared/schemas.ts';
import { ApiError, get, patch, post, put } from '../api.ts';
import { addDays, date, dateTime, label, money, todayStr } from '../format.ts';
import { useAction, useApi, useAuth } from '../state.tsx';
import { Button, Card, Check, Empty, ErrorState, fieldErr, FormError, Icon, Loading, MissingList, Modal, MoneyField, NumberField, PageHeader, Pager, Pill, SelectField, Status, TextArea, TextField, UserSelect } from '../ui.tsx';
import { ReceiveModal } from './shared.tsx';

export default function Procurement() {
  return (
    <Routes>
      <Route index element={<Queue />} />
      <Route path="vendors" element={<Vendors />} />
      <Route path="rfqs" element={<Rfqs />} />
      <Route path="rfqs/:id" element={<RfqDetail />} />
      <Route path="purchase-orders" element={<PurchaseOrders />} />
      <Route path="receiving" element={<Receiving />} />
    </Routes>
  );
}
const zerr = (schema: { safeParse: (v: unknown) => any }, v: unknown) => { const r = schema.safeParse(v); if (r.success) return null; const f: Record<string, string> = {}; for (const i of r.error.issues) f[i.path.join('.')] ??= i.message; return new ApiError(400, 'validation', 'Please fix the highlighted fields.', { fields: f }); };

// ================================================================ queue
function Queue() {
  const { can } = useAuth(); const [mine, setMine] = useState(!can('procurement.all'));
  const { data, error, loading, reload } = useApi<any>(`/procurement/queue?scope=${mine ? 'mine' : 'all'}`);
  const t = todayStr();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="stack-lg">
      <PageHeader title="Procurement" sub="Orders being sourced, quotes awaited, POs to confirm and feasibility checks." actions={<><Check label="Only orders I own" checked={mine} onChange={setMine} />{can('procurement.write') && <><Link className="btn" to="/procurement/rfqs?new=1">New RFQ</Link><Link className="btn primary" to="/procurement/purchase-orders?new=1">New purchase order</Link></>}</>} />
      <Card title={`Orders in sourcing (${data.orders.length})`} pad={false}>
        {data.orders.length === 0 ? <Empty title="No orders being sourced" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>Order</th><th>Stage</th><th>Due</th><th>Components</th><th>Risk</th><th>Owner</th></tr></thead>
          <tbody>{data.orders.map((o: any) => <tr key={o.id}><td data-label="Order"><Link className="row-link" to={`/orders/${o.id}?tab=procurement`}>{o.number}</Link><div className="small muted">{o.company_name}</div></td><td data-label="Stage"><Status kind="order" value={o.stage} /></td><td data-label="Due">{date(o.due_date)}</td>
            <td data-label="Components" className="small">{o.components === 0 ? <Pill tone="warn">No BOM yet</Pill> : <>{o.not_ordered > 0 && <Pill tone="bad">{o.not_ordered} not ordered</Pill>} {o.incoming > 0 && <Pill tone="navy">{o.incoming} incoming</Pill>} {o.awaiting_qc > 0 && <Pill tone="info">{o.awaiting_qc} to check</Pill>} {o.complete > 0 && <Pill tone="ok">{o.complete} complete</Pill>}</>}</td>
            <td data-label="Risk"><Status kind="risk" value={o.risk.level} />{o.risk.reasons[0] && <div className="small muted">{o.risk.reasons[0]}</div>}</td><td data-label="Owner">{o.procurement_owner_name ?? <Pill tone="bad">Unassigned</Pill>}</td></tr>)}</tbody></table></div>}
      </Card>
      <div className="grid grid-3">
        <Card title="Feasibility checks" pad={false}>{data.feasibility.length === 0 ? <Empty title="None waiting" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.feasibility.map((f: any) => <li key={f.id}><span style={{ flex: 1 }}><Link to={`/sales/opportunities/${f.opportunity_id}`}>{f.title}</Link><div className="small muted">{f.assigned_name} · asked {date(f.requested_at)}</div></span></li>)}</ul>}</Card>
        <Card title="Quotes awaited from vendors" pad={false}>{data.rfqs_waiting.length === 0 ? <Empty title="None outstanding" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.rfqs_waiting.map((q: any) => <li key={q.id}><span style={{ flex: 1 }}><Link to={`/procurement/rfqs/${q.rfq_id}`}>{q.title}</Link><div className="small muted">{q.vendor}</div></span>{q.response_due && <Pill tone={q.response_due < t ? 'bad' : 'neutral'} icon="clock">{date(q.response_due)}</Pill>}</li>)}</ul>}</Card>
        <Card title="POs awaiting vendor confirmation" pad={false}>{data.awaiting_confirmation.length === 0 ? <Empty title="All confirmed" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.awaiting_confirmation.map((p: any) => <li key={p.id}><span style={{ flex: 1 }}><Link to={`/procurement/purchase-orders/${p.id}`}>{p.number}</Link><div className="small muted">{p.vendor}</div></span>{p.confirmation_due && <Pill tone={p.confirmation_due < t ? 'bad' : 'neutral'} icon="clock">{date(p.confirmation_due)}</Pill>}</li>)}</ul>}</Card>
      </div>
    </div>
  );
}

// ================================================================ vendors
const VSTATES = ['draft', 'info_requested', 'documents_pending', 'under_review', 'approved', 'active', 'suspended', 'inactive', 'rejected'];
function Vendors() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams(); const q = sp.get('q') ?? ''; const status = sp.get('status') ?? ''; const cat = sp.get('category') ?? ''; const page = Number(sp.get('page') ?? 1);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };
  const { data, error, loading, reload } = useApi<any>(`/vendors?q=${encodeURIComponent(q)}&status=${status}&category=${encodeURIComponent(cat)}&page=${page}&pageSize=25`);
  const meta = useApi<any>('/vendor-meta');
  const [creating, setCreating] = useState(false);
  const t = todayStr();
  return (
    <div className="stack">
      <PageHeader title="Vendors" sub="Directory and onboarding. Only approved or active vendors can receive a normal purchase order." actions={can('vendors.write') && <Button variant="emphasis" icon="plus" onClick={() => setCreating(true)}>New vendor</Button>} />
      <div className="filters" role="search">
        <input className="input grow" type="search" aria-label="Search vendors" placeholder="Name, city, category, GSTIN…" value={q} onChange={(e) => set('q', e.target.value)} />
        <select className="input" aria-label="Status" value={status} onChange={(e) => set('status', e.target.value)}><option value="">All statuses</option><option value="onboarding">In onboarding</option><option value="purchasable">Approved for purchasing</option>{VSTATES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        <select className="input" aria-label="Category" value={cat} onChange={(e) => set('category', e.target.value)}><option value="">All categories</option>{meta.data?.categories.map((c: string) => <option key={c}>{c}</option>)}</select>
      </div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title="No vendors match" /> : (
          <div className="table-wrap"><table className="table responsive"><thead><tr><th>Vendor</th><th>Categories</th><th>Status</th><th>Onboarding</th><th className="num">Lead time</th><th>Alerts</th></tr></thead>
            <tbody>{data.rows.map((v: any) => {
              const onboarding = ['draft', 'info_requested', 'documents_pending', 'under_review'].includes(v.status);
              return <tr key={v.id}><td data-label="Vendor"><Link className="row-link" to={`/procurement/vendors/${v.id}`}>{v.display_name}</Link><div className="small muted">{v.legal_name}{v.city && ` · ${v.city}`}</div></td><td data-label="Categories" className="small">{v.categories.join(', ') || '—'}</td><td data-label="Status"><Status kind="vendor" value={v.status} /></td>
                <td data-label="Onboarding" className="small">{onboarding ? <><div className="bar" role="progressbar" aria-label="Checklist progress" aria-valuenow={v.checklist_done} aria-valuemin={0} aria-valuemax={v.checklist_total}><span style={{ width: `${(v.checklist_done / v.checklist_total) * 100}%` }} /></div>{v.checklist_done}/{v.checklist_total} · {v.onboarding_owner_name ?? '—'}{v.onboarding_due && <> · due {date(v.onboarding_due)}</>}</> : '—'}</td>
                <td data-label="Lead time" className="num">{v.lead_time_days ? `${v.lead_time_days} d` : '—'}</td>
                <td data-label="Alerts">{v.bank_review ? <Pill tone="bad" icon="lock">Bank change to verify</Pill> : null} {v.next_expiry && v.next_expiry <= addDays(t, 30) ? <Pill tone={v.next_expiry < t ? 'bad' : 'warn'}>Document {v.next_expiry < t ? 'expired' : 'expiring'} {date(v.next_expiry)}</Pill> : null} {onboarding && v.onboarding_due && v.onboarding_due < t ? <Pill tone="bad">Onboarding overdue</Pill> : null}</td></tr>;
            })}</tbody></table></div>
        )}
        {data && <Pager page={page} pageSize={25} total={data.total} onPage={(p) => set('page', String(p))} />}
      </Card>
      {creating && <VendorForm open onClose={() => setCreating(false)} categories={meta.data?.categories ?? []} />}
    </div>
  );
}
export function VendorForm({ open, onClose, vendor, categories, onSaved }: { open: boolean; onClose: () => void; vendor?: any; categories: string[]; onSaved?: () => void }) {
  const { me } = useAuth(); const nav = useNavigate(); const act = useAction();
  const [f, setF] = useState<any>(vendor ? { ...vendor, sample_available: !!vendor.sample_available } : { legal_name: '', display_name: '', phone: '', email: '', address: '', city: '', serviceable_locations: '', categories: [], capabilities: '', customisation_options: '', lead_time_days: null, moq: null, capacity_per_week: null, payment_terms: '', sample_available: false, preferred_comm: 'WhatsApp', notes: '', gst_number: '', pan_number: '', onboarding_owner_id: me!.user.id, onboarding_due: addDays(todayStr(), 7) });
  const s = (k: string) => (v: any) => setF({ ...f, [k]: v });
  const save = async (confirm_duplicate = false) => {
    const body: any = { ...f, confirm_duplicate };
    for (const k of ['id', 'status', 'status_reason', 'approved_by', 'approved_at', 'archived_at', 'created_by', 'created_at', 'updated_at', 'version', 'onboarding_owner_name', 'approved_by_name']) delete body[k];
    if (vendor) body.expected_version = vendor.version;
    const v = zerr(vendorInput, body); if (v) { act.setError(v); return; }
    const r = await act.run(() => (vendor ? patch(`/vendors/${vendor.id}`, body) : post<{ id: number }>('/vendors', body)), vendor ? 'Vendor saved' : 'Vendor created');
    if (r) { onClose(); if (vendor) onSaved?.(); else nav(`/procurement/vendors/${(r as any).id}`); }
  };
  const e = (k: string) => fieldErr(act.error, k);
  return (
    <Modal open={open} onClose={onClose} wide title={vendor ? 'Edit vendor profile' : 'New vendor'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={() => save(false)}>{vendor ? 'Save' : 'Create vendor'}</Button></>}>
      <div className="stack"><FormError error={act.error} onConfirmDuplicate={() => save(true)} />
        <fieldset><legend>Identity and contact</legend><div className="grid grid-2">
          <TextField label="Legal name" value={f.legal_name} onChange={s('legal_name')} required error={e('legal_name')} />
          <TextField label="Display name" value={f.display_name} onChange={s('display_name')} required error={e('display_name')} />
          <TextField label="Phone" type="tel" value={f.phone} onChange={s('phone')} error={e('phone')} />
          <TextField label="Email" type="email" value={f.email} onChange={s('email')} error={e('email')} />
          <TextArea label="Address" value={f.address} onChange={s('address')} rows={2} />
          <div className="stack"><TextField label="City" value={f.city} onChange={s('city')} /><SelectField label="Preferred communication" value={f.preferred_comm} onChange={s('preferred_comm')} options={['WhatsApp', 'Email', 'Phone'].map((x) => ({ value: x, label: x }))} /></div>
        </div></fieldset>
        <fieldset><legend>What they supply</legend><div className="stack">
          <div className="row" role="group" aria-label="Product categories">{categories.map((c) => <Check key={c} label={c} checked={f.categories.includes(c)} onChange={(v) => setF({ ...f, categories: v ? [...f.categories, c] : f.categories.filter((x: string) => x !== c) })} />)}</div>
          <div className="grid grid-2"><TextField label="Capabilities" value={f.capabilities} onChange={s('capabilities')} /><TextField label="Customisation options" value={f.customisation_options} onChange={s('customisation_options')} /><TextField label="Serviceable locations" value={f.serviceable_locations} onChange={s('serviceable_locations')} /><TextField label="Payment terms" value={f.payment_terms} onChange={s('payment_terms')} /></div>
          <div className="grid grid-3"><NumberField label="Normal lead time (days)" value={f.lead_time_days} onChange={s('lead_time_days')} error={e('lead_time_days')} /><NumberField label="Minimum order quantity" value={f.moq} onChange={s('moq')} /><NumberField label="Capacity per week (units)" value={f.capacity_per_week} onChange={s('capacity_per_week')} /></div>
          <Check label="Samples available" checked={f.sample_available} onChange={s('sample_available')} />
        </div></fieldset>
        <fieldset><legend>Tax identifiers (verified by finance/admin; no compliance claim)</legend><div className="grid grid-2"><TextField label="GSTIN" value={f.gst_number} onChange={s('gst_number')} error={e('gst_number')} /><TextField label="PAN" value={f.pan_number} onChange={s('pan_number')} error={e('pan_number')} /></div></fieldset>
        <fieldset><legend>Onboarding</legend><div className="grid grid-2"><UserSelect label="Onboarding owner" value={f.onboarding_owner_id} onChange={s('onboarding_owner_id')} roles={['procurement_manager', 'procurement_exec', 'admin']} /><TextField label="Onboarding due" type="date" value={f.onboarding_due} onChange={s('onboarding_due')} /></div></fieldset>
        <TextArea label="Notes" value={f.notes} onChange={s('notes')} rows={2} />
        <p className="small muted">Bank details are entered by finance on the vendor page.</p>
      </div>
    </Modal>
  );
}

// ================================================================ RFQs
function Rfqs() {
  const [sp, setSp] = useSearchParams(); const status = sp.get('status') ?? 'open';
  const { data, error, loading, reload } = useApi<any>(`/rfqs?status=${status}`);
  const [creating, setCreating] = useState(sp.get('new') === '1');
  return (
    <div className="stack">
      <PageHeader title="Requests for quotation" sub="Ask several vendors for the same component, then compare landed cost and delivery risk." actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New RFQ</Button>} />
      <div className="filters"><select className="input" aria-label="Status" value={status} onChange={(e) => setSp({ status: e.target.value })}><option value="open">Open</option><option value="awarded">Awarded</option><option value="cancelled">Cancelled</option><option value="all">All</option></select></div>
      <Card pad={false}>{loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title="No RFQs" /> : (
        <div className="table-wrap"><table className="table responsive"><thead><tr><th>RFQ</th><th>Order</th><th className="num">Qty</th><th>Needed by</th><th>Quotes</th><th>Status</th></tr></thead>
          <tbody>{data.rows.map((r: any) => <tr key={r.id}><td data-label="RFQ"><Link className="row-link" to={`/procurement/rfqs/${r.id}`}>{r.title}</Link>{r.is_critical ? <> <Pill tone="warn">Critical</Pill></> : null}</td><td data-label="Order">{r.order_number ? <Link to={`/orders/${r.order_id}`}>{r.order_number}</Link> : '—'}</td><td data-label="Qty" className="num">{r.qty}</td><td data-label="Needed by">{date(r.needed_by)}</td><td data-label="Quotes">{r.received} of {r.requested} received</td><td data-label="Status">{label(r.status)}</td></tr>)}</tbody></table></div>
      )}</Card>
      {creating && <NewRfq onClose={() => { setCreating(false); setSp({ status }); }} orderId={sp.get('order') ? Number(sp.get('order')) : null} />}
    </div>
  );
}
function NewRfq({ onClose, orderId }: { onClose: () => void; orderId: number | null }) {
  const nav = useNavigate(); const act = useAction();
  const [f, setF] = useState<any>({ order_id: orderId, bom_item_id: '', title: '', qty: null, needed_by: '', is_critical: false, vendor_ids: [], response_due: addDays(todayStr(), 2) });
  const orders = useApi<any>('/orders?stage=active&pageSize=100');
  const comps = useApi<any>(f.order_id ? `/orders/${f.order_id}/components` : null);
  const vendors = useApi<any>('/vendors?pageSize=100');
  useEffect(() => { const c = comps.data?.rows.find((x: any) => String(x.id) === String(f.bom_item_id)); if (c) setF((p: any) => ({ ...p, title: c.component_name + (c.spec ? ` (${c.spec})` : ''), qty: c.uncovered || c.still_needed || c.required, is_critical: !!c.is_critical })); }, [f.bom_item_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { const r = await act.run(() => post<{ id: number }>('/rfqs', { ...f, order_id: f.order_id || null, bom_item_id: f.bom_item_id ? Number(f.bom_item_id) : null, needed_by: f.needed_by || null }), 'RFQ created'); if (r) nav(`/procurement/rfqs/${r.id}`); };
  return (
    <Modal open onClose={onClose} wide title="New request for quotation" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={save}>Create RFQ</Button></>}>
      <div className="stack"><FormError error={act.error} />
        <div className="grid grid-2">
          <SelectField label="Order (optional)" value={f.order_id ?? ''} onChange={(v) => setF({ ...f, order_id: v ? Number(v) : null, bom_item_id: '' })} options={(orders.data?.rows ?? []).map((o: any) => ({ value: o.id, label: `${o.number} — ${o.company_name}` }))} placeholder="Not for a specific order" />
          <SelectField label="Component" value={f.bom_item_id} onChange={(v) => setF({ ...f, bom_item_id: v })} disabled={!f.order_id} options={(comps.data?.rows ?? []).map((c: any) => ({ value: c.id, label: `${c.component_name} (${c.variant_name}) — ${c.uncovered} not ordered` }))} />
        </div>
        <TextField label="What are you sourcing?" value={f.title} onChange={(v) => setF({ ...f, title: v })} required error={fieldErr(act.error, 'title')} />
        <div className="grid grid-3"><NumberField label="Quantity" value={f.qty} onChange={(v) => setF({ ...f, qty: v })} required error={fieldErr(act.error, 'qty')} /><TextField label="Needed by" type="date" value={f.needed_by} onChange={(v) => setF({ ...f, needed_by: v })} /><TextField label="Quotes due by" type="date" value={f.response_due} onChange={(v) => setF({ ...f, response_due: v })} required error={fieldErr(act.error, 'response_due')} /></div>
        <Check label="Critical component (select a backup vendor when awarding)" checked={f.is_critical} onChange={(v) => setF({ ...f, is_critical: v })} />
        <fieldset><legend>Ask these vendors {fieldErr(act.error, 'vendor_ids') && <span className="err">— {fieldErr(act.error, 'vendor_ids')}</span>}</legend>
          <div className="grid grid-2">{(vendors.data?.rows ?? []).filter((v: any) => !['suspended', 'rejected', 'inactive'].includes(v.status)).map((v: any) => <Check key={v.id} label={`${v.display_name} (${label(v.status)})`} hint={v.categories.join(', ')} checked={f.vendor_ids.includes(v.id)} onChange={(c) => setF({ ...f, vendor_ids: c ? [...f.vendor_ids, v.id] : f.vendor_ids.filter((x: number) => x !== v.id) })} />)}</div>
          <p className="small muted">Vendors still in onboarding may quote, but cannot receive a normal purchase order until approved. Suspended vendors are hidden.</p>
        </fieldset>
      </div>
    </Modal>
  );
}
function RfqDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const { data, error, loading, reload } = useApi<any>(`/rfqs/${id}`);
  const act = useAction();
  const [rec, setRec] = useState<any | null>(null); const [award, setAward] = useState<any | null>(null); const [warnings, setWarnings] = useState<string[]>([]); const [add, setAdd] = useState<number[] | null>(null); const [poOverride, setPoOverride] = useState<{ use: string; reason: string } | null>(null);
  const vendors = useApi<any>(add ? '/vendors?pageSize=100' : null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const r = data.rfq; const quotes = data.quotes;
  const createPo = async (use: string, override_reason?: string) => { const res = await act.run(() => post<{ id: number }>(`/rfqs/${id}/create-po`, { use, ...(override_reason ? { override_reason } : {}) }), 'Purchase order drafted'); if (res) nav(`/procurement/purchase-orders/${res.id}`); };
  const riskTone: Record<string, any> = { ok: 'ok', tight: 'warn', late: 'bad', unknown: 'neutral' };
  return (
    <div className="stack-lg">
      <PageHeader crumbs={[{ to: '/procurement/rfqs', label: 'RFQs' }]} title={r.title} sub={<>{r.qty} units{r.needed_by && ` · needed by ${date(r.needed_by)}`}{r.order_number && <> · <Link to={`/orders/${r.order_id}?tab=procurement`}>{r.order_number}</Link></>}{r.is_critical ? ' · critical' : ''} · {label(r.status)}</>}
        actions={r.status === 'open' ? <><Button onClick={() => setAdd([])}>Ask more vendors</Button><Button variant="primary" disabled={!quotes.some((q: any) => q.status === 'received')} onClick={() => setAward({ quote_id: quotes.find((q: any) => q.cheapest)?.id ?? '', reason: '', backup_quote_id: '' })}>Select vendor</Button><Button variant="danger" onClick={() => act.run(() => post(`/rfqs/${id}/cancel`, { reason: 'No longer needed' }), 'RFQ cancelled').then(reload)}>Cancel RFQ</Button></> : r.status === 'awarded' && data.purchase_orders.length === 0 ? <><Button variant="primary" loading={act.pending} onClick={() => createPo('selected')}>Create PO from selected quote</Button>{r.backup_quote_id && <Button onClick={() => createPo('backup')}>Create PO from backup</Button>}</> : null} />
      {act.error?.code === 'blocked' && <><MissingList title={act.error.message} items={act.error.missing} /><Button onClick={() => setPoOverride({ use: 'selected', reason: '' })}>Record an authorised override…</Button></>}
      {warnings.length > 0 && <div className="callout warn" role="alert"><Icon name="alert" /><div><h4>Selected, with warnings</h4><ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul></div></div>}
      {r.status === 'awarded' && <div className="callout ok"><Icon name="check" /><div>Selected {quotes.find((q: any) => q.id === r.selected_quote_id)?.vendor}: {r.selection_reason}{r.backup_quote_id && <> · Backup: {quotes.find((q: any) => q.id === r.backup_quote_id)?.vendor}</>}{data.purchase_orders.map((p: any) => <> · <Link key={p.id} to={`/procurement/purchase-orders/${p.id}`}>PO</Link></>)}</div></div>}
      <Card title="Side-by-side comparison" pad={false}>
        <div className="table-wrap"><table className="table responsive"><thead><tr><th>Vendor</th><th className="num">Unit price</th><th className="num">Tax</th><th className="num">Shipping</th><th className="num">Landed total</th><th className="num">Landed / unit</th><th className="num">Lead time</th><th>Expected arrival</th><th>Delivery risk</th><th>Notes</th><th><span className="sr-only">Record</span></th></tr></thead>
          <tbody>{quotes.map((q: any) => <tr key={q.id} className={q.id === r.selected_quote_id ? 'selected' : ''}>
            <td data-label="Vendor"><Link to={`/procurement/vendors/${q.vendor_id}`}>{q.vendor}</Link> <Status kind="vendor" value={q.vendor_status} />{q.cheapest && <> <Pill tone="ok">Lowest landed cost</Pill></>}{q.fastest && <> <Pill tone="info">Fastest</Pill></>}</td>
            {q.status === 'received' ? <><td data-label="Unit" className="num">{money(q.unit_price_paise)}</td><td data-label="Tax" className="num">{money(q.tax_paise)}</td><td data-label="Shipping" className="num">{money(q.shipping_paise)}</td><td data-label="Landed" className="num"><strong>{money(q.landed_paise)}</strong></td><td data-label="Per unit" className="num">{money(q.landed_per_unit_paise)}</td><td data-label="Lead" className="num">{q.lead_time_days} d</td><td data-label="Arrival">{date(q.expected_arrival)}</td><td data-label="Risk"><Pill tone={riskTone[q.delivery_risk]}>{label(q.delivery_risk)}</Pill></td>
              <td data-label="Notes" className="small">{[q.availability, q.moq && `MOQ ${q.moq}`, q.valid_until && `valid to ${date(q.valid_until)}`, ...q.flags].filter(Boolean).join(' · ')}</td></>
              : <td colSpan={9} className="muted">{q.status === 'declined' ? `Declined: ${q.notes ?? ''}` : `Waiting — due ${date(q.response_due)}`}</td>}
            <td>{r.status === 'open' && <Button size="sm" onClick={() => setRec({ id: q.id, vendor: q.vendor, unit_price_paise: q.unit_price_paise, tax_bp: q.tax_bp ?? 1800, shipping_paise: q.shipping_paise ?? 0, moq: q.moq, lead_time_days: q.lead_time_days, availability: q.availability ?? '', valid_until: q.valid_until ?? addDays(todayStr(), 15), notes: q.notes ?? '' })}>{q.status === 'received' ? 'Edit' : 'Record quote'}</Button>}</td>
          </tr>)}</tbody></table></div>
        <p className="card-pad small muted">Landed total = quantity × unit price + tax on goods + shipping. Delivery risk compares today + lead time with the needed-by date and the configured buffer for checking, packing and shipping.</p>
      </Card>
      <Modal open={!!rec} onClose={() => setRec(null)} title={`Quote from ${rec?.vendor}`} footer={<><Button variant="danger" onClick={() => act.run(() => post(`/vendor-quotes/${rec.id}/decline`, { reason: 'Vendor declined to quote' }), 'Marked declined').then((x) => { if (x) { setRec(null); reload(); } })}>Vendor declined</Button><Button onClick={() => setRec(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => { const body = { ...rec }; delete body.id; delete body.vendor; const v = zerr(vendorQuoteInput, body); if (v) { act.setError(v); return; } const x = await act.run(() => put(`/vendor-quotes/${rec.id}`, body), 'Quote recorded'); if (x) { setRec(null); reload(); } }}>Save quote</Button></>}>
        {rec && <div className="stack"><FormError error={act.error} /><div className="grid grid-3"><MoneyField label="Unit price (before tax)" value={rec.unit_price_paise} onChange={(v) => setRec({ ...rec, unit_price_paise: v })} required error={fieldErr(act.error, 'unit_price_paise')} /><SelectField label="Tax" value={rec.tax_bp} onChange={(v) => setRec({ ...rec, tax_bp: Number(v) })} placeholder={null} options={[0, 500, 1200, 1800, 2800].map((b) => ({ value: b, label: `${b / 100}%` }))} /><MoneyField label="Shipping" value={rec.shipping_paise} onChange={(v) => setRec({ ...rec, shipping_paise: v ?? 0 })} /></div>
          <div className="grid grid-3"><NumberField label="Lead time (days)" value={rec.lead_time_days} onChange={(v) => setRec({ ...rec, lead_time_days: v })} required error={fieldErr(act.error, 'lead_time_days')} /><NumberField label="MOQ" value={rec.moq} onChange={(v) => setRec({ ...rec, moq: v })} /><TextField label="Quote valid until" type="date" value={rec.valid_until} onChange={(v) => setRec({ ...rec, valid_until: v })} required error={fieldErr(act.error, 'valid_until')} /></div>
          <TextField label="Availability" value={rec.availability} onChange={(v) => setRec({ ...rec, availability: v })} placeholder="In stock / made to order…" /><TextArea label="Notes" value={rec.notes} onChange={(v) => setRec({ ...rec, notes: v })} rows={2} /></div>}
      </Modal>
      <Modal open={!!award} onClose={() => setAward(null)} title="Select vendor" footer={<><Button onClick={() => setAward(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => { const x = await act.run<any>(() => post(`/rfqs/${id}/award`, { quote_id: Number(award.quote_id), reason: award.reason, backup_quote_id: award.backup_quote_id ? Number(award.backup_quote_id) : null }), 'Vendor selected'); if (x) { setAward(null); setWarnings(x.warnings ?? []); reload(); } }}>Confirm selection</Button></>}>
        {award && <div className="stack"><FormError error={act.error} />
          <SelectField label="Selected quote" value={award.quote_id} onChange={(v) => setAward({ ...award, quote_id: v })} options={quotes.filter((q: any) => q.status === 'received').map((q: any) => ({ value: q.id, label: `${q.vendor} — ${money(q.landed_paise)}, ${q.lead_time_days} days` }))} required />
          <TextArea label="Why this vendor?" value={award.reason} onChange={(v) => setAward({ ...award, reason: v })} required error={fieldErr(act.error, 'reason')} />
          <SelectField label={`Backup source${r.is_critical ? ' (recommended for critical components)' : ''}`} value={award.backup_quote_id} onChange={(v) => setAward({ ...award, backup_quote_id: v })} placeholder="No backup" options={quotes.filter((q: any) => q.status === 'received' && String(q.id) !== String(award.quote_id)).map((q: any) => ({ value: q.id, label: q.vendor }))} />
          {quotes.find((q: any) => String(q.id) === String(award.quote_id))?.flags.map((fl: string) => <div key={fl} className="callout warn"><Icon name="alert" /><div>{fl}</div></div>)}
        </div>}
      </Modal>
      <Modal open={!!add} onClose={() => setAdd(null)} title="Ask more vendors" footer={<><Button onClick={() => setAdd(null)}>Cancel</Button><Button variant="primary" loading={act.pending} disabled={!add?.length} onClick={async () => { const x = await act.run(() => post(`/rfqs/${id}/vendors`, { vendor_ids: add, response_due: addDays(todayStr(), 2) }), 'Requests added'); if (x) { setAdd(null); reload(); } }}>Add</Button></>}>
        {add && <div className="stack"><FormError error={act.error} />{(vendors.data?.rows ?? []).filter((v: any) => !['suspended', 'rejected', 'inactive'].includes(v.status) && !quotes.some((q: any) => q.vendor_id === v.id)).map((v: any) => <Check key={v.id} label={`${v.display_name} (${label(v.status)})`} checked={add.includes(v.id)} onChange={(c) => setAdd(c ? [...add, v.id] : add.filter((x) => x !== v.id))} />)}</div>}
      </Modal>
      <Modal open={!!poOverride} onClose={() => setPoOverride(null)} title="Override vendor approval" footer={<><Button onClick={() => setPoOverride(null)}>Cancel</Button><Button variant="danger" loading={act.pending} onClick={() => createPo(poOverride!.use, poOverride!.reason)}>Create PO with override</Button></>}>
        {poOverride && <div className="stack"><div className="callout warn"><Icon name="alert" /><div>Only a procurement manager or the founder can do this. The override and reason are logged on the PO, the vendor and the audit trail.</div></div><FormError error={act.error?.code === 'blocked' ? null : act.error} /><TextArea label="Reason" value={poOverride.reason} onChange={(v) => setPoOverride({ ...poOverride, reason: v })} required /></div>}
      </Modal>
    </div>
  );
}

// ================================================================ purchase orders
function PurchaseOrders() {
  const [sp, setSp] = useSearchParams(); const q = sp.get('q') ?? ''; const status = sp.get('status') ?? 'open'; const page = Number(sp.get('page') ?? 1);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); n.delete('new'); setSp(n, { replace: true }); };
  const { data, error, loading, reload } = useApi<any>(`/purchase-orders?q=${encodeURIComponent(q)}&status=${status}&page=${page}&pageSize=25`);
  const { can } = useAuth();
  const [creating, setCreating] = useState(sp.get('new') === '1');
  return (
    <div className="stack">
      <PageHeader title="Purchase orders" sub="Linked to order components and vendor quotes." actions={can('procurement.write') && <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New purchase order</Button>} />
      <div className="filters" role="search"><input className="input grow" type="search" aria-label="Search purchase orders" placeholder="PO number, vendor, order…" value={q} onChange={(e) => set('q', e.target.value)} />
        <select className="input" aria-label="Status" value={status} onChange={(e) => set('status', e.target.value)}><option value="open">Open</option><option value="">All</option>{['draft', 'pending_approval', 'issued', 'confirmed', 'partially_received', 'received', 'cancelled'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
      <Card pad={false}>{loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title="No purchase orders" /> : (
        <div className="table-wrap"><table className="table responsive"><thead><tr><th>PO</th><th>Vendor</th><th>Order</th><th>Promised</th>{can('costing.view') && <th className="num">Total</th>}<th>Status</th></tr></thead>
          <tbody>{data.rows.map((p: any) => <tr key={p.id}><td data-label="PO"><Link className="row-link" to={`/procurement/purchase-orders/${p.id}`}>{p.number}</Link>{p.override_reason && <> <Pill tone="warn">Override</Pill></>}</td><td data-label="Vendor">{p.vendor}</td><td data-label="Order">{p.order_number ? <Link to={`/orders/${p.order_id}`}>{p.order_number}</Link> : '—'}</td><td data-label="Promised">{date(p.promised_date)} {p.late && <Pill tone="bad">Late</Pill>}</td>{can('costing.view') && <td data-label="Total" className="num">{money(p.totals?.total_paise)}</td>}<td data-label="Status"><Status kind="po" value={p.status} /></td></tr>)}</tbody></table></div>
      )}{data && <Pager page={page} pageSize={25} total={data.total} onPage={(p) => set('page', String(p))} />}</Card>
      {creating && <NewPo onClose={() => { setCreating(false); set('new', ''); }} orderId={sp.get('order') ? Number(sp.get('order')) : null} />}
    </div>
  );
}
function NewPo({ onClose, orderId }: { onClose: () => void; orderId: number | null }) {
  const nav = useNavigate(); const act = useAction(); const { can } = useAuth();
  const [f, setF] = useState<any>({ order_id: orderId, vendor_id: '', promised_date: addDays(todayStr(), 7), shipping_paise: 0, advance_required_paise: 0, notes: '', override_reason: '', lines: [] });
  const orders = useApi<any>('/orders?stage=active&pageSize=100');
  const comps = useApi<any>(f.order_id ? `/orders/${f.order_id}/components` : null);
  const vendors = useApi<any>('/vendors?pageSize=100');
  const vendor = vendors.data?.rows.find((v: any) => String(v.id) === String(f.vendor_id));
  const purchasable = vendor && ['approved', 'active'].includes(vendor.status);
  const addComp = (c: any) => setF({ ...f, lines: [...f.lines, { bom_item_id: c.id, description: c.component_name, qty_ordered: c.uncovered || c.still_needed, unit_price_paise: c.est_unit_cost_paise || 0, tax_bp: 1800 }] });
  const save = async () => { const r = await act.run(() => post<{ id: number }>('/purchase-orders', { ...f, vendor_id: Number(f.vendor_id) || undefined, order_id: f.order_id || null, override_reason: f.override_reason || null }), 'Purchase order drafted'); if (r) nav(`/procurement/purchase-orders/${r.id}`); };
  return (
    <Modal open onClose={onClose} wide title="New purchase order" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={save}>Save draft</Button></>}>
      <div className="stack"><FormError error={act.error} />
        <div className="grid grid-3">
          <SelectField label="Order" value={f.order_id ?? ''} onChange={(v) => setF({ ...f, order_id: v ? Number(v) : null, lines: [] })} options={(orders.data?.rows ?? []).map((o: any) => ({ value: o.id, label: `${o.number} — ${o.company_name}` }))} placeholder="Stock / not for one order" />
          <SelectField label="Vendor" value={f.vendor_id} onChange={(v) => setF({ ...f, vendor_id: v })} required error={fieldErr(act.error, 'vendor_id')} options={(vendors.data?.rows ?? []).map((v: any) => ({ value: v.id, label: `${v.display_name} (${label(v.status)})` }))} />
          <TextField label="Promised date" type="date" value={f.promised_date} onChange={(v) => setF({ ...f, promised_date: v })} required error={fieldErr(act.error, 'promised_date')} />
        </div>
        {vendor && !purchasable && <div className="callout warn"><Icon name="lock" /><div><strong>{vendor.display_name} is {label(vendor.status)}.</strong> A normal purchase order is not allowed. {can('procurement.override') ? 'You may record an override with a reason; it is logged.' : 'Choose an approved vendor or ask a procurement manager.'}{can('procurement.override') && <TextArea label="Override reason" value={f.override_reason} onChange={(v) => setF({ ...f, override_reason: v })} />}</div></div>}
        {comps.data && <div className="row">{comps.data.rows.filter((c: any) => c.uncovered > 0 && !f.lines.some((l: any) => l.bom_item_id === c.id)).map((c: any) => <Button key={c.id} size="sm" icon="plus" onClick={() => addComp(c)}>{c.component_name} ({c.uncovered})</Button>)}</div>}
        <fieldset><legend>Lines</legend>{f.lines.length === 0 ? <p className="muted small">Add components from the order above, or a free line.</p> : f.lines.map((l: any, i: number) => (
          <div key={i} className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,.8fr) minmax(0,1fr) minmax(0,.8fr) auto', alignItems: 'end' }}>
            <TextField label="Item" value={l.description} onChange={(v) => setF({ ...f, lines: f.lines.map((x: any, j: number) => (j === i ? { ...x, description: v } : x)) })} error={fieldErr(act.error, `lines.${i}.description`)} />
            <NumberField label="Qty" value={l.qty_ordered} onChange={(v) => setF({ ...f, lines: f.lines.map((x: any, j: number) => (j === i ? { ...x, qty_ordered: v } : x)) })} error={fieldErr(act.error, `lines.${i}.qty_ordered`)} />
            <MoneyField label="Unit price" value={l.unit_price_paise} onChange={(v) => setF({ ...f, lines: f.lines.map((x: any, j: number) => (j === i ? { ...x, unit_price_paise: v ?? 0 } : x)) })} />
            <SelectField label="Tax" value={l.tax_bp} placeholder={null} onChange={(v) => setF({ ...f, lines: f.lines.map((x: any, j: number) => (j === i ? { ...x, tax_bp: Number(v) } : x)) })} options={[0, 500, 1200, 1800, 2800].map((b) => ({ value: b, label: `${b / 100}%` }))} />
            <Button variant="ghost" icon="x" aria-label="Remove line" onClick={() => setF({ ...f, lines: f.lines.filter((_: any, j: number) => j !== i) })} />
          </div>))}
          <Button size="sm" icon="plus" onClick={() => setF({ ...f, lines: [...f.lines, { bom_item_id: null, description: '', qty_ordered: 1, unit_price_paise: 0, tax_bp: 1800 }] })}>Free line</Button>
          {fieldErr(act.error, 'lines') && <div className="err">{fieldErr(act.error, 'lines')}</div>}
        </fieldset>
        <div className="grid grid-2"><MoneyField label="Shipping" value={f.shipping_paise} onChange={(v) => setF({ ...f, shipping_paise: v ?? 0 })} /><MoneyField label="Advance required" value={f.advance_required_paise} onChange={(v) => setF({ ...f, advance_required_paise: v ?? 0 })} /></div>
        <TextArea label="Notes to vendor" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} rows={2} />
        <p className="small muted">Saved as a draft. Issuing it re-checks the vendor's status; above the configured value it needs manager approval.</p>
      </div>
    </Modal>
  );
}

// ================================================================ receiving (mobile-friendly)
function Receiving() {
  const { data, error, loading, reload } = useApi<any>('/arrivals?days=30');
  const [po, setPo] = useState<any | null>(null);
  const openPo = async (poId: number) => { const d = await get<any>(`/purchase-orders/${poId}`); setPo({ po: d.po, lines: d.lines.filter((l: any) => l.outstanding > 0) }); };
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const groups = new Map<number, any[]>(); for (const r of data.rows) groups.set(r.po_id, [...(groups.get(r.po_id) ?? []), r]);
  return (
    <div className="stack">
      <PageHeader title="Receiving" sub="What is due in, oldest first. Tap a PO to record what arrived." />
      {groups.size === 0 ? <Card><Empty title="Nothing expected in the next 30 days" /></Card> : [...groups.values()].map((lines) => (
        <Card key={lines[0].po_id} title={<>{lines[0].number} · {lines[0].vendor} {lines[0].overdue ? <Pill tone="bad">Overdue {date(lines[0].promised_date)}</Pill> : <Pill tone="neutral" icon="clock">{lines[0].promised_date ? date(lines[0].promised_date) : 'No date'}</Pill>}</>} actions={<Button variant="primary" onClick={() => openPo(lines[0].po_id)}>Receive</Button>}>
          <ul className="checklist">{lines.map((l: any) => <li key={l.po_line_id}><span style={{ flex: 1 }}>{l.description}{l.order_number && <span className="small muted"> · {l.order_number}</span>}</span><strong>{l.outstanding}</strong> due</li>)}</ul>
        </Card>
      ))}
      {po && <ReceiveModal open po={po.po} lines={po.lines} onClose={() => setPo(null)} onDone={reload} />}
      <p className="small muted">After receiving, record the quality check on the order's Quality tab or the PO page. <Link to="/procurement/purchase-orders?status=receivable">All receivable POs</Link> · {dateTime(new Date().toISOString())}</p>
    </div>
  );
}
