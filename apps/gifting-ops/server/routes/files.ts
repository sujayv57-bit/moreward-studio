import { Router, type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { assertEntityAccess } from '../access.ts';
import { audit } from '../audit.ts';
import { insert, many, one, run } from '../db.ts';
import { badRequest, forbidden, notFound } from '../http.ts';
import { makeUpload, verifyMagic } from '../files.ts';
import { can, canAny } from '../permissions.ts';
import { intParam, parse } from '../validate.ts';
import type { Ctx } from '../context.ts';

const r = Router();
const ENTITY_TYPES = ['order', 'lead', 'opportunity', 'quotation', 'company', 'vendor', 'purchase_order', 'shipment', 'goods_receipt'] as const;
const uploaders = new WeakMap<Ctx, ReturnType<typeof makeUpload>>();
const upload = (req: Request, res: Response, next: NextFunction) => {
  let u = uploaders.get(req.ctx); if (!u) { u = makeUpload(req.ctx); uploaders.set(req.ctx, u); }
  u.single('file')(req, res, next);
};
function orderIdFor(ctx: Ctx, type: string, id: number): number | null {
  if (type === 'order') return id;
  if (type === 'shipment') return one<{ order_id: number }>(ctx.db, 'SELECT order_id FROM shipments WHERE id=?', id)?.order_id ?? null;
  if (type === 'purchase_order') return one<{ order_id: number | null }>(ctx.db, 'SELECT order_id FROM purchase_orders WHERE id=?', id)?.order_id ?? null;
  return null;
}
function entityAccess(ctx: Ctx, req: Request, type: string, id: number) {
  if (type === 'quotation') { const q = one<{ opportunity_id: number }>(ctx.db, 'SELECT opportunity_id FROM quotations WHERE id=?', id); if (!q) throw notFound(); return assertEntityAccess(ctx, req.user, 'opportunity', q.opportunity_id); }
  if (type === 'goods_receipt') { const g = one<{ po_id: number }>(ctx.db, 'SELECT po_id FROM goods_receipts WHERE id=?', id); if (!g) throw notFound(); return assertEntityAccess(ctx, req.user, 'purchase_order', g.po_id); }
  return assertEntityAccess(ctx, req.user, type, id);
}
const sensitiveAllowed = (req: Request) => canAny(req.user, 'vendors.sensitive', 'finance.view');

r.post('/attachments', upload, (req, res) => {
  const ctx = req.ctx; const f = req.file;
  try {
    if (!f) throw badRequest('Choose a file to upload.');
    const v = parse(z.object({ entity_type: z.enum(ENTITY_TYPES), entity_id: z.coerce.number().int().positive(), kind: z.string().trim().max(40).default('file'), sensitive: z.enum(['true', 'false']).optional() }), req.body);
    entityAccess(ctx, req, v.entity_type, v.entity_id);
    if (v.entity_type === 'vendor' && !canAny(req.user, 'vendors.write', 'vendors.sensitive')) throw forbidden();
    if (!verifyMagic(f.path, f.originalname)) throw badRequest('The file contents do not match its extension.');
    const sensitive = v.sensitive === 'true' || (v.entity_type === 'vendor' && v.sensitive !== 'false');
    const orderId = orderIdFor(ctx, v.entity_type, v.entity_id);
    const id = insert(ctx.db, 'attachments', { entity_type: v.entity_type, entity_id: v.entity_id, order_id: orderId, kind: v.kind, filename: path.basename(f.originalname).slice(0, 200), stored_name: f.filename, mime: f.mimetype, size: f.size, sensitive: sensitive ? 1 : 0, uploaded_by: req.user.id, uploaded_at: ctx.now() });
    audit(ctx.db, ctx.now(), req.user.id, 'file', v.entity_type, v.entity_id, `File uploaded: ${f.originalname} (${v.kind})`, { orderId });
    res.status(201).json({ id, filename: f.originalname });
  } catch (e) {
    if (f) fs.rm(f.path, { force: true }, () => {});
    throw e;
  }
});
r.get('/attachments', (req, res) => {
  const ctx = req.ctx;
  const v = parse(z.object({ entity_type: z.enum(ENTITY_TYPES), entity_id: z.coerce.number().int().positive() }), req.query);
  entityAccess(ctx, req, v.entity_type, v.entity_id);
  const rows = v.entity_type === 'order'
    ? many(ctx.db, 'SELECT a.*, u.name uploaded_name FROM attachments a LEFT JOIN users u ON u.id=a.uploaded_by WHERE a.order_id=? AND a.archived_at IS NULL ORDER BY a.id DESC', v.entity_id)
    : many(ctx.db, 'SELECT a.*, u.name uploaded_name FROM attachments a LEFT JOIN users u ON u.id=a.uploaded_by WHERE a.entity_type=? AND a.entity_id=? AND a.archived_at IS NULL ORDER BY a.id DESC', v.entity_type, v.entity_id);
  res.json({ rows: rows.map(({ stored_name: _s, ...a }) => (a.sensitive && !sensitiveAllowed(req) ? { ...a, restricted: true } : a)) });
});
r.get('/attachments/:id/download', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const a = one(ctx.db, 'SELECT * FROM attachments WHERE id=? AND archived_at IS NULL', id); if (!a) throw notFound('File');
  entityAccess(ctx, req, a.entity_type, a.entity_id);
  if (a.sensitive && !sensitiveAllowed(req)) throw forbidden('This file is restricted to finance and the founder.');
  const file = path.join(ctx.uploadsDir, path.basename(a.stored_name));
  if (!fs.existsSync(file)) throw notFound('File (missing on disk — restore uploads from backup)');
  if (a.sensitive) audit(ctx.db, ctx.now(), req.user.id, 'download', a.entity_type, a.entity_id, `Restricted file downloaded: ${a.filename}`, { orderId: a.order_id });
  res.setHeader('Content-Type', a.mime);
  res.setHeader('Content-Disposition', `${a.mime.startsWith('image/') || a.mime === 'application/pdf' ? 'inline' : 'attachment'}; filename="${a.filename.replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(file).pipe(res);
});
r.post('/attachments/:id/archive', (req, res) => {
  const ctx = req.ctx; const id = intParam(req.params.id);
  const a = one(ctx.db, 'SELECT * FROM attachments WHERE id=? AND archived_at IS NULL', id); if (!a) throw notFound('File');
  entityAccess(ctx, req, a.entity_type, a.entity_id);
  if (a.uploaded_by !== req.user.id && !can(req.user, '*')) throw forbidden('Only the uploader or the founder can remove a file.');
  run(ctx.db, 'UPDATE attachments SET archived_at=? WHERE id=?', ctx.now(), id);
  audit(ctx.db, ctx.now(), req.user.id, 'archive', a.entity_type, a.entity_id, `File archived: ${a.filename} (kept on disk for audit)`, { orderId: a.order_id });
  res.json({ ok: true });
});

export default r;
