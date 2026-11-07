// Offline step 2 (owner choice 7 Nov 2026): a "no internet" strip on every page (found out from the app's own server
// requests, no new package — owner's choice), and the leader and package lists work without internet. TDD.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isOffline, markOffline, markOnline, onNetChange, trackedFetch, netStripText } from '../../src/lib/netState.js';
import { leaderCopyName, filterLeadersLocal } from '../../src/lib/market.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, 'utf8');

test('the net state flips with what the server requests do, and tells listeners only on a change', () => {
  markOnline();
  const seen = []; const off = onNetChange((o) => seen.push(o));
  markOffline(); markOffline(); markOnline(); markOnline();
  off(); markOffline();
  assert.deepEqual(seen, [true, false], 'one call per real change, none after unsubscribing');
  assert.equal(isOffline(), true);
  markOnline();
});

test('trackedFetch: an answer from the server means online, a failed request means offline, a cancelled one changes nothing', async () => {
  markOnline();
  const failing = trackedFetch(() => Promise.reject(new TypeError('Network request failed')));
  await assert.rejects(failing('https://x'));
  assert.equal(isOffline(), true);
  const ok = trackedFetch(() => Promise.resolve({ status: 500 }));
  await ok('https://x');
  assert.equal(isOffline(), false, 'even an error answer means the server was reached');
  const ac = new AbortController(); ac.abort();
  await assert.rejects(trackedFetch(() => Promise.reject(new Error('aborted')))('https://x', { signal: ac.signal }));
  assert.equal(isOffline(), false, 'cancelled by the app itself');
});

test('the strip text is plain Bengali and says what still works', () => {
  const t = netStripText();
  assert.match(t, /ইন্টারনেট নেই/);
  assert.match(t, /আগের তথ্য/);
});

test('every server request goes through trackedFetch, and every page shows the strip', () => {
  assert.match(read('src/lib/supabase.ts'), /global:\s*\{\s*fetch:\s*trackedFetch\(/);
  const app = read('App.tsx');
  assert.match(app, /screenLayout=\{[^\n]*<NetStrip \/>/, 'the strip sits in the layout every page uses');
  const strip = read('src/components/NetStrip.tsx');
  assert.ok(strip.includes('accessibilityLiveRegion'), 'read aloud when it appears');
  assert.ok(strip.includes('/auth/v1/health'), 'checks again by itself while offline');
});

test('leader list: one saved copy per district (no search text), and the search works on that copy offline', () => {
  assert.equal(leaderCopyName('', ''), 'leaders.all');
  assert.equal(leaderCopyName('ঢাকা', ''), 'leaders.ঢাকা');
  assert.equal(leaderCopyName('ঢাকা', 'হারামাইন'), 'leaders.ঢাকা', 'the search text never makes new copies');
  const rows = [{ full_name: 'রহিম', agency_name: 'আল হারামাইন', leader_code: 'TL-00012', upazila: 'সাভার', union_name: null },
                { full_name: 'করিম', agency_name: 'মক্কা ট্রাভেল', leader_code: 'TL-00034', upazila: 'ধামরাই', union_name: 'কুল্লা' }];
  assert.deepEqual(filterLeadersLocal(rows, 'হারামাইন').map((r) => r.full_name), ['রহিম']);
  assert.deepEqual(filterLeadersLocal(rows, 'tl-00034').map((r) => r.full_name), ['করিম']);
  assert.deepEqual(filterLeadersLocal(rows, 'কুল্লা').map((r) => r.full_name), ['করিম']);
  assert.equal(filterLeadersLocal(rows, '  ').length, 2);
});

test('the leader and package pages use the saved copy and say so', () => {
  for (const f of ['src/screens/LeadersScreen.tsx', 'src/screens/OffersScreen.tsx']) {
    const s = read(f);
    assert.ok(s.includes('withCopy('), `${f} keeps a copy`);
    assert.ok(s.includes('<OfflineNote'), `${f} shows when the copy is from`);
  }
  assert.match(read('src/screens/OffersScreen.tsx'), /withCopy\(`offers\.\$\{k\}`/);
});
