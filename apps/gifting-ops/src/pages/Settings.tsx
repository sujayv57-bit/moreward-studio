import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { patch, post, put } from '../api.ts';
import { dateTime, label, money, parseRupees } from '../format.ts';
import { useAction, useApi, useAuth } from '../state.tsx';
import { Button, Card, Check, Empty, ErrorState, fieldErr, FormError, Icon, Loading, Modal, PageHeader, Pager, Pill, SelectField, TabPanel, Tabs, TextArea, TextField } from '../ui.tsx';

export default function Settings() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') ?? (can('*') ? 'team' : 'workflow');
  const tabs = [
    ...(can('*') ? [{ id: 'team', label: 'Team and roles' }] : []), { id: 'workflow', label: 'Workflow and approvals' }, { id: 'tax', label: 'Tax and money' }, { id: 'vendors', label: 'Vendor onboarding' },
    { id: 'categories', label: 'Product categories' }, { id: 'checklists', label: 'Checklist templates' }, { id: 'notifications', label: 'Notification rules' },
    { id: 'messages', label: 'Message templates' }, { id: 'integrations', label: 'Integrations' }, ...(can('*') ? [{ id: 'audit', label: 'Audit log' }] : []),
  ];
  return (
    <div className="stack">
      <PageHeader title="Settings" sub={can('*') ? 'Business values the rules use. Every change is recorded in the audit log.' : 'Business values the rules use. Only the founder/admin can change most of them.'} />
      <Tabs label="Settings sections" tabs={tabs} active={tab} onChange={(t) => setSp({ tab: t }, { replace: true })} />
      <TabPanel id={tab}>
        {tab === 'team' && <Team />}
        {['workflow', 'tax', 'vendors', 'notifications'].includes(tab) && <Values section={tab} />}
        {tab === 'categories' && <Categories />}
        {tab === 'checklists' && <Checklists />}
        {tab === 'messages' && <Messages />}
        {tab === 'integrations' && <Integrations />}
        {tab === 'audit' && <Audit />}
      </TabPanel>
    </div>
  );
}

// ---------------------------------------------------------------- team
function Team() {
  const { data, error, loading, reload } = useApi<any>('/admin/users');
  const meta = useApi<any>('/meta'); const act = useAction(); const { me } = useAuth();
  const [u, setU] = useState<any | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const roles = meta.data?.roles ?? {};
  const save = async () => { const body: any = { name: u.name, email: u.email, roles: u.roles, active: u.active }; if (u.password) body.password = u.password; const r = await act.run(() => (u.id ? patch(`/admin/users/${u.id}`, body) : post('/admin/users', body)), 'Saved'); if (r) { setU(null); reload(); } };
  return (
    <Card title={`Team (${data.rows.filter((x: any) => x.active).length} active)`} actions={<Button variant="primary" icon="plus" onClick={() => setU({ name: '', email: '', roles: [], active: true, password: '' })}>Add person</Button>} pad={false}>
      <div className="table-wrap"><table className="table responsive"><thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th><span className="sr-only">Edit</span></th></tr></thead>
        <tbody>{data.rows.map((x: any) => <tr key={x.id}><td data-label="Name"><strong>{x.name}</strong></td><td data-label="Email">{x.email}</td><td data-label="Roles">{x.roles.map((r: string) => <Pill key={r} tone="navy">{roles[r] ?? r}</Pill>)}</td><td data-label="Status">{x.active ? <Pill tone="ok">Active</Pill> : <Pill tone="neutral">Deactivated</Pill>}{x.locked_until && x.locked_until > new Date().toISOString() && <Pill tone="warn">Locked</Pill>}</td><td><Button size="sm" variant="ghost" onClick={() => setU({ ...x, active: !!x.active, password: '' })}>Edit</Button></td></tr>)}</tbody></table></div>
      <p className="card-pad small muted">A person can hold several roles. Deactivating someone signs them out and stops new assignments; their history is kept. Permissions are enforced on the server for every request.</p>
      <Modal open={!!u} onClose={() => setU(null)} title={u?.id ? `Edit ${u.name}` : 'Add person'} footer={<><Button onClick={() => setU(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={save}>Save</Button></>}>
        {u && <div className="stack"><FormError error={act.error} />
          <div className="grid grid-2"><TextField label="Name" value={u.name} onChange={(v) => setU({ ...u, name: v })} required error={fieldErr(act.error, 'name')} /><TextField label="Work email" type="email" value={u.email} onChange={(v) => setU({ ...u, email: v })} required error={fieldErr(act.error, 'email')} /></div>
          <fieldset><legend>Roles {fieldErr(act.error, 'roles') && <span className="err">— {fieldErr(act.error, 'roles')}</span>}</legend><div className="grid grid-2">{Object.entries(roles).map(([k, l]) => <Check key={k} label={l as string} checked={u.roles.includes(k)} onChange={(c) => setU({ ...u, roles: c ? [...u.roles, k] : u.roles.filter((r: string) => r !== k) })} />)}</div></fieldset>
          <TextField label={u.id ? 'New password (leave blank to keep)' : 'Initial password'} type="password" value={u.password} onChange={(v) => setU({ ...u, password: v })} autoComplete="new-password" required={!u.id} error={fieldErr(act.error, 'password')} hint="At least 10 characters. Share it privately; ask them to keep it secret." />
          {u.id && u.id !== me!.user.id && <Check label="Active" checked={u.active} onChange={(v) => setU({ ...u, active: v })} />}</div>}
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------- settings values
type Kind = 'bp' | 'rupees' | 'int' | 'bool' | 'list' | 'roles' | 'stage_text' | 'stage_int' | 'tax_rates';
const SECTIONS: Record<string, { key: string; label: string; kind: Kind; hint?: string }[]> = {
  workflow: [
    { key: 'approval.margin_min_bp', label: 'Quotation margin below which a sales manager must approve', kind: 'bp' },
    { key: 'approval.margin_floor_bp', label: 'Quotation margin below which the founder must approve', kind: 'bp' },
    { key: 'approval.po_value_threshold_paise', label: 'Purchase order value above which an executive needs manager approval', kind: 'rupees' },
    { key: 'approval.vendor_approver_roles', label: 'Who may approve vendors for purchasing', kind: 'roles' },
    { key: 'packing.checker_must_differ', label: 'A packing batch must be checked by someone other than the packer', kind: 'bool' },
    { key: 'risk.buffer_days', label: 'Days needed after the last component arrives to check, pack and ship', kind: 'int', hint: 'Used for delivery risk' },
    { key: 'order.stage_labels', label: 'Order stage names', kind: 'stage_text', hint: 'The stages and their rules are fixed; their names can change' },
    { key: 'order.stage_target_days', label: 'Target days per stage', kind: 'stage_int', hint: 'Used to flag a stalled handoff' },
    { key: 'sales.quote_validity_days', label: 'Default quotation validity (days)', kind: 'int' },
    { key: 'tasks.followup_days_after_quote', label: 'Days after sending a quotation to chase the customer', kind: 'int' },
    { key: 'sales.lost_reasons', label: 'Lost-opportunity reasons', kind: 'list' },
  ],
  tax: [
    { key: 'tax.rates', label: 'Tax rates offered on quotations', kind: 'tax_rates', hint: 'No GST treatment is assumed; confirm rates per product with your accountant' },
    { key: 'tax.default_bp', label: 'Default tax rate on new quotations', kind: 'bp' },
    { key: 'costing.vendor_tax_in_cost', label: 'Count vendor GST as cost in actual margin', kind: 'bool', hint: 'Off if input tax credit is claimed; confirm with accountants' },
    { key: 'customer.payment_terms_days', label: 'Customer payment terms when no invoice due date is recorded (days after delivery)', kind: 'int' },
  ],
  vendors: [
    { key: 'vendor.required_docs', label: 'Documents required for review', kind: 'list' },
    { key: 'vendor.required_fields', label: 'Profile fields required for review', kind: 'list', hint: 'Field keys, e.g. phone, email, address, categories, lead_time_days, payment_terms, gst_number' },
    { key: 'vendor.require_bank', label: 'Bank details must be on file and verified before approval', kind: 'bool' },
    { key: 'vendor.doc_expiry_warn_days', label: 'Warn the onboarding owner this many days before a document expires', kind: 'int' },
    { key: 'vendor.min_orders_for_score', label: 'Completed POs needed before showing on-time and rejection rates', kind: 'int' },
  ],
  notifications: [
    { key: 'notify.follow_up_overdue', label: 'Follow-ups and tasks due or overdue', kind: 'bool' },
    { key: 'notify.vendor_onboarding_overdue', label: 'Vendor onboarding past its due date', kind: 'bool' },
    { key: 'notify.vendor_doc_expiry', label: 'Vendor documents expiring', kind: 'bool' },
    { key: 'notify.po_confirmation_overdue_days', label: 'Days after issue before a PO confirmation is overdue', kind: 'int' },
    { key: 'notify.arrival_warning_days', label: 'Warn this many days before a vendor arrival', kind: 'int' },
    { key: 'notify.packing_due_days', label: 'Packing due warning (days before the due date, plus buffer)', kind: 'int' },
    { key: 'notify.dispatch_due_days', label: 'Dispatch due warning (days before the due date)', kind: 'int' },
    { key: 'notify.shipment_delay', label: 'Shipments past their expected date', kind: 'bool' },
    { key: 'notify.balance_overdue', label: 'Customer balances overdue', kind: 'bool' },
  ],
};
function Values({ section }: { section: string }) {
  const { data, error, loading, reload } = useApi<any>('/settings');
  const meta = useApi<any>('/meta'); const { can } = useAuth();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="stack">
      {section === 'notifications' && <div className="callout info"><Icon name="info" /><div>Notifications are in-app and go to the person responsible. Each situation notifies once; a new date or a new problem notifies again. Scheduled checks run every 15 minutes. Email and WhatsApp are not configured.</div></div>}
      {SECTIONS[section].map((s) => <SettingRow key={s.key} def={s} value={data.values[s.key]} editable={can('*')} roles={meta.data?.roles ?? {}} stages={meta.data?.stages ?? []} onSaved={reload} />)}
    </div>
  );
}
function SettingRow({ def, value, editable, roles, stages, onSaved }: { def: { key: string; label: string; kind: Kind; hint?: string }; value: any; editable: boolean; roles: Record<string, string>; stages: string[]; onSaved: () => void }) {
  const [v, setV] = useState<any>(value); const [dirty, setDirty] = useState(false); const act = useAction();
  useEffect(() => { setV(value); setDirty(false); }, [value]);
  const set = (x: any) => { setV(x); setDirty(true); };
  const save = async () => { const r = await act.run(() => put(`/settings/${def.key}`, { value: v }), 'Setting saved'); if (r) { setDirty(false); onSaved(); } };
  const display = () => {
    switch (def.kind) {
      case 'bp': return `${(value / 100).toFixed(1)}%`;
      case 'rupees': return money(value);
      case 'bool': return value ? 'On' : 'Off';
      case 'list': return (value as string[]).join(', ');
      case 'roles': return (value as string[]).map((r) => roles[r] ?? r).join(', ');
      case 'stage_text': return stages.map((s) => value[s]).join(' → ');
      case 'stage_int': return stages.map((s) => `${label(s)} ${value[s]}d`).join(' · ');
      case 'tax_rates': return (value as any[]).map((t) => t.name).join(', ');
      default: return String(value);
    }
  };
  return (
    <div className="card card-pad">
      <div className="row between"><div><strong>{def.label}</strong>{def.hint && <div className="small muted">{def.hint}</div>}{!editable && <div className="small">{display()}</div>}</div>{editable && dirty && <div className="row"><Button size="sm" onClick={() => { setV(value); setDirty(false); }}>Undo</Button><Button size="sm" variant="primary" loading={act.pending} onClick={save}>Save</Button></div>}</div>
      {act.error && <FormError error={act.error} />}
      {editable && <div style={{ marginTop: '.5rem' }}>
        {def.kind === 'bp' && <PercentInput value={v} onChange={set} label={def.label} />}
        {def.kind === 'rupees' && <RupeeInput value={v} onChange={set} label={def.label} />}
        {def.kind === 'int' && <input className="input" style={{ maxWidth: 140 }} type="number" min={0} aria-label={def.label} value={v} onChange={(e) => set(Math.max(0, Math.trunc(Number(e.target.value))))} />}
        {def.kind === 'bool' && <Check label={v ? 'On' : 'Off'} checked={!!v} onChange={set} />}
        {def.kind === 'list' && <TextArea label="One per line" value={(v as string[]).join('\n')} onChange={(x) => set(x.split('\n').map((s) => s.trim()).filter(Boolean))} rows={Math.min(8, (v as string[]).length + 1)} />}
        {def.kind === 'roles' && <div className="row">{Object.entries(roles).map(([k, l]) => <Check key={k} label={l} checked={(v as string[]).includes(k)} onChange={(c) => set(c ? [...v, k] : v.filter((r: string) => r !== k))} />)}</div>}
        {def.kind === 'stage_text' && <div className="grid grid-4">{stages.map((s) => <TextField key={s} label={label(s)} value={v[s]} onChange={(x) => set({ ...v, [s]: x })} />)}</div>}
        {def.kind === 'stage_int' && <div className="grid grid-4">{stages.map((s) => <TextField key={s} label={`${label(s)} (days)`} type="number" value={v[s]} onChange={(x) => set({ ...v, [s]: Math.max(0, Math.trunc(Number(x))) })} />)}</div>}
        {def.kind === 'tax_rates' && <div className="stack">{(v as any[]).map((t, i) => <div className="row" key={i}><input className="input" style={{ maxWidth: 220 }} aria-label="Tax name" value={t.name} onChange={(e) => set(v.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)))} /><PercentInput label="Rate" value={t.bp} onChange={(bp) => set(v.map((x: any, j: number) => (j === i ? { ...x, bp } : x)))} /><Button size="sm" variant="ghost" onClick={() => set(v.filter((_: any, j: number) => j !== i))}>Remove</Button></div>)}<div><Button size="sm" icon="plus" onClick={() => set([...v, { name: 'New rate', bp: 0 }])}>Add rate</Button></div></div>}
      </div>}
    </div>
  );
}
function PercentInput({ value, onChange, label: l }: { value: number; onChange: (bp: number) => void; label: string }) {
  const [t, setT] = useState((value / 100).toString());
  useEffect(() => setT((value / 100).toString()), [value]);
  return <span className="row" style={{ gap: '.3rem' }}><input className="input" style={{ maxWidth: 110 }} inputMode="decimal" aria-label={`${l} (percent)`} value={t} onChange={(e) => { setT(e.target.value); const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(e.target.value.trim()); if (m) onChange(Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0)); }} />%</span>;
}
function RupeeInput({ value, onChange, label: l }: { value: number; onChange: (p: number) => void; label: string }) {
  const [t, setT] = useState(String(value / 100));
  return <span className="row" style={{ gap: '.3rem' }}>₹<input className="input" style={{ maxWidth: 160 }} inputMode="decimal" aria-label={l} value={t} onChange={(e) => { setT(e.target.value); const p = parseRupees(e.target.value); if (p != null && p >= 0) onChange(p); }} /></span>;
}

// ---------------------------------------------------------------- categories
function Categories() {
  const meta = useApi<any>('/meta'); const act = useAction(); const { can } = useAuth(); const [name, setName] = useState('');
  if (meta.loading && !meta.data) return <Loading />;
  const editable = can('*', 'vendors.approve');
  return (
    <Card title="Product categories" pad={false}>
      {editable && <form className="row card-pad" onSubmit={async (e) => { e.preventDefault(); const r = await act.run(() => post('/categories', { name }), 'Category added'); if (r) { setName(''); meta.reload(); } }}><input className="input" style={{ maxWidth: 300 }} aria-label="New category" value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" /><Button type="submit" variant="primary" loading={act.pending} disabled={name.trim().length < 2}>Add</Button>{act.error && <span className="err">{act.error.message}</span>}</form>}
      <ul className="checklist" style={{ padding: '0 1.15rem' }}>{meta.data.categories.map((c: any) => <li key={c.id}><span style={{ flex: 1 }}>{c.name}</span>{c.active ? <Pill tone="ok">In use</Pill> : <Pill tone="neutral">Hidden</Pill>}{editable && <Button size="sm" variant="ghost" onClick={() => act.run(() => patch(`/categories/${c.id}`, { active: !c.active }), c.active ? 'Hidden' : 'Restored').then(meta.reload)}>{c.active ? 'Hide' : 'Restore'}</Button>}</li>)}</ul>
    </Card>
  );
}

// ---------------------------------------------------------------- checklists
function Checklists() {
  const { data, error, loading, reload } = useApi<any>('/checklist-templates'); const act = useAction(); const { can } = useAuth();
  const [t, setT] = useState<any | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const editable = can('*', 'procurement.all');
  return (
    <Card title="Checklist templates" actions={editable && <Button size="sm" icon="plus" onClick={() => setT({ name: '', kind: 'packing', items: [], active: true })}>New template</Button>} pad={false}>
      <p className="card-pad small muted">Every packing batch gets one checklist line per component from the order's bill of materials, plus the steps from active packing templates.</p>
      {data.rows.length === 0 ? <Empty title="No templates" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.rows.map((x: any) => <li key={x.id}><span style={{ flex: 1 }}><strong>{x.name}</strong> <Pill tone="navy">{label(x.kind)}</Pill> {!x.active && <Pill tone="neutral">Inactive</Pill>}<ol className="small" style={{ margin: '.3rem 0 0' }}>{x.items.map((i: string) => <li key={i} style={{ border: 0, padding: 0, display: 'list-item' }}>{i}</li>)}</ol></span>{editable && <Button size="sm" variant="ghost" onClick={() => setT({ ...x, active: !!x.active })}>Edit</Button>}</li>)}</ul>}
      <Modal open={!!t} onClose={() => setT(null)} title={t?.id ? 'Edit template' : 'New template'} footer={<><Button onClick={() => setT(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => { const body = { name: t.name, kind: t.kind, items: t.items, active: t.active }; const r = await act.run(() => (t.id ? put(`/checklist-templates/${t.id}`, body) : post('/checklist-templates', body)), 'Saved'); if (r) { setT(null); reload(); } }}>Save</Button></>}>
        {t && <div className="stack"><FormError error={act.error} /><TextField label="Name" value={t.name} onChange={(v) => setT({ ...t, name: v })} required error={fieldErr(act.error, 'name')} /><SelectField label="Used for" value={t.kind} onChange={(v) => setT({ ...t, kind: v })} placeholder={null} options={[{ value: 'packing', label: 'Packing' }, { value: 'receiving', label: 'Receiving (reference)' }, { value: 'dispatch', label: 'Dispatch (reference)' }]} /><TextArea label="Steps (one per line)" value={t.items.join('\n')} onChange={(v) => setT({ ...t, items: v.split('\n').map((s: string) => s.trim()).filter(Boolean) })} rows={6} error={fieldErr(act.error, 'items')} /><Check label="Active" checked={t.active} onChange={(v) => setT({ ...t, active: v })} /><p className="small muted">Changes apply to new batches only.</p></div>}
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------- message templates
function Messages() {
  const { data, error, loading, reload } = useApi<any>('/message-templates'); const act = useAction(); const { can } = useAuth();
  const [t, setT] = useState<any | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const editable = can('*', 'sales.all');
  return (
    <Card title="Message templates" actions={editable && <Button size="sm" icon="plus" onClick={() => setT({ name: '', key: '', channel: 'email', party: 'customer', subject: '', body: '' })}>New template</Button>} pad={false}>
      <p className="card-pad small muted">Drafts are filled with order, vendor and PO details. Placeholders: {'{{contact_name}} {{order_number}} {{order_title}} {{customer}} {{due_date}} {{tracking}} {{balance}} {{vendor_name}} {{po_number}} {{promised_date}} {{missing_items}} {{quote_number}} {{valid_until}} {{sender_name}}'}.</p>
      <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.rows.map((x: any) => <li key={x.id}><span style={{ flex: 1 }}><strong>{x.name}</strong> <Pill tone="navy">{label(x.party)}</Pill> <Pill tone="neutral">{x.channel === 'email' ? 'Email' : 'WhatsApp'}</Pill><div className="small muted" style={{ whiteSpace: 'pre-line' }}>{x.body.slice(0, 160)}{x.body.length > 160 ? '…' : ''}</div></span>{editable && <Button size="sm" variant="ghost" onClick={() => setT({ ...x })}>Edit</Button>}</li>)}</ul>
      <Modal open={!!t} onClose={() => setT(null)} title={t?.id ? 'Edit template' : 'New template'} wide footer={<><Button onClick={() => setT(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => { const body = { name: t.name, key: t.key, channel: t.channel, party: t.party, subject: t.subject, body: t.body }; const r = await act.run(() => (t.id ? put(`/message-templates/${t.id}`, body) : post('/message-templates', body)), 'Saved'); if (r) { setT(null); reload(); } }}>Save</Button></>}>
        {t && <div className="stack"><FormError error={act.error} /><div className="grid grid-2"><TextField label="Name" value={t.name} onChange={(v) => setT({ ...t, name: v })} required error={fieldErr(act.error, 'name')} /><TextField label="Key" value={t.key} onChange={(v) => setT({ ...t, key: v })} required error={fieldErr(act.error, 'key')} hint="lowercase_with_underscores" /><SelectField label="To" value={t.party} onChange={(v) => setT({ ...t, party: v })} placeholder={null} options={[{ value: 'customer', label: 'Customer' }, { value: 'vendor', label: 'Vendor' }]} /><SelectField label="Channel" value={t.channel} onChange={(v) => setT({ ...t, channel: v })} placeholder={null} options={[{ value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp' }]} /></div>{t.channel === 'email' && <TextField label="Subject" value={t.subject} onChange={(v) => setT({ ...t, subject: v })} />}<TextArea label="Message" value={t.body} onChange={(v) => setT({ ...t, body: v })} rows={8} required error={fieldErr(act.error, 'body')} /></div>}
      </Modal>
    </Card>
  );
}

function Integrations() {
  const meta = useApi<any>('/meta');
  if (meta.loading && !meta.data) return <Loading />;
  const p = meta.data.providers;
  const rows = [
    ['Email', p.email, 'Editable drafts + “I sent it — log as contacted”.'], ['WhatsApp', p.whatsapp, 'Editable drafts + manual contact log.'],
    ['Courier tracking', p.courier, 'Courier, docket number and status updates entered by hand.'], ['Payments', p.payments, 'Payments are recorded by finance; nothing is collected or paid here.'],
    ['Accounting system', p.accounting, 'CSV exports from Finance; invoice numbers entered by hand.'],
  ];
  return (
    <Card title="Integrations" pad={false}>
      <div className="table-wrap"><table className="table responsive"><thead><tr><th>Service</th><th>Status</th><th>What happens instead</th></tr></thead><tbody>{rows.map(([n, on, alt]) => <tr key={n as string}><td data-label="Service"><strong>{n}</strong></td><td data-label="Status">{on ? <Pill tone="ok">Configured</Pill> : <Pill tone="neutral" icon="x">Not configured</Pill>}</td><td data-label="Instead" className="small">{alt}</td></tr>)}</tbody></table></div>
      <p className="card-pad small muted">The app never reports a message, booking, payment or sync as successful unless a configured provider confirms it. Connecting a provider needs the client's choice of service and credentials (see README → Integrations).</p>
    </Card>
  );
}

function Audit() {
  const [q, setQ] = useState(''); const [type, setType] = useState(''); const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<any>(`/audit?q=${encodeURIComponent(q)}&entity_type=${type}&page=${page}&pageSize=50`);
  return (
    <Card title="Audit log" pad={false}>
      <div className="filters card-pad"><input className="input grow" type="search" aria-label="Search audit log" placeholder="Search what happened…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /><select className="input" aria-label="Record type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">All record types</option>{data?.entity_types.map((t: string) => <option key={t} value={t}>{label(t)}</option>)}</select></div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title="No matching events" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>What happened</th></tr></thead><tbody>{data.rows.map((a: any) => <tr key={a.id}><td data-label="When" className="nowrap small">{dateTime(a.at)}</td><td data-label="Who">{a.user_name ?? 'System'}</td><td data-label="Action">{label(a.action)}</td><td data-label="Record">{label(a.entity_type)}{a.entity_id ? ` #${a.entity_id}` : ''}</td><td data-label="What" className="small">{a.summary}</td></tr>)}</tbody></table></div>}
      {data && <Pager page={page} pageSize={50} total={data.total} onPage={setPage} />}
    </Card>
  );
}
