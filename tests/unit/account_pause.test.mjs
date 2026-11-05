// Owner request (Nov 2026): pause / resume the account; deletion waits 30 days (Google Play still gets a real
// deletion). Server side is supabase/035_account_pause.sql (tests/sql/t35.sh). Written first (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reset } from './stubs/supabase.mjs';
import { pauseMyAccount, resumeMyAccount, deleteMyAccount, pauseText, deleteDay } from '../../src/lib/account.js';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const calls = () => globalThis.__sbCalls;
const SESSION = { user: { id: 'u1', email: '01711110001@users.traveladda.app' } };
beforeEach(() => { reset(); globalThis.__sb = { session: SESSION }; });

test('pausing checks the password first, then asks the server; a wrong password never pauses', async () => {
  globalThis.__sb.signIn = () => ({ error: { message: 'Invalid login credentials' } });
  await assert.rejects(pauseMyAccount('bad'), (e) => e.code === 'wrong-password');
  assert.ok(!calls().some((c) => c[0] === 'rpc'));
  await assert.rejects(pauseMyAccount('  '), (e) => e.code === 'password-needed');
});

test('pausing: the server answer comes back as it is (ok, has_contract, not_active)', async () => {
  for (const a of ['ok', 'has_contract', 'not_active']) {
    globalThis.__sb.rpc = (name) => (name === 'pause_my_account' ? { data: a, error: null } : { data: null, error: null });
    assert.equal(await pauseMyAccount('pw'), a);
  }
});

test('resume calls the server and returns its answer', async () => {
  globalThis.__sb.rpc = (name) => ({ data: name === 'resume_my_account' ? 'ok' : null, error: null });
  assert.equal(await resumeMyAccount(), 'ok');
  globalThis.__sb.rpc = () => ({ data: null, error: { message: 'boom' } });
  await assert.rejects(resumeMyAccount());
});

test('deletion now asks for removal after 30 days (request_account_deletion), never the old instant delete', async () => {
  globalThis.__sb.rpc = (name) => ({ data: name === 'request_account_deletion' ? 'ok' : null, error: null });
  await deleteMyAccount('pw');
  const rpcs = calls().filter((c) => c[0] === 'rpc').map((c) => c[1]);
  assert.deepEqual(rpcs, ['request_account_deletion']);
});

test('deletion: a server "password_needed" is an error, nothing is reported as done', async () => {
  globalThis.__sb.rpc = () => ({ data: 'password_needed', error: null });
  await assert.rejects(deleteMyAccount('pw'), (e) => /password needed/.test(e.message));
});

test('plain Bengali for every answer; the removal day in Bengali digits', () => {
  assert.match(pauseText('ok'), /বন্ধ/);
  assert.match(pauseText('has_contract'), /চুক্তি/);
  assert.match(pauseText('not_active'), /চালু নেই|বন্ধ আছে/);
  assert.match(pauseText('password_needed'), /পাসওয়ার্ড/);
  assert.equal(deleteDay('2026-12-05T21:41:00Z'), '৬ ডিসেম্বর ২০২৬');   // Bangladesh time (UTC+6)
  assert.equal(deleteDay(null), '');
});

test('the app shows a "paused" screen (resume or log out), the account page offers pause first, then delayed deletion', () => {
  const app = read('App.tsx');
  assert.ok(/me\.status === 'paused'[\s\S]{0,80}<Paused/.test(app), 'paused people see the paused screen');
  const p = read('src/screens/Paused.tsx');
  assert.ok(p.includes('resumeMyAccount') && p.includes('অ্যাকাউন্ট আবার চালু করুন'));
  assert.ok(p.includes('deleteDay(') && p.includes('মোছা বাতিল'), 'says when it will be removed and that resuming cancels it');
  const s = read('src/screens/Suspended.tsx');
  assert.ok(s.includes('delete_after') && s.includes('resumeMyAccount'), 'a suspended person can cancel his deletion');
  const a = read('src/screens/Placeholder.tsx');
  assert.ok(a.includes('অ্যাকাউন্ট বন্ধ রাখুন') && a.includes('pauseMyAccount'));
  assert.ok(a.indexOf('অ্যাকাউন্ট বন্ধ রাখুন') < a.indexOf('অ্যাকাউন্ট মুছে ফেলুন'), 'pause comes before delete');
  assert.ok(a.includes('৩০ দিন'), 'the deletion text says 30 days');
  assert.ok(read('src/lib/me.ts').includes('delete_after'), 'the profile brings the removal date');
  assert.ok(read('src/content/privacy.ts').includes('৩০ দিন'), 'privacy policy tells the new rule');
});
