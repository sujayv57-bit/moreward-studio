import type { Ctx } from '../context.ts';
import { insert, many, one, run } from '../db.ts';
import { notify } from '../notify.ts';
import { can, permsOf, type AuthUser, type Role } from '../permissions.ts';
import { audit } from '../audit.ts';

export type ApprovalRow = { id: number; kind: string; entity_type: string; entity_id: number; order_id: number | null; title: string; detail: string | null; requested_by: number; required_permission: string; status: string };
type Handler = (ctx: Ctx, a: ApprovalRow, approved: boolean, user: AuthUser, note: string | null) => void;
const handlers = new Map<string, Handler>();
/** Each module registers what happens when its approval kind is approved or rejected. */
export function onDecision(kind: string, h: Handler) { handlers.set(kind, h); }

/** 'approvals.admin' is satisfied only by '*' (founder/admin). */
export function canDecide(user: AuthUser, perm: string) { return can(user, perm); }

export function requestApproval(ctx: Ctx, user: AuthUser, a: { kind: string; entity_type: string; entity_id: number; order_id?: number | null; title: string; detail?: string | null; required_permission: string; link: string }) {
  const existing = one<{ id: number }>(ctx.db, "SELECT id FROM approvals WHERE kind=? AND entity_type=? AND entity_id=? AND status='pending'", a.kind, a.entity_type, a.entity_id);
  if (existing) return existing.id;
  const id = insert(ctx.db, 'approvals', { kind: a.kind, entity_type: a.entity_type, entity_id: a.entity_id, order_id: a.order_id ?? null, title: a.title, detail: a.detail ?? null, requested_by: user.id, required_permission: a.required_permission, requested_at: ctx.now() });
  for (const u of many<{ id: number; roles: string }>(ctx.db, 'SELECT id, roles FROM users WHERE active=1')) {
    const p = permsOf(JSON.parse(u.roles) as Role[]);
    if ((p.has('*') || p.has(a.required_permission)) && u.id !== user.id) notify(ctx.db, ctx.now(), u.id, 'approval_needed', `Approval needed: ${a.title}`, a.detail ?? null, a.link, `approval:${id}`);
  }
  audit(ctx.db, ctx.now(), user.id, 'approval_requested', a.entity_type, a.entity_id, `Approval requested: ${a.title}`, { orderId: a.order_id });
  return id;
}

export function decide(ctx: Ctx, user: AuthUser, id: number, approved: boolean, note: string | null) {
  const a = one<ApprovalRow>(ctx.db, 'SELECT * FROM approvals WHERE id=?', id);
  if (!a) return { error: 'not_found' as const };
  if (a.status !== 'pending') return { error: 'decided' as const };
  if (!canDecide(user, a.required_permission)) return { error: 'forbidden' as const };
  if (a.requested_by === user.id && !can(user, '*')) return { error: 'self' as const };
  run(ctx.db, 'UPDATE approvals SET status=?, decided_by=?, decided_at=?, decision_note=? WHERE id=?', approved ? 'approved' : 'rejected', user.id, ctx.now(), note, id);
  handlers.get(a.kind)?.(ctx, a, approved, user, note);
  audit(ctx.db, ctx.now(), user.id, approved ? 'approved' : 'rejected', a.entity_type, a.entity_id, `${approved ? 'Approved' : 'Rejected'}: ${a.title}${note ? ` — ${note}` : ''}`, { orderId: a.order_id });
  notify(ctx.db, ctx.now(), a.requested_by, 'approval_decided', `${approved ? 'Approved' : 'Rejected'}: ${a.title}`, note, null, `approval_decided:${id}`);
  return { ok: true as const };
}
