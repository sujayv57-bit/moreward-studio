import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { get, post, ApiError } from './api.ts';
import { AuthProvider, ToastProvider, useAuth } from './state.tsx';
import { Button, ConfirmProvider, Icon, Loading, TextField } from './ui.tsx';

const Home = lazy(() => import('./pages/Home.tsx'));
const Notifications = lazy(() => import('./pages/Notifications.tsx'));
const Sales = lazy(() => import('./pages/Sales.tsx'));
const Quotation = lazy(() => import('./pages/Quotation.tsx'));
const Orders = lazy(() => import('./pages/Orders.tsx'));
const OrderWorkspace = lazy(() => import('./pages/OrderWorkspace.tsx'));
const Procurement = lazy(() => import('./pages/Procurement.tsx'));
const Vendor = lazy(() => import('./pages/Vendor.tsx'));
const PurchaseOrder = lazy(() => import('./pages/PurchaseOrder.tsx'));
const Fulfilment = lazy(() => import('./pages/Fulfilment.tsx'));
const Finance = lazy(() => import('./pages/Finance.tsx'));
const Reports = lazy(() => import('./pages/Reports.tsx'));
const Settings = lazy(() => import('./pages/Settings.tsx'));
const Tasks = lazy(() => import('./pages/Tasks.tsx'));

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider><AuthProvider><ConfirmProvider><Gate /></ConfirmProvider></AuthProvider></ToastProvider>
    </BrowserRouter>
  );
}

function Gate() {
  const { me, loading } = useAuth();
  if (loading) return <div className="login"><div className="card"><Loading label="Starting…" /></div></div>;
  if (!me) return <Login />;
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/approvals" element={<Tasks view="approvals" />} />
          <Route path="/sales/quotations/:id" element={<Quotation />} />
          <Route path="/sales/*" element={<Sales />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderWorkspace />} />
          <Route path="/procurement/vendors/:id" element={<Vendor />} />
          <Route path="/procurement/purchase-orders/:id" element={<PurchaseOrder />} />
          <Route path="/procurement/*" element={<Procurement />} />
          <Route path="/fulfilment/*" element={<Fulfilment />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/reports/*" element={<Reports />} />
          <Route path="/settings/*" element={<Settings />} />
          <Route path="*" element={<div className="card card-pad"><h1>Page not found</h1><p><Link to="/">Go to Home</Link></p></div>} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

// ---------------------------------------------------------------- shell + navigation (permission-aware)
interface NavItem { to: string; label: string; icon: string; show: boolean; end?: boolean }
function Shell({ children }: { children: ReactNode }) {
  const { me, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  // After in-app navigation, move focus to the new content (screen readers announce it). Not on first load,
  // so the skip link stays the first Tab stop.
  const firstLoad = useRef(true);
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return; }
    document.getElementById('main')?.focus({ preventScroll: true }); window.scrollTo(0, 0);
  }, [loc.pathname]);
  const groups: { title?: string; items: NavItem[] }[] = [
    { items: [
      { to: '/', label: 'Home', icon: 'home', show: true, end: true },
      { to: '/tasks', label: 'My tasks', icon: 'check', show: true },
      { to: '/approvals', label: 'Approvals', icon: 'lock', show: true },
    ] },
    { title: 'Sales', items: [
      { to: '/sales/leads', label: 'Leads', icon: 'user', show: can('sales.write', 'sales.all') },
      { to: '/sales/opportunities', label: 'Opportunities', icon: 'arrow', show: can('sales.write', 'sales.all', 'feasibility.write') },
      { to: '/sales/companies', label: 'Companies', icon: 'home', show: can('sales.write', 'sales.all', 'orders.view_all') },
    ] },
    { title: 'Operations', items: [
      { to: '/orders', label: 'Orders', icon: 'box', show: true },
      { to: '/procurement', label: 'Procurement', icon: 'cart', show: can('procurement.write', 'receiving.write'), end: true },
      { to: '/procurement/vendors', label: 'Vendors', icon: 'user', show: can('vendors.view', 'vendors.view.basic') },
      { to: '/procurement/purchase-orders', label: 'Purchase orders', icon: 'file', show: can('procurement.write', 'receiving.write', 'finance.view') },
      { to: '/procurement/receiving', label: 'Receiving', icon: 'download', show: can('receiving.write') },
      { to: '/fulfilment/packing', label: 'Packing', icon: 'box', show: can('packing.write', 'procurement.all') },
      { to: '/fulfilment/dispatch', label: 'Dispatch', icon: 'truck', show: can('shipments.write', 'procurement.all') },
      { to: '/fulfilment/issues', label: 'Issues', icon: 'alert', show: true },
    ] },
    { title: 'Management', items: [
      { to: '/finance', label: 'Finance', icon: 'rupee', show: can('finance.view') },
      { to: '/reports', label: 'Reports', icon: 'chart', show: can('reports.view', 'reports.sales') },
      { to: '/settings', label: 'Settings', icon: 'cog', show: true },
    ] },
  ];
  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand"><span className="brand-mark" aria-hidden="true">G</span><span>Gifting Ops<small>Lead to delivery</small></span></div>
        <nav className="nav">
          {groups.map((g, gi) => {
            const items = g.items.filter((i) => i.show);
            if (!items.length) return null;
            return (
              <div key={gi} className={g.title ? 'nav-group' : ''} role="group" aria-label={g.title ?? 'General'}>
                {g.title && <div className="nav-group-title">{g.title}</div>}
                {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end}><Icon name={i.icon} />{i.label}</NavLink>)}
              </div>
            );
          })}
        </nav>
        <div style={{ marginTop: 'auto' }} className="small">
          <div style={{ color: '#fff', fontWeight: 600 }}>{me!.user.name}</div>
          <div>{me!.user.roles.map((r) => me!.roleLabels[r]).join(', ')}</div>
          <button className="btn ghost sm" style={{ color: 'var(--nav-text)', paddingLeft: 0, marginTop: '.4rem' }} onClick={logout}>Sign out</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <GlobalSearch />
          <Link to="/notifications" className="btn ghost" aria-label={`Notifications, ${me!.unread} unread`}>
            <Icon name="bell" />{me!.unread > 0 && <span className="pill bad" style={{ padding: '0 .4rem' }}>{me!.unread}</span>}
          </Link>
        </header>
        <main id="main" className="content" tabIndex={-1} style={{ outline: 'none' }}>{children}</main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState(''); const [results, setResults] = useState<{ type: string; id: number; title: string; subtitle: string; link: string }[] | null>(null);
  const [active, setActive] = useState(0); const [error, setError] = useState<string | null>(null);
  const nav = useNavigate(); const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(() => get(`/search?q=${encodeURIComponent(q.trim())}`).then((r) => { setResults(r.results); setActive(0); setError(null); }).catch((e) => setError(e.message)), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setResults(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea,select')) { e.preventDefault(); box.current?.querySelector('input')?.focus(); } };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);
  const go = (link: string) => { setQ(''); setResults(null); nav(link); };
  return (
    <div className="search" ref={box} role="search">
      <Icon name="search" />
      <label htmlFor="gsearch" className="sr-only">Search customers, leads, orders, vendors and purchase orders</label>
      <input id="gsearch" value={q} placeholder="Search orders, customers, vendors, POs…  ( / )" autoComplete="off" role="combobox" aria-expanded={!!results} aria-controls="gsearch-list" aria-activedescendant={results?.length ? `gs-${active}` : undefined}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (!results?.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter') { e.preventDefault(); go(results[active].link); }
          if (e.key === 'Escape') setResults(null);
        }} />
      {(results || error) && (
        <div className="search-results" id="gsearch-list" role="listbox" aria-label="Search results">
          {error && <div className="muted card-pad">{error}</div>}
          {results?.length === 0 && <div className="muted card-pad">No matching records you can access.</div>}
          {results?.map((r, i) => (
            <div key={`${r.type}-${r.id}`} id={`gs-${i}`} role="option" tabIndex={-1} aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); go(r.link); }}>
              <span className="search-type">{r.type}</span><span><strong>{r.title}</strong><br /><span className="muted small">{r.subtitle}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DEMO = [
  ['founder@example.com', 'Founder / admin'], ['priya.sales@example.com', 'Sales manager'], ['rohan.sales@example.com', 'Sales executive'],
  ['vikram.procurement@example.com', 'Procurement manager'], ['anjali.procurement@example.com', 'Procurement executive'], ['meera.warehouse@example.com', 'Packing / quality'],
  ['imran.dispatch@example.com', 'Dispatch'], ['kavya.finance@example.com', 'Finance'],
];
function Login() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError(null);
    try { await post('/auth/login', { email, password }); await refresh(); nav('/'); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Sign-in failed.'); } finally { setBusy(false); }
  };
  const showDemo = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';
  return (
    <main className="login">
      <div className="card stack">
        <div className="brand" style={{ color: 'var(--navy-900)', borderColor: 'var(--border)' }}><span className="brand-mark" aria-hidden="true">G</span><span>Gifting Ops<small style={{ color: 'var(--text-muted)' }}>Internal operations</small></span></div>
        <h1>Sign in</h1>
        <form onSubmit={submit} className="stack" noValidate>
          <TextField label="Work email" type="email" value={email} onChange={setEmail} autoComplete="username" required autoFocus />
          <TextField label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
          {error && <div className="callout bad" role="alert"><Icon name="alert" />{error}</div>}
          <Button type="submit" variant="primary" loading={busy}>Sign in</Button>
        </form>
        {showDemo && (
          <details className="demo-accounts">
            <summary>Demo accounts (local review only)</summary>
            <p className="muted">Password for all: <code>demo-password-2026</code></p>
            {DEMO.map(([e, r]) => <div key={e}><button type="button" onClick={() => { setEmail(e); setPassword('demo-password-2026'); }}>{r} — {e}</button></div>)}
          </details>
        )}
      </div>
    </main>
  );
}
export { Navigate };
