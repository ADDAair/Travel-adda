// 032 (owner choice 2 + 3, Nov 2026) — written before the code (TDD).
//  2: hajis' Home shows a rounded total once the admin's minimum is reached;  3: a leader sees his own numbers.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reset } from './stubs/supabase.mjs';
import { hajiCountPublic, hajiCountText, leaderMyStats, cleanCountMin } from '../../src/lib/counts.js';

beforeEach(() => { reset(); });
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

// ---------- 2: the line on Home ----------
test('Home line: Bengali digits with thousands separator and a plus (it is a rounded number)', () => {
  assert.equal(hajiCountText(12000), '১২,০০০+ হাজী "আমি হাজী" অ্যাপ ব্যবহার করছেন');
  assert.equal(hajiCountText(1200), '১,২০০+ হাজী "আমি হাজী" অ্যাপ ব্যবহার করছেন');
});
test('Home line: nothing for no number / zero', () => {
  assert.equal(hajiCountText(null), null);
  assert.equal(hajiCountText(0), null);
});
test('reads the rounded total; hidden (null) while the server says so', async () => {
  globalThis.__sb = { rpc: (fn) => ({ data: fn === 'haji_count_public' ? 12000 : null, error: null }) };
  assert.equal(await hajiCountPublic(), 12000);
  globalThis.__sb = { rpc: () => ({ data: null, error: null }) };
  assert.equal(await hajiCountPublic(), null);
});
test('Home never breaks: offline or step 032 not run gives null', async () => {
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) };
  assert.equal(await hajiCountPublic(), null);
  globalThis.__sb = { rpc: () => { throw new Error('network'); } };
  assert.equal(await hajiCountPublic(), null);
});
test('admin minimum: Bengali or English digits, commas allowed; empty = off; nonsense refused', () => {
  assert.equal(cleanCountMin('১০,০০০'), '10000');
  assert.equal(cleanCountMin(' 5000 '), '5000');
  assert.equal(cleanCountMin(''), '');
  assert.equal(cleanCountMin('অনেক'), null);
  assert.equal(cleanCountMin('0'), null);
  assert.equal(cleanCountMin('1000000000'), null);
});

// ---------- 3: the leader's own numbers ----------
test('leader stats: three numbers', async () => {
  globalThis.__sb = { rpc: (fn) => ({ data: fn === 'leader_my_stats' ? { hajis: 42, contracts: '5', calls_month: 15 } : null, error: null }) };
  assert.deepEqual(await leaderMyStats(), { hajis: 42, contracts: 5, callsMonth: 15 });
});
test('leader stats: not available → null (card hidden), never zeros', async () => {
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: '42501', message: 'not allowed' } }) };
  assert.equal(await leaderMyStats(), null);
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) };
  assert.equal(await leaderMyStats(), null);
});

// ---------- screens ----------
test('Home shows the line for hajis only (not on the leader account)', () => {
  const s = src('src/screens/HomeScreen.tsx');
  assert.ok(s.includes('hajiCountPublic()') && s.includes('hajiCountText('));
  assert.ok(/!leaderAcc && countLine/.test(s), 'only for haji accounts');
});
test('leader panel shows his own numbers card with a screen-reader label', () => {
  const s = src('src/screens/LeaderScreen.tsx');
  assert.ok(s.includes('<MyStatsCard') && s.includes('leaderMyStats()'));
  const card = s.slice(s.indexOf('function MyStatsCard'));
  assert.ok(card.includes('accessibilityLabel') && card.includes('এ মাসে'));
});
test('admin ব্যবহারকারী tab lets the admin set the minimum or turn the line off', () => {
  const s = src('src/screens/AdminScreen.tsx');
  assert.ok(s.includes('<HomeCountSetting') && s.includes("'haji_count_min'"));
  const box = s.slice(s.indexOf('function HomeCountSetting'));
  assert.ok(box.includes('cleanCountMin(') && box.includes('confirm('));
});
