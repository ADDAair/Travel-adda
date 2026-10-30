// Faster app start (owner: "opening the app and Home feel slow", Oct 2026). Written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './stubs/supabase.mjs';
import { photoGateState } from '../../src/lib/avatar.js';
import { markStart, mark, finishStartup, lastStartup, startupText } from '../../src/lib/startup.ts';

beforeEach(() => { reset(); if (globalThis.__store) globalThis.__store.clear(); });
const profileCalls = () => globalThis.__sbCalls.filter((c) => c[0] === 'from' && c[1] === 'profiles').length;

test('once the photo is known to exist, later app starts do not ask the server again (no extra wait on the splash)', async () => {
  globalThis.__sb = { from: () => ({ data: { avatar_path: 'u/profile.jpg' }, error: null }) };
  assert.equal(await photoGateState(), 'ok');
  assert.equal(profileCalls(), 1);
  assert.equal(await photoGateState(), 'ok');
  assert.equal(profileCalls(), 1, 'second start must not call the server');
});

test('a missing photo is still asked from the server every time (until it is added)', async () => {
  globalThis.__sb = { from: () => ({ data: { avatar_path: null }, error: null }) };
  assert.equal(await photoGateState(), 'missing');
  assert.equal(await photoGateState(), 'missing');
  assert.equal(profileCalls(), 2);
});

test('startup timeline: steps are measured from the start and kept for the speed page', async () => {
  let t = 1000; const now = () => t;
  markStart(now);
  t = 1400; mark('session', now);
  t = 1900; mark('photo', now);
  t = 2100; await finishStartup('home', now);
  const last = await lastStartup();
  assert.deepEqual(last.steps.map((s) => [s.name, s.ms]), [['session', 400], ['photo', 900], ['home', 1100]]);
  assert.equal(last.total, 1100);
  assert.ok(startupText(last).includes('১.১'));
});
