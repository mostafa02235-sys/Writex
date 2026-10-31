// SQLite storage (node:sqlite, built into Node 22+) with numbered SQL migrations.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  for (const f of files) {
    if (done.has(f)) continue;
    db.exec('BEGIN');
    try {
      db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(f, Date.now());
      db.exec('COMMIT');
      applied.push(f);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${f} failed: ${e.message}`);
    }
  }
  return applied;
}
