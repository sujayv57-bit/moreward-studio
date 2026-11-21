import type { DB } from './db.ts';
/** Insert a notification unless an identical one (same user + dedupe key) already exists. Returns true if created. */
export function notify(db: DB, now: string, userId: number | null | undefined, kind: string, title: string, body: string | null, link: string | null, dedupeKey: string): boolean {
  if (!userId) return false;
  const active = db.prepare('SELECT active FROM users WHERE id=?').get(userId) as { active: number } | undefined;
  if (!active || !active.active) return false;
  const r = db.prepare('INSERT OR IGNORE INTO notifications (user_id,kind,title,body,link,dedupe_key,created_at) VALUES (?,?,?,?,?,?,?)').run(userId, kind, title, body, link, dedupeKey, now);
  return r.changes > 0;
}
export function usersWithRole(db: DB, ...roles: string[]): number[] {
  const rows = db.prepare('SELECT id, roles FROM users WHERE active=1').all() as { id: number; roles: string }[];
  return rows.filter((u) => (JSON.parse(u.roles) as string[]).some((r) => roles.includes(r))).map((u) => u.id);
}
export function notifyRoles(db: DB, now: string, roles: string[], kind: string, title: string, body: string | null, link: string | null, dedupeKey: string) {
  for (const id of usersWithRole(db, ...roles)) notify(db, now, id, kind, title, body, link, dedupeKey);
}
