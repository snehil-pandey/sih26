import { DatabaseSync } from 'node:sqlite';
// Thin wrapper over Node's built-in SQLite (no third-party dependency, works offline).
export function openDb(file) {
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  const cache = new Map();
  const st = q => { let s = cache.get(q); if (!s) { s = d.prepare(q); cache.set(q, s); } return s; };
  return {
    raw: d,
    all: (q, ...a) => st(q).all(...a).map(r => ({ ...r })),
    get: (q, ...a) => { const r = st(q).get(...a); return r ? { ...r } : undefined; },
    run: (q, ...a) => st(q).run(...a),
    exec: q => d.exec(q),
    tx(fn) { d.exec('BEGIN IMMEDIATE'); try { const r = fn(); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; } },
    close: () => d.close(),
  };
}
