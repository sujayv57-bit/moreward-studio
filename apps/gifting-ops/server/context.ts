import type { DB } from './db.ts';
import type { AuthUser } from './permissions.ts';

export interface Ctx {
  db: DB;
  /** Injectable clock (ISO string) so tests can control time. */
  now: () => string;
  uploadsDir: string;
  maxUploadBytes: number;
  production: boolean;
  /** Send the session cookie only over HTTPS. Defaults to `production`; set COOKIE_SECURE=false only for local HTTP testing. */
  secureCookies?: boolean;
  /** Which outbound providers have real credentials. None configured → manual workflows only. */
  providers: { email: boolean; whatsapp: boolean; courier: boolean; payments: boolean; accounting: boolean };
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user: AuthUser; ctx: Ctx } }
}
export const today = (ctx: Ctx) => ctx.now().slice(0, 10);
export function addDays(date: string, days: number): string {
  const d = new Date(date.slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
}
