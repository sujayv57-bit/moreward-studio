import type { z } from 'zod';
import { HttpError, badRequest } from './http.ts';
import { one } from './db.ts';
import type { Ctx } from './context.ts';

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const i of r.error.issues) { const k = i.path.join('.') || '_'; if (!fields[k]) fields[k] = i.message; }
    throw new HttpError(400, 'validation', 'Please fix the highlighted fields.', { fields });
  }
  return r.data;
}
export function intParam(v: unknown, label = 'id'): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw badRequest(`Invalid ${label}`);
  return n;
}
/** Optimistic concurrency: reject a stale edit and tell the client to reload. */
export function checkVersion(ctx: Ctx, table: string, id: number, expected: number | undefined) {
  if (expected === undefined) return;
  const row = one<{ version: number }>(ctx.db, `SELECT version FROM ${table} WHERE id=?`, id);
  if (row && row.version !== expected) {
    throw new HttpError(409, 'stale', 'Someone else changed this record after you opened it. Your edits are still in the form; reload to see their changes, then re-apply yours.', { current_version: row.version });
  }
}
export function assertUser(ctx: Ctx, id: number | null | undefined, label = 'person') {
  if (id == null) return;
  if (!one(ctx.db, 'SELECT id FROM users WHERE id=? AND active=1', id)) throw new HttpError(400, 'validation', `Choose an active ${label}.`, { fields: {} });
}
