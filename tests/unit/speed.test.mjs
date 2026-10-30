// Speed check from the owner's own phone (owner: "loading feels slow", Oct 2026). Written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './stubs/supabase.mjs';
import { median, timeCall, speedVerdict, speedText } from '../../src/lib/speed.ts';

beforeEach(() => reset());

test('median of the timings', () => {
  assert.equal(median([300, 100, 200]), 200);
  assert.equal(median([400, 100, 300, 200]), 250);
  assert.equal(median([]), null);
});

test('a call is timed several times; errors are counted, never thrown', async () => {
  let n = 0; let clock = 0;
  const now = () => clock;
  const r = await timeCall(async () => { n += 1; clock += 100 * n; if (n === 2) return { error: { message: 'x' } }; return { data: [] }; }, 3, now);
  assert.equal(n, 3);
  assert.deepEqual(r.times, [100, 200, 300]);
  assert.equal(r.median, 200);
  assert.equal(r.errors, 1);
  const bad = await timeCall(async () => { throw new Error('Network request failed'); }, 2, now);
  assert.equal(bad.errors, 2);
});

test('plain verdicts: fast, okay, slow', () => {
  assert.equal(speedVerdict(250), 'fast');
  assert.equal(speedVerdict(700), 'okay');
  assert.equal(speedVerdict(1600), 'slow');
  assert.equal(speedVerdict(null), 'failed');
  assert.ok(speedText({ median: 1600, errors: 0 }).includes('ধীর'));
  assert.ok(speedText({ median: 250, errors: 0 }).includes('দ্রুত'));
  assert.ok(speedText({ median: null, errors: 3 }).includes('হয়নি'));
  assert.ok(/[০-৯]/.test(speedText({ median: 250, errors: 0 })), 'Bengali digits');
});
