// Offline step 1 (owner request, Nov 2026): (1) everything the phone keeps about the signed-in person is listed in
// one place and removed together at logout / account deletion; (2) the haji's own pages (my leader, contract,
// payments, group, group terms) open without internet with the last saved copy and the time it was saved.
// Written first (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { reset } from './stubs/supabase.mjs';
import { USER_KEYS, USER_PREFIXES, DEVICE_KEYS, clearUserData, keepCopy, lastCopy, withCopy } from '../../src/lib/offlineStore.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const store = () => globalThis.__store;
const files = (d) => readdirSync(join(ROOT, d)).flatMap((n) => { const p = join(d, n); return statSync(join(ROOT, p)).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
const me = (id) => { globalThis.__sb.session = id ? { user: { id } } : null; };
beforeEach(() => { reset(); store().clear(); me('u1'); });

test('every key the app keeps on the phone is listed: about the person (removed at logout) or about the phone (kept)', () => {
  const found = new Set();
  for (const f of files('src')) for (const m of read(f).matchAll(/['"`]((?:ta|amihaji)\.[A-Za-z0-9_.-]+)(?=['"`]|\$\{)/g)) found.add(m[1]);
  assert.ok(found.size > 30, 'the scan finds the keys');
  const unknown = [...found].filter((k) => !USER_KEYS.includes(k) && !DEVICE_KEYS.includes(k) && !USER_PREFIXES.some((p) => k.startsWith(p)));
  assert.deepEqual(unknown, [], 'a new key must be put in one of the two lists in src/lib/offlineStore.ts');
  assert.deepEqual(USER_KEYS.filter((k) => DEVICE_KEYS.includes(k)), [], 'never in both lists');
});

test('private things are in the person list: typed emergency details, the SOS location choice, the photo check', () => {
  for (const k of ['ta.emergency.v1', 'ta.sos.location', 'ta.photoOk.v1', 'ta.profileCache.v1', 'ta.tripMoney.v1', 'ta.notifs.v1', 'ta.pendingReferral', 'ta.pendingTerms.v1'])
    assert.ok(USER_KEYS.includes(k), k);
  assert.ok(DEVICE_KEYS.includes('amihaji.lang'), 'the language stays');
});

test('logout removes everything about the person and keeps the phone settings', async () => {
  for (const k of [...USER_KEYS, ...DEVICE_KEYS, 'ta.docsCache.v1.u1', 'ta.off.v1.myLeader']) store().set(k, 'x');
  await clearUserData();
  const left = [...store().keys()].sort();
  assert.deepEqual(left, [...DEVICE_KEYS].sort());
});

test('logout and account deletion both use this one list (no hand-written lists any more)', () => {
  const p = read('src/screens/Placeholder.tsx');
  assert.ok(p.includes('clearUserData()'), 'logout calls clearUserData');
  assert.ok(!p.includes("'ta.profileCache.v1'"), 'the old hand-written list is gone');
  assert.ok(read('src/lib/account.ts').includes('clearUserData()'), 'account deletion calls clearUserData');
});

test('a saved copy is given back only to the same person', async () => {
  await keepCopy('myLeader', { a: 1 });
  const c = await lastCopy('myLeader');
  assert.deepEqual(c.data, { a: 1 });
  assert.ok(Math.abs(Date.now() - c.at) < 5000);
  me('u2');
  assert.equal(await lastCopy('myLeader'), null, 'another person on this phone sees nothing');
  me(null);
  assert.equal(await lastCopy('myLeader'), null, 'signed out: nothing');
  await keepCopy('x', { b: 2 });
  assert.equal([...store().keys()].filter((k) => k.includes('.x')).length, 0, 'signed out: nothing is saved');
});

test('withCopy: fresh data is saved; without internet the last copy comes back with its time', async () => {
  const fresh = await withCopy('myLeader', async () => ({ n: 1 }));
  assert.deepEqual(fresh, { data: { n: 1 }, offline: false, at: fresh.at });
  const old = await withCopy('myLeader', async () => { throw new TypeError('Network request failed'); });
  assert.equal(old.offline, true);
  assert.deepEqual(old.data, { n: 1 });
  assert.equal(old.at, fresh.at);
});

test('withCopy: no copy yet means the error is passed on; a missing database step is never hidden', async () => {
  await assert.rejects(withCopy('none', async () => { throw new TypeError('Network request failed'); }));
  await withCopy('g', async () => [1]);
  await assert.rejects(withCopy('g', async () => { throw { code: 'PGRST202', message: 'Could not find the function' }; }));
});

test('the haji pages use the saved copy and say how old it is', () => {
  for (const f of ['src/screens/MyLeaderScreen.tsx', 'src/components/PaymentBox.tsx', 'src/screens/GroupScreen.tsx']) {
    const s = read(f);
    assert.ok(s.includes('withCopy('), `${f} uses withCopy`);
    assert.ok(s.includes('<OfflineNote'), `${f} shows the offline note`);
  }
  assert.equal(read('src/screens/GroupScreen.tsx').split('withCopy(').length - 1, 2, 'the group list and the group terms');
  const n = read('src/components/OfflineNote.tsx');
  assert.ok(n.includes('শেষ হালনাগাদ') && n.includes('accessibilityLabel') && n.includes('📶'), 'icon + words + screen-reader label');
});
