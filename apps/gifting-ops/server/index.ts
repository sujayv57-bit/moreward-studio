import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { migrate, openDb } from './db.ts';
import { loadProviders, providerFlags } from './integrations.ts';
import { runAutomations } from './rules/automations.ts';
import type { Ctx } from './context.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const production = env.NODE_ENV === 'production';
const db = openDb(path.resolve(root, env.DATABASE_PATH ?? 'data/gifting-ops.db'));
const applied = migrate(db);
if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);

const ctx: Ctx = {
  db, now: () => new Date().toISOString(),
  uploadsDir: path.resolve(root, env.UPLOADS_DIR ?? 'uploads'),
  maxUploadBytes: Number(env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024,
  production, secureCookies: env.COOKIE_SECURE ? env.COOKIE_SECURE !== 'false' : production,
  providers: providerFlags(loadProviders(env)),
};
const app = createApp(ctx, { staticDir: production ? path.resolve(root, 'dist') : undefined });
const port = Number(env.PORT ?? 3001);
app.listen(port, () => console.log(`Gifting Ops API on http://localhost:${port}${production ? ' (serving built UI)' : ''}`));

// Scheduled checks (overdue follow-ups, vendor delays, balances…). Deduplicated, so frequent runs are safe.
const every = Number(env.AUTOMATION_INTERVAL_MINUTES ?? 15) * 60_000;
const tick = () => { try { const r = runAutomations(ctx); if (r.created) console.log(`[automations] ${r.created} notification(s)`, r.byRule); } catch (e) { console.error('[automations] failed', e); } };
setTimeout(tick, 5_000);
setInterval(tick, every);
