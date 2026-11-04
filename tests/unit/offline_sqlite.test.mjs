// Offline with SQLite (owner choice, Nov 2026): group announcements and the help chat (plus the leader's ready answers)
// are kept in a small database on the phone, so they can be read in Makkah/Mina without internet. Written first (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reset } from './stubs/supabase.mjs';
import { resetDb, setFailOpen } from './stubs/expo-sqlite.mjs';
import * as L from '../../src/lib/localdb.js';
import { groupAnnouncements } from '../../src/lib/groups.js';
import { myHelpMessagesOffline, helpThreadOffline, faqListOffline } from '../../src/lib/help.js';

beforeEach(() => { reset(); resetDb(); setFailOpen(false); L._forget(); });
const ann = (id, g, t) => ({ id, group_id: g, body: `ঘোষণা ${id}`, created_at: t });
const msg = (id, t, mine = false) => ({ id, sender_role: mine ? 'haji' : 'leader', sender_name: 'X', body: `বার্তা ${id}`, created_at: t, mine });
const offline = { message: 'Failed to fetch' };

// ---------- the database itself ----------
test('announcements: saved, newest first, only the groups asked for, no duplicates', async () => {
  await L.saveAnnouncements([ann('a', 'g1', '2026-11-01T10:00:00Z'), ann('b', 'g1', '2026-11-02T10:00:00Z'), ann('c', 'g2', '2026-11-03T10:00:00Z')]);
  await L.saveAnnouncements([ann('b', 'g1', '2026-11-02T10:00:00Z')]);
  assert.deepEqual((await L.loadAnnouncements(['g1'])).map((r) => r.id), ['b', 'a']);
  assert.deepEqual((await L.loadAnnouncements(['g1', 'g2'])).map((r) => r.id), ['c', 'b', 'a']);
  assert.deepEqual(await L.loadAnnouncements([]), []);
});
test('announcements: a removed one disappears from the phone too (the server list for a group is the truth)', async () => {
  await L.saveAnnouncements([ann('a', 'g1', '2026-11-01T10:00:00Z'), ann('b', 'g1', '2026-11-02T10:00:00Z')]);
  await L.replaceAnnouncements(['g1'], [ann('b', 'g1', '2026-11-02T10:00:00Z')]);
  assert.deepEqual((await L.loadAnnouncements(['g1'])).map((r) => r.id), ['b']);
});
test('chat: a whole thread is kept per conversation, in time order', async () => {
  await L.saveChat('my:g1', [msg('m2', '2026-11-02T10:00:00Z'), msg('m1', '2026-11-01T10:00:00Z', true)]);
  await L.saveChat('my:g2', [msg('x', '2026-11-05T10:00:00Z')]);
  const r = await L.loadChat('my:g1');
  assert.deepEqual(r.map((m) => m.id), ['m1', 'm2']);
  assert.equal(r[0].mine, true); assert.equal(r[0].body, 'বার্তা m1');
  await L.saveChat('my:g1', [msg('m3', '2026-11-03T10:00:00Z')]);
  assert.deepEqual((await L.loadChat('my:g1')).map((m) => m.id), ['m3'], 'a newer copy of the thread replaces the old one');
});
test('ready answers (FAQ) are kept per group', async () => {
  await L.saveList('faq:g1', [{ id: 'f1', question: 'হোটেল কোথায়?', answer: 'আজিজিয়া' }]);
  assert.equal((await L.loadList('faq:g1'))[0].answer, 'আজিজিয়া');
  assert.equal(await L.loadList('faq:none'), null);
});
test('logout clears everything on the phone', async () => {
  await L.saveAnnouncements([ann('a', 'g1', '2026-11-01T10:00:00Z')]);
  await L.saveChat('my:g1', [msg('m1', '2026-11-01T10:00:00Z')]);
  await L.saveList('faq:g1', [{ id: 'f1' }]);
  await L.clearLocalDb();
  assert.deepEqual(await L.loadAnnouncements(['g1']), []);
  assert.deepEqual(await L.loadChat('my:g1'), []);
  assert.equal(await L.loadList('faq:g1'), null);
});
test('if the phone database cannot open, nothing breaks (works like before, just no offline copy)', async () => {
  setFailOpen(true); L._forget();
  await L.saveAnnouncements([ann('a', 'g1', '2026-11-01T10:00:00Z')]);
  assert.deepEqual(await L.loadAnnouncements(['g1']), []);
  assert.deepEqual(await L.loadChat('my:g1'), []);
});

// ---------- the app using it ----------
test('announcements: online → shown and saved; offline later → the saved copy, marked offline', async () => {
  globalThis.__sb = { from: () => ({ data: [ann('a', 'g1', '2026-11-01T10:00:00Z')], error: null }) };
  assert.deepEqual(await groupAnnouncements(['g1']), { rows: [ann('a', 'g1', '2026-11-01T10:00:00Z')], offline: false });
  globalThis.__sb = { from: () => ({ data: null, error: offline }) };
  const r = await groupAnnouncements(['g1']);
  assert.equal(r.offline, true); assert.deepEqual(r.rows.map((x) => x.id), ['a']);
});
test('help chat (haji): online → saved; offline → old messages, marked offline; nothing saved yet → the error', async () => {
  globalThis.__sb = { rpc: (n) => ({ data: n === 'help_my_messages' ? [msg('m1', '2026-11-01T10:00:00Z', true)] : null, error: null }) };
  assert.deepEqual(await myHelpMessagesOffline('g1'), { rows: [msg('m1', '2026-11-01T10:00:00Z', true)], offline: false });
  globalThis.__sb = { rpc: () => ({ data: null, error: offline }) };
  const r = await myHelpMessagesOffline('g1');
  assert.equal(r.offline, true); assert.equal(r.rows[0].id, 'm1');
  await assert.rejects(myHelpMessagesOffline('g-other'));
});
test('help chat (leader/khadem thread) and FAQ work the same way', async () => {
  globalThis.__sb = { rpc: (n) => ({ data: n === 'help_thread' ? [msg('t1', '2026-11-01T10:00:00Z')] : n === 'faq_list' ? [{ id: 'f1', question: 'q', answer: 'a' }] : null, error: null }) };
  await helpThreadOffline('th1'); await faqListOffline('g1');
  globalThis.__sb = { rpc: () => ({ data: null, error: offline }) };
  assert.equal((await helpThreadOffline('th1')).rows[0].id, 't1');
  assert.equal((await faqListOffline('g1')).rows[0].answer, 'a');
});
test('a real server refusal (no permission) is never hidden behind old copies', async () => {
  globalThis.__sb = { rpc: (n) => ({ data: [msg('m1', '2026-11-01T10:00:00Z')], error: null }) };
  await myHelpMessagesOffline('g1');
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: '42501', message: 'not allowed' } }) };
  await assert.rejects(myHelpMessagesOffline('g1'));
});
test('screens use the offline versions and say when they show saved messages; logout clears the phone database', () => {
  const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  const chat = read('src/screens/HelpChatScreen.tsx');
  assert.ok(chat.includes('myHelpMessagesOffline(') && chat.includes('faqListOffline(') && chat.includes('ইন্টারনেট নেই'));
  const inbox = read('src/screens/HelpInboxScreen.tsx');
  assert.ok(inbox.includes('helpThreadOffline(') && inbox.includes('ইন্টারনেট নেই'));
  for (const f of ['src/screens/Placeholder.tsx', 'src/screens/Suspended.tsx', 'src/lib/account.ts']) assert.ok(read(f).includes('clearLocalDb()'), f);
});
// Found while building this: without internet the group page stopped at "my groups" and never reached the saved
// announcements. The list of the haji's groups is kept on the phone too.
import { myGroupsOffline } from '../../src/lib/groups.js';
test('my groups: online → saved; offline → saved list, marked offline; never saved → the error', async () => {
  const g = { group_id: 'g1', name: 'দল', status: 'active', leader_name: 'L', leader_phone: '017' };
  globalThis.__sb = { rpc: (n) => ({ data: n === 'my_groups' ? [g] : null, error: null }) };
  assert.deepEqual(await myGroupsOffline(), { rows: [g], offline: false });
  globalThis.__sb = { rpc: () => ({ data: null, error: offline }) };
  assert.deepEqual(await myGroupsOffline(), { rows: [g], offline: true });
  await L.clearLocalDb();
  await assert.rejects(myGroupsOffline());
});
test('group page and help chat start from the saved group list when offline', () => {
  const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  assert.ok(read('src/screens/GroupScreen.tsx').includes('myGroupsOffline()'));
  assert.ok(read('src/screens/HelpChatScreen.tsx').includes('myGroupsOffline()'));
});
// Staff side (leader/khadem): the inbox list is kept too, so a conversation already on the phone can be read offline.
import { helpInboxOffline } from '../../src/lib/help.js';
test('one shared helper: saved list or the error; inbox uses it', async () => {
  const fresh = await L.savedOr('x', async () => [{ id: 1 }]);
  assert.deepEqual(fresh, { rows: [{ id: 1 }], offline: false });
  assert.deepEqual(await L.savedOr('x', async () => { throw offline; }), { rows: [{ id: 1 }], offline: true });
  await assert.rejects(L.savedOr('never', async () => { throw offline; }));
  await assert.rejects(L.savedOr('x', async () => { throw { code: '42501', message: 'not allowed' }; }), 'a refusal is not hidden');
  globalThis.__sb = { rpc: (n) => ({ data: n === 'help_inbox' ? [{ thread_id: 't', status: 'open', last_at: '2026-11-01T10:00:00Z' }] : null, error: null }) };
  await helpInboxOffline('g1');
  globalThis.__sb = { rpc: () => ({ data: null, error: offline }) };
  assert.equal((await helpInboxOffline('g1')).rows[0].thread_id, 't');
});
test('offline network errors are recognised; server refusals are not', () => {
  assert.equal(L.isOffline({ message: 'TypeError: Network request failed' }), true);
  assert.equal(L.isOffline({ message: 'Failed to fetch' }), true);
  assert.equal(L.isOffline(new Error('timeout')), true);
  assert.equal(L.isOffline({ code: '42501', message: 'not allowed' }), false);
  assert.equal(L.isOffline({ code: 'PGRST202', message: 'Could not find the function' }), false);
});
