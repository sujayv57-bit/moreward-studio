import { useState } from 'react';
import { Link, Route, Routes, useSearchParams } from 'react-router-dom';
import { date, label } from '../format.ts';
import { useApi } from '../state.tsx';
import { Button, Card, Empty, ErrorState, Loading, PageHeader, Pager, Pill, Status } from '../ui.tsx';
import { IssueModal, IssueTable } from './shared.tsx';

export default function Fulfilment() {
  return <Routes><Route path="packing" element={<PackingQueue />} /><Route path="dispatch" element={<DispatchQueue />} /><Route path="issues" element={<Issues />} /><Route path="*" element={<PackingQueue />} /></Routes>;
}

function PackingQueue() {
  const { data, error, loading, reload } = useApi<any>('/packing/queue');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="stack">
      <PageHeader title="Packing queue" sub="Orders with goods in the warehouse. Packing starts only when every component is accepted, or with an approved exception." />
      {data.rows.length === 0 ? <Card><Empty title="Nothing to pack right now" /></Card> : data.rows.map((o: any) => (
        <Card key={o.id} title={<><Link to={`/orders/${o.id}?tab=packing`}>{o.number}</Link> <span className="muted" style={{ fontWeight: 500 }}>{o.company_name}</span></>} actions={<><Status kind="order" value={o.stage} />{o.due_soon && <Pill tone="warn" icon="clock">Due {date(o.due_date)}</Pill>}<Link className="btn primary sm" to={`/orders/${o.id}?tab=packing`}>{o.ready ? 'Open packing' : 'See what is missing'}</Link></>}>
          <div className="row between"><span>{o.checked} of {o.boxes} boxes packed and checked{o.batched > o.checked && ` · ${o.batched - o.checked} in progress`}{o.my_batches > 0 && <> · <strong>{o.my_batches} batch(es) assigned to you</strong></>}</span><div className="bar ok" style={{ width: 200 }} role="progressbar" aria-label="Packed and checked" aria-valuenow={o.checked} aria-valuemin={0} aria-valuemax={o.boxes}><span style={{ width: `${(o.checked / Math.max(1, o.boxes)) * 100}%` }} /></div></div>
          {!o.ready && <ul className="small" style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>{o.missing.slice(0, 3).map((m: any, i: number) => <li key={i}>{m.message}</li>)}{o.missing.length > 3 && <li>and {o.missing.length - 3} more</li>}</ul>}
        </Card>
      ))}
    </div>
  );
}

function DispatchQueue() {
  const { data, error, loading, reload } = useApi<any>('/dispatch/queue');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="stack-lg">
      <PageHeader title="Dispatch" sub="Checked boxes ready to ship, and shipments on the road. Tracking is updated by hand (no courier integration configured)." />
      <Card title="Ready to ship" pad={false}>{data.orders.length === 0 ? <Empty title="Nothing ready" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>Order</th><th>Due</th><th className="num">Ready</th><th className="num">Shipped / total</th><th><span className="sr-only">Open</span></th></tr></thead>
        <tbody>{data.orders.map((o: any) => <tr key={o.id}><td data-label="Order"><Link className="row-link" to={`/orders/${o.id}?tab=shipments`}>{o.number}</Link><div className="small muted">{o.company_name}</div></td><td data-label="Due">{date(o.due_date)}</td><td data-label="Ready" className="num">{o.ready_to_ship > 0 ? <Pill tone="info">{o.ready_to_ship}</Pill> : 0}</td><td data-label="Shipped" className="num">{o.shipped} / {o.total_boxes}</td><td><Link className="btn sm primary" to={`/orders/${o.id}?tab=shipments`}>Shipments</Link></td></tr>)}</tbody></table></div>}</Card>
      <Card title="On the road" pad={false}>{data.in_transit.length === 0 ? <Empty title="No shipments in transit" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>Shipment</th><th>Destination</th><th>Courier</th><th>Expected</th><th>Status</th></tr></thead>
        <tbody>{data.in_transit.map((s: any) => <tr key={s.id}><td data-label="Shipment"><Link to={`/orders/${s.order_id}?tab=shipments`}>{s.order_number} · #{s.id}</Link></td><td data-label="Destination">{s.destination}{s.city && `, ${s.city}`}</td><td data-label="Courier">{s.courier ?? '—'} {s.tracking_no}</td><td data-label="Expected">{s.expected_on ? <Pill tone={s.overdue ? 'bad' : 'neutral'} icon="clock">{date(s.expected_on)}</Pill> : '—'}</td><td data-label="Status"><Status kind="shipment" value={s.status} /></td></tr>)}</tbody></table></div>}</Card>
    </div>
  );
}

function Issues() {
  const [sp, setSp] = useSearchParams(); const status = sp.get('status') ?? 'open'; const kind = sp.get('kind') ?? ''; const owner = sp.get('owner') ?? ''; const page = Number(sp.get('page') ?? 1);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };
  const { data, error, loading, reload } = useApi<any>(`/issues?status=${status}&kind=${kind}&owner=${owner}&page=${page}&pageSize=25`);
  const [open, setOpen] = useState<any | null | false>(false);
  return (
    <div className="stack">
      <PageHeader title="Issues" sub="Shortages, damage, failed deliveries, replacements and returns — each with an owner, priority and due date." actions={<Button variant="primary" icon="plus" onClick={() => setOpen(null)}>Raise issue</Button>} />
      <div className="filters">
        <select className="input" aria-label="Status" value={status} onChange={(e) => set('status', e.target.value)}><option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All</option></select>
        <select className="input" aria-label="Type" value={kind} onChange={(e) => set('kind', e.target.value)}><option value="">All types</option>{['shortage', 'damage', 'quality', 'failed_delivery', 'replacement', 'return', 'other'].map((k) => <option key={k} value={k}>{label(k)}</option>)}</select>
        <select className="input" aria-label="Owner" value={owner} onChange={(e) => set('owner', e.target.value)}><option value="">Anyone</option><option value="me">Mine</option></select>
      </div>
      <Card pad={false}>{loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : <IssueTable rows={data.rows} onOpen={(i) => setOpen(i)} />}{data && <Pager page={page} pageSize={25} total={data.total} onPage={(p) => set('page', String(p))} />}</Card>
      <IssueModal open={open !== false} issue={open || undefined} onClose={() => setOpen(false)} onDone={reload} />
    </div>
  );
}
