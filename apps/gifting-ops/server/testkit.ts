// In-process API client used by the seed script and the automated tests. It drives the real HTTP API.
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from './app.ts';
import { migrate, openDb } from './db.ts';
import type { Ctx } from './context.ts';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export interface Clock { now: string; set(iso: string): void; addDays(n: number): void }
export function makeClock(start: string): Clock {
  return { now: start, set(iso) { this.now = iso; }, addDays(n) { const d = new Date(this.now); d.setUTCDate(d.getUTCDate() + n); this.now = d.toISOString(); } };
}
export async function startTestServer(opts: { dbFile?: string; clock?: Clock } = {}) {
  const db = openDb(opts.dbFile ?? ':memory:');
  migrate(db);
  const clock = opts.clock ?? makeClock(new Date().toISOString());
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gops-up-'));
  const ctx: Ctx = { db, now: () => clock.now, uploadsDir, maxUploadBytes: 2 * 1024 * 1024, production: false, providers: { email: false, whatsapp: false, courier: false, payments: false, accounting: false } };
  const app = createApp(ctx);
  const server: Server = await new Promise((res) => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { ctx, db, clock, base, close: () => new Promise<void>((r) => server.close(() => r())) };
}
export class ApiError extends Error {
  constructor(public status: number, public body: any) { super(`${status} ${body?.error?.code}: ${body?.error?.message}${body?.error?.details ? ' ' + JSON.stringify(body.error.details) : ''}`); }
}
export function client(base: string) {
  let cookie = '';
  const call = async (method: string, url: string, body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { 'x-requested-with': 'gifting-ops', ...extra };
    if (cookie) headers.cookie = cookie;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body; else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    if (method === 'POST' && !headers['idempotency-key']) headers['idempotency-key'] = crypto.randomUUID();
    const res = await fetch(base + url, { method, headers, body: payload });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const ct = res.headers.get('content-type') ?? '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  };
  const ok = async (method: string, url: string, body?: unknown, extra?: Record<string, string>) => {
    const r = await call(method, url, body, extra);
    if (r.status >= 400) throw new ApiError(r.status, r.data);
    return r.data;
  };
  return {
    raw: call,
    login: (email: string, password = 'demo-password-2026') => ok('POST', '/api/auth/login', { email, password }),
    get: (u: string) => ok('GET', u), post: (u: string, b: unknown = {}, h?: Record<string, string>) => ok('POST', u, b, h),
    put: (u: string, b: unknown) => ok('PUT', u, b), patch: (u: string, b: unknown) => ok('PATCH', u, b),
    upload: (entity_type: string, entity_id: number, name: string, content: Buffer, mime: string, extra: Record<string, string> = {}) => {
      const fd = new FormData(); fd.set('entity_type', entity_type); fd.set('entity_id', String(entity_id));
      for (const [k, v] of Object.entries(extra)) fd.set(k, v);
      fd.set('file', new Blob([new Uint8Array(content)], { type: mime }), name);
      return ok('POST', '/api/attachments', fd);
    },
  };
}
export type Client = ReturnType<typeof client>;
/** A minimal valid PDF for tests and demo attachments. */
export const tinyPdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
