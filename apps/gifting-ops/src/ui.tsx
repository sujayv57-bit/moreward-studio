import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, upload, type Missing } from './api.ts';
import { formatInr, label as fmtLabel, parseRupees } from './format.ts';
import { useApi, useToast } from './state.tsx';

// ---------------------------------------------------------------- icons (decorative; always paired with text)
const paths: Record<string, string> = {
  check: 'M5 12l4 4L19 6', alert: 'M12 8v5m0 3h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z', x: 'M6 6l12 12M18 6L6 18',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z', search: 'M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z', menu: 'M4 6h16M4 12h16M4 18h16',
  bell: 'M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2zM10 21h4', plus: 'M12 5v14M5 12h14', info: 'M12 16v-5m0-3h.01M12 21a9 9 0 100-18 9 9 0 000 18z',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z', file: 'M14 3H6v18h12V7l-4-4zM14 3v4h4', dot: 'M12 12h.01', block: 'M5.6 5.6l12.8 12.8M12 21a9 9 0 100-18 9 9 0 000 18z',
  pause: 'M10 6v12M14 6v12', truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z', home: 'M3 11l9-7 9 7v9H5v-9',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', box: 'M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  cog: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  rupee: 'M6 4h12M6 9h12M6 4c6 0 8 2 8 5s-2 5-8 5l8 6', cart: 'M3 3h2l2 12h11l2-8H6M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z',
  arrow: 'M5 12h14M13 6l6 6-6 6', back: 'M19 12H5M11 6l-6 6 6 6', up: 'M12 19V5M6 11l6-6 6 6', download: 'M12 4v12m0 0l-5-5m5 5l5-5M4 20h16',
};
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name] ?? paths.dot} /></svg>;
}

// ---------------------------------------------------------------- buttons
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'emphasis' | 'danger' | 'ghost' | 'default'; size?: 'sm'; loading?: boolean; icon?: string };
export function Button({ variant = 'default', size, loading, icon, children, className = '', disabled, ...rest }: BtnProps) {
  return (
    <button type="button" className={`btn ${variant !== 'default' ? variant : ''} ${size ?? ''} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- form fields
interface FieldBase { label: string; error?: string; hint?: string; required?: boolean; className?: string }
function FieldShell({ id, label, error, hint, required, className, children }: FieldBase & { id: string; children: ReactNode }) {
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      {children}
      {hint && !error && <div className="hint" id={`${id}-hint`}>{hint}</div>}
      {error && <div className="err" id={`${id}-err`} role="alert"><Icon name="alert" size={14} />{error}</div>}
    </div>
  );
}
const described = (id: string, error?: string, hint?: string) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);
export function TextField({ label, error, hint, required, className, value, onChange, type = 'text', ...rest }: FieldBase & { value: string | number | null | undefined; onChange: (v: string) => void; type?: string; placeholder?: string; autoComplete?: string; min?: string | number; max?: string | number; step?: string; inputMode?: 'numeric' | 'decimal' | 'text' | 'tel' | 'email'; autoFocus?: boolean; name?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <input id={id} className="input" type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error || undefined} aria-required={required || undefined} aria-describedby={described(id, error, hint)} {...rest} />
    </FieldShell>
  );
}
export function NumberField(props: Omit<Parameters<typeof TextField>[0], 'value' | 'onChange'> & { value: number | null | undefined; onChange: (v: number | null) => void }) {
  const { value, onChange, ...rest } = props;
  return <TextField {...rest} type="number" inputMode="numeric" step="1" value={value ?? ''} onChange={(v) => onChange(v === '' ? null : Math.trunc(Number(v)))} />;
}
export function TextArea({ label, error, hint, required, className, value, onChange, rows = 3, placeholder }: FieldBase & { value: string | null | undefined; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <textarea id={id} className="input" rows={rows} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error || undefined} aria-describedby={described(id, error, hint)} />
    </FieldShell>
  );
}
export function SelectField({ label, error, hint, required, className, value, onChange, options, placeholder = 'Choose…', disabled }: FieldBase & { value: string | number | null | undefined; onChange: (v: string) => void; options: { value: string | number; label: string }[]; placeholder?: string | null; disabled?: boolean }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <select id={id} className="input" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error || undefined} aria-describedby={described(id, error, hint)}>
        {placeholder !== null && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
}
/** Rupee input: the user types rupees ("1,250.50"); the value is integer paise. */
export function MoneyField({ label, error, hint, required, className, value, onChange }: FieldBase & { value: number | null | undefined; onChange: (paise: number | null) => void }) {
  const id = useId();
  const [text, setText] = useState(value == null ? '' : formatInr(value).replace('₹', ''));
  const [local, setLocal] = useState<string | undefined>();
  useEffect(() => { if (document.activeElement?.id !== id) setText(value == null ? '' : formatInr(value).replace('₹', '')); }, [value, id]);
  return (
    <FieldShell id={id} label={label} error={error ?? local} hint={hint} required={required} className={className}>
      <div className="input-prefix"><span aria-hidden="true">₹</span>
        <input id={id} className="input" inputMode="decimal" value={text} aria-invalid={!!(error ?? local) || undefined} aria-describedby={described(id, error ?? local, hint)}
          onChange={(e) => { setText(e.target.value); if (e.target.value.trim() === '') { setLocal(undefined); onChange(null); return; } const p = parseRupees(e.target.value); if (p == null || p < 0) setLocal('Enter an amount like 1,250.50'); else { setLocal(undefined); onChange(p); } }} />
      </div>
    </FieldShell>
  );
}
export function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> <span>{label}{hint && <span className="muted small"> — {hint}</span>}</span></label>;
}
export function UserSelect({ label = 'Owner', value, onChange, roles, error, required, hint }: { label?: string; value: number | null | undefined; onChange: (v: number | null) => void; roles?: string[]; error?: string; required?: boolean; hint?: string }) {
  const { data } = useApi<{ rows: { id: number; name: string; roles: string[] }[] }>('/users');
  const opts = (data?.rows ?? []).filter((u) => !roles || u.roles.some((r) => roles.includes(r))).map((u) => ({ value: u.id, label: u.name }));
  return <SelectField label={label} value={value ?? ''} onChange={(v) => onChange(v ? Number(v) : null)} options={opts} error={error} required={required} hint={hint} />;
}

// ---------------------------------------------------------------- status
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'navy';
const toneIcon: Record<Tone, string> = { ok: 'check', warn: 'clock', bad: 'alert', info: 'info', neutral: 'dot', navy: 'dot' };
export function Pill({ tone = 'neutral', children, icon, title }: { tone?: Tone; children: ReactNode; icon?: string; title?: string }) {
  return <span className={`pill ${tone}`} title={title}><Icon name={icon ?? toneIcon[tone]} size={13} />{children}</span>;
}
const TONES: Record<string, Record<string, Tone>> = {
  order: { confirmed: 'info', procurement: 'navy', goods_received: 'navy', quality_check: 'navy', packing: 'navy', dispatch: 'info', delivered: 'ok', closed: 'neutral' },
  risk: { on_track: 'ok', at_risk: 'warn', late: 'bad', none: 'neutral' },
  lead: { new: 'info', contacted: 'navy', qualified: 'ok', converted: 'ok', lost: 'neutral' },
  opp: { requirements: 'info', feasibility: 'warn', quotation: 'navy', awaiting_approval: 'warn', won: 'ok', lost: 'neutral' },
  quote: { draft: 'neutral', pending_approval: 'warn', approved: 'info', sent: 'navy', customer_approved: 'ok', rejected: 'bad', expired: 'neutral' },
  vendor: { draft: 'neutral', info_requested: 'warn', documents_pending: 'warn', under_review: 'info', approved: 'ok', active: 'ok', rejected: 'bad', suspended: 'bad', inactive: 'neutral' },
  po: { draft: 'neutral', pending_approval: 'warn', issued: 'info', confirmed: 'navy', partially_received: 'warn', received: 'ok', cancelled: 'neutral' },
  shipment: { planned: 'neutral', dispatched: 'info', in_transit: 'navy', delayed: 'warn', delivered: 'ok', failed: 'bad' },
  issue: { open: 'bad', in_progress: 'warn', resolved: 'ok' },
  priority: { low: 'neutral', medium: 'info', high: 'warn', urgent: 'bad' },
  approval: { pending: 'warn', approved: 'ok', rejected: 'bad' },
  task: { open: 'info', done: 'ok', cancelled: 'neutral' },
  batch: { in_progress: 'warn', packed: 'info', checked: 'ok' },
  feas: { feasible: 'ok', at_risk: 'warn', infeasible: 'bad', requested: 'info' },
  component: { complete: 'ok', awaiting_qc: 'info', incoming: 'navy', not_ordered: 'bad' },
};
const LABELS: Record<string, Record<string, string>> = {
  risk: { on_track: 'On track', at_risk: 'At risk', late: 'Late', none: 'Done' },
  component: { complete: 'Complete', awaiting_qc: 'Awaiting check', incoming: 'Incoming', not_ordered: 'Not ordered' },
  order: { closed: 'Payment closed', quality_check: 'Quality check', goods_received: 'Goods received' },
};
export function Status({ kind, value, label }: { kind: keyof typeof TONES; value: string | null | undefined; label?: string }) {
  if (!value) return <span className="muted">—</span>;
  return <Pill tone={TONES[kind]?.[value] ?? 'neutral'}>{label ?? LABELS[kind]?.[value] ?? fmtLabel(value)}</Pill>;
}

// ---------------------------------------------------------------- feedback
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="card-pad stack" role="status" aria-live="polite"><span className="sr-only">{label}</span>{[70, 90, 55].map((w) => <div key={w} className="skeleton" style={{ width: `${w}%` }} />)}</div>;
}
export function ErrorState({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  const status = (error as ApiError).status;
  if (status === 403) return <div className="callout info" role="alert"><Icon name="lock" /><div><h4>You don't have access to this</h4><p>Your role does not include it. Ask the founder/admin if you need it.</p></div></div>;
  const notFound = status === 404;
  return (
    <div className="callout bad" role="alert">
      <Icon name="alert" />
      <div><h4>{notFound ? 'Not found' : 'Could not load this'}</h4><p>{notFound ? 'It may have been removed, or you may not have access to it.' : error.message}</p>{onRetry && !notFound && <Button size="sm" onClick={onRetry}>Try again</Button>}</div>
    </div>
  );
}
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}{action && <div className="row" style={{ justifyContent: 'center', marginTop: '.75rem' }}>{action}</div>}</div>;
}
export function MissingList({ title, items, onTab }: { title: string; items: Missing[]; onTab?: (tab: string) => void }) {
  return (
    <div className="callout warn" role="alert">
      <Icon name="block" />
      <div><h4>{title}</h4>
        <ul>{items.map((m, i) => <li key={m.code + i}><strong>{m.message}.</strong> {m.fix} {m.tab && onTab && <button className="btn ghost sm" onClick={() => onTab(m.tab!)}>Go to {fmtLabel(m.tab)}</button>}</li>)}</ul>
      </div>
    </div>
  );
}
/** Top-of-form error: business-rule blocks, duplicates, stale edits and generic failures. */
export function FormError({ error, onTab, onConfirmDuplicate }: { error: ApiError | null; onTab?: (t: string) => void; onConfirmDuplicate?: () => void }) {
  if (!error) return null;
  if (error.code === 'blocked') return <MissingList title={error.message} items={error.missing} onTab={onTab} />;
  if (error.code === 'duplicate') return (
    <div className="callout warn" role="alert"><Icon name="alert" /><div><h4>{error.message}</h4><ul>{error.duplicates.map((d) => <li key={`${d.type}-${d.id}`}>{d.label} <span className="muted">({d.reason})</span></li>)}</ul>{onConfirmDuplicate && <Button size="sm" onClick={onConfirmDuplicate}>It is new — save anyway</Button>}</div></div>
  );
  if (error.code === 'stale') return <div className="callout warn" role="alert"><Icon name="alert" /><div><h4>This record changed while you were editing</h4><p>{error.message}</p></div></div>;
  if (error.code === 'validation' && Object.keys(error.fields).length) return <div className="callout bad" role="alert"><Icon name="alert" /><div>{error.message}</div></div>;
  return <div className="callout bad" role="alert"><Icon name="alert" /><div>{error.message}</div></div>;
}

// ---------------------------------------------------------------- modal (native <dialog>: focus trap + Esc built in)
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { d.showModal(); setTimeout(() => (d.querySelector('[autofocus], input, select, textarea, button:not(.modal-close)') as HTMLElement | null)?.focus(), 0); }
    if (!open && d.open) d.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="modal-head"><h2 id={titleId}>{title}</h2><button className="btn ghost icon modal-close" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </dialog>
  );
}
interface ConfirmOpts { title: string; body: ReactNode; confirm: string; tone?: 'danger' | 'primary' }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => done(false)} title={state?.title ?? ''} footer={<><Button onClick={() => done(false)}>Cancel</Button><Button variant={state?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => done(true)} autoFocus>{state?.confirm}</Button></>}>
        <div>{state?.body}</div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ---------------------------------------------------------------- tabs (ARIA, arrow keys)
export function Tabs({ tabs, active, onChange, label }: { tabs: { id: string; label: string; count?: number; alert?: boolean }[]; active: string; onChange: (id: string) => void; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const key = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (n == null) return;
    e.preventDefault(); const t = tabs[(n + tabs.length) % tabs.length]; onChange(t.id); refs.current[t.id]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} role="tab" id={`tab-${t.id}`} aria-selected={active === t.id} aria-controls={`panel-${t.id}`} tabIndex={active === t.id ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={(e) => key(e, i)}>
          {t.label}{t.count != null && t.count > 0 && <span className={`tab-count ${t.alert ? 'bad' : ''}`}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0}>{children}</div>;
}

// ---------------------------------------------------------------- misc
export function PageHeader({ title, sub, crumbs, actions }: { title: ReactNode; sub?: ReactNode; crumbs?: { to: string; label: string }[]; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && <nav className="breadcrumb" aria-label="Breadcrumb">{crumbs.map((c, i) => <span key={c.to}>{i > 0 && ' / '}<Link to={c.to}>{c.label}</Link></span>)}</nav>}
        <h1>{title}</h1>{sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pager" aria-label="Pagination">
      <span>{total === 0 ? 'No records' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} of ${total}`}</span>
      <span className="row"><Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">Previous</Button><span>Page {page} of {pages}</span><Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">Next</Button></span>
    </nav>
  );
}
export function Card({ title, actions, children, pad = true, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean; id?: string }) {
  return <section className="card" id={id} aria-label={typeof title === 'string' ? title : undefined}>{title && <div className="card-head"><h2>{title}</h2>{actions && <div className="row">{actions}</div>}</div>}<div className={pad ? 'card-body' : ''}>{children}</div></section>;
}
export function FileButton({ entity, id, kind = 'file', label = 'Upload file', onDone, sensitive, accept = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.csv,.txt' }: { entity: string; id: number; kind?: string; label?: string; onDone: (a: { id: number; filename: string }) => void; sensitive?: boolean; accept?: string }) {
  const ref = useRef<HTMLInputElement>(null); const toast = useToast(); const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={ref} type="file" hidden accept={accept} aria-hidden="true" tabIndex={-1} onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
        if (f.size > 10 * 1024 * 1024) { toast('File is larger than 10 MB.', 'bad'); return; }
        setBusy(true);
        try { const r = await upload(entity, id, f, { kind, ...(sensitive !== undefined ? { sensitive: String(sensitive) } : {}) }); toast(`Uploaded ${f.name}`); onDone(r); }
        catch (err) { toast((err as Error).message, 'bad'); } finally { setBusy(false); }
      }} />
      <Button size="sm" icon="up" loading={busy} onClick={() => ref.current?.click()}>{label}</Button>
    </>
  );
}
export const fieldErr = (e: ApiError | null, k: string) => (e?.code === 'validation' ? e.fields[k] : undefined);
export function Money({ v, cur }: { v: number | null | undefined; cur?: string }) { return <span className="num">{formatInr(v, cur)}</span>; }
