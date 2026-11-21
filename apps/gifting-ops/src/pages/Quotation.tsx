import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { convertInput, quoteVersionInput } from '../../shared/schemas.ts';
import { quoteTotals } from '../../shared/money.ts';
import { ApiError, post, put } from '../api.ts';
import { addDays, date, dateTime, money, pct, todayStr } from '../format.ts';
import { useAction, useApi, useAuth } from '../state.tsx';
import { Button, Card, Empty, ErrorState, fieldErr, FileButton, FormError, Icon, Loading, MissingList, Modal, MoneyField, NumberField, PageHeader, Pill, SelectField, Status, TextArea, TextField, UserSelect } from '../ui.tsx';
import { MessageDraft } from './shared.tsx';

const zerr = (schema: { safeParse: (v: unknown) => any }, v: unknown) => { const r = schema.safeParse(v); if (r.success) return null; const f: Record<string, string> = {}; for (const i of r.error.issues) f[i.path.join('.')] ??= i.message; return new ApiError(400, 'validation', 'Please fix the highlighted fields.', { fields: f }); };

/** Create a quotation, edit a draft in place, or create a revision (with a change note). */
export function QuoteEditor({ open, onClose, url, method = 'POST', initial, onSaved, revision, expectedVersion }: { open: boolean; onClose: () => void; url: string; method?: 'POST' | 'PUT'; initial?: any; onSaved: (r: any) => void; revision?: boolean; expectedVersion?: number }) {
  const settings = useApi<any>('/settings');
  const defTax = settings.data?.values['tax.default_bp'] ?? 1800;
  const [f, setF] = useState<any>(() => ({ lines: [{ description: '', qty: 1, unit_price_paise: 0, customisation: '', category: '' }], shipping_paise: 0, tax_bp: initial?.tax_bp ?? null, tax_name: '', validity_date: addDays(todayStr(), 15), delivery_date: '', notes: '', change_note: '', ...initial }));
  const act = useAction();
  const taxBp = f.tax_bp ?? defTax;
  const t = quoteTotals(f.lines.map((l: any) => ({ qty: Number(l.qty) || 0, unit_price_paise: l.unit_price_paise || 0, unit_cost_paise: l.unit_cost_paise || 0 })), f.shipping_paise || 0, taxBp);
  const setLine = (i: number, k: string, v: any) => setF({ ...f, lines: f.lines.map((l: any, j: number) => (j === i ? { ...l, [k]: v } : l)) });
  const save = async () => {
    const rates = settings.data?.values['tax.rates'] ?? [];
    const body = { ...f, tax_bp: taxBp, tax_name: rates.find((r: any) => r.bp === taxBp)?.name ?? null, lines: f.lines.map((l: any) => ({ description: l.description, qty: Number(l.qty), unit_price_paise: l.unit_price_paise ?? 0, customisation: l.customisation || null, category: l.category || null })), ...(expectedVersion ? { expected_version: expectedVersion } : {}) };
    const v = zerr(revision ? quoteVersionInput.refine((x) => !!x.change_note, { message: 'Say what changed and why', path: ['change_note'] }) : quoteVersionInput, body);
    if (v) { act.setError(v); return; }
    const r = await act.run(() => (method === 'PUT' ? put(url, body) : post(url, body)), revision ? 'New version created' : 'Quotation saved');
    if (r) { onSaved(r); onClose(); }
  };
  const e = (k: string) => fieldErr(act.error, k);
  return (
    <Modal open={open} onClose={onClose} wide title={revision ? 'Revise quotation (new version)' : method === 'PUT' ? 'Edit draft' : 'New quotation'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={save}>{revision ? 'Create new version' : 'Save quotation'}</Button></>}>
      <div className="stack">
        <FormError error={act.error} />
        {revision && <TextArea label="What changed and why" value={f.change_note} onChange={(v) => setF({ ...f, change_note: v })} required error={e('change_note')} rows={2} />}
        <fieldset><legend>Line items</legend>
          <div className="stack">
            {f.lines.map((l: any, i: number) => (
              <div key={i} className="grid" style={{ gridTemplateColumns: 'minmax(0,2.2fr) minmax(0,.7fr) minmax(0,1fr) minmax(0,1.6fr) auto', alignItems: 'end' }}>
                <TextField label={`Item ${i + 1}`} value={l.description} onChange={(v) => setLine(i, 'description', v)} required error={e(`lines.${i}.description`)} placeholder="e.g. Premium Diwali box" />
                <NumberField label="Qty" value={l.qty} onChange={(v) => setLine(i, 'qty', v)} error={e(`lines.${i}.qty`)} min={1} />
                <MoneyField label="Unit price" value={l.unit_price_paise} onChange={(v) => setLine(i, 'unit_price_paise', v ?? 0)} error={e(`lines.${i}.unit_price_paise`)} />
                <TextField label="Customisation" value={l.customisation} onChange={(v) => setLine(i, 'customisation', v)} placeholder="Logo, engraving…" />
                <Button variant="ghost" icon="x" aria-label={`Remove item ${i + 1}`} disabled={f.lines.length === 1} onClick={() => setF({ ...f, lines: f.lines.filter((_: any, j: number) => j !== i) })} />
              </div>
            ))}
            <div><Button size="sm" icon="plus" onClick={() => setF({ ...f, lines: [...f.lines, { description: '', qty: 1, unit_price_paise: 0, customisation: '' }] })}>Add line</Button></div>
          </div>
        </fieldset>
        <div className="grid grid-4">
          <MoneyField label="Shipping charged" value={f.shipping_paise} onChange={(v) => setF({ ...f, shipping_paise: v ?? 0 })} />
          <SelectField label="Tax" value={taxBp} placeholder={null} onChange={(v) => setF({ ...f, tax_bp: Number(v) })} options={(settings.data?.values['tax.rates'] ?? [{ name: 'GST 18%', bp: 1800 }]).map((r: any) => ({ value: r.bp, label: r.name }))} hint="Rates are configured in Settings" />
          <TextField label="Valid until" type="date" value={f.validity_date} onChange={(v) => setF({ ...f, validity_date: v })} required error={e('validity_date')} />
          <TextField label="Delivery date offered" type="date" value={f.delivery_date} onChange={(v) => setF({ ...f, delivery_date: v })} required error={e('delivery_date')} />
        </div>
        <TextArea label="Notes on the quotation" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} rows={2} />
        <div className="callout info" aria-live="polite"><Icon name="info" /><div>Subtotal {money(t.subtotal_paise)} · shipping {money(f.shipping_paise || 0)} · tax {money(t.tax_paise)} · <strong>total {money(t.total_paise)}</strong>. Margin is calculated once procurement adds costs.</div></div>
      </div>
    </Modal>
  );
}

export default function Quotation() {
  const { id } = useParams(); const { can, me } = useAuth(); const nav = useNavigate();
  const { data, error, loading, reload } = useApi<any>(`/quotations/${id}`);
  const act = useAction();
  const [dialog, setDialog] = useState<'' | 'edit' | 'revise' | 'costs' | 'send' | 'approve' | 'decline' | 'convert' | 'message'>('');
  const [override, setOverride] = useState(''); const [costs, setCosts] = useState<Record<number, number | null>>({});
  const [appr, setAppr] = useState<any>({ version: '', approver_name: '', approved_on: todayStr(), reference: '', attachment_id: null, filename: '' });
  const [decline, setDecline] = useState('');
  const [conv, setConv] = useState<any>({ procurement_owner_id: null, due_date: '', customer_po_ref: '', destinations: [{ label: '', address: '', city: '', pincode: '', contact_name: '', phone: '' }] });
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const q = data.quotation; const cur = data.versions[0]; const showCost = can('costing.view');
  const close = () => { setDialog(''); act.setError(null); };
  const doRun = async (fn: () => Promise<any>, msg: string) => { const r = await act.run(fn, msg); if (r) { close(); reload(); } return r; };
  const sentVersions = data.versions.filter((v: any) => v.sent_at);
  const editable = q.status === 'draft' && !cur.sent_at && !data.approvals.some((a: any) => a.detail?.includes(`v${cur.version}`));
  return (
    <div className="stack-lg">
      <PageHeader crumbs={[{ to: '/sales/opportunities', label: 'Opportunities' }, { to: `/sales/opportunities/${data.opportunity.id}`, label: data.opportunity.title }]}
        title={<>{q.number} <span className="muted">v{q.current_version}</span></>} sub={<>{data.opportunity.company_name} · <Status kind="quote" value={q.status} /></>}
        actions={<>
          <Button icon="file" onClick={() => window.print()}>Print / PDF</Button>
          {can('sales.write') && <Button onClick={() => setDialog('message')}>Draft follow-up</Button>}
          {can('feasibility.write', 'quotes.approve') && ['draft', 'pending_approval'].includes(q.status) && <Button onClick={() => { setCosts(Object.fromEntries(cur.lines.map((l: any) => [l.id, l.unit_cost_paise || null]))); setDialog('costs'); }}>Supply costs</Button>}
          {can('sales.write') && editable && <Button onClick={() => setDialog('edit')}>Edit draft</Button>}
          {can('sales.write') && !['customer_approved', 'expired'].includes(q.status) && <Button onClick={() => setDialog('revise')}>Revise</Button>}
          {can('sales.write') && q.status === 'draft' && <Button variant="primary" loading={act.pending} onClick={() => act.run(() => post(`/quotations/${id}/submit`), 'Submitted').then((r: any) => r && reload())}>Submit for approval</Button>}
          {can('sales.write') && q.status === 'approved' && <Button variant="primary" onClick={() => setDialog('send')}>Record as sent</Button>}
          {can('sales.write') && q.status === 'sent' && <><Button onClick={() => setDialog('decline')}>Customer declined</Button><Button variant="emphasis" onClick={() => { setAppr({ ...appr, version: sentVersions[0]?.version ?? '' }); setDialog('approve'); }}>Record customer approval</Button></>}
          {can('sales.write') && q.status === 'customer_approved' && data.opportunity.stage !== 'won' && <Button variant="emphasis" onClick={() => { setConv({ ...conv, due_date: cur.delivery_date }); setDialog('convert'); }}>Convert to order</Button>}
        </>} />
      {act.error?.code === 'blocked' && !dialog && <MissingList title={act.error.message} items={act.error.missing} />}
      {q.status === 'pending_approval' && <div className="callout warn"><Icon name="clock" /><div>Waiting for margin approval. {data.approvals.find((a: any) => a.status === 'pending')?.detail}</div></div>}
      {['approved', 'draft', 'pending_approval'].includes(q.status) && (data.commitment.ok
        ? <div className="callout ok"><Icon name="check" /><div>Feasibility supports this quantity and delivery date.{data.commitment.warning && <> <strong>Note:</strong> {data.commitment.warning}</>}</div></div>
        : <MissingList title="A firm commitment is not yet supported by procurement" items={data.commitment.missing} />)}
      {data.opportunity.stage === 'won' && <div className="callout ok"><Icon name="check" /><div>Converted to an order. <Link to={`/sales/opportunities/${data.opportunity.id}`}>See opportunity</Link></div></div>}
      <div className="print-only"><h2>Quotation {q.number} (version {cur.version})</h2><p>{data.opportunity.company_name} · {data.opportunity.title} · {date(cur.created_at)}</p></div>
      <VersionCard v={cur} showCost={showCost} current policy={data.policy} />
      <Card title="Earlier versions" pad={data.versions.length <= 1}>
        {data.versions.length <= 1 ? <p className="muted">This is the first version.</p> : data.versions.slice(1).map((v: any) => <details key={v.id} style={{ borderTop: '1px solid var(--border)', padding: '.5rem 1.15rem' }}><summary>Version {v.version} · {money(v.total_paise)} · {dateTime(v.created_at)}{v.sent_at && ' · sent'}</summary><VersionCard v={v} showCost={showCost} policy={data.policy} /></details>)}
      </Card>
      <div className="grid grid-2">
        <Card title="Internal approvals">{data.approvals.length === 0 ? <p className="muted">None needed so far.</p> : <ul className="timeline">{data.approvals.map((a: any) => <li key={a.id}><span className="dot" aria-hidden="true" /><div><Status kind="approval" value={a.status} /> {a.title}<div className="meta">{a.requested_name} · {dateTime(a.requested_at)}{a.decided_name && ` · decided by ${a.decided_name}`}{a.decision_note && ` — ${a.decision_note}`}</div></div></li>)}</ul>}</Card>
        <Card title="Customer approval">{data.customer_approvals.length === 0 ? <p className="muted">Not yet approved by the customer.</p> : data.customer_approvals.map((c: any) => <dl key={c.id} className="kv"><dt>Version approved</dt><dd><strong>v{c.version}</strong></dd><dt>Approved by</dt><dd>{c.approver_name}</dd><dt>Date</dt><dd>{date(c.approved_on)}</dd><dt>Reference</dt><dd>{c.reference ?? (c.attachment_id ? <a href={`/api/attachments/${c.attachment_id}/download`}>Attached file</a> : '—')}</dd><dt>Recorded by</dt><dd>{c.recorded_name}</dd></dl>)}</Card>
      </div>

      {(dialog === 'edit' || dialog === 'revise') && <QuoteEditor open onClose={close} url={dialog === 'edit' ? `/quotations/${id}/draft` : `/quotations/${id}/revise`} method={dialog === 'edit' ? 'PUT' : 'POST'} revision={dialog === 'revise'} expectedVersion={q.current_version}
        initial={{ lines: cur.lines.map((l: any) => ({ description: l.description, qty: l.qty, unit_price_paise: l.unit_price_paise, unit_cost_paise: l.unit_cost_paise, customisation: l.customisation ?? '' })), shipping_paise: cur.shipping_paise, tax_bp: cur.tax_bp, validity_date: cur.validity_date, delivery_date: cur.delivery_date, notes: cur.notes ?? '', change_note: '' }} onSaved={reload} />}
      <Modal open={dialog === 'costs'} onClose={close} title="Supply costs (procurement)" footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={() => doRun(() => put(`/quotations/${id}/costs`, { lines: Object.entries(costs).map(([k, v]) => ({ id: Number(k), unit_cost_paise: v ?? 0 })) }), 'Costs saved')}>Save costs</Button></>}>
        <div className="stack"><FormError error={act.error} /><p className="small muted">Enter the expected landed cost per unit (components, packaging, customisation and inbound shipping). Margin and the approval check use these numbers.</p>
          {cur.lines.map((l: any) => <MoneyField key={l.id} label={`${l.description} (× ${l.qty}, selling ${money(l.unit_price_paise)})`} value={costs[l.id]} onChange={(v) => setCosts({ ...costs, [l.id]: v })} />)}</div>
      </Modal>
      <Modal open={dialog === 'send'} onClose={close} title="Record quotation as sent" footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={act.pending} disabled={!data.commitment.ok && (!can('feasibility.override') || override.trim().length < 10)} onClick={() => doRun(() => post(`/quotations/${id}/send`, override ? { override_reason: override } : {}), 'Recorded as sent')}>Record as sent</Button></>}>
        <div className="stack">
          <p>This records that version {cur.version} ({money(cur.total_paise)}, delivery {date(cur.delivery_date)}) was shared with the customer — a firm commitment. Share the PDF yourself; this system does not send email.</p>
          {!data.commitment.ok && <>
            <MissingList title="Not supported by a feasibility check" items={data.commitment.missing} />
            {can('feasibility.override') ? <TextArea label="Override reason (recorded with your name, at least 10 characters)" value={override} onChange={setOverride} required error={fieldErr(act.error, 'override_reason')} /> : <p className="small"><Icon name="lock" size={14} /> Only a sales manager or the founder can override. Ask procurement to re-check, or change the date or quantity.</p>}
          </>}
          <FormError error={act.error} />
        </div>
      </Modal>
      <Modal open={dialog === 'approve'} onClose={close} title="Record customer approval" footer={<><Button onClick={close}>Cancel</Button><Button variant="emphasis" loading={act.pending} onClick={() => doRun(() => post(`/quotations/${id}/customer-approval`, { version: Number(appr.version), approver_name: appr.approver_name, approved_on: appr.approved_on, reference: appr.reference || null, attachment_id: appr.attachment_id }), 'Customer approval recorded')}>Save approval</Button></>}>
        <div className="stack"><FormError error={act.error} />
          <SelectField label="Exact version the customer approved" value={appr.version} onChange={(v) => setAppr({ ...appr, version: v })} options={sentVersions.map((v: any) => ({ value: v.version, label: `v${v.version} — ${money(v.total_paise)}, sent ${date(v.sent_at)}` }))} required />
          <div className="grid grid-2"><TextField label="Approved by (name, role)" value={appr.approver_name} onChange={(v) => setAppr({ ...appr, approver_name: v })} required error={fieldErr(act.error, 'approver_name')} /><TextField label="Approval date" type="date" value={appr.approved_on} onChange={(v) => setAppr({ ...appr, approved_on: v })} required /></div>
          <TextField label="Reference" value={appr.reference} onChange={(v) => setAppr({ ...appr, reference: v })} hint="Email subject, customer PO number, WhatsApp message date…" error={fieldErr(act.error, 'reference')} />
          <div className="row"><FileButton entity="quotation" id={Number(id)} kind="customer_approval" label="Attach approval / PO" onDone={(a) => setAppr({ ...appr, attachment_id: a.id, filename: a.filename })} />{appr.filename && <span className="small">{appr.filename}</span>}</div>
        </div>
      </Modal>
      <Modal open={dialog === 'decline'} onClose={close} title="Customer declined" footer={<><Button onClick={close}>Cancel</Button><Button variant="danger" loading={act.pending} onClick={() => doRun(() => post(`/quotations/${id}/customer-rejected`, { reason: decline }), 'Recorded')}>Record</Button></>}>
        <div className="stack"><FormError error={act.error} /><TextArea label="What did the customer say?" value={decline} onChange={setDecline} required error={fieldErr(act.error, 'reason')} /><p className="small muted">The opportunity returns to the quotation stage so you can revise.</p></div>
      </Modal>
      <Modal open={dialog === 'convert'} onClose={close} wide title="Convert to a confirmed order" footer={<><Button onClick={close}>Cancel</Button><Button variant="emphasis" loading={act.pending} onClick={async () => { const v = zerr(convertInput, conv); if (v) { act.setError(v); return; } const r = await act.run(() => post<any>(`/quotations/${id}/convert`, conv), 'Order created and handed to procurement'); if (r) nav(`/orders/${r.id}`); }}>Create order</Button></>}>
        <div className="stack"><FormError error={act.error} />
          <p className="small muted">The order is built from the customer-approved version. The procurement owner is notified and gets a handoff task. Every order needs a named procurement owner and at least one delivery address.</p>
          <div className="grid grid-3">
            <UserSelect label="Procurement owner" value={conv.procurement_owner_id} onChange={(v) => setConv({ ...conv, procurement_owner_id: v })} roles={['procurement_manager', 'procurement_exec']} required error={fieldErr(act.error, 'procurement_owner_id')} />
            <TextField label="Customer due date" type="date" value={conv.due_date} onChange={(v) => setConv({ ...conv, due_date: v })} required error={fieldErr(act.error, 'due_date')} />
            <TextField label="Customer PO number" value={conv.customer_po_ref} onChange={(v) => setConv({ ...conv, customer_po_ref: v })} />
          </div>
          <fieldset><legend>Delivery destinations</legend><div className="stack">
            {conv.destinations.map((d: any, i: number) => (
              <div key={i} className="grid grid-3" style={{ borderBottom: '1px dashed var(--border)', paddingBottom: '.75rem' }}>
                <TextField label="Label" value={d.label} onChange={(v) => setConv({ ...conv, destinations: conv.destinations.map((x: any, j: number) => (j === i ? { ...x, label: v } : x)) })} required error={fieldErr(act.error, `destinations.${i}.label`)} placeholder="e.g. Pune office" />
                <TextField label="Address" value={d.address} onChange={(v) => setConv({ ...conv, destinations: conv.destinations.map((x: any, j: number) => (j === i ? { ...x, address: v } : x)) })} required error={fieldErr(act.error, `destinations.${i}.address`)} />
                <div className="grid grid-2"><TextField label="City" value={d.city} onChange={(v) => setConv({ ...conv, destinations: conv.destinations.map((x: any, j: number) => (j === i ? { ...x, city: v } : x)) })} /><TextField label="PIN code" value={d.pincode} inputMode="numeric" onChange={(v) => setConv({ ...conv, destinations: conv.destinations.map((x: any, j: number) => (j === i ? { ...x, pincode: v } : x)) })} error={fieldErr(act.error, `destinations.${i}.pincode`)} /></div>
              </div>
            ))}
            <div className="row"><Button size="sm" icon="plus" onClick={() => setConv({ ...conv, destinations: [...conv.destinations, { label: '', address: '', city: '', pincode: '' }] })}>Add destination</Button>{conv.destinations.length > 1 && <Button size="sm" variant="ghost" onClick={() => setConv({ ...conv, destinations: conv.destinations.slice(0, -1) })}>Remove last</Button>}</div>
            {conv.destinations.length > 1 && <p className="small muted">With more than one destination you will split box quantities between them on the order's Contents tab.</p>}
          </div></fieldset>
        </div>
      </Modal>
      {dialog === 'message' && <Modal open onClose={close} title="Draft a follow-up message"><MessageDraft party="customer" entityType="opportunity" entityId={data.opportunity.id} defaultKey="quote_follow_up" onLogged={close} /></Modal>}
      <p className="small muted no-print">Signed in as {me!.user.name}. Quotations are never deleted; each change creates a new version.</p>
    </div>
  );
}

function VersionCard({ v, showCost, current, policy }: { v: any; showCost: boolean; current?: boolean; policy: any }) {
  const marginTone = v.margin_bp == null ? 'neutral' : v.margin_bp < policy.margin_floor_bp ? 'bad' : v.margin_bp < policy.margin_min_bp ? 'warn' : 'ok';
  return (
    <section className={current ? 'card' : ''} aria-label={`Version ${v.version}`}>
      {current && <div className="card-head"><h2>Version {v.version}{v.sent_at && <span className="muted small"> · sent {dateTime(v.sent_at)}</span>}</h2>{showCost && <Pill tone={marginTone as any} icon={marginTone === 'ok' ? 'check' : 'alert'}>Margin {pct(v.margin_bp)}</Pill>}</div>}
      <div className={current ? '' : 'stack'}>
        {v.changes?.length > 0 && <div className="callout info" style={{ margin: current ? '1rem 1.15rem 0' : 0 }}><Icon name="info" /><div><h4>Changed from version {v.version - 1}{v.change_note && `: ${v.change_note}`}</h4><ul>{v.changes.map((c: string) => <li key={c}>{c}</li>)}</ul></div></div>}
        {v.commitment_override_reason && <div className="callout warn" style={{ margin: current ? '1rem 1.15rem 0' : 0 }}><Icon name="alert" /><div><strong>Feasibility override</strong> by {v.override_name}: {v.commitment_override_reason}</div></div>}
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Item</th><th>Customisation</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th>{showCost && <><th className="num">Unit cost</th><th className="num">Line margin</th></>}</tr></thead>
          <tbody>{v.lines.map((l: any) => <tr key={l.id}><td>{l.description}</td><td className="small">{l.customisation ?? '—'}</td><td className="num">{l.qty}</td><td className="num">{money(l.unit_price_paise)}</td><td className="num">{money(l.qty * l.unit_price_paise)}</td>{showCost && <><td className="num">{l.unit_cost_paise ? money(l.unit_cost_paise) : <Pill tone="warn">Missing</Pill>}</td><td className="num">{l.unit_cost_paise && l.unit_price_paise ? pct(Math.round(((l.unit_price_paise - l.unit_cost_paise) * 10000) / l.unit_price_paise)) : '—'}</td></>}</tr>)}</tbody>
          <tfoot>
            <tr><td colSpan={4}>Subtotal</td><td className="num">{money(v.subtotal_paise)}</td>{showCost && <td colSpan={2} />}</tr>
            <tr><td colSpan={4}>Shipping</td><td className="num">{money(v.shipping_paise)}</td>{showCost && <td colSpan={2} />}</tr>
            <tr><td colSpan={4}>{v.tax_name ?? `Tax ${pct(v.tax_bp)}`}</td><td className="num">{money(v.tax_paise)}</td>{showCost && <td colSpan={2} />}</tr>
            <tr><td colSpan={4}>Total ({v.currency})</td><td className="num">{money(v.total_paise)}</td>{showCost && <><td className="num">{money(v.est_cost_paise)}</td><td className="num">{pct(v.margin_bp)}</td></>}</tr>
          </tfoot>
        </table></div>
        <div className="card-pad small muted">Valid until {date(v.validity_date)} · delivery {date(v.delivery_date)} · created by {v.created_name} {dateTime(v.created_at)}{v.notes && ` · ${v.notes}`}</div>
      </div>
    </section>
  );
}
export { Empty, NumberField };
