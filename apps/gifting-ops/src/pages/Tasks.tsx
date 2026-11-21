import { useState } from 'react';
import { Link } from 'react-router-dom';
import { taskInput } from '../../shared/schemas.ts';
import { post, patch } from '../api.ts';
import { date, dateTime, label, todayStr } from '../format.ts';
import { useAction, useApi, useAuth } from '../state.tsx';
import { Button, Card, Empty, ErrorState, fieldErr, FormError, Loading, Modal, PageHeader, Pager, Pill, Status, TextArea, TextField, UserSelect } from '../ui.tsx';

export default function Tasks({ view }: { view?: 'approvals' }) {
  return view === 'approvals' ? <Approvals /> : <TaskList />;
}

function TaskList() {
  const { me, can } = useAuth();
  const [scope, setScope] = useState('mine'); const [status, setStatus] = useState('open'); const [due, setDue] = useState(''); const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<any>(`/tasks?scope=${scope}&status=${status}&due=${due}&page=${page}&pageSize=25`);
  const [creating, setCreating] = useState(false);
  const act = useAction();
  const complete = (id: number) => act.run(() => post(`/tasks/${id}/complete`), 'Task done').then(reload);
  const snooze = (t: any, days: number) => { const d = new Date(); d.setDate(d.getDate() + days); act.run(() => patch(`/tasks/${t.id}`, { due_at: d.toLocaleDateString('en-CA') }), `Moved to ${date(d.toLocaleDateString('en-CA'))}`).then(reload); };
  const t = todayStr();
  return (
    <div className="stack">
      <PageHeader title="Tasks and follow-ups" sub="Follow-ups, handoffs and anything assigned to you." actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New task</Button>} />
      <div className="filters">
        {can('tasks.assign') && <select className="input" aria-label="Whose tasks" value={scope} onChange={(e) => { setScope(e.target.value); setPage(1); }}><option value="mine">My tasks</option><option value="team">Team tasks</option></select>}
        <select className="input" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="open">Open</option><option value="done">Done</option><option value="all">All</option></select>
        <select className="input" aria-label="Due" value={due} onChange={(e) => { setDue(e.target.value); setPage(1); }}><option value="">Any due date</option><option value="today">Due today or earlier</option><option value="overdue">Overdue</option></select>
      </div>
      <Card pad={false}>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title="No tasks match">Change the filters or create a task.</Empty> : (
          <div className="table-wrap"><table className="table responsive">
            <thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{data.rows.map((x: any) => {
              const overdue = x.status === 'open' && x.due_at && x.due_at < t;
              return (
                <tr key={x.id}>
                  <td data-label="Task">{x.link ? <Link className="row-link" to={x.link}>{x.title}</Link> : <strong>{x.title}</strong>}<div className="small muted">{label(x.kind)}{x.description ? ` · ${x.description}` : ''}</div></td>
                  <td data-label="Owner">{x.owner_name}</td>
                  <td data-label="Due">{x.due_at ? <Pill tone={overdue ? 'bad' : x.due_at === t ? 'warn' : 'neutral'} icon="clock">{overdue ? 'Overdue · ' : ''}{date(x.due_at)}</Pill> : '—'}</td>
                  <td data-label="Status"><Status kind="task" value={x.status} /></td>
                  <td data-label="">{x.status === 'open' && (x.owner_id === me!.user.id || can('tasks.assign')) && <div className="row end">
                    <Button size="sm" onClick={() => snooze(x, 1)} disabled={act.pending}>Tomorrow</Button>
                    <Button size="sm" variant="primary" icon="check" onClick={() => complete(x.id)} disabled={act.pending}>Done</Button>
                  </div>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {data && <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />}
      </Card>
      <NewTask open={creating} onClose={() => setCreating(false)} onDone={reload} />
    </div>
  );
}

export function NewTask({ open, onClose, onDone, entity }: { open: boolean; onClose: () => void; onDone: () => void; entity?: { type: string; id: number } }) {
  const { me, can } = useAuth();
  const [f, setF] = useState<any>({ title: '', description: '', owner_id: me!.user.id, due_at: todayStr() });
  const act = useAction();
  const [local, setLocal] = useState<Record<string, string>>({});
  const save = async () => {
    const body = { ...f, entity_type: entity?.type ?? null, entity_id: entity?.id ?? null };
    const r = taskInput.safeParse(body);
    if (!r.success) { setLocal(Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]))); return; }
    setLocal({});
    const out = await act.run(() => post('/tasks', body), 'Task created');
    if (out) { onDone(); onClose(); setF({ title: '', description: '', owner_id: me!.user.id, due_at: todayStr() }); }
  };
  const err = (k: string) => local[k] ?? fieldErr(act.error, k);
  return (
    <Modal open={open} onClose={onClose} title="New task" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.pending} onClick={save}>Create task</Button></>}>
      <div className="stack">
        <FormError error={act.error} />
        <TextField label="What needs doing" value={f.title} onChange={(v) => setF({ ...f, title: v })} required error={err('title')} autoFocus />
        <TextArea label="Details" value={f.description} onChange={(v) => setF({ ...f, description: v })} />
        <div className="grid grid-2">
          {can('tasks.assign') ? <UserSelect label="Owner" value={f.owner_id} onChange={(v) => setF({ ...f, owner_id: v })} required error={err('owner_id')} /> : <TextField label="Owner" value={me!.user.name} onChange={() => {}} disabled />}
          <TextField label="Due date" type="date" value={f.due_at} onChange={(v) => setF({ ...f, due_at: v })} error={err('due_at')} />
        </div>
      </div>
    </Modal>
  );
}

function Approvals() {
  const [tab, setTab] = useState<'pending' | 'decided'>('pending');
  const { data, error, loading, reload } = useApi<any>(`/approvals?status=${tab}`);
  const [deciding, setDeciding] = useState<{ a: any; decision: 'approved' | 'rejected' } | null>(null);
  const [note, setNote] = useState('');
  const act = useAction();
  const submit = async () => {
    const out = await act.run(() => post(`/approvals/${deciding!.a.id}/decide`, { decision: deciding!.decision, note: note || undefined }), deciding!.decision === 'approved' ? 'Approved' : 'Rejected');
    if (out) { setDeciding(null); setNote(''); reload(); }
  };
  return (
    <div className="stack">
      <PageHeader title="Approvals" sub="Margin exceptions, large purchase orders, partial-packing exceptions and other decisions that need authority." actions={
        <div className="row" role="group" aria-label="Show"><Button size="sm" variant={tab === 'pending' ? 'primary' : 'default'} aria-pressed={tab === 'pending'} onClick={() => setTab('pending')}>Pending</Button><Button size="sm" variant={tab === 'decided' ? 'primary' : 'default'} aria-pressed={tab === 'decided'} onClick={() => setTab('decided')}>Decided</Button></div>} />
      <Card pad={false}>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title={tab === 'pending' ? 'Nothing waiting for a decision' : 'No decisions yet'} /> : (
          <div className="table-wrap"><table className="table responsive">
            <thead><tr><th>Request</th><th>Requested by</th><th>Status</th><th><span className="sr-only">Decide</span></th></tr></thead>
            <tbody>{data.rows.map((a: any) => (
              <tr key={a.id}>
                <td data-label="Request">{a.link ? <Link className="row-link" to={a.link}>{a.title}</Link> : <strong>{a.title}</strong>}<div className="small muted">{a.detail}</div>{a.decision_note && <div className="small">Decision note: {a.decision_note}</div>}</td>
                <td data-label="Requested">{a.requested_name}<div className="small muted">{dateTime(a.requested_at)}</div></td>
                <td data-label="Status"><Status kind="approval" value={a.status} />{a.decided_name && <div className="small muted">{a.decided_name}</div>}</td>
                <td data-label="">{a.can_decide ? <div className="row end"><Button size="sm" variant="danger" onClick={() => setDeciding({ a, decision: 'rejected' })}>Reject</Button><Button size="sm" variant="primary" onClick={() => setDeciding({ a, decision: 'approved' })}>Approve</Button></div> : a.status === 'pending' ? <span className="small muted">Waiting for someone with authority</span> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      <Modal open={!!deciding} onClose={() => setDeciding(null)} title={deciding?.decision === 'approved' ? 'Approve request' : 'Reject request'} footer={<><Button onClick={() => setDeciding(null)}>Cancel</Button><Button variant={deciding?.decision === 'approved' ? 'primary' : 'danger'} loading={act.pending} onClick={submit}>{deciding?.decision === 'approved' ? 'Approve' : 'Reject'}</Button></>}>
        <div className="stack">
          <p><strong>{deciding?.a.title}</strong></p><p className="small muted">{deciding?.a.detail}</p>
          <FormError error={act.error} />
          <TextArea label={deciding?.decision === 'rejected' ? 'Reason (required)' : 'Note (optional)'} value={note} onChange={setNote} error={fieldErr(act.error, 'note')} required={deciding?.decision === 'rejected'} />
          <p className="small muted">Your decision is recorded with your name and the time.</p>
        </div>
      </Modal>
    </div>
  );
}
