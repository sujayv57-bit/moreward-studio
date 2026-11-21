import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { issueInput } from '../../shared/schemas.ts';
import { ApiError, patch, post } from '../api.ts';
import { date, dateTime, label, todayStr } from '../format.ts';
import { useAction, useApi, useAuth, useToast } from '../state.tsx';
import { Button, Empty, fieldErr, FormError, Icon, Loading, Modal, NumberField, Pill, SelectField, Status, TextArea, TextField, UserSelect } from '../ui.tsx';

// ---------------------------------------------------------------- files
export function AttachmentList({ entity, id, reloadKey }: { entity: string; id: number; reloadKey?: unknown }) {
  const { data, loading, error, reload } = useApi<any>(`/attachments?entity_type=${entity}&entity_id=${id}`);
  const { can, me } = useAuth(); const act = useAction();
  useEffect(() => { reload(); }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading && !data) return <Loading />;
  if (error) return <p className="muted">{error.message}</p>;
  if (!data.rows.length) return <p className="muted">No files yet.</p>;
  return (
    <ul className="checklist">
      {data.rows.map((a: any) => (
        <li key={a.id}>
          <Icon name={a.restricted ? 'lock' : 'file'} />
          <span style={{ flex: 1 }}>{a.restricted ? <span>{a.filename} <Pill tone="neutral" icon="lock">Restricted</Pill></span> : <a href={`/api/attachments/${a.id}/download`} target="_blank" rel="noreferrer">{a.filename}</a>}
            <div className="small muted">{label(a.kind)} · {Math.max(1, Math.round(a.size / 1024))} KB · {a.uploaded_name} · {dateTime(a.uploaded_at)}{a.sensitive ? ' · sensitive' : ''}</div></span>
          {(a.uploaded_by === me!.user.id || can('*')) && <Button size="sm" variant="ghost" onClick={() => act.run(() => post(`/attachments/${a.id}/archive`), 'File removed from view (kept for audit)').then(reload)} aria-label={`Remove ${a.filename}`}>Remove</Button>}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- message drafts (no provider configured → copy + log manually)
export function MessageDraft({ party, entityType, entityId, defaultKey, onLogged }: { party: 'customer' | 'vendor'; entityType: string; entityId: number; defaultKey?: string; onLogged?: () => void }) {
  const tpls = useApi<any>('/message-templates');
  const [tplId, setTplId] = useState<number | null>(null);
  const [subject, setSubject] = useState(''); const [body, setBody] = useState(''); const [channel, setChannel] = useState('email');
  const [rendered, setRendered] = useState(false);
  const act = useAction(); const toast = useToast();
  const options = (tpls.data?.rows ?? []).filter((t: any) => t.party === party);
  useEffect(() => { if (!tplId && options.length) setTplId((options.find((t: any) => t.key === defaultKey) ?? options[0]).id); }, [options.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tplId) return;
    post<any>('/message-templates/render', { template_id: tplId, entity_type: entityType, entity_id: entityId }).then((r) => { setSubject(r.subject); setBody(r.body); setChannel(r.channel); setRendered(true); }).catch((e) => toast(e.message, 'bad'));
  }, [tplId, entityType, entityId, toast]);
  const logIt = async () => {
    const r = await act.run(() => post('/contact-log', { party, entity_type: entityType === 'opportunity' ? 'opportunity' : entityType, entity_id: entityId, channel, summary: `${subject ? subject + ': ' : ''}${body.slice(0, 400)}` }), 'Logged as contacted');
    if (r) onLogged?.();
  };
  if (tpls.loading && !tpls.data) return <Loading />;
  return (
    <div className="stack">
      <div className="callout info"><Icon name="info" /><div><strong>{channel === 'email' ? 'Email' : 'WhatsApp'} sending is not configured.</strong> Edit the draft, copy it into your own {channel === 'email' ? 'email' : 'WhatsApp'}, send it yourself, then log that you contacted them. Nothing is sent from here.</div></div>
      <SelectField label="Template" value={tplId ?? ''} onChange={(v) => setTplId(Number(v))} options={options.map((t: any) => ({ value: t.id, label: `${t.name} (${t.channel})` }))} placeholder={null} />
      {channel === 'email' && <TextField label="Subject" value={subject} onChange={setSubject} />}
      <TextArea label="Message" value={body} onChange={setBody} rows={8} />
      <div className="row end">
        <Button onClick={() => { navigator.clipboard?.writeText((subject ? subject + '\n\n' : '') + body).then(() => toast('Copied to clipboard')).catch(() => toast('Copy failed — select the text and copy it manually', 'bad')); }} disabled={!rendered}>Copy text</Button>
        <Button variant="primary" loading={act.pending} onClick={logIt} disabled={!rendered}>I sent it — log as contacted</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- goods receipt
export function ReceiveModal({ po, lines, open, onClose, onDone }: { po: { id: number; number: string }; lines: any[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState<Record<number, number | null>>({}); const [disc, setDisc] = useState<Record<number, string>>({});
  const [day, setDay] = useState(todayStr()); const [notes, setNotes] = useState(''); const act = useAction();
  const save = async () => {
    const r = await act.run(() => post(`/purchase-orders/${po.id}/receipts`, { received_on: day, notes, lines: lines.map((l) => ({ po_line_id: l.id, qty_received: q[l.id] ?? 0, discrepancy: disc[l.id] || null })) }), 'Goods receipt recorded');
    if (r) { setQ({}); setDisc({}); setNotes(''); onClose(); onDone(); }
  };
  return (
    <Modal open={open} onClose={onClose} wide title={`Receive goods — ${po.number}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={save}>Record receipt</Button></>}>
      <div className="stack"><FormError error={act.error} />
        <TextField label="Date received" type="date" value={day} onChange={setDay} max={todayStr()} required />
        <div className="table-wrap"><table className="table responsive"><thead><tr><th>Item</th><th className="num">Outstanding</th><th>Received now</th><th>Discrepancy / damage note</th></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.id}><td data-label="Item">{l.description}</td><td data-label="Outstanding" className="num">{l.outstanding}</td>
              <td data-label="Received"><input className="input" style={{ maxWidth: 120 }} type="number" min={0} max={l.outstanding} inputMode="numeric" aria-label={`Quantity received for ${l.description}`} value={q[l.id] ?? ''} onChange={(e) => setQ({ ...q, [l.id]: e.target.value === '' ? null : Number(e.target.value) })} /> <Button size="sm" variant="ghost" onClick={() => setQ({ ...q, [l.id]: l.outstanding })}>All</Button></td>
              <td data-label="Note"><input className="input" aria-label={`Discrepancy note for ${l.description}`} value={disc[l.id] ?? ''} onChange={(e) => setDisc({ ...disc, [l.id]: e.target.value })} placeholder="Short, damaged, wrong item…" /></td></tr>
          ))}</tbody></table></div>
        <TextArea label="Receiving notes" value={notes} onChange={setNotes} rows={2} hint="Upload photos of damage on the PO's files after saving." />
        <p className="small muted">Received goods wait for a quality check before they count as available for packing.</p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- quality check
export function QcModal({ line, open, onClose, onDone }: { line: any | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ qty_accepted: null, qty_rejected: 0, reason: '', action: '' });
  const act = useAction();
  useEffect(() => { if (line) setF({ qty_accepted: line.awaiting_qc, qty_rejected: 0, reason: '', action: '' }); }, [line]);
  if (!line) return null;
  const save = async () => {
    const r = await act.run(() => post<any>(`/po-lines/${line.id}/quality`, { qty_accepted: f.qty_accepted ?? 0, qty_rejected: f.qty_rejected ?? 0, reason: f.reason || null, action: f.action || null }), 'Quality check recorded');
    if (r) { onClose(); onDone(); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Quality check — ${line.description}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={save}>Save check</Button></>}>
      <div className="stack"><FormError error={act.error} />
        <p>{line.awaiting_qc} unit(s) waiting for a check.</p>
        <div className="grid grid-2"><NumberField label="Accepted" value={f.qty_accepted} onChange={(v) => setF({ ...f, qty_accepted: v })} error={fieldErr(act.error, 'qty_accepted')} min={0} /><NumberField label="Rejected" value={f.qty_rejected} onChange={(v) => setF({ ...f, qty_rejected: v })} min={0} /></div>
        {(f.qty_rejected ?? 0) > 0 && <>
          <TextArea label="What is wrong?" value={f.reason} onChange={(v) => setF({ ...f, reason: v })} required error={fieldErr(act.error, 'reason')} />
          <SelectField label="What happens to rejected goods?" value={f.action} onChange={(v) => setF({ ...f, action: v })} required error={fieldErr(act.error, 'action')} options={[{ value: 'replace', label: 'Vendor replaces them (still owed)' }, { value: 'return', label: 'Return, no replacement' }, { value: 'credit', label: 'Vendor credit, no replacement' }, { value: 'accept_with_concession', label: 'Use with concession (recorded)' }]} />
          <div className="callout warn"><Icon name="alert" /><div>Rejections open a high-priority issue for the procurement owner and alert sales and packing. Packing stays blocked until the shortfall is resolved.</div></div>
        </>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- issues
export function IssueModal({ open, onClose, onDone, orderId, issue }: { open: boolean; onClose: () => void; onDone: () => void; orderId?: number; issue?: any }) {
  const { me } = useAuth();
  const [f, setF] = useState<any>(issue ?? { kind: 'shortage', title: '', detail: '', priority: 'medium', owner_id: me!.user.id, due_date: todayStr(), status: 'open', resolution: '' });
  const act = useAction();
  useEffect(() => { if (open) setF(issue ? { ...issue, resolution: issue.resolution ?? '' } : { kind: 'shortage', title: '', detail: '', priority: 'medium', owner_id: me!.user.id, due_date: todayStr(), status: 'open', resolution: '' }); }, [open, issue, me]);
  const save = async () => {
    if (!issue) {
      const body = { ...f, order_id: orderId ?? null };
      const v = issueInput.safeParse(body);
      if (!v.success) { act.setError(new ApiError(400, 'validation', 'Please fix the highlighted fields.', { fields: Object.fromEntries(v.error.issues.map((i) => [i.path.join('.'), i.message])) })); return; }
      const r = await act.run(() => post('/issues', body), 'Issue raised'); if (r) { onClose(); onDone(); }
    } else {
      const r = await act.run(() => patch(`/issues/${issue.id}`, { status: f.status, owner_id: f.owner_id, priority: f.priority, due_date: f.due_date || null, resolution: f.resolution || undefined }), 'Issue updated'); if (r) { onClose(); onDone(); }
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={issue ? `Issue #${issue.id}` : 'Raise an issue'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={save}>{issue ? 'Save' : 'Raise issue'}</Button></>}>
      <div className="stack"><FormError error={act.error} />
        {!issue && <div className="grid grid-2">
          <SelectField label="Type" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} placeholder={null} options={['shortage', 'damage', 'quality', 'failed_delivery', 'replacement', 'return', 'other'].map((k) => ({ value: k, label: label(k) }))} />
          <TextField label="Title" value={f.title} onChange={(v) => setF({ ...f, title: v })} required error={fieldErr(act.error, 'title')} />
        </div>}
        {issue && <p><strong>{issue.title}</strong><br /><span className="small muted">{issue.detail}</span></p>}
        {!issue && <TextArea label="Details" value={f.detail} onChange={(v) => setF({ ...f, detail: v })} />}
        <div className="grid grid-3">
          <SelectField label="Priority" value={f.priority} onChange={(v) => setF({ ...f, priority: v })} placeholder={null} options={['low', 'medium', 'high', 'urgent'].map((k) => ({ value: k, label: label(k) }))} />
          <UserSelect label="Owner" value={f.owner_id} onChange={(v) => setF({ ...f, owner_id: v })} required error={fieldErr(act.error, 'owner_id')} />
          <TextField label="Due" type="date" value={f.due_date ?? ''} onChange={(v) => setF({ ...f, due_date: v })} />
        </div>
        {issue && <><SelectField label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder={null} options={['open', 'in_progress', 'resolved'].map((k) => ({ value: k, label: label(k) }))} />
          {f.status === 'resolved' && <TextArea label="Resolution" value={f.resolution} onChange={(v) => setF({ ...f, resolution: v })} required error={fieldErr(act.error, 'resolution')} />}</>}
      </div>
    </Modal>
  );
}
export function IssueTable({ rows, onOpen }: { rows: any[]; onOpen: (i: any) => void }) {
  if (!rows.length) return <Empty title="No issues" />;
  return (
    <div className="table-wrap"><table className="table responsive"><thead><tr><th>Issue</th><th>Order</th><th>Priority</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
      <tbody>{rows.map((i) => (
        <tr key={i.id}><td data-label="Issue"><button className="btn ghost sm" style={{ padding: 0, fontWeight: 600, textAlign: 'left', whiteSpace: 'normal' }} onClick={() => onOpen(i)}>{i.title}</button><div className="small muted">{label(i.kind)}{i.vendor ? ` · ${i.vendor}` : ''}{i.resolution ? ` · ${i.resolution}` : ''}</div></td>
          <td data-label="Order">{i.order_id ? <Link to={`/orders/${i.order_id}?tab=issues`}>{i.order_number}</Link> : '—'}</td>
          <td data-label="Priority"><Status kind="priority" value={i.priority} /></td><td data-label="Owner">{i.owner_name}</td>
          <td data-label="Due">{i.due_date ? <Pill tone={i.overdue ? 'bad' : 'neutral'} icon="clock">{date(i.due_date)}</Pill> : '—'}</td><td data-label="Status"><Status kind="issue" value={i.status} /></td></tr>
      ))}</tbody></table></div>
  );
}

// ---------------------------------------------------------------- component reconciliation
export function ComponentTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <Empty title="No bill of materials yet">Add components to each box on the Contents tab.</Empty>;
  return (
    <div className="table-wrap"><table className="table responsive">
      <thead><tr><th>Component</th><th>Box</th><th className="num">Required</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Accepted</th><th className="num">Rejected</th><th className="num">Still needed</th><th>Next arrival</th><th>Status</th></tr></thead>
      <tbody>{rows.map((c) => (
        <tr key={c.id}><td data-label="Component"><strong>{c.component_name}</strong>{c.is_critical ? <> <Pill tone="warn">Critical</Pill></> : null}<div className="small muted">{c.qty_per_box} per box{c.spec ? ` · ${c.spec}` : ''}</div></td>
          <td data-label="Box">{c.variant_name}</td><td data-label="Required" className="num">{c.required}</td><td data-label="Ordered" className="num">{c.ordered}{c.planned ? <div className="small muted">+{c.planned} draft</div> : null}</td>
          <td data-label="Received" className="num">{c.received}</td><td data-label="Accepted" className="num">{c.accepted}</td><td data-label="Rejected" className="num">{c.rejected || '—'}</td>
          <td data-label="Still needed" className="num"><strong>{c.still_needed}</strong>{c.uncovered > 0 && <div className="small" style={{ color: 'var(--bad-fg)' }}>{c.uncovered} not on any PO</div>}</td>
          <td data-label="Next arrival">{c.next_arrival ? date(c.next_arrival) : '—'}</td><td data-label="Status"><Status kind="component" value={c.state} /></td></tr>
      ))}</tbody>
    </table></div>
  );
}
