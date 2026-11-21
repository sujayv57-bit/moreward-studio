import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, openDb } from './db.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.resolve(root, process.env.DATABASE_PATH ?? 'data/gifting-ops.db');
const uploadsDir = path.resolve(root, process.env.UPLOADS_DIR ?? 'uploads');
const cmd = process.argv[2];
const refuseInProd = () => { if (process.env.NODE_ENV === 'production') { console.error('Refusing to load demo data with NODE_ENV=production.'); process.exit(1); } };

async function main() {
  switch (cmd) {
    case 'migrate': { const db = openDb(dbPath); console.log('Applied:', migrate(db).join(', ') || 'nothing (up to date)'); break; }
    case 'seed': {
      refuseInProd();
      const db = openDb(dbPath); migrate(db);
      const { seedDemo } = await import('./seed.ts');
      await seedDemo(db, uploadsDir);
      console.log(`Demo workspace loaded into ${dbPath}. Sign in with any demo account (see README), password: demo-password-2026`);
      break;
    }
    case 'reset': {
      refuseInProd();
      for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(f, { force: true });
      const db = openDb(dbPath); migrate(db);
      if (process.argv.includes('--empty')) {
        const { seedBase } = await import('./seed-base.ts');
        seedBase(db, new Date().toISOString());
        console.log('Empty workspace with demo users only.');
      } else {
        const { seedDemo } = await import('./seed.ts');
        await seedDemo(db, uploadsDir);
        console.log('Database reset and demo workspace loaded.');
      }
      break;
    }
    case 'backup': {
      // Consistent online backup (safe while the app is running), plus a copy of uploaded files.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dir = path.resolve(root, process.env.BACKUP_DIR ?? 'data/backups', stamp);
      fs.mkdirSync(dir, { recursive: true });
      const db = openDb(dbPath);
      await db.backup(path.join(dir, 'gifting-ops.db'));
      if (fs.existsSync(uploadsDir)) fs.cpSync(uploadsDir, path.join(dir, 'uploads'), { recursive: true });
      console.log(`Backup written to ${dir}`);
      break;
    }
    case 'create-admin': {
      const [, , , email, name, password] = process.argv;
      if (!email || !name || !password || password.length < 10) { console.error('Usage: tsx server/cli.ts create-admin <email> "<name>" <password (10+ chars)>'); process.exit(1); }
      const { hashPassword } = await import('./auth.ts');
      const db = openDb(dbPath); migrate(db);
      db.prepare('INSERT INTO users (name,email,roles,password_hash,created_at) VALUES (?,?,?,?,?)').run(name, email, JSON.stringify(['admin']), hashPassword(password), new Date().toISOString());
      const { seedBase: _s } = await import('./seed-base.ts'); void _s;
      console.log(`Admin ${email} created.`);
      break;
    }
    default:
      console.log('Commands: migrate | seed | reset [--empty] | backup | create-admin <email> "<name>" <password>');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
