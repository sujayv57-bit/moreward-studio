import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, get, post, setUnauthorizedHandler } from './api.ts';

// ---------------------------------------------------------------- auth
export interface Me { user: { id: number; name: string; email: string; roles: string[] }; permissions: string[]; roleLabels: Record<string, string>; providers: Record<string, boolean>; unread: number }
interface AuthCtx { me: Me | null; loading: boolean; can: (...perms: string[]) => boolean; hasRole: (...r: string[]) => boolean; refresh: () => Promise<void>; logout: () => Promise<void>; setUnread: (n: number) => void }
const Auth = createContext<AuthCtx>(null as unknown as AuthCtx);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setMe(await get<Me>('/auth/me')); } catch { setMe(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { setUnauthorizedHandler(() => setMe(null)); refresh(); }, [refresh]);
  // Keep the notification badge fresh without reloading pages.
  useEffect(() => {
    if (!me) return;
    const t = setInterval(() => { get<Me>('/auth/me').then((m) => setMe((cur) => (cur && cur.unread !== m.unread ? { ...cur, unread: m.unread } : cur))).catch(() => {}); }, 60_000);
    return () => clearInterval(t);
  }, [me?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo<AuthCtx>(() => ({
    me, loading, refresh,
    can: (...perms) => !!me && (me.permissions.includes('*') || perms.some((p) => me.permissions.includes(p))),
    hasRole: (...r) => !!me && me.user.roles.some((x) => r.includes(x)),
    logout: async () => { await post('/auth/logout').catch(() => {}); setMe(null); },
    setUnread: (n) => setMe((cur) => (cur ? { ...cur, unread: n } : cur)),
  }), [me, loading, refresh]);
  return <Auth.Provider value={value}>{children}</Auth.Provider>;
}
export const useAuth = () => useContext(Auth);

// ---------------------------------------------------------------- toasts
interface Toast { id: number; text: string; tone: 'ok' | 'bad' }
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'bad' ? 8000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.tone === 'bad' ? 'bad' : ''}`}>{t.tone === 'ok' ? '✓' : '!'} <span>{t.text}</span></div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------- data fetching
export function useApi<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    const mine = ++seq.current;
    setLoading(true);
    try { const d = await get<T>(url); if (mine === seq.current) { setData(d); setError(null); } }
    catch (e) { if (mine === seq.current) setError(e instanceof ApiError ? e : new ApiError(0, 'error', String(e))); }
    finally { if (mine === seq.current) setLoading(false); }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

/** Run a mutation once at a time: disables re-submits, shows toasts, keeps the error for forms. */
export function useAction() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const busy = useRef(false);
  const run = useCallback(async <R,>(fn: () => Promise<R>, success?: string): Promise<R | undefined> => {
    if (busy.current) return undefined;
    busy.current = true; setPending(true); setError(null);
    try { const r = await fn(); if (success) toast(success); return r; }
    catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'error', String(e));
      setError(err);
      if (!['validation', 'blocked', 'duplicate', 'stale'].includes(err.code)) toast(err.message, 'bad');
      return undefined;
    } finally { busy.current = false; setPending(false); }
  }, [toast]);
  return { run, pending, error, setError };
}
