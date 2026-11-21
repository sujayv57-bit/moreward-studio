import { Router } from 'express';
import { z } from 'zod';
import { COOKIE, authenticate, createSession, destroySession, verifyPassword } from '../auth.ts';
import { one, run } from '../db.ts';
import { HttpError } from '../http.ts';
import { parse } from '../validate.ts';
import { ROLES, allPermissions } from '../permissions.ts';
import { audit } from '../audit.ts';

const r = Router();
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

r.post('/login', (req, res) => {
  if (req.get('x-requested-with') !== 'gifting-ops') throw new HttpError(403, 'csrf', 'Missing request header.');
  const ctx = req.ctx;
  const { email, password } = parse(z.object({ email: z.string().trim().min(1, 'Enter your email'), password: z.string().min(1, 'Enter your password') }), req.body);
  const u = one<{ id: number; password_hash: string; active: number; failed_logins: number; locked_until: string | null }>(ctx.db, 'SELECT id,password_hash,active,failed_logins,locked_until FROM users WHERE email=?', email);
  const generic = new HttpError(401, 'bad_credentials', 'Email or password is incorrect.');
  if (!u || !u.active) throw generic;
  if (u.locked_until && u.locked_until > ctx.now()) throw new HttpError(429, 'locked', `Too many failed attempts. Try again after ${new Date(u.locked_until).toLocaleTimeString('en-IN')}.`);
  if (!verifyPassword(password, u.password_hash)) {
    const fails = u.failed_logins + 1;
    const lock = fails >= MAX_FAILS ? new Date(Date.parse(ctx.now()) + LOCK_MINUTES * 60_000).toISOString() : null;
    run(ctx.db, 'UPDATE users SET failed_logins=?, locked_until=? WHERE id=?', lock ? 0 : fails, lock, u.id);
    throw generic;
  }
  run(ctx.db, 'UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=?', u.id);
  const s = createSession(ctx, u.id);
  audit(ctx.db, ctx.now(), u.id, 'login', 'user', u.id, 'Signed in');
  res.cookie(COOKIE, s.token, { httpOnly: true, sameSite: 'lax', secure: ctx.secureCookies ?? ctx.production, expires: s.expires, path: '/' });
  res.json({ ok: true });
});

r.post('/logout', (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) destroySession(req.ctx, token);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

r.get('/me', authenticate, (req, res) => {
  const ctx = req.ctx;
  res.json({
    user: req.user, permissions: allPermissions(req.user), roleLabels: ROLES,
    providers: ctx.providers,
    unread: (one<{ n: number }>(ctx.db, 'SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', req.user.id)!).n,
  });
});

export default r;
