import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Ctx } from './context.ts';
import { HttpError, forbidden } from './http.ts';
import { can, type AuthUser, type Role } from './permissions.ts';
import { one, run } from './db.ts';

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const SESSION_HOURS = 12;
export const COOKIE = 'gops_sid';

export function createSession(ctx: Ctx, userId: number): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.parse(ctx.now()) + SESSION_HOURS * 3600_000);
  run(ctx.db, 'INSERT INTO sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)', sha(token), userId, expires.toISOString(), ctx.now());
  return { token, expires };
}
export function destroySession(ctx: Ctx, token: string) { run(ctx.db, 'DELETE FROM sessions WHERE id=?', sha(token)); }

export function loadUser(ctx: Ctx, token: string | undefined): AuthUser | null {
  if (!token) return null;
  const row = one<{ user_id: number; expires_at: string }>(ctx.db, 'SELECT user_id, expires_at FROM sessions WHERE id=?', sha(token));
  if (!row || row.expires_at < ctx.now()) return null;
  const u = one<{ id: number; name: string; email: string; roles: string; active: number }>(ctx.db, 'SELECT id,name,email,roles,active FROM users WHERE id=?', row.user_id);
  if (!u || !u.active) return null;
  return { id: u.id, name: u.name, email: u.email, roles: JSON.parse(u.roles) as Role[] };
}

/** Attach req.user or reject with 401. CSRF: every state-changing request must carry a custom header, which cross-site forms cannot set. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-requested-with') !== 'gifting-ops') {
    return next(new HttpError(403, 'csrf', 'Missing request header.'));
  }
  const user = loadUser(req.ctx, req.cookies?.[COOKIE]);
  if (!user) return next(new HttpError(401, 'unauthenticated', 'Please sign in.'));
  req.user = user;
  next();
}
export const requirePerm = (...perms: string[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (perms.some((p) => can(req.user, p))) return next();
  next(forbidden());
};
