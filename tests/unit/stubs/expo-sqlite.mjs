// Test stand-in for expo-sqlite: the same async API, backed by Node's own SQLite (a real database in memory),
// so the app's SQL is really run in the tests. resetDb() gives each test a fresh, empty database.
import { DatabaseSync } from 'node:sqlite';

let dbs = new Map();
export function resetDb() { for (const d of dbs.values()) d.close(); dbs = new Map(); }
export function openCount() { return dbs.size; }
export let failOpen = false;
export function setFailOpen(v) { failOpen = v; }

export async function openDatabaseAsync(name) {
  if (failOpen) throw new Error('cannot open database');
  if (!dbs.has(name)) dbs.set(name, new DatabaseSync(':memory:'));
  const d = dbs.get(name);
  return {
    execAsync: async (sql) => { d.exec(sql); },
    runAsync: async (sql, ...args) => { const p = Array.isArray(args[0]) ? args[0] : args; const r = d.prepare(sql).run(...p); return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) }; },
    getAllAsync: async (sql, ...args) => { const p = Array.isArray(args[0]) ? args[0] : args; return d.prepare(sql).all(...p).map((r) => ({ ...r })); },
    getFirstAsync: async (sql, ...args) => { const p = Array.isArray(args[0]) ? args[0] : args; const r = d.prepare(sql).get(...p); return r ? { ...r } : null; },
    withTransactionAsync: async (fn) => { d.exec('BEGIN'); try { await fn(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; } },
  };
}
