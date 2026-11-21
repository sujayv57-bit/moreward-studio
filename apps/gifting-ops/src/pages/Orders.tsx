import { Link, useSearchParams } from 'react-router-dom';
import { date, label, relDays } from '../format.ts';
import { useApi, useAuth } from '../state.tsx';
import { Card, Empty, ErrorState, Loading, PageHeader, Pager, Pill, Status } from '../ui.tsx';

const STAGES = ['confirmed', 'procurement', 'goods_received', 'quality_check', 'packing', 'dispatch', 'delivered', 'closed'];

export default function Orders() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const get = (k: string, d = '') => sp.get(k) ?? d;
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };
  const page = Number(get('page', '1'));
  const qs = new URLSearchParams({ q: get('q'), stage: get('stage', 'active'), owner: get('owner'), due: get('due'), risk: get('risk'), sort: get('sort', 'due'), archived: get('archived'), page: String(page), pageSize: '25' });
  const { data, error, loading, reload } = useApi<any>(`/orders?${qs}`);
  const users = useApi<any>(can('orders.view_all') ? '/users' : null);
  return (
    <div className="stack">
      <PageHeader title="Orders" sub="Every confirmed order, its stage, owner, next action and delivery risk." />
      <div className="filters" role="search">
        <input className="input grow" type="search" aria-label="Search orders" placeholder="Order number, customer, title, customer PO…" value={get('q')} onChange={(e) => set('q', e.target.value)} />
        <select className="input" aria-label="Stage" value={get('stage', 'active')} onChange={(e) => set('stage', e.target.value)}><option value="active">Active (not delivered)</option><option value="">All stages</option>{STAGES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        <select className="input" aria-label="Attention" value={get('risk')} onChange={(e) => set('risk', e.target.value)}><option value="">Any status</option><option value="attention">Needs attention</option><option value="blocked">Blocked</option><option value="late">Late</option><option value="at_risk">At risk</option><option value="on_track">On track</option></select>
        <select className="input" aria-label="Due" value={get('due')} onChange={(e) => set('due', e.target.value)}><option value="">Any due date</option><option value="overdue">Overdue</option><option value="week">Due in 7 days</option></select>
        {users.data && <select className="input" aria-label="Owner" value={get('owner')} onChange={(e) => set('owner', e.target.value)}><option value="">Any owner</option>{users.data.rows.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        <select className="input" aria-label="Sort" value={get('sort', 'due')} onChange={(e) => set('sort', e.target.value)}><option value="due">Sort: due date</option><option value="created">Sort: newest</option><option value="number">Sort: order number</option><option value="customer">Sort: customer</option></select>
        {can('*') && <label className="check small"><input type="checkbox" checked={get('archived') === '1'} onChange={(e) => set('archived', e.target.checked ? '1' : '')} /> Archived</label>}
      </div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title="No orders match these filters">Orders are created by converting a customer-approved quotation.</Empty> : (
          <div className="table-wrap"><table className="table responsive">
            <thead><tr><th>Order</th><th>Customer</th><th>Stage</th><th>Due</th><th>Status</th><th>Next action · owner</th></tr></thead>
            <tbody>{data.rows.map((o: any) => (
              <tr key={o.id}>
                <td data-label="Order"><Link className="row-link" to={`/orders/${o.id}`}>{o.number}</Link><div className="small muted">{o.title}</div></td>
                <td data-label="Customer">{o.company_name}<div className="small muted">Sales {o.sales_owner_name} · Proc. {o.procurement_owner_name ?? '—'}</div></td>
                <td data-label="Stage"><Status kind="order" value={o.stage} /></td>
                <td data-label="Due" className="nowrap">{date(o.due_date)}<div className="small muted">{relDays(o.due_date)}</div></td>
                <td data-label="Status">{o.status.blocked ? <Pill tone="bad" icon="block" title={o.status.reason}>Blocked</Pill> : <Status kind="risk" value={o.risk.level} />}{o.risk.projected_delivery && o.risk.level !== 'on_track' && o.risk.level !== 'none' && <div className="small muted">Projected {date(o.risk.projected_delivery)}</div>}</td>
                <td data-label="Next" className="small">{o.status.blocked && <div style={{ color: 'var(--bad-fg)' }}>{o.status.reason}</div>}{o.status.next_action} <strong>— {o.status_owner_name}</strong></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {data && <Pager page={page} pageSize={25} total={data.total} onPage={(p) => set('page', String(p))} />}
      </Card>
    </div>
  );
}
