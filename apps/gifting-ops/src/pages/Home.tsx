import { Link } from 'react-router-dom';
import { post } from '../api.ts';
import { date, label, money, relDays } from '../format.ts';
import { useAction, useApi, useAuth } from '../state.tsx';
import { Button, Card, Empty, ErrorState, Icon, Loading, PageHeader, Pill, Status } from '../ui.tsx';

export default function Home() {
  const { me, can } = useAuth();
  const { data, error, loading, reload } = useApi<any>('/home');
  const act = useAction();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const d = data!;
  const overdue = d.tasks.filter((t: any) => t.overdue).length;
  return (
    <div className="stack-lg">
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${me!.user.name.split(' ')[0]}`}
        sub={`${date(d.today)} · ${d.tasks.length} open task${d.tasks.length === 1 ? '' : 's'}${overdue ? `, ${overdue} overdue` : ''} · ${d.approvals.length} approval${d.approvals.length === 1 ? '' : 's'} waiting for you`}
        actions={can('*', 'sales.all', 'procurement.all') ? <Button size="sm" loading={act.pending} onClick={() => act.run(() => post('/automations/run'), 'Checks complete').then(reload)} title="Runs the scheduled overdue/risk checks now">Run checks now</Button> : undefined} />

      {d.summary.length > 0 && (
        <section aria-label="Summary" className="grid grid-auto">
          {d.summary.map((s: any) => (
            <Link key={s.key} to={s.link} className={`card kpi ${s.tone === 'warn' && s.value > 0 ? 'warn' : ''}`}>
              <span className="v">{s.tone?.startsWith('money') ? money(s.value) : s.value}</span>
              <span className="l">{s.label}</span>
            </Link>
          ))}
        </section>
      )}

      <div className="grid grid-2">
        <Card title="My tasks and follow-ups" actions={<Link to="/tasks" className="small">All tasks</Link>} pad={false}>
          {d.tasks.length === 0 ? <Empty title="Nothing due">You have no open tasks.</Empty> : (
            <ul className="checklist" style={{ padding: '0 1.15rem' }}>
              {d.tasks.slice(0, 8).map((t: any) => (
                <li key={t.id}>
                  <span style={{ flex: 1 }}>{t.link ? <Link to={t.link}>{t.title}</Link> : t.title}<br /><span className="small muted">{label(t.kind)}</span></span>
                  {t.due_at && <Pill tone={t.overdue ? 'bad' : t.due_today ? 'warn' : 'neutral'} icon="clock">{t.overdue ? `Overdue · ${date(t.due_at)}` : t.due_today ? 'Due today' : date(t.due_at)}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Approvals waiting for me" actions={<Link to="/approvals" className="small">Approvals inbox</Link>} pad={false}>
          {d.approvals.length === 0 ? <Empty title="No approvals waiting" /> : (
            <ul className="checklist" style={{ padding: '0 1.15rem' }}>
              {d.approvals.map((a: any) => (
                <li key={a.id}><span style={{ flex: 1 }}>{a.link ? <Link to={a.link}>{a.title}</Link> : a.title}<br /><span className="small muted">{a.requested_name} · {a.detail}</span></span><Status kind="approval" value="pending" /></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`Orders needing attention (${d.attention_total})`} actions={<Link to="/orders?risk=attention" className="small">See all</Link>} pad={false}>
        {d.attention.length === 0 ? <Empty title="All orders on track">No late, at-risk or blocked orders in your view.</Empty> : (
          <div className="table-wrap"><table className="table responsive">
            <thead><tr><th>Order</th><th>Stage</th><th>Due</th><th>Status</th><th>Why</th><th>Owner · next action</th></tr></thead>
            <tbody>{d.attention.map((o: any) => (
              <tr key={o.id}>
                <td data-label="Order"><Link className="row-link" to={`/orders/${o.id}`}>{o.number}</Link><div className="small muted">{o.company_name}</div></td>
                <td data-label="Stage"><Status kind="order" value={o.stage} /></td>
                <td data-label="Due" className="nowrap">{date(o.due_date)}<div className="small muted">{relDays(o.due_date)}</div></td>
                <td data-label="Status">{o.status.blocked ? <Pill tone="bad" icon="block">Blocked</Pill> : <Status kind="risk" value={o.risk.level} />}</td>
                <td data-label="Why" className="small">{o.status.reason ?? o.risk.reasons[0]}</td>
                <td data-label="Next" className="small"><strong>{o.status.owner_name}</strong>: {o.status.next_action}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      {d.issues.length > 0 && (
        <Card title="Issues I own" actions={<Link to="/fulfilment/issues?owner=me" className="small">All issues</Link>} pad={false}>
          <ul className="checklist" style={{ padding: '0 1.15rem' }}>
            {d.issues.map((i: any) => <li key={i.id}><span style={{ flex: 1 }}>{i.order_id ? <Link to={`/orders/${i.order_id}?tab=issues`}>{i.title}</Link> : i.title}<div className="small muted">{i.order_number ?? 'No order'} · {label(i.kind)}</div></span><Status kind="priority" value={i.priority} />{i.overdue && <Pill tone="bad">Overdue</Pill>}</li>)}
          </ul>
        </Card>
      )}

      {d.management && <Management m={d.management} />}
    </div>
  );
}

function Management({ m }: { m: any }) {
  const max = Math.max(1, ...m.by_stage.map((s: any) => s.count));
  return (
    <section className="stack" aria-label="Management overview">
      <h2>Management overview</h2>
      <div className="grid grid-4">
        <div className="card kpi"><span className="v">{m.active_orders}</span><span className="l">Active orders{m.active_value_paise != null && ` · ${money(m.active_value_paise)}`}</span></div>
        <Link to="/orders?risk=blocked" className={`card kpi ${m.blocked ? 'warn' : ''}`}><span className="v">{m.blocked}</span><span className="l">Blocked orders</span></Link>
        <Link to="/orders?risk=late" className={`card kpi ${m.late ? 'warn' : ''}`}><span className="v">{m.late} late · {m.at_risk} at risk</span><span className="l">Delivery risk</span></Link>
        <div className="card kpi"><span className="v">{m.delivered_30d ? `${m.delivered_on_time_30d}/${m.delivered_30d}` : '—'}</span><span className="l">Delivered on time, last 30 days</span></div>
      </div>
      <div className="grid grid-2">
        <Card title="Orders by stage">
          {m.by_stage.map((s: any) => (
            <div key={s.stage} className="chart-row"><Link to={`/orders?stage=${s.stage}`}>{label(s.stage)}</Link><div className="chart-bar" style={{ width: `${(s.count / max) * 100}%` }} aria-hidden="true" /><span className="num">{s.count}</span></div>
          ))}
        </Card>
        <Card title="Team workload" pad={false}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Person</th><th className="num">Open tasks</th><th className="num">Overdue</th><th className="num">Open issues</th></tr></thead>
            <tbody>{m.workload.map((w: any) => <tr key={w.id}><td>{w.name}</td><td className="num">{w.open_tasks}</td><td className="num">{w.overdue_tasks ? <Pill tone="bad">{w.overdue_tasks}</Pill> : 0}</td><td className="num">{w.open_issues}</td></tr>)}</tbody></table></div>
        </Card>
      </div>
      <Card title="Overrides and exceptions in the last 30 days">
        {m.overrides_30d.length === 0 ? <p className="muted">No overrides recorded.</p> : (
          <ul className="timeline">{m.overrides_30d.map((o: any, i: number) => <li key={i}><span className="dot exception" aria-hidden="true" /><div><div>{o.summary}</div><div className="meta">{o.user_name} · {date(o.at)}{o.order_id && <> · <Link to={`/orders/${o.order_id}?tab=activity`}>open order</Link></>}</div></div></li>)}</ul>
        )}
      </Card>
      <p className="small muted"><Icon name="info" size={14} /> {m.overdue_tasks} overdue tasks and {m.open_issues} open issues across the team. Orders confirmed in the last 30 days: {m.confirmed_30d}.</p>
    </section>
  );
}
