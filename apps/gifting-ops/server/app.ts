import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import type { Ctx } from './context.ts';
import { authenticate } from './auth.ts';
import { HttpError } from './http.ts';
import { one, run } from './db.ts';
import authRoutes from './routes/auth.ts';
import salesRoutes from './routes/sales.ts';
import quoteRoutes from './routes/quotes.ts';
import orderRoutes from './routes/orders.ts';
import vendorRoutes from './routes/vendors.ts';
import procurementRoutes from './routes/procurement.ts';
import fulfilmentRoutes from './routes/fulfilment.ts';
import financeRoutes from './routes/finance.ts';
import homeRoutes from './routes/home.ts';
import adminRoutes from './routes/admin.ts';
import fileRoutes from './routes/files.ts';

export function createApp(ctx: Ctx, opts: { staticDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    req.ctx = ctx;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => { one(ctx.db, 'SELECT 1'); res.json({ ok: true }); });
  app.use('/api/auth', authRoutes);

  const api = express.Router();
  api.use(authenticate);
  api.use(idempotency);
  api.use(salesRoutes, quoteRoutes, orderRoutes, vendorRoutes, procurementRoutes, fulfilmentRoutes, financeRoutes, homeRoutes, adminRoutes, fileRoutes);
  app.use('/api', api);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found', 'Unknown API route.')));

  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(opts.staticDir!, 'index.html')));
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${Math.round(ctx.maxUploadBytes / 1048576)} MB).` : err.message;
      return res.status(400).json({ error: { code: 'upload', message: msg } });
    }
    const e = err as { type?: string; message?: string };
    if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'invalid', message: 'Request body is not valid JSON.' } });
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ error: { code: 'server', message: 'Something went wrong on the server. Nothing was saved; please try again.' } });
  });
  return app;
}

/**
 * Duplicate-submission guard. The client sends an Idempotency-Key with each create/action;
 * a repeat (double click, retry after a dropped connection) returns the first response instead of acting twice.
 */
function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.get('idempotency-key');
  if (req.method !== 'POST' || !key) return next();
  const ctx = req.ctx;
  const prev = one<{ status: number; body: string }>(ctx.db, 'SELECT status, body FROM idempotency_keys WHERE key=? AND user_id=?', key, req.user.id);
  if (prev) return res.status(prev.status).type('json').send(prev.body);
  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode < 500) run(ctx.db, 'INSERT OR IGNORE INTO idempotency_keys (key,user_id,status,body,created_at) VALUES (?,?,?,?,?)', key, req.user.id, res.statusCode, JSON.stringify(body), ctx.now());
    return json(body);
  };
  next();
}
