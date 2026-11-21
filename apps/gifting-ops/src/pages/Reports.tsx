import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addDays, date, label, money, pct, todayStr } from '../format.ts';
import { useApi, useAuth } from '../state.tsx';
import { Card, Empty, ErrorState, Icon, Loading, PageHeader, Pill, Status, TabPanel, Tabs, TextField } from '../ui.tsx';

export default function Reports() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') ?? (can('reports.view') ? 'orders' : 'pipeline');
  const [from, setFrom] = useState(addDays(todayStr(), -90)); const [to, setTo] = useState(todayStr());
  const tabs = [
    { id: 'pipeline', label: 'Sales pipeline', show: can('reports.view', 'reports.sales') }, { id: 'orders', label: 'Orders by stage', show: can('reports.view') },
    { id: 'delays', label: 'Delay reasons', show: can('reports.view') }, { id: 'vendors', label: 'Vendor performance', show: can('reports.view') },
    { id: 'profit', label: 'Profitability', show: can('margin.view') }, { id: 'rp', label: 'Receivables & payables', show: can('finance.view') },
  ].filter((t) => t.show);
  return (
    <div className="stack">
      <PageHeader title="Reports" sub="All figures are calculated live from the records you can access." actions={['pipeline', 'delays'].includes(tab) && <div className="row"><TextField label="From" type="date" value={from} onChange={setFrom} /><TextField label="To" type="date" value={to} onChange={setTo} /></div>} />
      <Tabs label="Reports" tabs={tabs} active={tab} onChange={(t) => setSp({ tab: t }, { replace: true })} />
      <TabPanel id={tab}>
        {tab === 'pipeline' && <Pipeline from={from} to={to} />}
        {tab === 'orders' && <OrdersReport />}
        {tab === 'delays' && <Delays from={from} to={to} />}
        {tab === 'vendors' && <VendorsReport />}
        {tab === 'profit' && <Profit />}
        {tab === 'rp' && <RecPay />}
      </TabPanel>
    </div>
  );
}
function Bars({ rows, value, labelOf, fmt = String }: { rows: any[]; value: (r: any) => number; labelOf: (r: any) => React.ReactNode; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map(value));
  if (!rows.length) return <p className="muted">No data in this period.</p>;
  return <div>{rows.map((r, i) => <div className="chart-row" key={i}><span>{labelOf(r)}</span><div className="chart-bar" style={{ width: `${(value(r) / max) * 100}%` }} aria-hidden="true" /><span className="num">{fmt(value(r))}</span></div>)}</div>;
}
function useReport(url: string) { const r = useApi<any>(url); return r; }
function Wrap({ r, children }: { r: ReturnType<typeof useReport>; children: (d: any) => React.ReactNode }) {
  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <ErrorState error={r.error} onRetry={r.reload} />;
  return <>{children(r.data)}</>;
}
function Pipeline({ from, to }: { from: string; to: string }) {
  const r = useReport(`/reports/pipeline?from=${from}&to=${to}`);
  return <Wrap r={r}>{(d) => (
    <div className="stack-lg">
      <div className="grid grid-4"><div className="card kpi"><span className="v">{d.leads_total}</span><span className="l">Leads created</span></div><div className="card kpi"><span className="v">{d.lead_conversion_pct == null ? '—' : `${d.lead_conversion_pct}%`}</span><span className="l">Leads converted to opportunities</span></div><div className="card kpi"><span className="v">{d.opps_total}</span><span className="l">Opportunities created</span></div><div className="card kpi"><span className="v">{d.win_rate_pct == null ? '—' : `${d.win_rate_pct}%`}</span><span className="l">Win rate ({d.won} won, {d.lost} lost)</span></div></div>
      <div className="grid grid-2">
        <Card title="Leads by stage"><Bars rows={d.leads_by_stage} value={(x) => x.n} labelOf={(x) => label(x.key)} /></Card>
        <Card title="Opportunities by stage"><Bars rows={d.opps_by_stage} value={(x) => x.n} labelOf={(x) => <>{label(x.key)}{x.value_paise ? <span className="muted small"> · {money(x.value_paise)}</span> : null}</>} /></Card>
        <Card title="Lead sources (converted / total)"><Bars rows={d.by_source} value={(x) => x.n} labelOf={(x) => `${x.key} (${x.converted} converted)`} /></Card>
        <Card title="Lost reasons"><Bars rows={d.lost_reasons} value={(x) => x.n} labelOf={(x) => x.key} /></Card>
      </div>
      <p className="small muted">Period {date(d.from)} to {date(d.to)}, by creation date.</p>
    </div>)}</Wrap>;
}
function OrdersReport() {
  const r = useReport('/reports/orders');
  return <Wrap r={r}>{(d) => (
    <div className="stack-lg">
      <div className="grid grid-2">
        <Card title="Orders by stage"><Bars rows={d.by_stage} value={(x) => x.count} labelOf={(x) => <Link to={`/orders?stage=${x.stage}`}>{x.label}{x.late ? ` (${x.late} late)` : ''}</Link>} /></Card>
        <Card title="Active orders by due date"><Bars rows={d.by_due} value={(x) => x.count} labelOf={(x) => x.bucket} /></Card>
      </div>
      <Card title="Active orders" pad={false}>{d.rows.length === 0 ? <Empty title="No active orders" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>Order</th><th>Stage</th><th>Due</th><th>Projected</th><th>Risk</th></tr></thead><tbody>{d.rows.map((o: any) => <tr key={o.id}><td data-label="Order"><Link to={`/orders/${o.id}`}>{o.number}</Link><div className="small muted">{o.company_name}</div></td><td data-label="Stage"><Status kind="order" value={o.stage} /></td><td data-label="Due">{date(o.due_date)}</td><td data-label="Projected">{date(o.projected)}</td><td data-label="Risk"><Status kind="risk" value={o.risk} /></td></tr>)}</tbody></table></div>}</Card>
    </div>)}</Wrap>;
}
function Delays({ from, to }: { from: string; to: string }) {
  const r = useReport(`/reports/delays?from=${from}&to=${to}`);
  return <Wrap r={r}>{(d) => (
    <div className="stack-lg">
      <div className="grid grid-2">
        <Card title="Vendor delays by vendor"><Bars rows={d.delays_by_vendor} value={(x) => x.n} labelOf={(x) => `${x.vendor} (${Math.round(x.days ?? 0)} days in total)`} /></Card>
        <Card title="Issues by type"><Bars rows={d.issues_by_kind} value={(x) => x.n} labelOf={(x) => `${label(x.kind)} (${x.open} open)`} /></Card>
      </div>
      <Card title="Currently blocked orders" pad={false}>{d.blockers.length === 0 ? <Empty title="No blocked orders" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{d.blockers.map((b: any) => <li key={b.id}><span style={{ flex: 1 }}><Link to={`/orders/${b.id}`}>{b.number}</Link>: {b.reason}<div className="small muted">{label(b.source)} · next: {b.next_action}</div></span></li>)}</ul>}</Card>
      <Card title="Vendor delay log" pad={false}>{d.vendor_delays.length === 0 ? <Empty title="No delays recorded in this period" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>When</th><th>PO</th><th>Vendor</th><th>Order</th><th>Moved</th><th>Reason</th></tr></thead><tbody>{d.vendor_delays.map((x: any) => <tr key={x.id}><td data-label="When">{date(x.at)}</td><td data-label="PO"><Link to={`/procurement/purchase-orders/${x.po_id}`}>{x.po_number}</Link></td><td data-label="Vendor">{x.vendor}</td><td data-label="Order">{x.order_number ?? '—'}</td><td data-label="Moved">{date(x.old_date)} → {date(x.new_date)}</td><td data-label="Reason">{x.reason}</td></tr>)}</tbody></table></div>}</Card>
    </div>)}</Wrap>;
}
function VendorsReport() {
  const r = useReport('/reports/vendors');
  return <Wrap r={r}>{(d) => (
    <Card pad={false}>{d.rows.length === 0 ? <Empty title="No vendors yet" /> : <>
      <div className="table-wrap"><table className="table responsive"><thead><tr><th>Vendor</th><th>Status</th><th className="num">POs</th><th className="num">Completed</th><th className="num">On time</th><th className="num">Rejection rate</th><th className="num">Incidents</th><th className="num">Delays</th><th className="num">Purchase value</th></tr></thead>
        <tbody>{d.rows.map((v: any) => <tr key={v.id}><td data-label="Vendor"><Link to={`/procurement/vendors/${v.id}?tab=performance`}>{v.display_name}</Link></td><td data-label="Status"><Status kind="vendor" value={v.status} /></td><td data-label="POs" className="num">{v.purchase_orders}</td><td data-label="Completed" className="num">{v.completed_pos}</td><td data-label="On time" className="num">{v.on_time_rate_pct == null ? <Pill tone="neutral" title={`Shown after ${v.min_orders_for_score} completed POs`}>Not enough data</Pill> : `${v.on_time_rate_pct}%`}</td><td data-label="Rejection" className="num">{v.rejection_rate_pct == null ? '—' : `${v.rejection_rate_pct}%`}</td><td data-label="Incidents" className="num">{v.quality_incidents}</td><td data-label="Delays" className="num">{v.delay_notices}</td><td data-label="Value" className="num">{money(v.purchase_value_paise)}</td></tr>)}</tbody></table></div>
      <p className="card-pad small muted"><Icon name="info" size={14} /> {d.rows[0].method}</p></>}</Card>)}</Wrap>;
}
function Profit() {
  const r = useReport('/reports/profitability');
  return <Wrap r={r}>{(d) => (
    <div className="stack">
      <div className="grid grid-3"><div className="card kpi"><span className="v">{money(d.completed_revenue_paise)}</span><span className="l">Revenue on fully-costed orders</span></div><div className="card kpi"><span className="v">{money(d.completed_cost_paise)}</span><span className="l">Their actual cost</span></div><div className="card kpi"><span className="v">{pct(d.completed_margin_bp)}</span><span className="l">Blended actual margin (policy minimum {pct(d.min_margin_bp)})</span></div></div>
      <Card pad={false}><div className="table-wrap"><table className="table responsive"><thead><tr><th>Order</th><th className="num">Revenue</th><th className="num">Est. margin</th><th className="num">Actual margin</th><th>Variance</th></tr></thead>
        <tbody>{d.rows.map((o: any) => { const v = o.actual_margin_bp != null && o.est_margin_bp != null ? o.actual_margin_bp - o.est_margin_bp : null; return <tr key={o.id}><td data-label="Order"><Link to={`/orders/${o.id}?tab=costing`}>{o.number}</Link><div className="small muted">{o.company_name}</div></td><td data-label="Revenue" className="num">{money(o.revenue_paise)}</td><td data-label="Estimated" className="num">{pct(o.est_margin_bp)}</td><td data-label="Actual" className="num">{pct(o.actual_margin_bp)}{o.provisional && <> <Pill tone="neutral">Provisional</Pill></>}</td><td data-label="Variance">{v == null || o.provisional ? '—' : <Pill tone={v < -200 ? 'bad' : v < 0 ? 'warn' : 'ok'}>{v > 0 ? '+' : ''}{(v / 100).toFixed(1)} pts</Pill>}</td></tr>; })}</tbody></table></div></Card>
    </div>)}</Wrap>;
}
function RecPay() {
  const r = useReport('/reports/receivables-payables');
  return <Wrap r={r}>{(d) => (
    <div className="grid grid-2">
      <Card title={`Receivables ageing · ${money(d.receivables_total_paise)}`}><Bars rows={d.receivables} value={(x) => x.amount_paise} labelOf={(x) => `${x.bucket} (${x.count})`} fmt={(n) => money(n)} /></Card>
      <Card title={`Payables · ${money(d.payables_total_paise)}`} pad={false}>{d.payables.length === 0 ? <Empty title="Nothing owed to vendors" /> : <ul className="checklist" style={{ padding: '0 1.15rem' }}>{d.payables.map((p: any) => <li key={p.id}><span style={{ flex: 1 }}><Link to={`/procurement/purchase-orders/${p.id}`}>{p.number}</Link> · {p.vendor}</span><span className="num">{money(p.balance_paise)}</span></li>)}</ul>}</Card>
    </div>)}</Wrap>;
}
