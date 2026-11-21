import { Link, useSearchParams } from 'react-router-dom';
import { date, label, money, pct } from '../format.ts';
import { useApi, useAuth } from '../state.tsx';
import { Card, Empty, ErrorState, Icon, Loading, PageHeader, Pill, Status, TabPanel, Tabs } from '../ui.tsx';

export default function Finance() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') ?? 'receivables';
  const meta = useApi<any>('/meta');
  return (
    <div className="stack">
      <PageHeader title="Finance" sub="Advances, balances, margins and exports for the accounting team." />
      <div className="callout info"><Icon name="info" /><div>This is an operational record. Invoices, receipts and payments are <strong>entered here by hand</strong> and nothing is processed or synced. The accounting system stays the source of truth{meta.data && !meta.data.providers.accounting && ' (no accounting integration configured)'}.</div></div>
      <Tabs label="Finance sections" active={tab} onChange={(t) => setSp({ tab: t }, { replace: true })} tabs={[{ id: 'receivables', label: 'Customer balances' }, { id: 'overdue', label: 'Overdue' }, { id: 'payables', label: 'Vendor balances' }, { id: 'margins', label: 'Order margins' }, ...(can('export') ? [{ id: 'exports', label: 'Exports' }] : [])]} />
      <TabPanel id={tab}>
        {tab === 'receivables' && <Receivables filter="open" />}
        {tab === 'overdue' && <Receivables filter="overdue" />}
        {tab === 'payables' && <Payables />}
        {tab === 'margins' && <Margins />}
        {tab === 'exports' && <Exports kinds={meta.data?.exports ?? []} />}
      </TabPanel>
    </div>
  );
}
function Receivables({ filter }: { filter: string }) {
  const { data, error, loading, reload } = useApi<any>(`/finance/receivables?filter=${filter}`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="stack">
      <div className="grid grid-3"><div className="card kpi"><span className="v">{money(data.totals.balance_paise)}</span><span className="l">Open customer balances</span></div><div className={`card kpi ${data.totals.overdue_paise ? 'warn' : ''}`}><span className="v">{money(data.totals.overdue_paise)}</span><span className="l">Overdue</span></div><div className="card kpi"><span className="v">{money(data.totals.received_paise)}</span><span className="l">Received on these orders</span></div></div>
      <Card pad={false}>{data.rows.length === 0 ? <Empty title={filter === 'overdue' ? 'Nothing overdue' : 'No open balances'} /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>Order</th><th>Stage</th><th className="num">Total</th><th className="num">Received</th><th className="num">Balance</th><th>Invoices</th><th>Due</th></tr></thead>
        <tbody>{data.rows.map((r: any) => <tr key={r.id}><td data-label="Order"><Link className="row-link" to={`/orders/${r.id}?tab=payments`}>{r.number}</Link><div className="small muted">{r.company_name}</div></td><td data-label="Stage"><Status kind="order" value={r.stage} /></td><td data-label="Total" className="num">{money(r.total_paise)}</td><td data-label="Received" className="num">{money(r.received_paise)}</td><td data-label="Balance" className="num"><strong>{money(r.balance_paise)}</strong></td><td data-label="Invoices" className="small">{r.invoices.join(', ') || <Pill tone="warn">None recorded</Pill>}</td><td data-label="Due">{r.due_on ? <Pill tone={r.overdue ? 'bad' : 'neutral'} icon="clock">{r.overdue ? `${r.days_overdue} days overdue` : date(r.due_on)}</Pill> : <span className="small muted">Not due yet</span>}</td></tr>)}</tbody></table></div>}</Card>
      <p className="small muted">Due date = earliest invoice due date; if no invoice is recorded, delivery date plus the standard payment terms in Settings.</p>
    </div>
  );
}
function Payables() {
  const { data, error, loading, reload } = useApi<any>('/finance/payables?filter=open');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="stack">
      <div className="grid grid-3"><div className="card kpi"><span className="v">{money(data.totals.balance_paise)}</span><span className="l">Open vendor balances</span></div><div className="card kpi"><span className="v">{money(data.totals.advances_due_paise)}</span><span className="l">Advances required but not yet paid</span></div><div className="card kpi"><span className="v">{money(data.totals.paid_paise)}</span><span className="l">Paid on these POs</span></div></div>
      <Card pad={false}>{data.rows.length === 0 ? <Empty title="No open vendor balances" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>PO</th><th>Vendor</th><th>Status</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Advance due</th><th className="num">Balance</th></tr></thead>
        <tbody>{data.rows.map((p: any) => <tr key={p.id}><td data-label="PO"><Link className="row-link" to={`/procurement/purchase-orders/${p.id}`}>{p.number}</Link><div className="small muted">{p.order_number ?? 'No order'}</div></td><td data-label="Vendor">{p.vendor}</td><td data-label="Status"><Status kind="po" value={p.status} /></td><td data-label="Total" className="num">{money(p.total_paise)}</td><td data-label="Paid" className="num">{money(p.paid_paise)}</td><td data-label="Advance due" className="num">{p.advance_outstanding_paise ? <Pill tone="warn">{money(p.advance_outstanding_paise)}</Pill> : '—'}</td><td data-label="Balance" className="num"><strong>{money(p.balance_paise)}</strong></td></tr>)}</tbody></table></div>}</Card>
    </div>
  );
}
function Margins() {
  const { data, error, loading, reload } = useApi<any>('/finance/margins');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <Card pad={false}>{data.rows.length === 0 ? <Empty title="No orders" /> : <div className="table-wrap"><table className="table responsive"><thead><tr><th>Order</th><th>Stage</th><th className="num">Revenue (pre-tax)</th><th className="num">Estimated margin</th><th className="num">Actual cost so far</th><th className="num">Actual margin</th></tr></thead>
      <tbody>{data.rows.map((r: any) => <tr key={r.id}><td data-label="Order"><Link className="row-link" to={`/orders/${r.id}?tab=costing`}>{r.number}</Link><div className="small muted">{r.company_name}</div></td><td data-label="Stage"><Status kind="order" value={r.stage} /></td><td data-label="Revenue" className="num">{money(r.revenue_paise)}</td><td data-label="Estimated" className="num">{pct(r.est_margin_bp)}</td><td data-label="Actual cost" className="num">{money(r.actual_cost_paise)}</td><td data-label="Actual" className="num">{pct(r.actual_margin_bp)} {r.provisional && <Pill tone="neutral">Provisional</Pill>}</td></tr>)}</tbody></table></div>}
      <p className="card-pad small muted">Actual cost counts issued POs (pre-tax{data.vendor_tax_in_cost ? ' + vendor tax' : ''}, plus shipping) and other recorded costs. “Provisional” means some components are not on a PO yet.</p></Card>
  );
}
function Exports({ kinds }: { kinds: string[] }) {
  const desc: Record<string, string> = { receivables: 'Orders with totals, amounts received, balances, invoice references and due dates', payables: 'Issued POs with totals, advances and balances', 'customer-payments': 'Every customer payment recorded', 'vendor-payments': 'Every vendor payment recorded', invoices: 'Invoice references recorded against orders', margins: 'Estimated and actual margin per order' };
  return (
    <Card title="CSV exports for the accounting team">
      <ul className="checklist">{kinds.map((k) => <li key={k}><span style={{ flex: 1 }}><strong>{label(k.replace('-', ' '))}</strong><div className="small muted">{desc[k]}</div></span><a className="btn sm" href={`/api/exports/${k}`} download>Download CSV</a></li>)}</ul>
      <p className="small muted">Amounts are in rupees with two decimals, currency stated per row where it varies. Exports open in Excel or Google Sheets; each download is recorded in the audit log.</p>
    </Card>
  );
}
