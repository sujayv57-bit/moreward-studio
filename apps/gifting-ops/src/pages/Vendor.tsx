import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { bankInput } from '../../shared/schemas.ts';
import { ApiError, post, put } from '../api.ts';
import { date, dateTime, label, money, todayStr } from '../format.ts';
import { useAction, useApi, useAuth } from '../state.tsx';
import { Button, Card, Empty, ErrorState, fieldErr, FileButton, FormError, Icon, Loading, MissingList, Modal, PageHeader, Pill, SelectField, Status, TabPanel, Tabs, TextArea, TextField } from '../ui.tsx';
import { VendorForm } from './Procurement.tsx';
import { AttachmentList, MessageDraft } from './shared.tsx';

export default function Vendor() {
  const { id } = useParams(); const { can } = useAuth();
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') ?? 'onboarding';
  const { data, error, loading, reload } = useApi<any>(`/vendors/${id}`);
  const meta = useApi<any>('/vendor-meta');
  const act = useAction();
  const [edit, setEdit] = useState(false); const [move, setMove] = useState<any | null>(null); const [doc, setDoc] = useState<any | null>(null); const [bank, setBank] = useState<any | null>(null); const [verify, setVerify] = useState(''); const [verifyOpen, setVerifyOpen] = useState(false);
  const [contact, setContact] = useState<any | null>(null); const [ev, setEv] = useState<any | null>(null); const [msg, setMsg] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const v = data.vendor;
  const missing = data.checklist.filter((c: any) => !c.done);
  const done = (r: unknown, close: () => void) => { if (r) { close(); reload(); } };
  const tabs = [{ id: 'onboarding', label: 'Onboarding', count: missing.length, alert: missing.length > 0 }, { id: 'profile', label: 'Profile' }, { id: 'documents', label: 'Documents', count: data.documents.length }, { id: 'bank', label: 'Bank details' }, { id: 'history', label: 'Contact & history' }, ...(data.performance ? [{ id: 'performance', label: 'Performance' }] : [])];
  return (
    <div className="stack">
      <PageHeader crumbs={[{ to: '/procurement/vendors', label: 'Vendors' }]} title={v.display_name} sub={<>{v.legal_name}{v.city && ` · ${v.city}`} · <Status kind="vendor" value={v.status} />{v.status_reason && <span className="muted"> — {v.status_reason}</span>}{v.approved_by_name && <span className="muted"> · approved by {v.approved_by_name} {date(v.approved_at)}</span>}</>}
        actions={<>{data.can.edit && <Button onClick={() => setMsg(true)}>Draft message</Button>}{data.can.edit && <Button onClick={() => setEdit(true)}>Edit profile</Button>}</>} />
      {data.duplicates.length > 0 && <div className="callout warn"><Icon name="alert" /><div><h4>Possible duplicate vendors</h4><ul>{data.duplicates.map((d: any) => <li key={d.id}><Link to={`/procurement/vendors/${d.id}`}>{d.label}</Link> ({label(d.status)}) — {d.reason}</li>)}</ul></div></div>}
      {data.bank && data.bank.review_required ? <div className="callout bad"><Icon name="lock" /><div><strong>Bank details changed and not yet verified.</strong> Vendor payments are blocked until someone other than the person who changed them verifies the change.</div></div> : null}
      {['suspended', 'rejected', 'inactive'].includes(v.status) && <div className="callout bad"><Icon name="block" /><div>This vendor cannot receive normal purchase orders{v.status === 'suspended' ? ' or quote requests' : ''}.</div></div>}
      <Tabs tabs={tabs} active={tab} onChange={(t) => setSp({ tab: t }, { replace: true })} label="Vendor sections" />
      <TabPanel id={tab}>
        {tab === 'onboarding' && <div className="grid grid-2">
          <Card title="Checklist">
            <p className="small muted">Onboarding owner: {v.onboarding_owner_name ?? '—'}{v.onboarding_due && <> · due {date(v.onboarding_due)} {v.onboarding_due < todayStr() && ['draft', 'info_requested', 'documents_pending'].includes(v.status) && <Pill tone="bad">Overdue</Pill>}</>}</p>
            {['information', 'documents', 'bank', 'verification'].map((g) => {
              const items = data.checklist.filter((c: any) => c.group === g); if (!items.length) return null;
              return <div key={g}><h3 style={{ margin: '.75rem 0 .25rem' }}>{label(g)}</h3><ul className="checklist">{items.map((c: any) => <li key={c.key}>{c.done ? <Pill tone="ok">Done</Pill> : <Pill tone="warn">Missing</Pill>}<span>{c.label}{c.detail && <span className="small muted"> — {c.detail}</span>}</span></li>)}</ul></div>;
            })}
          </Card>
          <Card title="Status">
            <p>Current: <Status kind="vendor" value={v.status} /></p>
            <p className="small muted">Draft → Information requested → Documents pending → Under review → Approved → Active. Approval needs every checklist item, including finance/admin verification, and is done by an authorised approver.</p>
            <div className="row" style={{ marginTop: '.5rem' }}>{data.transitions.map((t: any) => <Button key={t.to} size="sm" variant={t.to === 'approved' || t.to === 'active' ? 'primary' : ['suspended', 'rejected', 'inactive'].includes(t.to) ? 'danger' : 'default'} disabled={!t.allowed} title={t.allowed ? undefined : 'You do not have authority for this change'} onClick={() => setMove({ to: t.to, reason: '', reason_required: t.reason_required })}>{label(t.to)}</Button>)}</div>
            {act.error?.code === 'blocked' && <div style={{ marginTop: '.75rem' }}><MissingList title={act.error.message} items={act.error.missing} /></div>}
          </Card>
        </div>}
        {tab === 'profile' && <div className="grid grid-2">
          <Card title="Contact and supply"><dl className="kv"><dt>Phone</dt><dd>{v.phone ? <a href={`tel:${v.phone}`}>{v.phone}</a> : '—'}</dd><dt>Email</dt><dd>{v.email ? <a href={`mailto:${v.email}`}>{v.email}</a> : '—'}</dd><dt>Address</dt><dd>{v.address ?? '—'}</dd><dt>Preferred contact</dt><dd>{v.preferred_comm ?? '—'}</dd><dt>Categories</dt><dd>{v.categories.join(', ') || '—'}</dd><dt>Capabilities</dt><dd>{v.capabilities ?? '—'}</dd><dt>Customisation</dt><dd>{v.customisation_options ?? '—'}</dd><dt>Serviceable</dt><dd>{v.serviceable_locations ?? '—'}</dd><dt>Lead time</dt><dd>{v.lead_time_days ? `${v.lead_time_days} days` : '—'}</dd><dt>MOQ</dt><dd>{v.moq ?? '—'}</dd><dt>Capacity / week</dt><dd>{v.capacity_per_week ?? '—'}</dd><dt>Payment terms</dt><dd>{v.payment_terms ?? '—'}</dd><dt>Samples</dt><dd>{v.sample_available ? 'Available' : 'No'}</dd>{v.gst_number !== undefined && <><dt>GSTIN</dt><dd>{v.gst_number ?? '—'}</dd><dt>PAN</dt><dd>{v.pan_number ?? '—'}</dd></>}<dt>Notes</dt><dd>{v.notes ?? '—'}</dd></dl></Card>
          <Card title="Contacts" actions={data.can.edit && <Button size="sm" icon="plus" onClick={() => setContact({ name: '', phone: '', email: '', role: '', is_primary: data.contacts.length === 0 })}>Add</Button>} pad={false}>{data.contacts.length === 0 ? <Empty title="No contacts" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{data.contacts.map((c: any) => <li key={c.id}><span style={{ flex: 1 }}><strong>{c.name}</strong> {c.is_primary ? <Pill tone="info">Primary</Pill> : null}<div className="small">{c.role} {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>} {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}</div></span></li>)}</ul>}</Card>
        </div>}
        {tab === 'documents' && <Card title="Documents" actions={data.can.edit && <Button size="sm" icon="plus" onClick={() => setDoc({ kind: meta.data?.required_docs[0] ?? '', attachment_id: null, filename: '', reference: '', expires_on: '', sensitive: true })}>Add document</Button>} pad={false}>
          {data.documents.length === 0 ? <Empty title="No documents yet" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>Document</th><th>File / reference</th><th>Expires</th><th>Checked</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{data.documents.map((d: any) => <tr key={d.id}><td data-label="Document"><strong>{d.kind}</strong>{d.sensitive ? <> <Pill tone="neutral" icon="lock">Restricted</Pill></> : null}</td><td data-label="File">{d.restricted ? <span className="muted">Finance/admin only</span> : d.attachment_id ? <a href={`/api/attachments/${d.attachment_id}/download`} target="_blank" rel="noreferrer">{d.filename}</a> : null} <span className="small muted">{d.reference}</span></td>
              <td data-label="Expires">{d.expires_on ? <Pill tone={d.expires_on < todayStr() ? 'bad' : 'neutral'}>{date(d.expires_on)}</Pill> : '—'}</td><td data-label="Checked">{d.verified_at ? <Pill tone="ok">{d.verified_name}</Pill> : <Pill tone="warn">Not checked</Pill>}</td>
              <td><div className="row end">{data.can.verify && !d.verified_at && <Button size="sm" onClick={() => act.run(() => post(`/vendor-documents/${d.id}/verify`), 'Marked as checked').then((r) => r && reload())}>Mark checked</Button>}{data.can.edit && <Button size="sm" variant="ghost" onClick={() => act.run(() => post(`/vendor-documents/${d.id}/archive`), 'Archived').then((r) => r && reload())}>Archive</Button>}</div></td></tr>)}</tbody></table></div>}
          <p className="card-pad small muted">"Checked" means a finance/admin person compared the document with the vendor record. It is an internal check, not a legal or tax compliance opinion.</p>
        </Card>}
        {tab === 'bank' && <Card title="Bank details" actions={data.can.sensitive && <Button size="sm" onClick={() => setBank(data.bank ? { account_name: data.bank.account_name, account_number: data.bank.account_number, ifsc: data.bank.ifsc, bank_name: data.bank.bank_name, upi_id: data.bank.upi_id ?? '' } : { account_name: v.legal_name, account_number: '', ifsc: '', bank_name: '', upi_id: '' })}>{data.bank ? 'Change' : 'Add'} bank details</Button>}>
          {data.bank?.restricted ? <div className="stack"><p><Icon name="lock" /> Bank details are visible only to finance and the founder.</p><p>On file: <strong>{data.bank.on_file ? 'Yes' : 'No'}</strong> · Verified: <strong>{data.bank.verified ? 'Yes' : 'No'}</strong>{data.bank.review_required && <> · <Pill tone="bad">Change awaiting verification</Pill></>}</p></div>
            : !data.bank ? <Empty title="No bank details on file" /> : <div className="stack"><dl className="kv"><dt>Account name</dt><dd>{data.bank.account_name}</dd><dt>Account number</dt><dd className="mono">{data.bank.account_number}</dd><dt>IFSC</dt><dd className="mono">{data.bank.ifsc}</dd><dt>Bank</dt><dd>{data.bank.bank_name}</dd><dt>UPI</dt><dd>{data.bank.upi_id ?? '—'}</dd><dt>Last changed</dt><dd>{data.bank.changed_name} · {dateTime(data.bank.changed_at)}</dd><dt>Verified</dt><dd>{data.bank.verified_at && !data.bank.review_required ? `${data.bank.verified_name} · ${dateTime(data.bank.verified_at)}` : <Pill tone="bad">Not verified</Pill>}</dd></dl>
              {data.can.verify && (data.bank.review_required || !data.bank.verified_at) ? <Button variant="primary" onClick={() => setVerifyOpen(true)}>Verify bank details</Button> : null}</div>}
        </Card>}
        {tab === 'history' && <div className="grid grid-2">
          <Card title="Log contact, sample, incident or note"><div className="stack">
            <Button onClick={() => setEv({ kind: 'contact', channel: 'phone', summary: '' })}>Log contact</Button>
            {can('vendors.write') && <Button onClick={() => setEv({ kind: 'sample', summary: '' })}>Record sample received</Button>}
            {can('vendors.write', 'quality.write') && <Button onClick={() => setEv({ kind: 'quality_incident', summary: '' })}>Record quality incident</Button>}
            {can('vendors.write') && <Button onClick={() => setEv({ kind: 'performance', summary: '' })}>Add performance note</Button>}
          </div><div className="divider" /><h3>Attachments</h3><div className="row" style={{ margin: '.5rem 0' }}>{data.can.edit && <FileButton entity="vendor" id={v.id} kind="photo" label="Upload (samples, photos)" sensitive={false} onDone={reload} />}</div><AttachmentList entity="vendor" id={v.id} reloadKey={data.events.length} /></Card>
          <Card title="History"><ul className="timeline">{data.events.map((e: any) => <li key={e.id}><span className={`dot ${['quality_incident', 'override', 'sensitive_change'].includes(e.kind) ? 'exception' : ''}`} aria-hidden="true" /><div><div><strong>{label(e.kind)}</strong>: {e.summary}</div><div className="meta">{e.by_name ?? 'System'} · {dateTime(e.at)}</div></div></li>)}</ul></Card>
        </div>}
        {tab === 'performance' && data.performance && <Performance p={data.performance} pos={data.purchase_orders} quotes={data.quotes} />}
      </TabPanel>

      {edit && <VendorForm open onClose={() => setEdit(false)} vendor={v} categories={meta.data?.categories ?? []} onSaved={reload} />}
      <Modal open={!!move} onClose={() => setMove(null)} title={`Move to “${label(move?.to)}”`} footer={<><Button onClick={() => setMove(null)}>Cancel</Button><Button variant={['suspended', 'rejected', 'inactive'].includes(move?.to) ? 'danger' : 'primary'} loading={act.pending} onClick={async () => done(await act.run(() => post(`/vendors/${v.id}/transition`, { to: move.to, reason: move.reason || undefined, expected_version: v.version }), 'Status updated'), () => setMove(null))}>Confirm</Button></>}>
        {move && <div className="stack">{act.error?.code === 'blocked' ? <MissingList title={act.error.message} items={act.error.missing} /> : <FormError error={act.error} />}{move.to === 'approved' && <p>Approving means this vendor may receive purchase orders. Your name and the time are recorded.</p>}<TextArea label={`Reason${move.reason_required ? '' : ' (optional)'}`} value={move.reason} onChange={(x) => setMove({ ...move, reason: x })} required={move.reason_required} error={fieldErr(act.error, 'reason')} /></div>}
      </Modal>
      <Modal open={!!doc} onClose={() => setDoc(null)} title="Add document" footer={<><Button onClick={() => setDoc(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => done(await act.run(() => post(`/vendors/${v.id}/documents`, { kind: doc.kind, attachment_id: doc.attachment_id, reference: doc.reference || null, expires_on: doc.expires_on || null, sensitive: doc.sensitive }), 'Document added'), () => setDoc(null))}>Save</Button></>}>
        {doc && <div className="stack"><FormError error={act.error} /><SelectField label="Type" value={doc.kind} onChange={(x) => setDoc({ ...doc, kind: x })} options={[...(meta.data?.required_docs ?? []), 'FSSAI licence', 'MSME certificate', 'Trade licence', 'Agreement', 'Other'].map((k: string) => ({ value: k, label: k }))} required error={fieldErr(act.error, 'kind')} />
          <div className="row"><FileButton entity="vendor" id={v.id} kind="vendor_document" label="Choose file" sensitive={doc.sensitive} onDone={(a) => setDoc({ ...doc, attachment_id: a.id, filename: a.filename })} /><span className="small">{doc.filename}</span></div>{fieldErr(act.error, 'attachment_id') && <div className="err">{fieldErr(act.error, 'attachment_id')}</div>}
          <div className="grid grid-2"><TextField label="Reference number" value={doc.reference} onChange={(x) => setDoc({ ...doc, reference: x })} /><TextField label="Expiry date (if any)" type="date" value={doc.expires_on} onChange={(x) => setDoc({ ...doc, expires_on: x })} hint="The owner is reminded before it expires" /></div>
          <label className="check"><input type="checkbox" checked={doc.sensitive} onChange={(e) => setDoc({ ...doc, sensitive: e.target.checked })} /> Restricted to finance and the founder</label></div>}
      </Modal>
      <Modal open={!!bank} onClose={() => setBank(null)} title="Bank details" footer={<><Button onClick={() => setBank(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => { const r = bankInput.safeParse(bank); if (!r.success) { act.setError(new ApiError(400, 'validation', 'Please fix the highlighted fields.', { fields: Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message])) })); return; } done(await act.run(() => put(`/vendors/${v.id}/bank`, bank), 'Bank details saved — verification required'), () => setBank(null)); }}>Save</Button></>}>
        {bank && <div className="stack"><div className="callout warn"><Icon name="alert" /><div>Any change is logged, flagged for review, and blocks vendor payments until someone else verifies it. Confirm changes by calling the vendor on a number you already trust — never one given in the change request.</div></div><FormError error={act.error} />
          <TextField label="Account name" value={bank.account_name} onChange={(x) => setBank({ ...bank, account_name: x })} required error={fieldErr(act.error, 'account_name')} /><div className="grid grid-2"><TextField label="Account number" value={bank.account_number} onChange={(x) => setBank({ ...bank, account_number: x })} required inputMode="numeric" error={fieldErr(act.error, 'account_number')} /><TextField label="IFSC" value={bank.ifsc} onChange={(x) => setBank({ ...bank, ifsc: x.toUpperCase() })} required error={fieldErr(act.error, 'ifsc')} /><TextField label="Bank" value={bank.bank_name} onChange={(x) => setBank({ ...bank, bank_name: x })} required error={fieldErr(act.error, 'bank_name')} /><TextField label="UPI ID" value={bank.upi_id} onChange={(x) => setBank({ ...bank, upi_id: x })} /></div></div>}
      </Modal>
      <Modal open={verifyOpen} onClose={() => setVerifyOpen(false)} title="Verify bank details" footer={<><Button onClick={() => setVerifyOpen(false)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => done(await act.run(() => post(`/vendors/${v.id}/bank/verify`, { method: verify }), 'Bank details verified'), () => setVerifyOpen(false))}>Verify</Button></>}>
        <div className="stack"><FormError error={act.error} /><TextArea label="How did you verify?" value={verify} onChange={setVerify} required error={fieldErr(act.error, 'method')} hint="e.g. Called the owner on the number from the GST certificate; matched the cancelled cheque" /></div>
      </Modal>
      <Modal open={!!contact} onClose={() => setContact(null)} title="Add contact" footer={<><Button onClick={() => setContact(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => done(await act.run(() => post(`/vendors/${v.id}/contacts`, contact), 'Contact added'), () => setContact(null))}>Save</Button></>}>
        {contact && <div className="stack"><FormError error={act.error} /><TextField label="Name" value={contact.name} onChange={(x) => setContact({ ...contact, name: x })} required error={fieldErr(act.error, 'name')} /><div className="grid grid-2"><TextField label="Phone" type="tel" value={contact.phone} onChange={(x) => setContact({ ...contact, phone: x })} /><TextField label="Email" type="email" value={contact.email} onChange={(x) => setContact({ ...contact, email: x })} error={fieldErr(act.error, 'email')} /></div><TextField label="Role" value={contact.role} onChange={(x) => setContact({ ...contact, role: x })} /></div>}
      </Modal>
      <Modal open={!!ev} onClose={() => setEv(null)} title={label(ev?.kind)} footer={<><Button onClick={() => setEv(null)}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={async () => done(await act.run(() => post(`/vendors/${v.id}/events`, ev), 'Saved'), () => setEv(null))}>Save</Button></>}>
        {ev && <div className="stack"><FormError error={act.error} />{ev.kind === 'contact' && <SelectField label="Channel" value={ev.channel} onChange={(x) => setEv({ ...ev, channel: x })} placeholder={null} options={['phone', 'email', 'whatsapp', 'meeting', 'visit'].map((c) => ({ value: c, label: label(c) }))} />}<TextArea label="Summary" value={ev.summary} onChange={(x) => setEv({ ...ev, summary: x })} required error={fieldErr(act.error, 'summary')} /></div>}
      </Modal>
      {msg && <Modal open onClose={() => setMsg(false)} title="Message the vendor"><MessageDraft party="vendor" entityType="vendor" entityId={v.id} defaultKey="vendor_info_request" onLogged={() => { setMsg(false); reload(); }} /></Modal>}
    </div>
  );
}

function Performance({ p, pos, quotes }: { p: any; pos: any[]; quotes: any[] }) {
  return (
    <div className="stack-lg">
      {!p.enough_data && <div className="callout info"><Icon name="info" /><div>Only {p.completed_pos} completed purchase order(s). Rates are shown after {p.min_orders_for_score}, so a small sample does not produce a misleading score.</div></div>}
      <div className="grid grid-4">
        <div className="card kpi"><span className="v">{p.on_time_rate_pct == null ? '—' : `${p.on_time_rate_pct}%`}</span><span className="l">On time ({p.on_time_pos} of {p.completed_pos} completed)</span></div>
        <div className="card kpi"><span className="v">{p.rejection_rate_pct == null ? '—' : `${p.rejection_rate_pct}%`}</span><span className="l">Rejected at quality check ({p.units_rejected} of {p.units_received} units)</span></div>
        <div className="card kpi"><span className="v">{p.quality_incidents}</span><span className="l">Quality incidents</span></div>
        <div className="card kpi"><span className="v">{p.delay_notices}</span><span className="l">Delay notices · {p.open_overdue_pos} open PO(s) overdue</span></div>
      </div>
      <p className="small muted">{p.method} Purchase value: {money(p.purchase_value_paise)} across {p.purchase_orders} PO(s).{p.avg_days_late != null && ` Late POs averaged ${p.avg_days_late} days late.`}</p>
      <div className="grid grid-2">
        <Card title="Purchase history" pad={false}>{pos.length === 0 ? <Empty title="No purchase orders" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{pos.map((x) => <li key={x.id}><span style={{ flex: 1 }}><Link to={`/procurement/purchase-orders/${x.id}`}>{x.number}</Link>{x.order_number && ` · ${x.order_number}`}<div className="small muted">Promised {date(x.promised_date)}</div></span><Status kind="po" value={x.status} /></li>)}</ul>}</Card>
        <Card title="Quotes given" pad={false}>{quotes.length === 0 ? <Empty title="No quotes" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{quotes.map((q) => <li key={q.id}><span style={{ flex: 1 }}><Link to={`/procurement/rfqs/${q.rfq_id}`}>{q.rfq_title}</Link><div className="small muted">{q.status === 'received' ? `${money(q.unit_price_paise)}/unit · ${q.lead_time_days} days` : label(q.status)}</div></span></li>)}</ul>}</Card>
      </div>
    </div>
  );
}
