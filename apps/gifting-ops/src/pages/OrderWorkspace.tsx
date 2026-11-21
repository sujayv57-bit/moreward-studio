import { Fragment, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { destinationInput, paymentInput, invoiceInput } from '../../shared/schemas.ts';
import { ApiError, patch, post, put } from '../api.ts';
import { date, dateTime, label, money, pct, relDays, todayStr, addDays } from '../format.ts';
import { useAction, useApi, useAuth } from '../state.tsx';
import { Button, Card, Check, Empty, ErrorState, fieldErr, FileButton, FormError, Icon, Loading, MissingList, Modal, MoneyField, NumberField, PageHeader, Pill, SelectField, Status, TabPanel, Tabs, TextArea, TextField, UserSelect, useConfirm } from '../ui.tsx';
import { RequirementsForm, RequirementsView } from './Sales.tsx';
import { AttachmentList, ComponentTable, IssueModal, IssueTable, MessageDraft, QcModal, ReceiveModal } from './shared.tsx';
export { AttachmentList, MessageDraft };

const STAGES = ['confirmed', 'procurement', 'goods_received', 'quality_check', 'packing', 'dispatch', 'delivered', 'closed'];
const err = (schema: { safeParse: (v: unknown) => any }, v: unknown) => { const r = schema.safeParse(v); if (r.success) return null; const f: Record<string, string> = {}; for (const i of r.error.issues) f[i.path.join('.')] ??= i.message; return new ApiError(400, 'validation', 'Please fix the highlighted fields.', { fields: f }); };

export default function OrderWorkspace() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const rawTab = sp.get('tab') ?? 'overview';
  const setTab = (t: string) => setSp(t === 'overview' ? {} : { tab: t }, { replace: true });
  const { data, error, loading, reload } = useApi<any>(`/orders/${id}`);
  const { can } = useAuth();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const o = data.order;
  const tabs = [
    { id: 'overview', label: 'Overview' }, { id: 'requirements', label: 'Requirements' }, { id: 'contents', label: 'Box contents' },
    ...(can('margin.view', 'finance.view') ? [{ id: 'costing', label: 'Costing' }] : []),
    { id: 'approvals', label: 'Approvals', count: data.counts.pending_approvals, alert: data.counts.pending_approvals > 0 },
    { id: 'procurement', label: 'Procurement', count: data.counts.components - data.counts.components_complete },
    { id: 'received', label: 'Goods received' }, { id: 'quality', label: 'Quality' }, { id: 'packing', label: 'Packing' },
    { id: 'shipments', label: 'Shipments', count: data.counts.shipments },
    ...(can('finance.view') ? [{ id: 'payments', label: 'Payments' }] : []),
    { id: 'files', label: 'Files', count: data.counts.files }, { id: 'issues', label: 'Issues', count: data.counts.open_issues, alert: data.counts.open_issues > 0 }, { id: 'activity', label: 'Activity' },
  ];
  const tab = tabs.some((t) => t.id === rawTab) ? rawTab : 'overview';
  const props = { order: o, data, reload, setTab };
  return (
    <div className="stack">
      <PageHeader crumbs={[{ to: '/orders', label: 'Orders' }]} title={<>{o.number} <span className="muted" style={{ fontWeight: 500 }}>{o.title}</span></>}
        sub={<>{data.company.name} · due {date(o.due_date)} ({relDays(o.due_date)}) · sales {data.owners.sales} · procurement {data.owners.procurement ?? <Pill tone="bad">Unassigned</Pill>}</>} />
      <ol className="stages" aria-label="Order stages">{STAGES.map((s, i) => { const idx = STAGES.indexOf(o.stage); return <li key={s} className={i < idx ? 'done' : i === idx ? 'current' : ''} aria-current={i === idx ? 'step' : undefined}>{i < idx && <Icon name="check" size={13} />}{data.stage_labels[s] ?? label(s)}</li>; })}</ol>
      <StatusBanner data={data} setTab={setTab} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} label="Order workspace sections" />
      <TabPanel id={tab}>
        {tab === 'overview' && <Overview {...props} />}
        {tab === 'requirements' && <Requirements {...props} />}
        {tab === 'contents' && <Contents {...props} />}
        {tab === 'costing' && <Costing {...props} />}
        {tab === 'approvals' && <Approvals {...props} />}
        {tab === 'procurement' && <ProcurementTab {...props} />}
        {tab === 'received' && <Received {...props} />}
        {tab === 'quality' && <Quality {...props} />}
        {tab === 'packing' && <Packing {...props} />}
        {tab === 'shipments' && <Shipments {...props} />}
        {tab === 'payments' && <Payments {...props} />}
        {tab === 'files' && <Files {...props} />}
        {tab === 'issues' && <Issues {...props} />}
        {tab === 'activity' && <Activity {...props} />}
      </TabPanel>
    </div>
  );
}
type P = { order: any; data: any; reload: () => void; setTab: (t: string) => void };

function StatusBanner({ data, setTab }: { data: any; setTab: (t: string) => void }) {
  const s = data.status; const r = data.risk;
  if (s.blocked) return <div className="callout bad" role="status"><Icon name="block" /><div><h4>Blocked: {s.reason}</h4><p><strong>{data.owners.status}</strong> owns the next step: {s.next_action}</p>{r.projected_delivery && <p className="small">Projected delivery {date(r.projected_delivery)} vs due {date(data.order.due_date)}{r.days_late ? ` (${r.days_late} days late)` : ''}.</p>}</div></div>;
  if (r.level === 'at_risk') return <div className="callout warn" role="status"><Icon name="clock" /><div><h4>At risk</h4><ul>{r.reasons.map((x: string) => <li key={x}>{x}</li>)}</ul><p className="small">Next: {s.next_action} — <strong>{data.owners.status}</strong></p></div></div>;
  return <div className="callout info" role="status"><Icon name="arrow" /><div><strong>Next action:</strong> {s.next_action} — <strong>{data.owners.status}</strong>{data.next_missing.length > 0 && <> · <button className="btn ghost sm" onClick={() => setTab('overview')}>{data.next_missing.length} item(s) before the next stage</button></>}</div></div>;
}

// ================================================================ overview
function Overview({ order: o, data, reload, setTab }: P) {
  const { can } = useAuth(); const act = useAction(); const confirm = useConfirm();
  const [edit, setEdit] = useState(false); const [blocker, setBlocker] = useState(false); const [unblock, setUnblock] = useState(false); const [msg, setMsg] = useState(false); const [team, setTeam] = useState(false);
  const [f, setF] = useState<any>({}); const [b, setB] = useState<any>({ reason: '', owner_id: null, next_action: '' }); const [res, setRes] = useState(''); const [tm, setTm] = useState<any>({ user_id: null, duty: 'packing' });
  const [override, setOverride] = useState('');
  const next = data.next_stage;
  const advance = async () => {
    if (!(await confirm({ title: `Move to ${data.stage_labels[next] ?? label(next)}?`, body: <p>{o.number} will move from <strong>{label(o.stage)}</strong> to <strong>{label(next)}</strong>. This is recorded in the activity history.</p>, confirm: 'Move stage', tone: 'primary' }))) return;
    const r = await act.run(() => post(`/orders/${o.id}/advance`, { to: next, expected_version: o.version, ...(override ? { override_reason: override } : {}) }), 'Stage updated');
    if (r) reload();
  };
  const saveEdit = async () => { const r = await act.run(() => patch(`/orders/${o.id}`, { ...f, expected_version: o.version }), 'Order updated'); if (r) { setEdit(false); reload(); } };
  return (
    <div className="stack-lg">
      {next && next !== 'delivered' && (
        <Card title={`Ready for ${data.stage_labels[next] ?? label(next)}?`} actions={can('orders.write', 'procurement.write', 'receiving.write', 'packing.write', 'shipments.write', 'finance.write') && <Button variant="primary" loading={act.pending} onClick={advance} disabled={data.next_missing.length > 0 && !(next === 'closed' && can('*') && override.length > 5)}>Move to {data.stage_labels[next] ?? label(next)}</Button>}>
          {data.next_missing.length === 0 ? <p><Icon name="check" /> Everything required is in place.</p> : <MissingList title="Before this stage, fix:" items={data.next_missing} onTab={setTab} />}
          {next === 'closed' && data.next_missing.length > 0 && can('*') && <TextField label="Founder override reason (close despite open items)" value={override} onChange={setOverride} hint="Use for write-offs or settlements agreed outside the system" />}
          {act.error?.code === 'blocked' && <MissingList title={act.error.message} items={act.error.missing} onTab={setTab} />}
          {act.error?.code === 'stale' && <FormError error={act.error} />}
        </Card>
      )}
      {next === 'delivered' && <div className="callout info"><Icon name="truck" /><div>The order becomes <strong>Delivered</strong> automatically when every box has been delivered. {data.next_missing.map((m: any) => m.message).join('; ')}</div></div>}
      <div className="grid grid-2">
        <Card title="Order" actions={can('orders.write', 'procurement.write') && <Button size="sm" onClick={() => { setF({ title: o.title, due_date: o.due_date, customer_po_ref: o.customer_po_ref ?? '', next_action: o.next_action ?? '', change_reason: '' }); setEdit(true); }}>Edit</Button>}>
          <dl className="kv">
            <dt>Customer</dt><dd><Link to={`/sales/companies/${data.company.id}`}>{data.company.name}</Link>{data.contact && <> · {data.contact.name} {data.contact.phone && <a href={`tel:${data.contact.phone}`}>{data.contact.phone}</a>}</>}</dd>
            <dt>Quotation</dt><dd>{data.quotation ? <Link to={`/sales/quotations/${data.quotation.id}`}>{data.quotation.number} v{data.quotation.version}</Link> : '—'}</dd>
            <dt>Customer approval</dt><dd>{data.customer_approval ? `${data.customer_approval.approver_name}, ${date(data.customer_approval.approved_on)} (v${data.customer_approval.version})` : '—'}</dd>
            <dt>Customer PO</dt><dd>{o.customer_po_ref ?? '—'}</dd><dt>Due date</dt><dd>{date(o.due_date)}</dd>
            <dt>Projected delivery</dt><dd>{data.risk.projected_delivery ? date(data.risk.projected_delivery) : '—'} <Status kind="risk" value={data.risk.level} /></dd>
            {data.finance && <><dt>Margin</dt><dd>Estimated {pct(data.finance.est_margin_bp)} · actual so far {pct(data.finance.actual_margin_bp)}{data.finance.margin_provisional && <span className="muted small"> (provisional)</span>}</dd></>}
            {data.finance?.balance_paise != null && <><dt>Customer balance</dt><dd>{money(data.finance.balance_paise)} of {money(data.finance.total_paise)}</dd></>}
          </dl>
        </Card>
        <Card title="Ownership" actions={<>{can('sales.assign', 'procurement.all', 'orders.write') && <Button size="sm" onClick={() => setTeam(true)}>Team</Button>}{data.order.blocker_reason ? <Button size="sm" onClick={() => setUnblock(true)}>Clear blocker</Button> : <Button size="sm" variant="danger" onClick={() => { setB({ reason: '', owner_id: null, next_action: '' }); setBlocker(true); }}>Mark blocked</Button>}</>}>
          <dl className="kv">
            <dt>Sales owner</dt><dd>{data.owners.sales} <span className="small muted">customer communication</span></dd>
            <dt>Procurement owner</dt><dd>{data.owners.procurement ?? '—'} <span className="small muted">sourcing and fulfilment</span></dd>
            <dt>Next action</dt><dd>{data.status.next_action} — <strong>{data.owners.status}</strong></dd>
            {data.team.filter((t: any) => !['sales', 'procurement'].includes(t.duty)).map((t: any) => <Fragment key={`${t.user_id}-${t.duty}`}><dt>{label(t.duty)}</dt><dd>{t.name}</dd></Fragment>)}
          </dl>
          <div className="divider" />
          <div className="row"><Button size="sm" onClick={() => setMsg(true)}>Draft customer message</Button></div>
        </Card>
      </div>
      <Card title="Open tasks on this order" pad={false}>{data.tasks.length === 0 ? <Empty title="No open tasks" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.tasks.map((t: any) => <li key={t.id}><span style={{ flex: 1 }}>{t.title}<div className="small muted">{t.owner_name}</div></span>{t.due_at && <Pill tone={t.due_at < todayStr() ? 'bad' : 'neutral'} icon="clock">{date(t.due_at)}</Pill>}<Button size="sm" onClick={() => act.run(() => post(`/tasks/${t.id}/complete`), 'Done').then(reload)}>Done</Button></li>)}</ul>}</Card>
      <Modal open={edit} onClose={() => setEdit(false)} title="Edit order" footer={<><Button onClick={() => setEdit(false)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={saveEdit}>Save</Button></>}>
        <div className="stack"><FormError error={act.error} />
          <TextField label="Title" value={f.title} onChange={(v) => setF({ ...f, title: v })} error={fieldErr(act.error, 'title')} />
          <div className="grid grid-2"><TextField label="Due date" type="date" value={f.due_date} onChange={(v) => setF({ ...f, due_date: v })} error={fieldErr(act.error, 'due_date')} /><TextField label="Customer PO number" value={f.customer_po_ref} onChange={(v) => setF({ ...f, customer_po_ref: v })} /></div>
          {f.due_date !== o.due_date && <TextField label="Why is the due date changing?" value={f.change_reason} onChange={(v) => setF({ ...f, change_reason: v })} required error={fieldErr(act.error, 'change_reason')} />}
          <TextField label="Next action (overrides the default for this stage)" value={f.next_action} onChange={(v) => setF({ ...f, next_action: v })} error={fieldErr(act.error, 'next_action')} />
          {can('sales.assign', 'procurement.all') && <div className="grid grid-2"><UserSelect label="Sales owner" value={f.sales_owner_id ?? o.sales_owner_id} onChange={(v) => setF({ ...f, sales_owner_id: v })} roles={['sales_exec', 'sales_manager', 'admin']} /><UserSelect label="Procurement owner" value={f.procurement_owner_id ?? o.procurement_owner_id} onChange={(v) => setF({ ...f, procurement_owner_id: v })} roles={['procurement_exec', 'procurement_manager', 'admin']} /></div>}
        </div>
      </Modal>
      <Modal open={blocker} onClose={() => setBlocker(false)} title="Mark order as blocked" footer={<><Button onClick={() => setBlocker(false)}>Cancel</Button><Button variant="danger" loading={act.pending} onClick={async () => { const r = await act.run(() => post(`/orders/${o.id}/blocker`, b), 'Marked blocked'); if (r) { setBlocker(false); reload(); } }}>Mark blocked</Button></>}>
        <div className="stack"><FormError error={act.error} /><p className="small muted">A blocked order must say why, who will unblock it, and what they will do. The owner is notified.</p>
          <TextArea label="What is blocking it?" value={b.reason} onChange={(v) => setB({ ...b, reason: v })} required error={fieldErr(act.error, 'reason')} />
          <UserSelect label="Who owns unblocking it?" value={b.owner_id} onChange={(v) => setB({ ...b, owner_id: v })} required error={fieldErr(act.error, 'owner_id')} />
          <TextField label="Next action" value={b.next_action} onChange={(v) => setB({ ...b, next_action: v })} required error={fieldErr(act.error, 'next_action')} /></div>
      </Modal>
      <Modal open={unblock} onClose={() => setUnblock(false)} title="Clear blocker" footer={<><Button onClick={() => setUnblock(false)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => { const r = await act.run(() => post(`/orders/${o.id}/unblock`, { resolution: res }), 'Blocker cleared'); if (r) { setUnblock(false); reload(); } }}>Clear</Button></>}>
        <div className="stack"><FormError error={act.error} /><p>{o.blocker_reason}</p><TextArea label="How was it resolved?" value={res} onChange={setRes} required error={fieldErr(act.error, 'resolution')} /></div>
      </Modal>
      <Modal open={team} onClose={() => setTeam(false)} title="Order team" footer={<><Button onClick={() => setTeam(false)}>Close</Button><Button variant="primary" loading={act.pending} disabled={!tm.user_id} onClick={() => act.run(() => post(`/orders/${o.id}/team`, tm), 'Added to team').then((r) => r && reload())}>Add</Button></>}>
        <div className="stack"><FormError error={act.error} />
          <ul className="checklist">{data.team.map((t: any) => <li key={`${t.user_id}-${t.duty}`}><span style={{ flex: 1 }}>{t.name} — {label(t.duty)}</span>{!['sales', 'procurement'].includes(t.duty) && <Button size="sm" variant="ghost" onClick={() => act.run(() => post(`/orders/${o.id}/team`, { user_id: t.user_id, duty: t.duty, remove: true }), 'Removed').then(reload)}>Remove</Button>}</li>)}</ul>
          <div className="grid grid-2"><UserSelect label="Person" value={tm.user_id} onChange={(v) => setTm({ ...tm, user_id: v })} /><SelectField label="Duty" value={tm.duty} onChange={(v) => setTm({ ...tm, duty: v })} placeholder={null} options={['packing', 'quality', 'dispatch', 'finance', 'procurement', 'sales'].map((d) => ({ value: d, label: label(d) }))} /></div></div>
      </Modal>
      {msg && <Modal open onClose={() => setMsg(false)} title="Message the customer"><MessageDraft party="customer" entityType="order" entityId={o.id} defaultKey="dispatch_tracking" onLogged={() => { setMsg(false); reload(); }} /></Modal>}
    </div>
  );
}

function Requirements({ order: o, reload }: P) {
  const { can } = useAuth(); const act = useAction(); const [edit, setEdit] = useState(false);
  return <Card title="Customer requirements" actions={can('orders.write') && !edit && <Button size="sm" onClick={() => setEdit(true)}>Edit</Button>}>
    {edit ? <RequirementsForm value={o.requirements} pending={act.pending} error={act.error} onSave={async (v) => { const r = await act.run(() => patch(`/orders/${o.id}`, { requirements: v, expected_version: o.version }), 'Requirements saved'); if (r) { setEdit(false); reload(); } }} /> : <RequirementsView req={o.requirements} />}
  </Card>;
}

// ================================================================ contents: variants, BOM, destinations, allocations, artwork
function Contents({ order: o, reload: reloadOrder }: P) {
  const { can } = useAuth(); const act = useAction(); const confirm = useConfirm();
  const { data, error, loading, reload } = useApi<any>(`/orders/${o.id}/contents`);
  const [variant, setVariant] = useState<any | null>(null); const [bom, setBom] = useState<any | null>(null); const [dest, setDest] = useState<any | null>(null); const [alloc, setAlloc] = useState<Record<string, number> | null>(null); const [art, setArt] = useState<any | null>(null);
  const [decision, setDecision] = useState<any | null>(null);
  const editable = can('orders.write', 'procurement.write') && !['packing', 'dispatch', 'delivered', 'closed'].includes(o.stage) || can('*');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const refresh = () => { reload(); reloadOrder(); };
  const saveVariant = async () => { const body = { name: variant.name, qty: variant.qty, customisation: variant.customisation || null, artwork_required: !!variant.artwork_required, change_reason: variant.change_reason || undefined }; const r = await act.run(() => (variant.id ? patch(`/variants/${variant.id}`, body) : post(`/orders/${o.id}/variants`, body)), 'Saved'); if (r) { setVariant(null); refresh(); } };
  const saveBom = async () => { const body = { component_name: bom.component_name, category: bom.category || null, qty_per_box: bom.qty_per_box, unit: bom.unit || 'pc', is_packaging: !!bom.is_packaging, is_critical: !!bom.is_critical, spec: bom.spec || null, lead_time_days: bom.lead_time_days || null, ...(can('costing.view') ? { est_unit_cost_paise: bom.est_unit_cost_paise ?? 0 } : {}) }; const r = await act.run(() => (bom.id ? patch(`/bom/${bom.id}`, body) : post(`/variants/${bom.variant_id}/bom`, body)), 'Component saved'); if (r) { setBom(null); refresh(); } };
  const saveDest = async () => { const v = err(destinationInput, dest); if (v) { act.setError(v); return; } const r = await act.run(() => (dest.id ? patch(`/destinations/${dest.id}`, dest) : post(`/orders/${o.id}/destinations`, dest)), 'Destination saved'); if (r) { setDest(null); refresh(); } };
  const saveAlloc = async () => { const rows = Object.entries(alloc!).map(([k, qty]) => { const [variant_id, destination_id] = k.split(':').map(Number); return { variant_id, destination_id, qty: qty || 0 }; }); const r = await act.run(() => put(`/orders/${o.id}/allocations`, { rows }), 'Allocations saved'); if (r) { setAlloc(null); refresh(); } };
  const allocOf = (v: number, d: number) => data.allocations.find((a: any) => a.variant_id === v && a.destination_id === d)?.qty ?? 0;
  return (
    <div className="stack-lg">
      {!editable && <div className="callout info"><Icon name="lock" /><div>Box contents are locked once packing starts{can('*') ? ' (you can still edit as founder/admin)' : ''}.</div></div>}
      {data.variants.map((v: any) => {
        const arts = data.artworks.filter((a: any) => a.variant_id === v.id || a.variant_id == null);
        const approved = arts.find((a: any) => a.status === 'approved');
        return (
          <Card key={v.id} title={<>{v.name} <span className="muted">× {v.qty} boxes</span></>} actions={editable && <><Button size="sm" onClick={() => setVariant({ ...v, artwork_required: !!v.artwork_required, change_reason: '' })}>Edit box</Button><Button size="sm" icon="plus" onClick={() => setBom({ variant_id: v.id, component_name: '', qty_per_box: 1, unit: 'pc', category: '', is_packaging: false, is_critical: false, spec: '', lead_time_days: null, est_unit_cost_paise: 0 })}>Add component</Button></>} pad={false}>
            <div className="card-pad small">{v.customisation ? <>Customisation: {v.customisation}</> : <span className="muted">No customisation.</span>} {v.artwork_required ? (approved ? <Pill tone="ok">Artwork v{approved.version} approved{approved.override_reason ? ' (override)' : ''}</Pill> : <Pill tone="warn">Artwork approval needed</Pill>) : null}</div>
            {v.bom.length === 0 ? <Empty title="No components yet">Add what goes into this box so procurement can source it and packing gets a checklist.</Empty> : (
              <div className="table-wrap"><table className="table responsive"><thead><tr><th>Component</th><th>Category</th><th className="num">Per box</th><th className="num">Total</th><th>Spec</th>{can('costing.view') && <th className="num">Est. unit cost</th>}<th><span className="sr-only">Edit</span></th></tr></thead>
                <tbody>{v.bom.map((b: any) => <tr key={b.id}><td data-label="Component"><strong>{b.component_name}</strong> {b.is_packaging ? <Pill tone="neutral">Packaging</Pill> : null} {b.is_critical ? <Pill tone="warn">Critical</Pill> : null}</td><td data-label="Category">{b.category ?? '—'}</td><td data-label="Per box" className="num">{b.qty_per_box} {b.unit}</td><td data-label="Total" className="num">{b.qty_per_box * v.qty}</td><td data-label="Spec" className="small">{b.spec ?? '—'}</td>{can('costing.view') && <td data-label="Cost" className="num">{b.est_unit_cost_paise ? money(b.est_unit_cost_paise) : <span className="muted">Not set</span>}</td>}<td>{editable && <div className="row end"><Button size="sm" variant="ghost" onClick={() => setBom({ ...b, is_packaging: !!b.is_packaging, is_critical: !!b.is_critical })}>Edit</Button><Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: `Remove ${b.component_name}?`, body: <p>It will no longer be sourced or appear on packing checklists for “{v.name}”. The change is recorded in the order history.</p>, confirm: 'Remove component', tone: 'danger' })) act.run(() => patch(`/bom/${b.id}`, { archived: true }), 'Component removed').then((r) => r && refresh()); }}>Remove</Button></div>}</td></tr>)}</tbody></table></div>
            )}
          </Card>
        );
      })}
      {editable && <div><Button icon="plus" onClick={() => setVariant({ name: '', qty: 1, customisation: '', artwork_required: false })}>Add box variant</Button></div>}
      <div className="grid grid-2">
        <Card title="Delivery destinations" actions={can('orders.write', 'procurement.write') && <Button size="sm" icon="plus" onClick={() => setDest({ label: '', address: '', city: '', pincode: '', contact_name: '', phone: '' })}>Add</Button>} pad={false}>
          {data.destinations.length === 0 ? <Empty title="No destinations" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.destinations.map((d: any) => <li key={d.id}><span style={{ flex: 1 }}><strong>{d.label}</strong><div className="small">{d.address}{d.city && `, ${d.city}`} {d.pincode}</div>{d.contact_name && <div className="small muted">{d.contact_name} {d.phone}</div>}</span>{can('orders.write', 'procurement.write') && <Button size="sm" variant="ghost" onClick={() => setDest({ ...d })}>Edit</Button>}</li>)}</ul>}
        </Card>
        <Card title="Boxes per destination" actions={can('orders.write', 'procurement.write') && data.destinations.length > 0 && <Button size="sm" onClick={() => setAlloc(Object.fromEntries(data.variants.flatMap((v: any) => data.destinations.map((d: any) => [`${v.id}:${d.id}`, allocOf(v.id, d.id)]))))}>Edit split</Button>} pad={false}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Box</th>{data.destinations.map((d: any) => <th key={d.id} className="num">{d.label}</th>)}<th className="num">Allocated</th></tr></thead>
            <tbody>{data.variants.map((v: any) => { const sum = data.destinations.reduce((a: number, d: any) => a + allocOf(v.id, d.id), 0); return <tr key={v.id}><td>{v.name}</td>{data.destinations.map((d: any) => <td key={d.id} className="num">{allocOf(v.id, d.id)}</td>)}<td className="num">{sum === v.qty ? <Pill tone="ok">{sum} / {v.qty}</Pill> : <Pill tone="warn">{sum} / {v.qty}</Pill>}</td></tr>; })}</tbody></table></div>
        </Card>
      </div>
      <Card title="Artwork and proofs" actions={can('orders.write', 'procurement.write') && <Button size="sm" icon="plus" onClick={() => setArt({ variant_id: '', attachment_id: null, filename: '', notes: '' })}>Upload new version</Button>} pad={false}>
        {data.artworks.length === 0 ? <Empty title="No artwork uploaded" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>Version</th><th>For</th><th>File</th><th>Status</th><th>Approval</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{data.artworks.map((a: any) => <tr key={a.id}><td data-label="Version">v{a.version}</td><td data-label="For">{data.variants.find((v: any) => v.id === a.variant_id)?.name ?? 'All boxes'}</td><td data-label="File">{a.attachment_id ? <a href={`/api/attachments/${a.attachment_id}/download`} target="_blank" rel="noreferrer">{a.filename}</a> : '—'}<div className="small muted">{a.notes}</div></td><td data-label="Status"><Status kind="approval" value={a.status} /></td>
            <td data-label="Approval" className="small">{a.approved_by_name ? `${a.approved_by_name}, ${date(a.approved_on)}` : a.override_reason ? <span style={{ color: 'var(--bad-fg)' }}>Override by {a.override_name}: {a.override_reason}</span> : '—'}</td>
            <td>{a.status === 'pending' && can('orders.write', 'procurement.write') && <div className="row end"><Button size="sm" onClick={() => setDecision({ a, decision: 'rejected', note: '' })}>Reject</Button>{can('quotes.approve', 'procurement.override') && <Button size="sm" onClick={() => setDecision({ a, decision: 'override', reason: '' })}>Override</Button>}<Button size="sm" variant="primary" onClick={() => setDecision({ a, decision: 'approved', approved_by_name: '', approved_on: todayStr() })}>Record approval</Button></div>}</td></tr>)}</tbody></table></div>}
      </Card>

      <Modal open={!!variant} onClose={() => setVariant(null)} title={variant?.id ? 'Edit box variant' : 'Add box variant'} footer={<><Button onClick={() => setVariant(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={saveVariant}>Save</Button></>}>
        {variant && <div className="stack"><FormError error={act.error} /><TextField label="Name" value={variant.name} onChange={(v) => setVariant({ ...variant, name: v })} required error={fieldErr(act.error, 'name')} /><NumberField label="Number of boxes" value={variant.qty} onChange={(v) => setVariant({ ...variant, qty: v })} required error={fieldErr(act.error, 'qty')} /><TextField label="Customisation" value={variant.customisation} onChange={(v) => setVariant({ ...variant, customisation: v })} /><Check label="Needs customer-approved artwork before packing" checked={variant.artwork_required} onChange={(v) => setVariant({ ...variant, artwork_required: v })} />{variant.id && variant.qty !== data.variants.find((x: any) => x.id === variant.id)?.qty && o.stage !== 'confirmed' && <TextField label="Why is the quantity changing?" value={variant.change_reason} onChange={(v) => setVariant({ ...variant, change_reason: v })} required error={fieldErr(act.error, 'change_reason')} />}</div>}
      </Modal>
      <Modal open={!!bom} onClose={() => setBom(null)} title={bom?.id ? 'Edit component' : 'Add component'} footer={<><Button onClick={() => setBom(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={saveBom}>Save</Button></>}>
        {bom && <div className="stack"><FormError error={act.error} />
          <TextField label="Component" value={bom.component_name} onChange={(v) => setBom({ ...bom, component_name: v })} required error={fieldErr(act.error, 'component_name')} placeholder="e.g. Almonds 200g pouch" />
          <div className="grid grid-3"><NumberField label="Quantity per box" value={bom.qty_per_box} onChange={(v) => setBom({ ...bom, qty_per_box: v })} required error={fieldErr(act.error, 'qty_per_box')} /><TextField label="Unit" value={bom.unit} onChange={(v) => setBom({ ...bom, unit: v })} /><SelectField label="Category" value={bom.category ?? ''} onChange={(v) => setBom({ ...bom, category: v })} options={data.categories.map((c: string) => ({ value: c, label: c }))} /></div>
          <TextField label="Specification" value={bom.spec ?? ''} onChange={(v) => setBom({ ...bom, spec: v })} placeholder="Size, colour, brand, print details…" />
          <div className="grid grid-2"><NumberField label="Typical lead time (days)" value={bom.lead_time_days} onChange={(v) => setBom({ ...bom, lead_time_days: v })} hint="Used for delivery risk before a PO exists" />{can('costing.view') && <MoneyField label="Estimated unit cost" value={bom.est_unit_cost_paise} onChange={(v) => setBom({ ...bom, est_unit_cost_paise: v ?? 0 })} />}</div>
          <div className="row"><Check label="Packaging material" checked={bom.is_packaging} onChange={(v) => setBom({ ...bom, is_packaging: v })} /><Check label="Critical (needs a backup source)" checked={bom.is_critical} onChange={(v) => setBom({ ...bom, is_critical: v })} /></div></div>}
      </Modal>
      <Modal open={!!dest} onClose={() => setDest(null)} title={dest?.id ? 'Edit destination' : 'Add destination'} footer={<><Button onClick={() => setDest(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={saveDest}>Save</Button></>}>
        {dest && <div className="stack"><FormError error={act.error} /><TextField label="Label" value={dest.label} onChange={(v) => setDest({ ...dest, label: v })} required error={fieldErr(act.error, 'label')} /><TextArea label="Address" value={dest.address} onChange={(v) => setDest({ ...dest, address: v })} required error={fieldErr(act.error, 'address')} rows={2} /><div className="grid grid-2"><TextField label="City" value={dest.city} onChange={(v) => setDest({ ...dest, city: v })} /><TextField label="PIN code" value={dest.pincode} onChange={(v) => setDest({ ...dest, pincode: v })} error={fieldErr(act.error, 'pincode')} inputMode="numeric" /><TextField label="Receiver name" value={dest.contact_name} onChange={(v) => setDest({ ...dest, contact_name: v })} /><TextField label="Receiver phone" type="tel" value={dest.phone} onChange={(v) => setDest({ ...dest, phone: v })} error={fieldErr(act.error, 'phone')} /></div></div>}
      </Modal>
      <Modal open={!!alloc} onClose={() => setAlloc(null)} title="Split boxes between destinations" wide footer={<><Button onClick={() => setAlloc(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={saveAlloc}>Save split</Button></>}>
        {alloc && <div className="stack"><FormError error={act.error} /><div className="table-wrap"><table className="table"><thead><tr><th>Box</th>{data.destinations.map((d: any) => <th key={d.id}>{d.label}</th>)}<th className="num">Total / ordered</th></tr></thead>
          <tbody>{data.variants.map((v: any) => { const sum = data.destinations.reduce((a: number, d: any) => a + (alloc[`${v.id}:${d.id}`] || 0), 0); return <tr key={v.id}><td>{v.name}</td>{data.destinations.map((d: any) => <td key={d.id}><input className="input" type="number" min={0} style={{ maxWidth: 110 }} aria-label={`${v.name} to ${d.label}`} value={alloc[`${v.id}:${d.id}`] ?? 0} onChange={(e) => setAlloc({ ...alloc, [`${v.id}:${d.id}`]: Number(e.target.value) })} /></td>)}<td className="num">{sum === v.qty ? <Pill tone="ok">{sum} / {v.qty}</Pill> : <Pill tone={sum > v.qty ? 'bad' : 'warn'}>{sum} / {v.qty}</Pill>}</td></tr>; })}</tbody></table></div></div>}
      </Modal>
      <Modal open={!!art} onClose={() => setArt(null)} title="Upload artwork version" footer={<><Button onClick={() => setArt(null)}>Cancel</Button><Button variant="primary" loading={act.pending} disabled={!art?.attachment_id} onClick={async () => { const r = await act.run(() => post(`/orders/${o.id}/artworks`, { variant_id: art.variant_id ? Number(art.variant_id) : null, attachment_id: art.attachment_id, notes: art.notes }), 'Artwork version added'); if (r) { setArt(null); refresh(); } }}>Save version</Button></>}>
        {art && <div className="stack"><FormError error={act.error} /><SelectField label="Applies to" value={art.variant_id} onChange={(v) => setArt({ ...art, variant_id: v })} placeholder="All boxes" options={data.variants.map((v: any) => ({ value: v.id, label: v.name }))} /><div className="row"><FileButton entity="order" id={o.id} kind="artwork" label="Choose artwork file" onDone={(a) => setArt({ ...art, attachment_id: a.id, filename: a.filename })} /><span className="small">{art.filename}</span></div><TextField label="Notes" value={art.notes} onChange={(v) => setArt({ ...art, notes: v })} /><p className="small muted">The new version replaces any version still waiting for approval.</p></div>}
      </Modal>
      <Modal open={!!decision} onClose={() => setDecision(null)} title={decision?.decision === 'approved' ? 'Record customer artwork approval' : decision?.decision === 'override' ? 'Use artwork without customer approval' : 'Reject artwork'} footer={<><Button onClick={() => setDecision(null)}>Cancel</Button><Button variant={decision?.decision === 'approved' ? 'primary' : 'danger'} loading={act.pending} onClick={async () => { const { a, ...body } = decision; const r = await act.run(() => post(`/artworks/${a.id}/decision`, body), 'Saved'); if (r) { setDecision(null); refresh(); } }}>Save</Button></>}>
        {decision && <div className="stack"><FormError error={act.error} />
          {decision.decision === 'approved' && <><TextField label="Approved by (customer)" value={decision.approved_by_name} onChange={(v) => setDecision({ ...decision, approved_by_name: v })} required error={fieldErr(act.error, 'approved_by_name')} /><TextField label="Date" type="date" value={decision.approved_on} onChange={(v) => setDecision({ ...decision, approved_on: v })} /></>}
          {decision.decision === 'rejected' && <TextArea label="What must change?" value={decision.note} onChange={(v) => setDecision({ ...decision, note: v })} required error={fieldErr(act.error, 'note')} />}
          {decision.decision === 'override' && <><div className="callout warn"><Icon name="alert" /><div>This is logged as an exception with your name. Packing may then use artwork the customer has not approved.</div></div><TextArea label="Reason" value={decision.reason} onChange={(v) => setDecision({ ...decision, reason: v })} required error={fieldErr(act.error, 'reason')} /></>}
        </div>}
      </Modal>
    </div>
  );
}

// ================================================================ costing
function Costing({ order: o }: P) {
  const { can } = useAuth(); const act = useAction();
  const { data, error, loading, reload } = useApi<any>(`/orders/${o.id}/costing`);
  const [add, setAdd] = useState<any | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const f = data.finance;
  return (
    <div className="stack-lg">
      <div className="grid grid-4">
        <div className="card kpi"><span className="v">{money(f.revenue_paise)}</span><span className="l">Revenue before tax</span></div>
        <div className="card kpi"><span className="v">{pct(f.est_margin_bp)}</span><span className="l">Estimated margin at quotation ({money(f.est_cost_paise)} cost)</span></div>
        <div className="card kpi"><span className="v">{pct(f.actual_margin_bp)}</span><span className="l">Actual margin so far ({money(f.actual_cost_paise)} cost)</span></div>
        <div className="card kpi"><span className="v">{f.margin_provisional ? 'Provisional' : 'Complete'}</span><span className="l">{f.margin_provisional ? 'Some components are not on a PO yet' : 'All components are on POs'}</span></div>
      </div>
      <p className="small muted"><Icon name="info" size={14} /> Actual cost = issued purchase orders (pre-tax{f.vendor_tax_in_cost ? ' plus vendor tax' : ''}, plus shipping) + packaging, customisation, shipping and other costs entered below. Whether vendor GST counts as cost is a Setting to confirm with your accountants.</p>
      <div className="grid grid-2">
        <Card title="Quoted lines (estimate)" pad={false}><div className="table-wrap"><table className="table"><thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Est. cost</th></tr></thead><tbody>{data.quote_lines.map((l: any, i: number) => <tr key={i}><td>{l.description}</td><td className="num">{l.qty}</td><td className="num">{money(l.unit_price_paise)}</td><td className="num">{money(l.unit_cost_paise)}</td></tr>)}</tbody></table></div></Card>
        <Card title="Purchase orders" pad={false}>{data.purchase_orders.length === 0 ? <Empty title="No purchase orders yet" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.purchase_orders.map((p: any) => <li key={p.id}><span style={{ flex: 1 }}><Link to={`/procurement/purchase-orders/${p.id}`}>{p.number}</Link> · {p.vendor}</span><Status kind="po" value={p.status} /></li>)}</ul>}<div className="card-pad small">Vendor cost counted: <strong>{money(f.vendor_cost_paise)}</strong></div></Card>
      </div>
      <Card title="Other costs" actions={can('finance.write', 'procurement.write') && <Button size="sm" icon="plus" onClick={() => setAdd({ kind: 'packaging', description: '', amount_paise: null, incurred_on: todayStr() })}>Add cost</Button>} pad={false}>
        {data.costs.length === 0 ? <Empty title="No extra costs recorded" /> : <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th className="num">Amount</th><th>By</th></tr></thead><tbody>{data.costs.map((c: any) => <tr key={c.id}><td>{date(c.incurred_on)}</td><td>{label(c.kind)}</td><td>{c.description}</td><td className="num">{money(c.amount_paise)}</td><td>{c.recorded_name}</td></tr>)}</tbody></table></div>}
      </Card>
      <Modal open={!!add} onClose={() => setAdd(null)} title="Add cost" footer={<><Button onClick={() => setAdd(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => { const r = await act.run(() => post(`/orders/${o.id}/costs`, add), 'Cost added'); if (r) { setAdd(null); reload(); } }}>Add</Button></>}>
        {add && <div className="stack"><FormError error={act.error} /><SelectField label="Type" value={add.kind} onChange={(v) => setAdd({ ...add, kind: v })} placeholder={null} options={['packaging', 'customisation', 'shipping', 'other'].map((k) => ({ value: k, label: label(k) }))} /><TextField label="Description" value={add.description} onChange={(v) => setAdd({ ...add, description: v })} required error={fieldErr(act.error, 'description')} /><div className="grid grid-2"><MoneyField label="Amount" value={add.amount_paise} onChange={(v) => setAdd({ ...add, amount_paise: v })} required error={fieldErr(act.error, 'amount_paise')} /><TextField label="Date" type="date" value={add.incurred_on} onChange={(v) => setAdd({ ...add, incurred_on: v })} /></div></div>}
      </Modal>
    </div>
  );
}

// ================================================================ approvals
function Approvals({ order: o, reload: reloadOrder }: P) {
  const { data, error, loading, reload } = useApi<any>(`/orders/${o.id}/approvals`);
  const act = useAction(); const { can } = useAuth();
  const [reason, setReason] = useState(''); const [open, setOpen] = useState(false);
  const [deciding, setDeciding] = useState<any | null>(null); const [note, setNote] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="stack">
      {can('packing.write', 'procurement.write') && ['procurement', 'goods_received', 'quality_check'].includes(o.stage) && <div className="row"><Button onClick={() => setOpen(true)}>Request partial-packing exception</Button><span className="small muted">Lets packing start before every component is accepted. Needs a procurement manager or the founder.</span></div>}
      <Card pad={false}>{data.rows.length === 0 ? <Empty title="No approvals on this order" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>Request</th><th>Requested</th><th>Status</th><th><span className="sr-only">Decide</span></th></tr></thead>
        <tbody>{data.rows.map((a: any) => <tr key={a.id}><td data-label="Request"><strong>{a.title}</strong><div className="small muted">{a.detail}</div>{a.decision_note && <div className="small">Note: {a.decision_note}</div>}</td><td data-label="Requested">{a.requested_name}<div className="small muted">{dateTime(a.requested_at)}</div></td><td data-label="Status"><Status kind="approval" value={a.status} />{a.decided_name && <div className="small muted">{a.decided_name} · {dateTime(a.decided_at)}</div>}</td>
          <td>{a.can_decide && <div className="row end"><Button size="sm" variant="danger" onClick={() => setDeciding({ a, decision: 'rejected' })}>Reject</Button><Button size="sm" variant="primary" onClick={() => setDeciding({ a, decision: 'approved' })}>Approve</Button></div>}</td></tr>)}</tbody></table></div>}</Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Request partial-packing exception" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => { const r = await act.run(() => post(`/orders/${o.id}/partial-packing`, { reason }), 'Exception requested'); if (r) { setOpen(false); reload(); reloadOrder(); } }}>Request</Button></>}>
        <div className="stack"><FormError error={act.error} /><TextArea label="Why should packing start now?" value={reason} onChange={setReason} required error={fieldErr(act.error, 'reason')} hint="e.g. 'Pack the 32 good boxes for the Bengaluru event; 8 follow after replacement'" /></div>
      </Modal>
      <Modal open={!!deciding} onClose={() => setDeciding(null)} title={deciding?.decision === 'approved' ? 'Approve' : 'Reject'} footer={<><Button onClick={() => setDeciding(null)}>Cancel</Button><Button variant={deciding?.decision === 'approved' ? 'primary' : 'danger'} loading={act.pending} onClick={async () => { const r = await act.run(() => post(`/approvals/${deciding.a.id}/decide`, { decision: deciding.decision, note: note || undefined }), 'Decision recorded'); if (r) { setDeciding(null); setNote(''); reload(); reloadOrder(); } }}>Confirm</Button></>}>
        <div className="stack"><FormError error={act.error} /><p>{deciding?.a.title}</p><TextArea label={deciding?.decision === 'rejected' ? 'Reason (required)' : 'Note'} value={note} onChange={setNote} error={fieldErr(act.error, 'note')} /></div>
      </Modal>
    </div>
  );
}

// ================================================================ procurement
function ProcurementTab({ order: o }: P) {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<any>(`/orders/${o.id}/procurement`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="stack-lg">
      <Card title="Components: required vs ordered vs received" actions={can('procurement.write') && <><Link className="btn sm" to={`/procurement/rfqs?new=1&order=${o.id}`}>Request quotes</Link><Link className="btn sm primary" to={`/procurement/purchase-orders?new=1&order=${o.id}`}>New purchase order</Link></>} pad={false}><ComponentTable rows={data.components} /></Card>
      <div className="grid grid-2">
        <Card title="Requests for quotation" pad={false}>{data.rfqs.length === 0 ? <Empty title="No RFQs" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.rfqs.map((r: any) => <li key={r.id}><span style={{ flex: 1 }}><Link to={`/procurement/rfqs/${r.id}`}>{r.title}</Link> × {r.qty}<div className="small muted">{r.received}/{r.requested} quotes received{r.is_critical ? ' · critical' : ''}</div></span><Status kind="approval" value={r.status === 'open' ? 'pending' : r.status === 'awarded' ? 'approved' : 'rejected'} label={label(r.status)} /></li>)}</ul>}</Card>
        <Card title="Purchase orders" pad={false}>{data.purchase_orders.length === 0 ? <Empty title="No purchase orders" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.purchase_orders.map((p: any) => <li key={p.id}><span style={{ flex: 1 }}><Link to={`/procurement/purchase-orders/${p.id}`}>{p.number}</Link> · {p.vendor}<div className="small muted">Promised {date(p.promised_date)}{p.late && ' · overdue'}{p.totals && ` · ${money(p.totals.total_paise)}`}</div></span>{p.late && <Pill tone="bad">Late</Pill>}<Status kind="po" value={p.status} /></li>)}</ul>}</Card>
      </div>
    </div>
  );
}

function Received({ order: o, reload: reloadOrder }: P) {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<any>(`/orders/${o.id}/procurement`);
  const [rcv, setRcv] = useState<any | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const open = data.purchase_orders.filter((p: any) => ['issued', 'confirmed', 'partially_received'].includes(p.status));
  return (
    <div className="stack-lg">
      <Card title="Expected from vendors" pad={false}>{open.length === 0 ? <Empty title="Nothing outstanding" /> : (
        <div className="table-wrap"><table className="table responsive"><thead><tr><th>PO</th><th>Vendor</th><th>Promised</th><th>Lines outstanding</th><th><span className="sr-only">Receive</span></th></tr></thead>
          <tbody>{open.map((p: any) => <tr key={p.id}><td data-label="PO"><Link to={`/procurement/purchase-orders/${p.id}`}>{p.number}</Link></td><td data-label="Vendor">{p.vendor}</td><td data-label="Promised">{date(p.promised_date)} {p.late && <Pill tone="bad">Overdue</Pill>}</td><td data-label="Outstanding" className="small">{p.lines.filter((l: any) => l.outstanding > 0).map((l: any) => `${l.outstanding} × ${l.description}`).join(', ') || '—'}</td><td>{can('receiving.write') && <Button size="sm" variant="primary" onClick={() => setRcv(p)}>Receive</Button>}</td></tr>)}</tbody></table></div>)}
      </Card>
      <Card title="Reconciliation" pad={false}><ComponentTable rows={data.components} /></Card>
      {rcv && <ReceiveModal open po={rcv} lines={rcv.lines.filter((l: any) => l.outstanding > 0)} onClose={() => setRcv(null)} onDone={() => { reload(); reloadOrder(); }} />}
    </div>
  );
}

function Quality({ order: o, reload: reloadOrder }: P) {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<any>(`/orders/${o.id}/quality`);
  const [line, setLine] = useState<any | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const waiting = data.lines.filter((l: any) => l.awaiting_qc > 0);
  return (
    <div className="stack-lg">
      <Card title="Waiting for a quality check" pad={false}>{waiting.length === 0 ? <Empty title="Nothing waiting">Received goods appear here until they are checked.</Empty> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>Item</th><th>PO / vendor</th><th className="num">Waiting</th><th><span className="sr-only">Check</span></th></tr></thead><tbody>{waiting.map((l: any) => <tr key={l.id}><td data-label="Item">{l.description}</td><td data-label="PO">{l.po_number} · {l.vendor}</td><td data-label="Waiting" className="num">{l.awaiting_qc}</td><td>{can('quality.write') && <Button size="sm" variant="primary" onClick={() => setLine(l)}>Record check</Button>}</td></tr>)}</tbody></table></div>}</Card>
      <Card title="Check history" pad={false}>{data.checks.length === 0 ? <Empty title="No checks yet" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>When</th><th>Item</th><th>Outcome</th><th className="num">Accepted</th><th className="num">Rejected</th><th>Reason / action</th><th>By</th></tr></thead><tbody>{data.checks.map((c: any) => <tr key={c.id}><td data-label="When">{dateTime(c.checked_at)}</td><td data-label="Item">{c.description}<div className="small muted">{c.po_number}</div></td><td data-label="Outcome"><Pill tone={c.outcome === 'passed' ? 'ok' : c.outcome === 'failed' ? 'bad' : 'warn'}>{label(c.outcome)}</Pill></td><td data-label="Accepted" className="num">{c.qty_accepted}</td><td data-label="Rejected" className="num">{c.qty_rejected}</td><td data-label="Reason" className="small">{c.reason ?? '—'}{c.action && ` (${label(c.action)})`}</td><td data-label="By">{c.checked_name}</td></tr>)}</tbody></table></div>}</Card>
      <QcModal line={line} open={!!line} onClose={() => setLine(null)} onDone={() => { reload(); reloadOrder(); }} />
    </div>
  );
}

// ================================================================ packing
function Packing({ order: o, reload: reloadOrder, setTab }: P) {
  const { can, me } = useAuth(); const act = useAction();
  const { data, error, loading, reload } = useApi<any>(`/orders/${o.id}/packing`);
  const [nb, setNb] = useState<any | null>(null); const [fail, setFail] = useState<any | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const refresh = () => { reload(); reloadOrder(); };
  return (
    <div className="stack-lg">
      {data.packing_missing.length > 0 && <MissingList title={data.exception?.status === 'approved' ? 'Partial-packing exception approved — packing may start, but these are still open' : 'Packing cannot start yet'} items={data.packing_missing} onTab={setTab} />}
      <Card title="Boxes" pad={false}><div className="table-wrap"><table className="table responsive"><thead><tr><th>Box</th><th className="num">Ordered</th><th className="num">In batches</th><th className="num">Checked</th><th className="num">Can pack now</th><th>Progress</th><th><span className="sr-only">Start batch</span></th></tr></thead>
        <tbody>{data.variants.map((v: any) => <tr key={v.variant_id}><td data-label="Box">{v.name}{v.short.length > 0 && v.remaining > 0 && <div className="small" style={{ color: 'var(--warn-fg)' }}>{v.short[0]}</div>}</td><td data-label="Ordered" className="num">{v.qty}</td><td data-label="Batched" className="num">{v.batched}</td><td data-label="Checked" className="num">{v.checked}</td><td data-label="Packable" className="num">{v.packable_now}</td><td data-label="Progress"><div className="bar ok" role="progressbar" aria-valuenow={v.checked} aria-valuemin={0} aria-valuemax={v.qty} aria-label={`${v.checked} of ${v.qty} checked`}><span style={{ width: `${(v.checked / v.qty) * 100}%` }} /></div></td>
          <td>{can('packing.write') && ['packing', 'dispatch'].includes(data.stage) && v.remaining > 0 && <Button size="sm" variant="primary" onClick={() => setNb({ variant_id: v.variant_id, name: v.name, qty: Math.min(v.remaining, v.packable_now || v.remaining), max: v.remaining, assigned_to: me!.user.id })}>Start batch</Button>}</td></tr>)}</tbody></table></div></Card>
      {data.batches.length === 0 ? <Empty title="No packing batches yet" /> : data.batches.map((b: any) => {
        const done = b.items.filter((i: any) => i.done).length;
        return (
          <Card key={b.id} title={<>Batch #{b.id}: {b.qty} × {b.variant_name} <Status kind="batch" value={b.status} /></>} actions={<>
            {b.status === 'in_progress' && can('packing.write') && <Button size="sm" variant="primary" disabled={done < b.items.length} loading={act.pending} onClick={() => act.run(() => post(`/packing-batches/${b.id}/packed`), 'Batch marked packed').then((r) => r && refresh())}>Mark packed ({done}/{b.items.length})</Button>}
            {b.status === 'packed' && can('packing.write', 'quality.write') && <><Button size="sm" variant="danger" onClick={() => setFail({ id: b.id, note: '' })}>Fail check</Button><Button size="sm" variant="primary" disabled={data.checker_must_differ && b.packed_by === me!.user.id} title={data.checker_must_differ && b.packed_by === me!.user.id ? 'Someone other than the packer must check' : undefined} onClick={() => act.run(() => post(`/packing-batches/${b.id}/check`, { result: 'pass' }), 'Batch checked').then((r) => r && refresh())}>Pass check</Button></>}
          </>}>
            <p className="small muted">Assigned to {b.assigned_name ?? '—'}{b.packed_name && ` · packed by ${b.packed_name} ${dateTime(b.packed_at)}`}{b.checked_name && ` · checked by ${b.checked_name} ${dateTime(b.checked_at)}`}{b.exception_approval_id && ' · under partial-packing exception'}</p>
            {b.status === 'checked' ? <details><summary className="small">Show checklist ({b.items.length} items, all done)</summary><ul className="checklist">{b.items.map((i: any) => <li key={i.id}><span style={{ flex: 1 }}>✓ {i.label}</span><span className="small muted">{i.done_name}</span></li>)}</ul></details> :
            <ul className="checklist">{b.items.map((i: any) => (
              <li key={i.id}><label className="check" style={{ flex: 1 }}><input type="checkbox" checked={!!i.done} disabled={b.status !== 'in_progress' || !can('packing.write')} onChange={(e) => act.run(() => post(`/checklist-items/${i.id}/toggle`, { done: e.target.checked })).then(reload)} /> <span>{i.label}</span></label>{i.done ? <span className="small muted">{i.done_name}</span> : null}</li>
            ))}</ul>}
          </Card>
        );
      })}
      <Modal open={!!nb} onClose={() => setNb(null)} title={`Start packing batch — ${nb?.name}`} footer={<><Button onClick={() => setNb(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => { const r = await act.run(() => post(`/orders/${o.id}/packing-batches`, { variant_id: nb.variant_id, qty: nb.qty, assigned_to: nb.assigned_to }), 'Batch started'); if (r) { setNb(null); refresh(); } }}>Start batch</Button></>}>
        {nb && <div className="stack"><FormError error={act.error} /><NumberField label="Boxes in this batch" value={nb.qty} onChange={(v) => setNb({ ...nb, qty: v })} required hint={`Up to ${nb.max} remaining`} error={fieldErr(act.error, 'qty')} /><UserSelect label="Packer" value={nb.assigned_to} onChange={(v) => setNb({ ...nb, assigned_to: v })} roles={['packing_quality', 'admin']} /><p className="small muted">A checklist is generated from this box's bill of materials and the packing template.</p></div>}
      </Modal>
      <Modal open={!!fail} onClose={() => setFail(null)} title="Fail batch check" footer={<><Button onClick={() => setFail(null)}>Cancel</Button><Button variant="danger" loading={act.pending} onClick={async () => { const r = await act.run(() => post(`/packing-batches/${fail.id}/check`, { result: 'fail', note: fail.note }), 'Sent back for rework'); if (r) { setFail(null); refresh(); } }}>Send back</Button></>}>
        {fail && <div className="stack"><FormError error={act.error} /><TextArea label="What is wrong?" value={fail.note} onChange={(v) => setFail({ ...fail, note: v })} required error={fieldErr(act.error, 'note')} /><p className="small muted">The checklist is reset and the packer is notified.</p></div>}
      </Modal>
    </div>
  );
}

// ================================================================ shipments
function Shipments({ order: o, reload: reloadOrder }: P) {
  const { can } = useAuth(); const act = useAction();
  const { data, error, loading, reload } = useApi<any>(`/orders/${o.id}/shipments`);
  const [plan, setPlan] = useState<any | null>(null); const [disp, setDisp] = useState<any | null>(null); const [trk, setTrk] = useState<any | null>(null); const [dlv, setDlv] = useState<any | null>(null);
  useEffect(() => { /* keep */ }, []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const refresh = () => { reload(); reloadOrder(); };
  const done = async (fn: () => Promise<any>, msg: string, close: () => void) => { const r = await act.run(fn, msg); if (r) { close(); refresh(); } return r; };
  return (
    <div className="stack-lg">
      {!data.courier_integration && <div className="callout info"><Icon name="info" /><div>No courier integration is configured. Enter courier, docket number and status updates by hand; nothing is booked from here.</div></div>}
      <div className="grid grid-2">
        <Card title="Ready to ship (checked boxes)" pad={false}><div className="table-wrap"><table className="table"><thead><tr><th>Box</th><th className="num">Checked</th><th className="num">Shipped</th><th className="num">Ready</th></tr></thead><tbody>{data.ready.map((r: any) => <tr key={r.variant_id}><td>{r.name}</td><td className="num">{r.checked} / {r.qty}</td><td className="num">{r.shipped}</td><td className="num"><strong>{r.ready_to_ship}</strong></td></tr>)}</tbody></table></div></Card>
        <Card title="By destination" pad={false}><ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.destinations.map((d: any) => <li key={d.id}><span style={{ flex: 1 }}><strong>{d.label}</strong> <span className="small muted">{d.city}</span><div className="small">{d.items.filter((i: any) => i.allocated).map((i: any) => `${i.name}: ${i.shipped}/${i.allocated} shipped`).join(' · ')}</div></span>{can('shipments.write') && d.items.some((i: any) => i.remaining > 0) && data.ready.some((r: any) => r.ready_to_ship > 0) && <Button size="sm" variant="primary" onClick={() => setPlan({ destination_id: d.id, label: d.label, courier: '', items: Object.fromEntries(d.items.map((i: any) => [i.variant_id, Math.min(i.remaining, data.ready.find((r: any) => r.variant_id === i.variant_id)?.ready_to_ship ?? 0)])) })}>Plan shipment</Button>}</li>)}</ul></Card>
      </div>
      <Card title="Shipments" pad={false}>{data.shipments.length === 0 ? <Empty title="No shipments yet" /> : data.shipments.map((s: any) => (
        <div key={s.id} className="card-pad" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="row between"><div><strong>#{s.id} → {s.destination}</strong> <Status kind="shipment" value={s.status} /><div className="small muted">{s.items.map((i: any) => `${i.qty} × ${i.variant_name}`).join(', ')}{s.courier && ` · ${s.courier} ${s.tracking_no ?? ''}`}{s.dispatched_on && ` · sent ${date(s.dispatched_on)}`}{s.expected_on && ` · expected ${date(s.expected_on)}`}{s.delivered_on && ` · delivered ${date(s.delivered_on)} to ${s.received_by_name ?? 'see POD'}`}</div></div>
            {can('shipments.write') && <div className="row">
              {s.status === 'planned' && <Button size="sm" variant="primary" onClick={() => setDisp({ id: s.id, courier: s.courier ?? '', tracking_no: '', dispatched_on: todayStr(), expected_on: addDays(todayStr(), 3) })}>Dispatch</Button>}
              {['dispatched', 'in_transit', 'delayed'].includes(s.status) && <><Button size="sm" onClick={() => setTrk({ id: s.id, status: 'in_transit', note: '', expected_on: s.expected_on })}>Update tracking</Button><Button size="sm" variant="primary" onClick={() => setDlv({ id: s.id, delivered_on: todayStr(), received_by_name: '', pod_attachment_id: null, filename: '' })}>Confirm delivery</Button></>}
            </div>}
          </div>
          {s.updates.length > 0 && <ul className="timeline small" style={{ marginTop: '.5rem' }}>{s.updates.map((u: any) => <li key={u.id}><span className="dot" aria-hidden="true" /><div>{label(u.status)} — {u.note}<div className="meta">{u.by_name} · {dateTime(u.at)}</div></div></li>)}</ul>}
          {s.pod_attachment_id && <a className="small" href={`/api/attachments/${s.pod_attachment_id}/download`} target="_blank" rel="noreferrer">Proof of delivery: {s.pod_filename}</a>}
        </div>
      ))}</Card>
      <Modal open={!!plan} onClose={() => setPlan(null)} title={`Plan shipment to ${plan?.label}`} footer={<><Button onClick={() => setPlan(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={() => done(() => post(`/orders/${o.id}/shipments`, { destination_id: plan.destination_id, courier: plan.courier || null, items: Object.entries(plan.items).filter(([, q]) => Number(q) > 0).map(([variant_id, qty]) => ({ variant_id: Number(variant_id), qty: Number(qty) })) }), 'Shipment planned', () => setPlan(null))}>Plan</Button></>}>
        {plan && <div className="stack"><FormError error={act.error} />{data.ready.map((r: any) => <NumberField key={r.variant_id} label={`${r.name} (ready ${r.ready_to_ship})`} value={plan.items[r.variant_id] ?? 0} onChange={(v) => setPlan({ ...plan, items: { ...plan.items, [r.variant_id]: v ?? 0 } })} min={0} />)}<TextField label="Courier (optional now)" value={plan.courier} onChange={(v) => setPlan({ ...plan, courier: v })} /></div>}
      </Modal>
      <Modal open={!!disp} onClose={() => setDisp(null)} title="Dispatch shipment" footer={<><Button onClick={() => setDisp(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={() => done(() => post(`/shipments/${disp.id}/dispatch`, disp), 'Dispatched', () => setDisp(null))}>Dispatch</Button></>}>
        {disp && <div className="stack"><FormError error={act.error} /><div className="grid grid-2"><TextField label="Courier" value={disp.courier} onChange={(v) => setDisp({ ...disp, courier: v })} required error={fieldErr(act.error, 'courier')} /><TextField label="Tracking / docket number" value={disp.tracking_no} onChange={(v) => setDisp({ ...disp, tracking_no: v })} required error={fieldErr(act.error, 'tracking_no')} /><TextField label="Dispatch date" type="date" value={disp.dispatched_on} onChange={(v) => setDisp({ ...disp, dispatched_on: v })} /><TextField label="Expected delivery" type="date" value={disp.expected_on} onChange={(v) => setDisp({ ...disp, expected_on: v })} error={fieldErr(act.error, 'expected_on')} /></div></div>}
      </Modal>
      <Modal open={!!trk} onClose={() => setTrk(null)} title="Tracking update (manual)" footer={<><Button onClick={() => setTrk(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={() => done(() => post(`/shipments/${trk.id}/tracking`, { status: trk.status, note: trk.note, expected_on: trk.expected_on || null }), 'Tracking updated', () => setTrk(null))}>Save</Button></>}>
        {trk && <div className="stack"><FormError error={act.error} /><SelectField label="Status" value={trk.status} onChange={(v) => setTrk({ ...trk, status: v })} placeholder={null} options={[{ value: 'in_transit', label: 'In transit' }, { value: 'delayed', label: 'Delayed (notifies sales owner)' }, { value: 'failed', label: 'Delivery failed (opens an issue)' }]} /><TextArea label="What did the courier say?" value={trk.note} onChange={(v) => setTrk({ ...trk, note: v })} required error={fieldErr(act.error, 'note')} />{trk.status === 'delayed' && <TextField label="New expected date" type="date" value={trk.expected_on} onChange={(v) => setTrk({ ...trk, expected_on: v })} />}</div>}
      </Modal>
      <Modal open={!!dlv} onClose={() => setDlv(null)} title="Confirm delivery" footer={<><Button onClick={() => setDlv(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={() => done(() => post(`/shipments/${dlv.id}/deliver`, { delivered_on: dlv.delivered_on, received_by_name: dlv.received_by_name || null, pod_attachment_id: dlv.pod_attachment_id }), 'Delivery confirmed', () => setDlv(null))}>Confirm</Button></>}>
        {dlv && <div className="stack"><FormError error={act.error} /><TextField label="Delivered on" type="date" value={dlv.delivered_on} onChange={(v) => setDlv({ ...dlv, delivered_on: v })} /><TextField label="Received by" value={dlv.received_by_name} onChange={(v) => setDlv({ ...dlv, received_by_name: v })} error={fieldErr(act.error, 'received_by_name')} hint="Name on the POD, or attach the POD" /><div className="row"><FileButton entity="order" id={o.id} kind="proof_of_delivery" label="Attach proof of delivery" accept=".pdf,.png,.jpg,.jpeg,.webp" onDone={(a) => setDlv({ ...dlv, pod_attachment_id: a.id, filename: a.filename })} /><span className="small">{dlv.filename}</span></div><p className="small muted">The order becomes Delivered only when every box to every destination is delivered.</p></div>}
      </Modal>
    </div>
  );
}

// ================================================================ payments
function Payments({ order: o, reload: reloadOrder }: P) {
  const { can } = useAuth(); const act = useAction();
  const { data, error, loading, reload } = useApi<any>(`/orders/${o.id}/payments`);
  const [pay, setPay] = useState<any | null>(null); const [inv, setInv] = useState<any | null>(null); const [msg, setMsg] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const f = data.finance;
  const refresh = () => { reload(); reloadOrder(); };
  return (
    <div className="stack-lg">
      <div className="callout info"><Icon name="info" /><div>Payments are <strong>recorded here, not processed</strong>. The accounting system remains the source of truth for invoices and receipts; use the Finance exports to reconcile.</div></div>
      <div className="grid grid-4">
        <div className="card kpi"><span className="v">{money(f.total_paise)}</span><span className="l">Order total (incl. tax)</span></div>
        <div className="card kpi"><span className="v">{money(f.received_paise)}</span><span className="l">Received ({money(f.advance_paise)} as advance)</span></div>
        <div className={`card kpi ${f.balance_paise > 0 && data.due_on && data.due_on < todayStr() ? 'warn' : ''}`}><span className="v">{money(f.balance_paise)}</span><span className="l">Balance{data.due_on ? `, due ${date(data.due_on)}` : ''}</span></div>
        <div className="card kpi"><span className="v">{money(f.invoiced_paise)}</span><span className="l">Invoiced (references)</span></div>
      </div>
      <div className="grid grid-2">
        <Card title="Customer payments" actions={<>{can('finance.write') && <Button size="sm" icon="plus" onClick={() => setPay({ kind: f.received_paise ? 'payment' : 'advance', amount_paise: f.balance_paise, received_on: todayStr(), reference: '', attachment_id: null, filename: '' })}>Record payment</Button>}<Button size="sm" onClick={() => setMsg(true)}>Payment reminder draft</Button></>} pad={false}>
          {data.payments.length === 0 ? <Empty title="No payments recorded" /> : <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th className="num">Amount</th></tr></thead><tbody>{data.payments.map((p: any) => <tr key={p.id}><td>{date(p.received_on)}</td><td>{label(p.kind)}</td><td>{p.reference}{p.attachment_id && <> · <a href={`/api/attachments/${p.attachment_id}/download`}>{p.filename}</a></>}<div className="small muted">{p.recorded_name}</div></td><td className="num">{money(p.amount_paise)}</td></tr>)}</tbody></table></div>}
        </Card>
        <Card title="Invoice references" actions={can('finance.write') && <Button size="sm" icon="plus" onClick={() => setInv({ number: '', amount_paise: f.total_paise, issued_on: todayStr(), due_on: addDays(todayStr(), 30), notes: '' })}>Add invoice</Button>} pad={false}>
          {data.invoices.length === 0 ? <Empty title="No invoice recorded" /> : <div className="table-wrap"><table className="table"><thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th className="num">Amount</th></tr></thead><tbody>{data.invoices.map((i: any) => <tr key={i.id}><td>{i.number}</td><td>{date(i.issued_on)}</td><td>{date(i.due_on)}</td><td className="num">{money(i.amount_paise)}</td></tr>)}</tbody></table></div>}
        </Card>
      </div>
      <Card title="Vendor balances on this order" pad={false}>{data.vendor.length === 0 ? <Empty title="No issued purchase orders" /> : <div className="table-wrap"><table className="table"><thead><tr><th>PO</th><th>Vendor</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead><tbody>{data.vendor.map((p: any) => <tr key={p.id}><td><Link to={`/procurement/purchase-orders/${p.id}`}>{p.number}</Link></td><td>{p.vendor}</td><td className="num">{money(p.total_paise)}</td><td className="num">{money(p.paid_paise)}</td><td className="num">{money(p.balance_paise)}</td></tr>)}</tbody></table></div>}</Card>
      <Modal open={!!pay} onClose={() => setPay(null)} title="Record customer payment" footer={<><Button onClick={() => setPay(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => { const body = { kind: pay.kind, amount_paise: pay.amount_paise, received_on: pay.received_on, reference: pay.reference, attachment_id: pay.attachment_id }; const v = err(paymentInput, body); if (v) { act.setError(v); return; } const r = await act.run(() => post(`/orders/${o.id}/payments`, body), 'Payment recorded'); if (r) { setPay(null); refresh(); } }}>Record</Button></>}>
        {pay && <div className="stack"><FormError error={act.error} /><SelectField label="Type" value={pay.kind} onChange={(v) => setPay({ ...pay, kind: v })} placeholder={null} options={[{ value: 'advance', label: 'Advance' }, { value: 'payment', label: 'Payment' }]} /><div className="grid grid-2"><MoneyField label="Amount" value={pay.amount_paise} onChange={(v) => setPay({ ...pay, amount_paise: v })} required error={fieldErr(act.error, 'amount_paise')} hint={`Balance ${money(f.balance_paise)}`} /><TextField label="Received on" type="date" value={pay.received_on} onChange={(v) => setPay({ ...pay, received_on: v })} max={todayStr()} error={fieldErr(act.error, 'received_on')} /></div><TextField label="Bank reference / UTR" value={pay.reference} onChange={(v) => setPay({ ...pay, reference: v })} required error={fieldErr(act.error, 'reference')} /><div className="row"><FileButton entity="order" id={o.id} kind="remittance" label="Attach remittance" onDone={(a) => setPay({ ...pay, attachment_id: a.id, filename: a.filename })} /><span className="small">{pay.filename}</span></div></div>}
      </Modal>
      <Modal open={!!inv} onClose={() => setInv(null)} title="Add invoice reference" footer={<><Button onClick={() => setInv(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => { const v = err(invoiceInput, inv); if (v) { act.setError(v); return; } const r = await act.run(() => post(`/orders/${o.id}/invoices`, inv), 'Invoice recorded'); if (r) { setInv(null); refresh(); } }}>Save</Button></>}>
        {inv && <div className="stack"><FormError error={act.error} /><TextField label="Invoice number (from accounting system)" value={inv.number} onChange={(v) => setInv({ ...inv, number: v })} required error={fieldErr(act.error, 'number')} /><MoneyField label="Amount" value={inv.amount_paise} onChange={(v) => setInv({ ...inv, amount_paise: v })} required error={fieldErr(act.error, 'amount_paise')} /><div className="grid grid-2"><TextField label="Issued on" type="date" value={inv.issued_on} onChange={(v) => setInv({ ...inv, issued_on: v })} /><TextField label="Due on" type="date" value={inv.due_on} onChange={(v) => setInv({ ...inv, due_on: v })} /></div></div>}
      </Modal>
      {msg && <Modal open onClose={() => setMsg(false)} title="Payment reminder"><MessageDraft party="customer" entityType="order" entityId={o.id} defaultKey="payment_reminder" onLogged={() => setMsg(false)} /></Modal>}
    </div>
  );
}

function Files({ order: o, reload }: P) {
  const [kind, setKind] = useState('file'); const [k, setK] = useState(0);
  return (
    <Card title="Files" actions={<><select className="input" style={{ width: 'auto' }} aria-label="File type" value={kind} onChange={(e) => setKind(e.target.value)}>{['customer_po', 'artwork', 'proof', 'specification', 'invoice', 'delivery_document', 'photo', 'file'].map((x) => <option key={x} value={x}>{label(x)}</option>)}</select><FileButton entity="order" id={o.id} kind={kind} onDone={() => { setK(k + 1); reload(); }} /></>}>
      <p className="small muted">PDF, images, Word, Excel, CSV or text, up to 10 MB. Files from the sales stage, purchase orders and shipments for this order appear here too.</p>
      <AttachmentList entity="order" id={o.id} reloadKey={k} />
    </Card>
  );
}

function Issues({ order: o, reload: reloadOrder }: P) {
  const { data, error, loading, reload } = useApi<any>(`/issues?order=${o.id}&status=all&pageSize=100`);
  const [open, setOpen] = useState<any | null | false>(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <Card title="Issues, replacements and returns" actions={<Button size="sm" icon="plus" onClick={() => setOpen(null)}>Raise issue</Button>} pad={false}>
      <IssueTable rows={data.rows} onOpen={(i) => setOpen(i)} />
      <IssueModal open={open !== false} issue={open || undefined} orderId={o.id} onClose={() => setOpen(false)} onDone={() => { reload(); reloadOrder(); }} />
    </Card>
  );
}

function Activity({ order: o }: P) {
  const [kind, setKind] = useState('');
  const { data, error, loading, reload } = useApi<any>(`/orders/${o.id}/history?kind=${kind}`);
  const [text, setText] = useState(''); const [mention, setMention] = useState<number | null>(null); const act = useAction();
  const [contact, setContact] = useState<any>({ channel: 'phone', summary: '', party: 'customer' });
  const post_ = async () => { const r = await act.run(() => post(`/orders/${o.id}/comments`, { text, mention: mention ?? undefined }), 'Comment added'); if (r) { setText(''); setMention(null); reload(); } };
  const log = async () => { const r = await act.run(() => post('/contact-log', { ...contact, entity_type: 'order', entity_id: o.id }), 'Logged'); if (r) { setContact({ ...contact, summary: '' }); reload(); } };
  return (
    <div className="grid grid-2">
      <Card title="Timeline" actions={<select className="input" style={{ width: 'auto' }} aria-label="Show" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Everything</option><option value="comments">Comments</option><option value="exceptions">Exceptions, approvals and blockers</option></select>}>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <p className="muted">Nothing yet.</p> : <ul className="timeline">{data.rows.map((h: any) => <li key={h.id}><span className={`dot ${/override|blocked|reject/i.test(h.action + h.summary) ? 'exception' : ''}`} aria-hidden="true" /><div><div>{h.action === 'comment' ? <><strong>{h.user_name}:</strong> {h.summary}</> : h.summary}</div><div className="meta">{h.action === 'comment' ? 'Comment' : `${h.user_name ?? 'System'}`} · {dateTime(h.at)}</div></div></li>)}</ul>}
      </Card>
      <div className="stack">
        <Card title="Add a comment"><div className="stack"><TextArea label="Comment" value={text} onChange={setText} rows={3} /><UserSelect label="Notify (optional)" value={mention} onChange={setMention} /><div className="row end"><Button variant="primary" loading={act.pending} disabled={!text.trim()} onClick={post_}>Post comment</Button></div></div></Card>
        <Card title="Log a conversation"><div className="stack"><div className="grid grid-2"><SelectField label="With" value={contact.party} onChange={(v) => setContact({ ...contact, party: v })} placeholder={null} options={[{ value: 'customer', label: 'Customer' }, { value: 'vendor', label: 'Vendor' }]} /><SelectField label="Channel" value={contact.channel} onChange={(v) => setContact({ ...contact, channel: v })} placeholder={null} options={['phone', 'email', 'whatsapp', 'meeting', 'visit'].map((c) => ({ value: c, label: label(c) }))} /></div><TextArea label="Summary" value={contact.summary} onChange={(v) => setContact({ ...contact, summary: v })} rows={2} /><div className="row end"><Button loading={act.pending} disabled={contact.summary.trim().length < 3} onClick={log}>Log conversation</Button></div></div>
          {data?.contacts?.length > 0 && <ul className="timeline small" style={{ marginTop: '.75rem' }}>{data.contacts.map((c: any) => <li key={c.id}><span className="dot" aria-hidden="true" /><div>{label(c.party)} · {label(c.channel)}: {c.summary}<div className="meta">{c.by_name} · {dateTime(c.at)} · logged manually</div></div></li>)}</ul>}
        </Card>
      </div>
    </div>
  );
}
