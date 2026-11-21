import { Router } from 'express';
import { z } from 'zod';
import { userInput } from '../../shared/schemas.ts';
import { audit } from '../audit.ts';
import { hashPassword, requirePerm } from '../auth.ts';
import { insert, many, one, run, tx, update } from '../db.ts';
import { HttpError, badRequest, forbidden, notFound } from '../http.ts';
import { ROLES, type Role } from '../permissions.ts';
import { pageParams, qstr } from '../rules/common.ts';
import { STAGES } from '../rules/orders.ts';
import { DEFAULT_SETTINGS, allSettings, setSetting } from '../settings.ts';
import { intParam, parse } from '../validate.ts';
import { EXPORT_KINDS } from './finance.ts';

const r = Router();
const isRole = (x: string): x is Role => x in ROLES;

r.get('/meta', (req, res) => {
  res.json({ roles: ROLES, stages: STAGES, settings: allSettings(req.ctx.db), exports: EXPORT_KINDS, providers: req.ctx.providers,
    categories: many(req.ctx.db, 'SELECT id, name, active FROM categories ORDER BY name') });
});

// ---------------------------------------------------------------- users
r.get('/admin/users', requirePerm('*'), (req, res) => {
  res.json({ rows: many(req.ctx.db, 'SELECT id, name, email, roles, active, created_at, locked_until FROM users ORDER BY active DESC, name').map((u) => ({ ...u, roles: JSON.parse(u.roles) })) });
});
r.post('/admin/users', requirePerm('*'), (req, res) => {
  const ctx = req.ctx; const v = parse(userInput.refine((x) => !!x.password, { message: 'Set an initial password', path: ['password'] }), req.body);
  if (!v.roles.every(isRole)) throw badRequest('Unknown role.');
  if (one(ctx.db, 'SELECT id FROM users WHERE email=?', v.email)) throw new HttpError(409, 'conflict', 'A user with this email already exists.');
  const id = insert(ctx.db, 'users', { name: v.name, email: v.email, roles: JSON.stringify(v.roles), password_hash: hashPassword(v.password!), active: 1, created_at: ctx.now() });
  audit(ctx.db, ctx.now(), req.user.id, 'create', 'user', id, `User ${v.name} created with roles ${v.roles.join(', ')}`);
  res.status(201).json({ id });
});
r.patch('/admin/users/:id', requirePerm('*'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const u = one(ctx.db, 'SELECT * FROM users WHERE id=?', id); if (!u) throw notFound('User');
  const v = parse(userInput.partial(), req.body);
  if (v.roles && !v.roles.every(isRole)) throw badRequest('Unknown role.');
  const admins = many(ctx.db, 'SELECT id, roles FROM users WHERE active=1').filter((x) => JSON.parse(x.roles).includes('admin'));
  const losesAdmin = (v.roles && !v.roles.includes('admin')) || v.active === false;
  if (losesAdmin && JSON.parse(u.roles).includes('admin') && admins.length <= 1) throw badRequest('There must always be at least one active founder/admin.');
  if (id === req.user.id && v.active === false) throw forbidden('You cannot deactivate yourself.');
  if (v.email && v.email.toLowerCase() !== u.email.toLowerCase() && one(ctx.db, 'SELECT id FROM users WHERE email=? AND id<>?', v.email, id)) throw new HttpError(409, 'conflict', 'Email already in use.');
  tx(ctx.db, () => {
    update(ctx.db, 'users', id, { ...(v.name ? { name: v.name } : {}), ...(v.email ? { email: v.email } : {}), ...(v.roles ? { roles: JSON.stringify(v.roles) } : {}), ...(v.active !== undefined ? { active: v.active ? 1 : 0 } : {}), ...(v.password ? { password_hash: hashPassword(v.password), failed_logins: 0, locked_until: null } : {}) });
    if (v.active === false || v.password) run(ctx.db, 'DELETE FROM sessions WHERE user_id=?', id);
    const what = [v.roles && `roles → ${v.roles.join(', ')}`, v.active !== undefined && (v.active ? 'reactivated' : 'deactivated'), v.password && 'password reset', v.name && 'name changed', v.email && 'email changed'].filter(Boolean).join('; ');
    audit(ctx.db, ctx.now(), req.user.id, 'update', 'user', id, `User ${u.name}: ${what}`);
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- settings
r.get('/settings', (req, res) => { res.json({ values: allSettings(req.ctx.db), defaults: DEFAULT_SETTINGS }); });
r.put('/settings/:key', requirePerm('*'), (req, res) => {
  const ctx = req.ctx; const key = String(req.params.key);
  if (!(key in DEFAULT_SETTINGS)) throw notFound('Setting');
  const def = DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] as unknown;
  const { value } = req.body ?? {};
  const sameShape = (a: unknown, b: unknown): boolean => {
    if (Array.isArray(a)) return Array.isArray(b) && (a.length === 0 || b.every((x) => sameShape(a[0], x)));
    if (a && typeof a === 'object') return !!b && typeof b === 'object' && !Array.isArray(b) && Object.keys(a).every((k) => k in (b as object) && sameShape((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
    return typeof a === typeof b;
  };
  if (!sameShape(def, value)) throw new HttpError(400, 'validation', 'Value has the wrong format for this setting.', { fields: { value: 'Wrong format' } });
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new HttpError(400, 'validation', 'Enter a whole, non-negative number.', { fields: { value: 'Whole number ≥ 0' } });
  if (key === 'approval.margin_floor_bp' && (value as number) > (allSettings(ctx.db)['approval.margin_min_bp'] as number)) throw badRequest('The founder floor must be at or below the policy minimum.');
  if (key === 'approval.vendor_approver_roles' && !(value as string[]).every(isRole)) throw badRequest('Unknown role.');
  const before = allSettings(ctx.db)[key];
  setSetting(ctx.db, key, value, req.user.id, ctx.now());
  audit(ctx.db, ctx.now(), req.user.id, 'setting', 'setting', null, `Setting ${key}: ${JSON.stringify(before)} → ${JSON.stringify(value)}`);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- lookups and templates
r.post('/categories', requirePerm('*', 'vendors.approve'), (req, res) => {
  const ctx = req.ctx; const { name } = parse(z.object({ name: z.string().trim().min(2, 'Name is required') }), req.body);
  if (one(ctx.db, 'SELECT id FROM categories WHERE name=?', name)) throw new HttpError(409, 'conflict', 'Category already exists.');
  const id = insert(ctx.db, 'categories', { name });
  audit(ctx.db, ctx.now(), req.user.id, 'create', 'category', id, `Category “${name}” added`);
  res.status(201).json({ id });
});
r.patch('/categories/:id', requirePerm('*', 'vendors.approve'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const v = parse(z.object({ name: z.string().trim().min(2).optional(), active: z.boolean().optional() }), req.body);
  update(ctx.db, 'categories', id, { ...(v.name ? { name: v.name } : {}), ...(v.active !== undefined ? { active: v.active ? 1 : 0 } : {}) });
  audit(ctx.db, ctx.now(), req.user.id, 'update', 'category', id, `Category updated`);
  res.json({ ok: true });
});
r.get('/checklist-templates', (req, res) => { res.json({ rows: many(req.ctx.db, 'SELECT * FROM checklist_templates ORDER BY kind, name').map((t) => ({ ...t, items: JSON.parse(t.items) })) }); });
const templateInput = z.object({ name: z.string().trim().min(2, 'Name is required'), kind: z.enum(['packing', 'receiving', 'dispatch']), items: z.array(z.string().trim().min(2)).min(1, 'Add at least one step'), active: z.boolean().optional() });
r.post('/checklist-templates', requirePerm('*', 'procurement.all'), (req, res) => {
  const ctx = req.ctx; const v = parse(templateInput, req.body);
  const id = insert(ctx.db, 'checklist_templates', { name: v.name, kind: v.kind, items: JSON.stringify(v.items), active: v.active === false ? 0 : 1 });
  audit(ctx.db, ctx.now(), req.user.id, 'create', 'checklist_template', id, `Checklist template “${v.name}” created`);
  res.status(201).json({ id });
});
r.put('/checklist-templates/:id', requirePerm('*', 'procurement.all'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const v = parse(templateInput, req.body);
  update(ctx.db, 'checklist_templates', id, { name: v.name, kind: v.kind, items: JSON.stringify(v.items), active: v.active === false ? 0 : 1 });
  audit(ctx.db, ctx.now(), req.user.id, 'update', 'checklist_template', id, `Checklist template “${v.name}” updated (applies to new batches only)`);
  res.json({ ok: true });
});
const msgInput = z.object({ name: z.string().trim().min(2), key: z.string().trim().regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers and _ only'), channel: z.enum(['email', 'whatsapp']), party: z.enum(['customer', 'vendor']), subject: z.string().trim().default(''), body: z.string().trim().min(5, 'Write the message') });
r.post('/message-templates', requirePerm('*', 'sales.all'), (req, res) => {
  const ctx = req.ctx; const v = parse(msgInput, req.body);
  if (one(ctx.db, 'SELECT id FROM message_templates WHERE key=?', v.key)) throw new HttpError(409, 'conflict', 'Key already used.');
  const id = insert(ctx.db, 'message_templates', v);
  audit(ctx.db, ctx.now(), req.user.id, 'create', 'message_template', id, `Message template “${v.name}” created`);
  res.status(201).json({ id });
});
r.put('/message-templates/:id', requirePerm('*', 'sales.all'), (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id); const v = parse(msgInput, req.body);
  update(ctx.db, 'message_templates', id, v);
  audit(ctx.db, ctx.now(), req.user.id, 'update', 'message_template', id, `Message template “${v.name}” updated`);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- audit log
r.get('/audit', requirePerm('*'), (req, res) => {
  const ctx = req.ctx; const { limit, offset, page, pageSize } = pageParams(req);
  const where: string[] = ['1=1']; const p: unknown[] = [];
  const q = qstr(req.query.q); if (q) { where.push('a.summary LIKE ?'); p.push(`%${q}%`); }
  const type = qstr(req.query.entity_type); if (type) { where.push('a.entity_type=?'); p.push(type); }
  const user = qstr(req.query.user); if (user) { where.push('a.user_id=?'); p.push(Number(user)); }
  const action = qstr(req.query.action); if (action) { where.push('a.action=?'); p.push(action); }
  const w = where.join(' AND ');
  res.json({
    rows: many(ctx.db, `SELECT a.*, u.name user_name FROM audit_events a LEFT JOIN users u ON u.id=a.user_id WHERE ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`, ...p, limit, offset),
    total: one<{ n: number }>(ctx.db, `SELECT COUNT(*) n FROM audit_events a WHERE ${w}`, ...p)!.n, page, pageSize,
    entity_types: many(ctx.db, 'SELECT DISTINCT entity_type FROM audit_events ORDER BY 1').map((x) => x.entity_type),
  });
});

export default r;
