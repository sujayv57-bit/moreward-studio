// Thin API client: JSON, CSRF header, idempotency keys for POSTs, typed errors.
export interface Missing { code: string; message: string; fix?: string; tab?: string }
export class ApiError extends Error {
  status: number; code: string; details: any;
  constructor(status: number, code: string, message: string, details?: any) { super(message); this.status = status; this.code = code; this.details = details; }
  get fields(): Record<string, string> { return this.details?.fields ?? {}; }
  get missing(): Missing[] { return this.details?.missing ?? []; }
  get duplicates(): { type?: string; id: number; label: string; reason: string; status?: string }[] { return this.details?.duplicates ?? []; }
}
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

export async function api<T = any>(method: string, url: string, body?: unknown, opts: { idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-requested-with': 'gifting-ops' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  if (method === 'POST') headers['idempotency-key'] = opts.idempotencyKey ?? uuid();
  let res: Response;
  try { res = await fetch('/api' + url, { method, headers, body: payload, credentials: 'same-origin' }); }
  catch { throw new ApiError(0, 'network', 'Could not reach the server. Check your connection — nothing was saved.'); }
  if (res.status === 401 && !url.startsWith('/auth/login')) onUnauthorized();
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const e = (data as any)?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}
export const get = <T = any>(url: string) => api<T>('GET', url);
export const post = <T = any>(url: string, body: unknown = {}, key?: string) => api<T>('POST', url, body, { idempotencyKey: key });
export const put = <T = any>(url: string, body: unknown) => api<T>('PUT', url, body);
export const patch = <T = any>(url: string, body: unknown) => api<T>('PATCH', url, body);
export async function upload(entity_type: string, entity_id: number, file: File, extra: Record<string, string> = {}) {
  const fd = new FormData(); fd.set('entity_type', entity_type); fd.set('entity_id', String(entity_id));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  fd.set('file', file);
  return api<{ id: number; filename: string }>('POST', '/attachments', fd);
}
