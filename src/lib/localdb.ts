// A small SQLite database on the phone (free, inside the phone, nothing on the server) so group announcements, the help
// chat and the leader's ready answers can be read without internet, e.g. in Makkah or Mina (owner, Nov 2026).
// Only copies of what the server already showed this account; logout clears it all (clearLocalDb).
// If the database can't open, every function quietly does nothing: the app works as before, just without the copy.
import * as SQLite from 'expo-sqlite';

type Db = Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>;
export type LocalAnnouncement = { id: string; group_id: string; body: string; created_at: string };
type Stamped = { id: string; created_at: string };

const SCHEMA = `
create table if not exists announcements (id text primary key, group_id text not null, body text not null, created_at text not null);
create index if not exists announcements_group on announcements (group_id, created_at);
create table if not exists chat (convo text not null, id text not null, created_at text not null, row text not null, primary key (convo, id));
create table if not exists lists (name text primary key, rows text not null, saved_at text not null);`;
const KEEP_PER_GROUP = 300;   // oldest announcements beyond this are dropped from the phone

let opening: Promise<Db | null> | null = null;
const db = (): Promise<Db | null> => (opening ??= SQLite.openDatabaseAsync('amihaji-local.db')
  .then(async (d) => { await d.execAsync(SCHEMA); return d; })
  .catch(() => null));
export const _forget = () => { opening = null; };   // tests: open again

async function safely<T>(fallback: T, fn: (d: Db) => Promise<T>): Promise<T> {
  try { const d = await db(); return d ? await fn(d) : fallback; } catch (e) { return fallback; }
}

export const saveAnnouncements = (rows: readonly LocalAnnouncement[]) => safely(undefined, async (d) => {
  await d.withTransactionAsync(async () => {
    for (const r of rows) await d.runAsync('insert or replace into announcements (id, group_id, body, created_at) values (?, ?, ?, ?)', [r.id, r.group_id, r.body, r.created_at]);
    for (const g of new Set(rows.map((r) => r.group_id))) {
      await d.runAsync('delete from announcements where group_id = ? and id not in (select id from announcements where group_id = ? order by created_at desc limit ?)', [g, g, KEEP_PER_GROUP]);
    }
  });
});
// The server's list for these groups is the truth: what it no longer has (a deleted announcement) is removed here too.
// complete = the server sent the whole list; otherwise only the time span it covered is replaced (older ones stay).
export const replaceAnnouncements = (groupIds: readonly string[], rows: readonly LocalAnnouncement[], complete = true) => safely(undefined, async (d) => {
  if (!groupIds.length) return;
  const oldest = complete || !rows.length ? '' : rows.reduce((m, r) => (r.created_at < m ? r.created_at : m), rows[0].created_at);
  await d.withTransactionAsync(async () => {
    const q = groupIds.map(() => '?').join(',');
    await d.runAsync(`delete from announcements where group_id in (${q}) and created_at >= ?`, [...groupIds, oldest]);
  });
  await saveAnnouncements(rows);
});
export const loadAnnouncements = (groupIds: readonly string[], limit = 200) => safely<LocalAnnouncement[]>([], async (d) => {
  if (!groupIds.length) return [];
  const q = groupIds.map(() => '?').join(',');
  return d.getAllAsync<LocalAnnouncement>(`select id, group_id, body, created_at from announcements where group_id in (${q}) order by created_at desc limit ?`, [...groupIds, limit]);
});

// One conversation ("my:<group>" for a haji, "thread:<id>" for leader/khadem) is replaced by the newest copy.
export const saveChat = <T extends Stamped>(convo: string, rows: readonly T[]) => safely(undefined, async (d) => {
  await d.withTransactionAsync(async () => {
    await d.runAsync('delete from chat where convo = ?', [convo]);
    for (const r of rows) await d.runAsync('insert into chat (convo, id, created_at, row) values (?, ?, ?, ?)', [convo, r.id, r.created_at, JSON.stringify(r)]);
  });
});
export const loadChat = <T>(convo: string) => safely<T[]>([], async (d) => {
  const rs = await d.getAllAsync<{ row: string }>('select row from chat where convo = ? order by created_at asc', [convo]);
  return rs.map((r) => JSON.parse(r.row) as T);
});

// Small lists kept whole (the leader's ready answers): null = never saved.
export const saveList = <T>(name: string, rows: readonly T[]) => safely(undefined, async (d) => {
  await d.runAsync('insert or replace into lists (name, rows, saved_at) values (?, ?, ?)', [name, JSON.stringify(rows), new Date().toISOString()]);
});
export const loadList = <T>(name: string) => safely<T[] | null>(null, async (d) => {
  const r = await d.getFirstAsync<{ rows: string }>('select rows from lists where name = ?', [name]);
  return r ? (JSON.parse(r.rows) as T[]) : null;
});

// Fetch from the server and keep a copy; without internet use the copy (marked offline). A real refusal is never hidden.
export async function savedOr<T>(name: string, fetch: () => Promise<T[]>): Promise<{ rows: T[]; offline: boolean }> {
  try { const rows = await fetch(); await saveList(name, rows); return { rows, offline: false }; } catch (e) {
    if (!isOffline(e)) throw e;
    const rows = await loadList<T>(name);
    if (!rows) throw e;
    return { rows, offline: true };
  }
}

export const clearLocalDb = () => safely(undefined, async (d) => {
  await d.execAsync('delete from announcements; delete from chat; delete from lists;');
});

// No answer from the server at all (no internet, timeout) – unlike a real refusal, which must be shown, not hidden.
export function isOffline(e: unknown): boolean {
  const o = (e && typeof e === 'object' ? e : {}) as { message?: unknown; code?: unknown; status?: unknown };
  if (o.code && String(o.code) !== '') return false;
  return /fetch|network|timed? ?out|offline|abort/i.test(String(o.message ?? e ?? ''));
}
