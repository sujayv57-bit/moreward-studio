import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { activityInput, contactInput, feasibilityResultInput, leadInput, LEAD_SOURCES } from '../../shared/schemas.ts';
import { ApiError, get, patch, post } from '../api.ts';
import { date, dateTime, label, money, pct, relDays, todayStr } from '../format.ts';
import { useAction, useApi, useAuth } from '../state.tsx';
import { Button, Card, Check, Empty, ErrorState, fieldErr, FileButton, FormError, Loading, MissingList, Modal, MoneyField, NumberField, PageHeader, Pager, Pill, SelectField, Status, TextArea, TextField, UserSelect } from '../ui.tsx';
import { QuoteEditor } from './Quotation.tsx';
import { NewTask } from './Tasks.tsx';
import { AttachmentList } from './shared.tsx';

export default function Sales() {
  return (
    <Routes>
      <Route path="leads" element={<Leads />} />
      <Route path="leads/:id" element={<LeadDetail />} />
      <Route path="companies" element={<Companies />} />
      <Route path="companies/:id" element={<CompanyDetail />} />
      <Route path="opportunities" element={<Opportunities />} />
      <Route path="opportunities/:id" element={<OpportunityDetail />} />
      <Route path="*" element={<Leads />} />
    </Routes>
  );
}
const zodErrors = (schema: { safeParse: (v: unknown) => any }, v: unknown): Record<string, string> => {
  const r = schema.safeParse(v); if (r.success) return {};
  const out: Record<string, string> = {}; for (const i of r.error.issues) { const k = i.path.join('.'); if (!out[k]) out[k] = i.message; } return out;
};

// ================================================================ leads
function Leads() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? ''; const stage = sp.get('stage') ?? 'open'; const owner = sp.get('owner') ?? ''; const followup = sp.get('followup') ?? ''; const page = Number(sp.get('page') ?? 1); const sort = sp.get('sort') ?? 'follow_up';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };
  const { data, error, loading, reload } = useApi<any>(`/leads?q=${encodeURIComponent(q)}&stage=${stage}&owner=${owner}&followup=${followup}&sort=${sort}&page=${page}&pageSize=25`);
  const [creating, setCreating] = useState(false);
  const users = useApi<any>(can('sales.all') ? '/users' : null);
  const t = todayStr();
  return (
    <div className="stack">
      <PageHeader title="Leads" sub="New enquiries, from first contact to qualification." actions={can('sales.write') && <Button variant="emphasis" icon="plus" onClick={() => setCreating(true)}>New lead</Button>} />
      <div className="filters" role="search">
        <input className="input grow" type="search" placeholder="Search company, contact, phone, email…" aria-label="Search leads" value={q} onChange={(e) => set('q', e.target.value)} />
        <select className="input" aria-label="Stage" value={stage} onChange={(e) => set('stage', e.target.value)}>
          <option value="open">Open (new, contacted, qualified)</option><option value="">All stages</option>
          {['new', 'contacted', 'qualified', 'converted', 'lost'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        {can('sales.all') && <select className="input" aria-label="Owner" value={owner} onChange={(e) => set('owner', e.target.value)}><option value="">Any owner</option>{users.data?.rows.filter((u: any) => u.roles.some((r: string) => r.startsWith('sales') || r === 'admin')).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        <select className="input" aria-label="Follow-up" value={followup} onChange={(e) => set('followup', e.target.value)}><option value="">Any follow-up</option><option value="overdue">Follow-up overdue</option></select>
        <select className="input" aria-label="Sort by" value={sort} onChange={(e) => set('sort', e.target.value)}><option value="follow_up">Sort: next follow-up</option><option value="created">Sort: newest</option><option value="required_by">Sort: required by</option><option value="company">Sort: company</option></select>
      </div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title="No leads match" action={can('sales.write') && <Button onClick={() => setCreating(true)}>Add a lead</Button>}>Try clearing filters.</Empty> : (
          <div className="table-wrap"><table className="table responsive">
            <thead><tr><th>Company</th><th>Contact</th><th>Occasion</th><th className="num">Qty</th><th>Required by</th><th>Owner</th><th>Stage</th><th>Next follow-up</th></tr></thead>
            <tbody>{data.rows.map((l: any) => (
              <tr key={l.id}>
                <td data-label="Company"><Link className="row-link" to={`/sales/leads/${l.id}`}>{l.company_name}</Link><div className="small muted">{l.source}</div></td>
                <td data-label="Contact">{l.contact_name}<div className="small muted">{l.phone ?? l.email ?? ''}</div></td>
                <td data-label="Occasion">{l.occasion ?? '—'}</td>
                <td data-label="Qty" className="num">{l.approx_qty ?? '—'}</td>
                <td data-label="Required by">{date(l.required_by)}</td>
                <td data-label="Owner">{l.owner_name}</td>
                <td data-label="Stage"><Status kind="lead" value={l.stage} /></td>
                <td data-label="Follow-up">{l.next_follow_up ? <Pill tone={l.next_follow_up < t && ['new', 'contacted', 'qualified'].includes(l.stage) ? 'bad' : 'neutral'} icon="clock">{date(l.next_follow_up)}</Pill> : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {data && <Pager page={page} pageSize={25} total={data.total} onPage={(p) => set('page', String(p))} />}
      </Card>
      <LeadForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function LeadForm({ open, onClose, lead, onSaved }: { open: boolean; onClose: () => void; lead?: any; onSaved?: () => void }) {
  const { me } = useAuth(); const nav = useNavigate();
  const blank = { company_name: '', contact_name: '', phone: '', email: '', source: '', occasion: '', approx_qty: null, budget_paise: null, required_by: '', locations: '', notes: '', owner_id: me!.user.id, next_follow_up: '' };
  const [f, setF] = useState<any>(lead ? { ...blank, ...lead } : blank);
  const [local, setLocal] = useState<Record<string, string>>({});
  const act = useAction();
  const save = async (confirm_duplicate = false) => {
    const errs = zodErrors(leadInput, f); setLocal(errs); if (Object.keys(errs).length) return;
    const body = { ...f, confirm_duplicate, approx_qty: f.approx_qty || null, ...(lead ? { expected_version: lead.version } : {}) };
    if (lead) { const { owner_id: _o, ...rest } = body; const out = await act.run(() => patch(`/leads/${lead.id}`, rest), 'Lead saved'); if (out) { onSaved?.(); onClose(); } }
    else { const out = await act.run(() => post<{ id: number }>('/leads', body), 'Lead created'); if (out) { onClose(); nav(`/sales/leads/${out.id}`); } }
  };
  const e = (k: string) => local[k] ?? fieldErr(act.error, k);
  const s = (k: string) => (v: any) => setF({ ...f, [k]: v });
  return (
    <Modal open={open} onClose={onClose} wide title={lead ? 'Edit lead' : 'New lead'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={() => save(false)}>{lead ? 'Save changes' : 'Create lead'}</Button></>}>
      <form className="stack" onSubmit={(ev) => { ev.preventDefault(); save(false); }}>
        <FormError error={act.error} onConfirmDuplicate={() => save(true)} />
        <div className="grid grid-2">
          <TextField label="Company" value={f.company_name} onChange={s('company_name')} required error={e('company_name')} autoFocus />
          <SelectField label="Lead source" value={f.source} onChange={s('source')} options={LEAD_SOURCES.map((x) => ({ value: x, label: x }))} required error={e('source')} />
          <TextField label="Contact name" value={f.contact_name} onChange={s('contact_name')} required error={e('contact_name')} />
          <TextField label="Occasion or campaign" value={f.occasion} onChange={s('occasion')} placeholder="e.g. Diwali employee gifting" />
          <TextField label="Phone" type="tel" value={f.phone} onChange={s('phone')} error={e('phone')} inputMode="tel" />
          <TextField label="Email" type="email" value={f.email} onChange={s('email')} error={e('email')} />
          <NumberField label="Approximate quantity" value={f.approx_qty} onChange={s('approx_qty')} error={e('approx_qty')} min={1} />
          <MoneyField label="Total budget" value={f.budget_paise} onChange={s('budget_paise')} error={e('budget_paise')} hint="Indicative; leave blank if unknown" />
          <TextField label="Required delivery date" type="date" value={f.required_by} onChange={s('required_by')} error={e('required_by')} />
          <TextField label="Next follow-up" type="date" value={f.next_follow_up} onChange={s('next_follow_up')} error={e('next_follow_up')} hint="Creates a follow-up task for the owner" />
          <TextField label="Delivery locations" value={f.locations} onChange={s('locations')} className="span-2" placeholder="Cities or offices" />
          {!lead && <UserSelect label="Owner" value={f.owner_id} onChange={s('owner_id')} roles={['sales_exec', 'sales_manager', 'admin']} required error={e('owner_id')} hint="Only sales managers can assign to someone else" />}
          <TextArea label="Notes" value={f.notes} onChange={s('notes')} className="span-2" />
        </div>
      </form>
    </Modal>
  );
}

function LeadDetail() {
  const { id } = useParams(); const { can } = useAuth(); const nav = useNavigate();
  const { data, error, loading, reload } = useApi<any>(`/leads/${id}`);
  const [editing, setEditing] = useState(false); const [losing, setLosing] = useState(false); const [assigning, setAssigning] = useState(false);
  const act = useAction();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const l = data.lead; const open = ['new', 'contacted', 'qualified'].includes(l.stage);
  const qualify = () => act.run(() => post(`/leads/${id}/qualify`), 'Lead qualified').then((r) => r && reload());
  const convert = async () => { const r = await act.run(() => post<{ opportunity_id: number }>(`/leads/${id}/convert`), 'Opportunity created'); if (r) nav(`/sales/opportunities/${r.opportunity_id}`); };
  return (
    <div className="stack-lg">
      <PageHeader crumbs={[{ to: '/sales/leads', label: 'Leads' }]} title={l.company_name} sub={<>{l.contact_name} · owner {l.owner_name} · <Status kind="lead" value={l.stage} /></>}
        actions={open && can('sales.write') && <>
          <Button onClick={() => setEditing(true)}>Edit</Button>
          {can('sales.assign') && <Button onClick={() => setAssigning(true)}>Reassign</Button>}
          <Button onClick={() => setLosing(true)}>Mark lost</Button>
          {l.stage === 'qualified' ? <Button variant="emphasis" loading={act.pending} onClick={convert}>Convert to opportunity</Button> : <Button variant="primary" loading={act.pending} onClick={qualify}>Qualify</Button>}
        </>} />
      {act.error?.code === 'blocked' && <MissingList title={act.error.message} items={act.error.missing} />}
      {l.stage === 'converted' && <div className="callout ok"><span>✓</span><div>Converted. Continue on the <Link to={`/sales/opportunities/${l.opportunity_id}`}>opportunity</Link>.</div></div>}
      {l.stage === 'lost' && <div className="callout info"><span>i</span><div>Lost: {l.lost_reason}</div></div>}
      {data.duplicates.length > 0 && <div className="callout warn" role="note"><span>!</span><div><h4>Possible duplicates</h4><ul>{data.duplicates.map((d: any) => <li key={d.type + d.id}>{d.type === 'lead' ? <Link to={`/sales/leads/${d.id}`}>{d.label}</Link> : d.type === 'company' ? <Link to={`/sales/companies/${d.id}`}>{d.label}</Link> : d.label} <span className="muted">({d.reason})</span></li>)}</ul></div></div>}
      <div className="grid grid-2">
        <Card title="Lead details">
          <dl className="kv">
            <dt>Source</dt><dd>{l.source}</dd><dt>Occasion</dt><dd>{l.occasion ?? '—'}</dd>
            <dt>Contact</dt><dd>{l.contact_name}{l.phone && <> · <a href={`tel:${l.phone}`}>{l.phone}</a></>}{l.email && <> · <a href={`mailto:${l.email}`}>{l.email}</a></>}</dd>
            <dt>Quantity</dt><dd>{l.approx_qty ?? '—'}</dd><dt>Budget</dt><dd>{money(l.budget_paise)}</dd>
            <dt>Required by</dt><dd>{date(l.required_by)} <span className="muted small">{relDays(l.required_by)}</span></dd>
            <dt>Locations</dt><dd>{l.locations ?? '—'}</dd><dt>Next follow-up</dt><dd>{date(l.next_follow_up)}</dd><dt>Notes</dt><dd style={{ whiteSpace: 'pre-line' }}>{l.notes ?? '—'}</dd>
          </dl>
        </Card>
        <Card title="Calls, meetings and notes">{open && can('sales.write') ? <LogActivity url={`/leads/${id}/activities`} onDone={reload} /> : null}<ActivityList items={data.activities} /></Card>
      </div>
      <Card title="Follow-up tasks" pad={false}><TaskTable rows={data.tasks} /></Card>
      <Card title="History"><History rows={data.history} /></Card>
      {editing && <LeadForm open onClose={() => setEditing(false)} lead={l} onSaved={reload} />}
      <LoseModal open={losing} onClose={() => setLosing(false)} url={`/leads/${id}/lose`} onDone={reload} />
      <AssignModal open={assigning} onClose={() => setAssigning(false)} url={`/leads/${id}/assign`} onDone={reload} />
    </div>
  );
}

export function LogActivity({ url, onDone }: { url: string; onDone: () => void }) {
  const [f, setF] = useState<any>({ kind: 'call', summary: '', outcome: '', next_follow_up: '' });
  const [setFollow, setSetFollow] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});
  const act = useAction();
  const save = async () => {
    const body: any = { kind: f.kind, summary: f.summary, outcome: f.outcome };
    if (setFollow) body.next_follow_up = f.next_follow_up || null;
    const errs = zodErrors(activityInput, body); setLocal(errs); if (Object.keys(errs).length) return;
    const r = await act.run(() => post(url, body), 'Logged');
    if (r) { setF({ kind: 'call', summary: '', outcome: '', next_follow_up: '' }); setSetFollow(false); onDone(); }
  };
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }} style={{ marginBottom: '1rem' }}>
      <div className="grid grid-2">
        <SelectField label="Type" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={['call', 'meeting', 'email', 'whatsapp', 'note'].map((k) => ({ value: k, label: label(k) }))} placeholder={null} />
        <TextField label="Outcome" value={f.outcome} onChange={(v) => setF({ ...f, outcome: v })} placeholder="e.g. Interested, asked for samples" />
      </div>
      <TextArea label="What was discussed" value={f.summary} onChange={(v) => setF({ ...f, summary: v })} required error={local.summary ?? fieldErr(act.error, 'summary')} rows={2} />
      <div className="row"><Check label="Set the next follow-up" checked={setFollow} onChange={setSetFollow} />{setFollow && <input className="input" style={{ width: 'auto' }} type="date" aria-label="Next follow-up date" value={f.next_follow_up} min={todayStr()} onChange={(e) => setF({ ...f, next_follow_up: e.target.value })} />}</div>
      <div className="row end"><Button type="submit" variant="primary" size="sm" loading={act.pending}>Log activity</Button></div>
    </form>
  );
}
export function ActivityList({ items }: { items: any[] }) {
  if (!items.length) return <p className="muted">No calls or meetings logged yet.</p>;
  return <ul className="timeline">{items.map((a) => <li key={a.id}><span className="dot" aria-hidden="true" /><div><div><strong>{label(a.kind)}</strong>: {a.summary}{a.outcome && <span className="muted"> — {a.outcome}</span>}</div><div className="meta">{a.by_name} · {dateTime(a.at)}{a.entity_type === 'lead' ? ' · from lead' : ''}</div></div></li>)}</ul>;
}
export function History({ rows }: { rows: any[] }) {
  if (!rows?.length) return <p className="muted">No history yet.</p>;
  return <ul className="timeline">{rows.map((h) => <li key={h.id}><span className={`dot ${/override|reject|blocked/i.test(h.summary + h.action) ? 'exception' : ''}`} aria-hidden="true" /><div><div>{h.summary}</div><div className="meta">{h.user_name ?? 'System'} · {dateTime(h.at)}</div></div></li>)}</ul>;
}
function TaskTable({ rows }: { rows: any[] }) {
  const t = todayStr();
  if (!rows.length) return <Empty title="No follow-up tasks" />;
  return <div className="table-wrap"><table className="table"><thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>{rows.map((x) => <tr key={x.id}><td>{x.title}</td><td>{x.owner_name}</td><td>{x.due_at ? <Pill tone={x.status === 'open' && x.due_at < t ? 'bad' : 'neutral'} icon="clock">{date(x.due_at)}</Pill> : '—'}</td><td><Status kind="task" value={x.status} /></td></tr>)}</tbody></table></div>;
}
function LoseModal({ open, onClose, url, onDone }: { open: boolean; onClose: () => void; url: string; onDone: () => void }) {
  const reasons = useApi<any>(open ? '/settings' : null);
  const [reason, setReason] = useState(''); const [detail, setDetail] = useState('');
  const act = useAction();
  const save = async () => { const r = await act.run(() => post(url, { reason, detail }), 'Marked lost'); if (r) { onClose(); onDone(); } };
  return (
    <Modal open={open} onClose={onClose} title="Mark as lost" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" loading={act.pending} onClick={save}>Mark lost</Button></>}>
      <div className="stack"><FormError error={act.error} />
        <SelectField label="Reason" value={reason} onChange={setReason} required options={(reasons.data?.values['sales.lost_reasons'] ?? []).map((r: string) => ({ value: r, label: r }))} error={fieldErr(act.error, 'reason')} />
        <TextArea label="Details" value={detail} onChange={setDetail} hint="What would have won it? This feeds the lost-reasons report." /></div>
    </Modal>
  );
}
function AssignModal({ open, onClose, url, onDone }: { open: boolean; onClose: () => void; url: string; onDone: () => void }) {
  const [owner, setOwner] = useState<number | null>(null); const [reason, setReason] = useState('');
  const act = useAction();
  const save = async () => { const r = await act.run(() => post(url, { owner_id: owner, reason }), 'Reassigned'); if (r) { onClose(); onDone(); } };
  return (
    <Modal open={open} onClose={onClose} title="Reassign" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={save} disabled={!owner}>Reassign</Button></>}>
      <div className="stack"><FormError error={act.error} /><UserSelect label="New owner" value={owner} onChange={setOwner} roles={['sales_exec', 'sales_manager', 'admin']} required /><TextField label="Reason" value={reason} onChange={setReason} hint="Shared with the new owner" /></div>
    </Modal>
  );
}

// ================================================================ companies
function Companies() {
  const [sp, setSp] = useSearchParams(); const q = sp.get('q') ?? ''; const page = Number(sp.get('page') ?? 1);
  const { data, error, loading, reload } = useApi<any>(`/companies?q=${encodeURIComponent(q)}&page=${page}&pageSize=25`);
  const [creating, setCreating] = useState(false); const { can } = useAuth();
  return (
    <div className="stack">
      <PageHeader title="Companies and contacts" sub="Customers and prospects. One company can have many contacts, opportunities and orders." actions={can('sales.write') && <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New company</Button>} />
      <div className="filters" role="search"><input className="input grow" type="search" aria-label="Search companies" placeholder="Search company, city or contact…" value={q} onChange={(e) => setSp(e.target.value ? { q: e.target.value } : {}, { replace: true })} /></div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title="No companies found" /> : (
          <div className="table-wrap"><table className="table responsive"><thead><tr><th>Company</th><th>City</th><th>Account owner</th><th className="num">Contacts</th><th className="num">Open opportunities</th><th className="num">Orders</th></tr></thead>
            <tbody>{data.rows.map((c: any) => <tr key={c.id}><td data-label="Company"><Link className="row-link" to={`/sales/companies/${c.id}`}>{c.name}</Link></td><td data-label="City">{c.city ?? '—'}</td><td data-label="Owner">{c.owner_name ?? '—'}</td><td data-label="Contacts" className="num">{c.contacts}</td><td data-label="Open opps" className="num">{c.open_opps}</td><td data-label="Orders" className="num">{c.orders}</td></tr>)}</tbody></table></div>
        )}
        {data && <Pager page={page} pageSize={25} total={data.total} onPage={(p) => setSp({ ...(q ? { q } : {}), page: String(p) })} />}
      </Card>
      <CompanyForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
function CompanyForm({ open, onClose, company, onSaved }: { open: boolean; onClose: () => void; company?: any; onSaved?: () => void }) {
  const [f, setF] = useState<any>(company ?? { name: '', city: '', industry: '', gst_number: '', address: '', notes: '' });
  const act = useAction(); const nav = useNavigate();
  const save = async (confirm_duplicate = false) => {
    if (company) { const r = await act.run(() => patch(`/companies/${company.id}`, { name: f.name, city: f.city, industry: f.industry, gst_number: f.gst_number, address: f.address, notes: f.notes, expected_version: company.version }), 'Saved'); if (r) { onSaved?.(); onClose(); } }
    else { const r = await act.run(() => post<{ id: number }>('/companies', { ...f, confirm_duplicate }), 'Company created'); if (r) { onClose(); nav(`/sales/companies/${r.id}`); } }
  };
  return (
    <Modal open={open} onClose={onClose} title={company ? 'Edit company' : 'New company'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={() => save()}>Save</Button></>}>
      <div className="stack"><FormError error={act.error} onConfirmDuplicate={() => save(true)} />
        <TextField label="Company name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required error={fieldErr(act.error, 'name')} />
        <div className="grid grid-2"><TextField label="City" value={f.city} onChange={(v) => setF({ ...f, city: v })} /><TextField label="Industry" value={f.industry} onChange={(v) => setF({ ...f, industry: v })} /></div>
        <TextField label="GSTIN (billing)" value={f.gst_number} onChange={(v) => setF({ ...f, gst_number: v })} hint="For reference only; invoicing happens in the accounting system" />
        <TextArea label="Address" value={f.address} onChange={(v) => setF({ ...f, address: v })} rows={2} />
        <TextArea label="Notes" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} rows={2} />
      </div>
    </Modal>
  );
}
function CompanyDetail() {
  const { id } = useParams(); const { can, me } = useAuth(); const nav = useNavigate();
  const { data, error, loading, reload } = useApi<any>(`/companies/${id}`);
  const [editing, setEditing] = useState(false); const [contact, setContact] = useState<any | null>(null); const [newOpp, setNewOpp] = useState(false);
  const [opp, setOpp] = useState<any>({ title: '', approx_qty: null, required_by: '', contact_id: '' });
  const act = useAction();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const c = data.company;
  const saveContact = async () => {
    const errs = zodErrors(contactInput, contact); if (Object.keys(errs).length) { act.setError(new ApiError(400, 'validation', 'Please fix the highlighted fields.', { fields: errs })); return; }
    const r = await act.run(() => (contact.id ? patch(`/contacts/${contact.id}`, contact) : post(`/companies/${id}/contacts`, contact)), 'Contact saved'); if (r) { setContact(null); reload(); }
  };
  const createOpp = async () => { const r = await act.run(() => post<{ id: number }>('/opportunities', { company_id: Number(id), owner_id: me!.user.id, title: opp.title, approx_qty: opp.approx_qty, required_by: opp.required_by || null, contact_id: opp.contact_id ? Number(opp.contact_id) : null }), 'Opportunity created'); if (r) nav(`/sales/opportunities/${r.id}`); };
  return (
    <div className="stack-lg">
      <PageHeader crumbs={[{ to: '/sales/companies', label: 'Companies' }]} title={c.name} sub={[c.city, c.industry, c.owner_name && `Account owner ${c.owner_name}`].filter(Boolean).join(' · ')}
        actions={can('sales.write') && <><Button onClick={() => setEditing(true)}>Edit</Button><Button variant="emphasis" icon="plus" onClick={() => { setOpp({ title: `${c.name} — `, approx_qty: null, required_by: '', contact_id: '' }); setNewOpp(true); }}>New opportunity</Button></>} />
      <div className="grid grid-2">
        <Card title="Contacts" actions={can('sales.write') && <Button size="sm" icon="plus" onClick={() => setContact({ name: '', email: '', phone: '', designation: '', is_primary: data.contacts.length === 0 })}>Add contact</Button>} pad={false}>
          {data.contacts.length === 0 ? <Empty title="No contacts yet" /> : <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Phone / email</th><th><span className="sr-only">Edit</span></th></tr></thead>
            <tbody>{data.contacts.map((ct: any) => <tr key={ct.id}><td><strong>{ct.name}</strong> {ct.is_primary ? <Pill tone="info">Primary</Pill> : null}<div className="small muted">{ct.designation}</div></td><td>{ct.phone && <a href={`tel:${ct.phone}`}>{ct.phone}</a>}<div>{ct.email && <a href={`mailto:${ct.email}`}>{ct.email}</a>}</div></td><td>{can('sales.write') && <Button size="sm" variant="ghost" onClick={() => setContact({ ...ct, is_primary: !!ct.is_primary })}>Edit</Button>}</td></tr>)}</tbody></table></div>}
        </Card>
        <Card title="Details"><dl className="kv"><dt>GSTIN</dt><dd>{c.gst_number ?? '—'}</dd><dt>Address</dt><dd>{c.address ?? '—'}</dd><dt>Notes</dt><dd>{c.notes ?? '—'}</dd></dl></Card>
      </div>
      <div className="grid grid-2">
        <Card title="Opportunities" pad={false}>{data.opportunities.length === 0 ? <Empty title="No opportunities" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.opportunities.map((o: any) => <li key={o.id}><span style={{ flex: 1 }}><Link to={`/sales/opportunities/${o.id}`}>{o.title}</Link><div className="small muted">{o.owner_name} · required {date(o.required_by)}</div></span><Status kind="opp" value={o.stage} /></li>)}</ul>}</Card>
        <Card title="Orders" pad={false}>{data.orders.length === 0 ? <Empty title="No orders yet" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.orders.map((o: any) => <li key={o.id}><span style={{ flex: 1 }}><Link to={`/orders/${o.id}`}>{o.number}</Link> {o.title}<div className="small muted">Due {date(o.due_date)}</div></span><Status kind="order" value={o.stage} /></li>)}</ul>}</Card>
      </div>
      {editing && <CompanyForm open onClose={() => setEditing(false)} company={c} onSaved={reload} />}
      <Modal open={!!contact} onClose={() => setContact(null)} title={contact?.id ? 'Edit contact' : 'Add contact'} footer={<>{contact?.id && <Button variant="danger" onClick={() => act.run(() => patch(`/contacts/${contact.id}`, { archived: true }), 'Contact archived').then((r) => { if (r) { setContact(null); reload(); } })}>Archive</Button>}<Button onClick={() => setContact(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={saveContact}>Save contact</Button></>}>
        {contact && <div className="stack"><FormError error={act.error} />
          <TextField label="Name" value={contact.name} onChange={(v) => setContact({ ...contact, name: v })} required error={fieldErr(act.error, 'name')} />
          <div className="grid grid-2"><TextField label="Phone" type="tel" value={contact.phone} onChange={(v) => setContact({ ...contact, phone: v })} error={fieldErr(act.error, 'phone')} /><TextField label="Email" type="email" value={contact.email} onChange={(v) => setContact({ ...contact, email: v })} error={fieldErr(act.error, 'email')} /></div>
          <TextField label="Designation" value={contact.designation} onChange={(v) => setContact({ ...contact, designation: v })} />
          <Check label="Primary contact" checked={!!contact.is_primary} onChange={(v) => setContact({ ...contact, is_primary: v })} /></div>}
      </Modal>
      <Modal open={newOpp} onClose={() => setNewOpp(false)} title="New opportunity" footer={<><Button onClick={() => setNewOpp(false)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={createOpp}>Create</Button></>}>
        <div className="stack"><FormError error={act.error} />
          <TextField label="Title" value={opp.title} onChange={(v) => setOpp({ ...opp, title: v })} required error={fieldErr(act.error, 'title')} />
          <SelectField label="Contact" value={opp.contact_id} onChange={(v) => setOpp({ ...opp, contact_id: v })} options={data.contacts.map((ct: any) => ({ value: ct.id, label: ct.name }))} />
          <div className="grid grid-2"><NumberField label="Approximate quantity" value={opp.approx_qty} onChange={(v) => setOpp({ ...opp, approx_qty: v })} /><TextField label="Required by" type="date" value={opp.required_by} onChange={(v) => setOpp({ ...opp, required_by: v })} /></div></div>
      </Modal>
    </div>
  );
}

// ================================================================ opportunities
function Opportunities() {
  const [sp, setSp] = useSearchParams(); const q = sp.get('q') ?? ''; const stage = sp.get('stage') ?? 'open'; const page = Number(sp.get('page') ?? 1);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };
  const { data, error, loading, reload } = useApi<any>(`/opportunities?q=${encodeURIComponent(q)}&stage=${stage}&page=${page}&pageSize=25`);
  const feas = useApi<any>(useAuth().can('feasibility.write') ? '/feasibility' : null);
  return (
    <div className="stack">
      <PageHeader title="Opportunities" sub="Qualified demand: requirements, feasibility, quotations and customer approval." />
      {feas.data?.rows.length > 0 && <div className="callout info"><span>i</span><div><strong>{feas.data.rows.length} feasibility check{feas.data.rows.length > 1 ? 's' : ''} waiting for procurement:</strong> {feas.data.rows.map((f: any) => <Link key={f.id} to={`/sales/opportunities/${f.opportunity_id}`} style={{ marginRight: '.75rem' }}>{f.title}</Link>)}</div></div>}
      <div className="filters" role="search">
        <input className="input grow" type="search" aria-label="Search opportunities" placeholder="Search title or company…" value={q} onChange={(e) => set('q', e.target.value)} />
        <select className="input" aria-label="Stage" value={stage} onChange={(e) => set('stage', e.target.value)}><option value="open">Open</option><option value="">All</option>{['requirements', 'feasibility', 'quotation', 'awaiting_approval', 'won', 'lost'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
      </div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title="No opportunities match">Opportunities are created by converting a qualified lead or from a company page.</Empty> : (
          <div className="table-wrap"><table className="table responsive"><thead><tr><th>Opportunity</th><th>Owner</th><th>Required by</th><th>Feasibility</th><th>Quotation</th><th className="num">Value</th><th>Stage</th></tr></thead>
            <tbody>{data.rows.map((o: any) => { const [fs, fr] = (o.feasibility ?? ':').split(':'); return (
              <tr key={o.id}><td data-label="Opportunity"><Link className="row-link" to={`/sales/opportunities/${o.id}`}>{o.title}</Link><div className="small muted">{o.company_name}</div></td><td data-label="Owner">{o.owner_name}</td><td data-label="Required by">{date(o.required_by)}</td>
                <td data-label="Feasibility">{fs ? <Status kind="feas" value={fs === 'requested' ? 'requested' : fr} /> : <span className="muted small">Not requested</span>}</td>
                <td data-label="Quotation">{o.quote_status ? <Status kind="quote" value={o.quote_status} /> : '—'}</td><td data-label="Value" className="num">{money(o.quote_total_paise)}</td><td data-label="Stage"><Status kind="opp" value={o.stage} /></td></tr>); })}</tbody></table></div>
        )}
        {data && <Pager page={page} pageSize={25} total={data.total} onPage={(p) => set('page', String(p))} />}
      </Card>
    </div>
  );
}

const REQ_FIELDS: [string, string, 'text' | 'number' | 'money' | 'date' | 'area'][] = [
  ['occasion', 'Occasion', 'text'], ['recipients', 'Number of recipients', 'number'], ['budget_per_box_paise', 'Budget per box', 'money'], ['delivery_by', 'Delivery by', 'date'],
  ['gift_theme', 'Gift theme / preferences', 'text'], ['customisation', 'Customisation', 'text'], ['branding', 'Branding', 'text'], ['packaging', 'Packaging', 'text'],
  ['delivery_locations', 'Delivery locations', 'area'], ['dietary_or_restrictions', 'Dietary needs / restrictions', 'area'], ['notes', 'Other notes', 'area'],
];
export function RequirementsView({ req }: { req: any }) {
  return <dl className="kv">{REQ_FIELDS.map(([k, l, t]) => <><dt key={k + 'l'}>{l}</dt><dd key={k}>{req?.[k] == null || req[k] === '' ? <span className="muted">—</span> : t === 'money' ? money(req[k]) : t === 'date' ? date(req[k]) : String(req[k])}</dd></>)}</dl>;
}
export function RequirementsForm({ value, onSave, pending, error }: { value: any; onSave: (v: any) => void; pending: boolean; error: ApiError | null }) {
  const [f, setF] = useState<any>({ ...value });
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
      <FormError error={error} />
      <div className="grid grid-2">{REQ_FIELDS.map(([k, l, t]) => t === 'money' ? <MoneyField key={k} label={l} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} /> : t === 'number' ? <NumberField key={k} label={l} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} /> : t === 'area' ? <TextArea key={k} label={l} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} rows={2} /> : <TextField key={k} label={l} type={t === 'date' ? 'date' : 'text'} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} />)}</div>
      <div className="form-actions"><Button type="submit" variant="primary" loading={pending}>Save requirements</Button></div>
    </form>
  );
}

function OpportunityDetail() {
  const { id } = useParams(); const { can, me } = useAuth();
  const { data, error, loading, reload } = useApi<any>(`/opportunities/${id}`);
  const [editReq, setEditReq] = useState(false); const [newQuote, setNewQuote] = useState(false); const [losing, setLosing] = useState(false); const [feasOpen, setFeasOpen] = useState(false); const [completing, setCompleting] = useState<any | null>(null); const [task, setTask] = useState(false);
  const act = useAction(); const nav = useNavigate();
  const [feasTo, setFeasTo] = useState<number | null>(null); const [feasNote, setFeasNote] = useState('');
  const [result, setResult] = useState<any>({ result: 'feasible', earliest_delivery: '', est_cost_paise: null, max_quantity: null, notes: '' });
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const o = data.opportunity; const open = !['won', 'lost'].includes(o.stage);
  const pendingFeas = data.feasibility.find((f: any) => f.status === 'requested');
  const saveReq = async (v: any) => { const r = await act.run(() => patch(`/opportunities/${id}`, { requirements: v, expected_version: o.version }), 'Requirements saved'); if (r) { setEditReq(false); reload(); } };
  const requestFeas = async () => { const r = await act.run(() => post(`/opportunities/${id}/feasibility`, { assigned_to: feasTo, notes: feasNote }), 'Feasibility check requested'); if (r) { setFeasOpen(false); reload(); } };
  const complete = async () => {
    const errs = zodErrors(feasibilityResultInput, result); if (Object.keys(errs).length) { act.setError(new ApiError(400, 'validation', 'Please fix the highlighted fields.', { fields: errs })); return; }
    const r = await act.run(() => post(`/feasibility/${completing.id}/complete`, result), 'Feasibility recorded'); if (r) { setCompleting(null); reload(); }
  };
  return (
    <div className="stack-lg">
      <PageHeader crumbs={[{ to: '/sales/opportunities', label: 'Opportunities' }, { to: `/sales/companies/${o.company_id}`, label: o.company_name }]} title={o.title}
        sub={<>{o.owner_name} · required by {date(o.required_by)} · <Status kind="opp" value={o.stage} />{o.order_id && <> · <Link to={`/orders/${o.order_id}`}>Open order</Link></>}</>}
        actions={open && can('sales.write') && <><Button onClick={() => setTask(true)}>Add task</Button><Button onClick={() => setLosing(true)}>Mark lost</Button>{!pendingFeas && <Button onClick={() => setFeasOpen(true)}>Request feasibility</Button>}<Button variant="emphasis" icon="plus" onClick={() => setNewQuote(true)}>New quotation</Button></>} />
      {o.stage === 'lost' && <div className="callout info"><span>i</span><div>Lost: {o.lost_reason}</div></div>}
      <div className="grid grid-2">
        <Card title="Customer requirements" actions={open && can('sales.write') && !editReq && <Button size="sm" onClick={() => setEditReq(true)}>Edit</Button>}>
          {editReq ? <RequirementsForm value={o.requirements} onSave={saveReq} pending={act.pending} error={act.error} /> : <RequirementsView req={o.requirements} />}
          <div className="divider" /><div className="small muted">Contact: {o.contact_name ?? '—'} {o.contact_phone && <a href={`tel:${o.contact_phone}`}>{o.contact_phone}</a>} {o.contact_email && <a href={`mailto:${o.contact_email}`}>{o.contact_email}</a>}</div>
        </Card>
        <div className="stack">
          <Card title="Feasibility (procurement)" pad>
            <p className="small muted">Sales cannot make a firm price or date commitment until procurement records a feasibility check that supports it.</p>
            {data.feasibility.length === 0 ? <p className="muted">Not requested yet.</p> : data.feasibility.map((f: any) => (
              <div key={f.id} className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: '.6rem', marginTop: '.6rem' }}>
                <div className="row between"><Status kind="feas" value={f.status === 'requested' ? 'requested' : f.result} label={f.status === 'requested' ? `Waiting for ${f.assigned_name}` : undefined} /><span className="small muted">Requested by {f.requested_name} · {dateTime(f.requested_at)}</span></div>
                {f.status === 'completed' && <dl className="kv small"><dt>Earliest delivery</dt><dd>{date(f.earliest_delivery)}</dd><dt>Max quantity</dt><dd>{f.max_quantity ?? 'No limit given'}</dd>{f.est_cost_paise != null && <><dt>Estimated cost</dt><dd>{money(f.est_cost_paise)}</dd></>}<dt>Notes</dt><dd>{f.notes}</dd><dt>Checked by</dt><dd>{f.completed_name} · {dateTime(f.completed_at)}</dd></dl>}
                {f.status === 'requested' && f.notes && <p className="small">Request: {f.notes}</p>}
                {f.status === 'requested' && can('feasibility.write') && (f.assigned_to === me!.user.id || can('procurement.all')) && <div><Button size="sm" variant="primary" onClick={() => { setResult({ result: 'feasible', earliest_delivery: o.required_by ?? '', est_cost_paise: null, max_quantity: null, notes: '' }); setCompleting(f); }}>Record result</Button></div>}
              </div>
            ))}
          </Card>
          <Card title="Quotations" pad={false}>
            {data.quotations.length === 0 ? <Empty title="No quotation yet" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.quotations.map((q: any) => <li key={q.id}><span style={{ flex: 1 }}><Link to={`/sales/quotations/${q.id}`}><strong>{q.number}</strong> v{q.current_version}</Link><div className="small muted">{money(q.total_paise)}{q.margin_bp != null && ` · margin ${pct(q.margin_bp)}`} · valid until {date(q.validity_date)}</div></span><Status kind="quote" value={q.status} /></li>)}</ul>}
          </Card>
        </div>
      </div>
      <div className="grid grid-2">
        <Card title="Calls, meetings and notes">{open && can('sales.write') && <LogActivity url={`/opportunities/${id}/activities`} onDone={reload} />}<ActivityList items={data.activities} /></Card>
        <div className="stack"><Card title="Files" actions={can('sales.write') && <FileButton entity="opportunity" id={Number(id)} label="Attach brief / artwork" onDone={reload} />}><AttachmentList entity="opportunity" id={Number(id)} key={data.history.length} /></Card><Card title="Tasks" pad={false}><TaskTable rows={data.tasks} /></Card></div>
      </div>
      <Card title="History (including the original lead)"><History rows={data.history} /></Card>
      <Modal open={feasOpen} onClose={() => setFeasOpen(false)} title="Request a feasibility check" footer={<><Button onClick={() => setFeasOpen(false)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={requestFeas}>Send request</Button></>}>
        <div className="stack"><FormError error={act.error} /><UserSelect label="Procurement person" value={feasTo} onChange={setFeasTo} roles={['procurement_manager', 'procurement_exec']} required error={fieldErr(act.error, 'assigned_to')} /><TextArea label="What should they check?" value={feasNote} onChange={setFeasNote} placeholder="Quantity, date, special items, budget per box…" /></div>
      </Modal>
      <Modal open={!!completing} onClose={() => setCompleting(null)} title="Record feasibility result" footer={<><Button onClick={() => setCompleting(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={complete}>Save result</Button></>}>
        <div className="stack"><FormError error={act.error} />
          <SelectField label="Result" value={result.result} onChange={(v) => setResult({ ...result, result: v })} placeholder={null} options={[{ value: 'feasible', label: 'Feasible' }, { value: 'at_risk', label: 'Feasible but at risk' }, { value: 'infeasible', label: 'Not feasible as asked' }]} />
          <div className="grid grid-2"><TextField label="Earliest delivery date" type="date" value={result.earliest_delivery} onChange={(v) => setResult({ ...result, earliest_delivery: v })} required error={fieldErr(act.error, 'earliest_delivery')} /><NumberField label="Maximum quantity" value={result.max_quantity} onChange={(v) => setResult({ ...result, max_quantity: v })} hint="Leave blank if no limit" /></div>
          <MoneyField label="Estimated total cost" value={result.est_cost_paise} onChange={(v) => setResult({ ...result, est_cost_paise: v })} hint="Line-level costs go on the quotation's Costing section" />
          <TextArea label="Notes for sales" value={result.notes} onChange={(v) => setResult({ ...result, notes: v })} required error={fieldErr(act.error, 'notes')} />
        </div>
      </Modal>
      {newQuote && <QuoteEditor open onClose={() => setNewQuote(false)} url={`/opportunities/${id}/quotations`} initial={{ lines: [{ description: '', qty: o.approx_qty ?? 1, unit_price_paise: o.requirements?.budget_per_box_paise ?? 0, customisation: o.requirements?.customisation ?? '' }], delivery_date: o.required_by ?? '' }} onSaved={(r: any) => nav(`/sales/quotations/${r.id}`)} />}
      <LoseModal open={losing} onClose={() => setLosing(false)} url={`/opportunities/${id}/lose`} onDone={reload} />
      <NewTask open={task} onClose={() => setTask(false)} onDone={reload} entity={{ type: 'opportunity', id: Number(id) }} />
    </div>
  );
}
export { get };
