import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../api.ts';
import { dateTime, label } from '../format.ts';
import { useAction, useApi, useAuth } from '../state.tsx';
import { Button, Card, Empty, ErrorState, Loading, PageHeader, Pager, Pill } from '../ui.tsx';

export default function Notifications() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all'); const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<any>(`/notifications?filter=${filter}&page=${page}&pageSize=30`);
  const { setUnread } = useAuth(); const act = useAction();
  const markAll = () => act.run(() => post('/notifications/read', { all: true }), 'All marked as read').then(() => { setUnread(0); reload(); });
  const open = (n: any) => { if (!n.read_at) post('/notifications/read', { ids: [n.id] }).then(() => setUnread(Math.max(0, (data?.unread ?? 1) - 1))).catch(() => {}); };
  return (
    <div className="stack">
      <PageHeader title="Notifications" sub="Everything the system has told you, newest first. Duplicates are suppressed." actions={<>
        <div className="row" role="group" aria-label="Filter">
          <Button size="sm" variant={filter === 'all' ? 'primary' : 'default'} aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setPage(1); }}>All</Button>
          <Button size="sm" variant={filter === 'unread' ? 'primary' : 'default'} aria-pressed={filter === 'unread'} onClick={() => { setFilter('unread'); setPage(1); }}>Unread ({data?.unread ?? 0})</Button>
        </div>
        <Button size="sm" onClick={markAll} loading={act.pending} disabled={!data?.unread}>Mark all as read</Button></>} />
      <Card pad={false}>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} /> : (
          <ul className="checklist" style={{ padding: '0 1.15rem' }}>
            {data.rows.map((n: any) => (
              <li key={n.id} style={{ opacity: n.read_at ? 0.75 : 1 }}>
                <span style={{ flex: 1 }}>
                  {!n.read_at && <Pill tone="info">New</Pill>} <strong>{n.link ? <Link to={n.link} onClick={() => open(n)}>{n.title}</Link> : n.title}</strong>
                  {n.body && <div className="small" style={{ whiteSpace: 'pre-line' }}>{n.body}</div>}
                  <div className="small muted">{label(n.kind)} · {dateTime(n.created_at)}</div>
                </span>
              </li>
            ))}
          </ul>
        )}
        {data && <Pager page={page} pageSize={30} total={data.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
