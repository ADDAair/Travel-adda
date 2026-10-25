// Admin & staff 2FA (supabase/023_admin_mfa.sql + src/lib/mfa.js) — written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './stubs/supabase.mjs';
import { mfaStep, startEnroll, verifyCode, cleanCode, mfaErrorText, secretGroups } from '../../src/lib/mfa.js';

beforeEach(() => reset());
const calls = () => globalThis.__sbCalls.filter((c) => c[0] === 'mfa');
const totp = (id, status) => ({ id, factor_type: 'totp', status });

test('a session that already passed 2FA goes straight in', async () => {
  globalThis.__sb = { mfa: { aal: () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }) } };
  assert.deepEqual(await mfaStep(), { step: 'ok' });
});

test('with an authenticator already set up, only the 6-digit code is asked', async () => {
  globalThis.__sb = { mfa: {
    aal: () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }),
    list: () => ({ data: { all: [totp('f0', 'unverified'), totp('f1', 'verified')] }, error: null }) } };
  assert.deepEqual(await mfaStep(), { step: 'verify', factorId: 'f1' });
});

test('first time: set up the authenticator app', async () => {
  globalThis.__sb = { mfa: {
    aal: () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }),
    list: () => ({ data: { all: [totp('f0', 'unverified')] }, error: null }) } };
  assert.deepEqual(await mfaStep(), { step: 'enroll' });
});

test('setting up removes half-finished earlier attempts, then gives the secret key and app link', async () => {
  globalThis.__sb = { mfa: {
    list: () => ({ data: { all: [totp('old', 'unverified'), totp('keep', 'verified')] }, error: null }),
    unenroll: () => ({ data: {}, error: null }),
    enroll: () => ({ data: { id: 'new', totp: { secret: 'ABCDEFGHIJKLMNOP', uri: 'otpauth://totp/TravelAdda:a?secret=ABCDEFGHIJKLMNOP' } }, error: null }) } };
  const r = await startEnroll();
  assert.deepEqual(r, { factorId: 'new', secret: 'ABCDEFGHIJKLMNOP', uri: 'otpauth://totp/TravelAdda:a?secret=ABCDEFGHIJKLMNOP' });
  const un = calls().filter((c) => c[1] === 'unenroll');
  assert.deepEqual(un.map((c) => c[2]), [{ factorId: 'old' }], 'a verified authenticator must never be removed by the app');
  assert.equal(calls().find((c) => c[1] === 'enroll')[2].factorType, 'totp');
});

test('the code accepts Bengali digits and spaces, and must be exactly 6 digits', () => {
  assert.equal(cleanCode('১২৩ ৪৫৬'), '123456');
  assert.equal(cleanCode(' 654321 '), '654321');
  assert.equal(cleanCode('12345'), null);
  assert.equal(cleanCode('12a456'), null);
});

test('verify: a wrong-length code is stopped before asking the server', async () => {
  await assert.rejects(verifyCode('f1', '১২৩'), (e) => e.code === 'format');
  assert.equal(calls().length, 0);
});

test('verify: challenge then verify with the cleaned code', async () => {
  globalThis.__sb = { mfa: {
    challenge: () => ({ data: { id: 'ch1' }, error: null }),
    verify: () => ({ data: { access_token: 'x' }, error: null }) } };
  await verifyCode('f1', '১২৩৪৫৬');
  assert.deepEqual(calls().find((c) => c[1] === 'challenge')[2], { factorId: 'f1' });
  assert.deepEqual(calls().find((c) => c[1] === 'verify')[2], { factorId: 'f1', challengeId: 'ch1', code: '123456' });
});

test('verify: a wrong code is reported as wrong, never as success', async () => {
  globalThis.__sb = { mfa: {
    challenge: () => ({ data: { id: 'ch1' }, error: null }),
    verify: () => ({ data: null, error: { status: 422, code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' } }) } };
  await assert.rejects(verifyCode('f1', '000000'), (e) => e.code === 'wrong');
});

test('messages are plain Bengali', () => {
  assert.ok(mfaErrorText({ code: 'format' }).includes('৬'));
  assert.ok(mfaErrorText({ code: 'wrong' }).includes('ভুল'));
  assert.ok(mfaErrorText({ message: 'Network request failed' }).includes('ইন্টারনেট'));
  assert.ok(mfaErrorText({ status: 429, message: 'too many' }).includes('অপেক্ষা'));
});

test('the secret key is shown in groups of 4 so it is easy to type', () => {
  assert.equal(secretGroups('ABCDEFGHIJKLMNOPQR'), 'ABCD EFGH IJKL MNOP QR');
  assert.equal(secretGroups(''), '');
});
