// Unit tests for the app side of SMS/e-mail codes (src/lib/otp.js).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './stubs/supabase.mjs';
import { otp, otpText } from '../../src/lib/otp.js';

beforeEach(() => reset());

test('server answer is passed through; error bodies of non-2xx answers are read', async () => {
  globalThis.__sb = { invoke: () => ({ data: { ok: true, sent: true }, error: null }) };
  assert.deepEqual(await otp('send_verify'), { ok: true, sent: true });
  globalThis.__sb = { invoke: () => ({ data: null, error: { name: 'FunctionsHttpError', context: { status: 429, json: async () => ({ ok: false, error: 'wait', retry_in: 42 }) } } }) };
  assert.deepEqual(await otp('send_verify'), { ok: false, error: 'wait', retry_in: 42 });
});

test('missing function = not ready; thrown error = network; never throws', async () => {
  globalThis.__sb = { invoke: () => ({ data: null, error: { name: 'FunctionsHttpError', context: { status: 404, json: async () => ({}) } } }) };
  assert.equal((await otp('send_verify')).error, 'not_ready');
  globalThis.__sb = { invoke: () => { throw new Error('boom'); } };
  assert.equal((await otp('send_verify')).error, 'network');
});

test('every server error has plain Bengali text, with Bengali digits', () => {
  const codes = ['wait', 'too_many', 'daily_cap', 'sms_failed', 'bad_code', 'wrong_code', 'too_many_tries', 'expired', 'weak_password',
    'bad_phone', 'bad_email', 'email_failed', 'email_taken', 'not_signed_in', 'network', 'not_ready'];
  for (const c of codes) {
    const t = otpText({ error: c, retry_in: 42, tries_left: 3 });
    assert.ok(t && /[ঀ-৿]/.test(t), `${c}: ${t}`);
    assert.ok(!/[0-9]/.test(t), `${c} shows English digits: ${t}`);
  }
  assert.ok(otpText({ error: 'wait', retry_in: 42 }).includes('৪২'));
  assert.ok(otpText({ error: 'wrong_code', tries_left: 3 }).includes('৩'));
});
