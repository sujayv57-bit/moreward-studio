import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DB = Database.Database;
const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, '../migrations');

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}
export function migrate(db: DB): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => (r as { name: string }).name));
  const applied: string[] = [];
  for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    db.transaction(() => { db.exec(sql); db.prepare('INSERT INTO _migrations VALUES (?,?)').run(f, new Date().toISOString()); })();
    applied.push(f);
  }
  return applied;
}
export const tx = <T>(db: DB, fn: () => T): T => db.transaction(fn)();
export function nextNumber(db: DB, name: string, prefix: string, year: number): string {
  const key = `${name}-${year}`;
  db.prepare('INSERT INTO counters (name,value) VALUES (?,1) ON CONFLICT(name) DO UPDATE SET value=value+1').run(key);
  const v = (db.prepare('SELECT value FROM counters WHERE name=?').get(key) as { value: number }).value;
  return `${prefix}-${String(year).slice(-2)}-${String(v).padStart(4, '0')}`;
}

// Small typed query helpers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const one = <T = any>(db: DB, sql: string, ...p: unknown[]): T | undefined => db.prepare(sql).get(...p) as T | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const many = <T = any>(db: DB, sql: string, ...p: unknown[]): T[] => db.prepare(sql).all(...p) as T[];
export const run = (db: DB, sql: string, ...p: unknown[]) => db.prepare(sql).run(...p);
export const insert = (db: DB, table: string, row: Record<string, unknown>): number => {
  const keys = Object.keys(row);
  const r = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => row[k] === undefined ? null : row[k]));
  return Number(r.lastInsertRowid);
};
export const update = (db: DB, table: string, id: number, row: Record<string, unknown>) => {
  const keys = Object.keys(row);
  if (!keys.length) return;
  db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`).run(...keys.map((k) => row[k] === undefined ? null : row[k]), id);
};
