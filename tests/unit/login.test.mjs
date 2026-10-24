// Unit tests for log in by phone or e-mail (src/lib/login.js) with a fake server.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './stubs/supabase.mjs';
import { loginEmailFor, newLoginEmail, isValidEmail, normalizeEmail, emailTypoFix, looksLikeEmail } from '../../src/lib/login.js';

beforeEach(() => reset());
const calls = () => globalThis.__sbCalls;

test('e-mail checks and typo suggestions', () => {
  assert.ok(isValidEmail('karim@gmail.com'));
  for (const bad of ['karim@', '@gmail.com', 'karim@gmail', 'kar im@gmail.com', 'a@b.c']) assert.ok(!isValidEmail(bad), bad);
  assert.equal(normalizeEmail('  Karim@Gmail.COM '), 'karim@gmail.com');
  assert.ok(looksLikeEmail('a@b') && !looksLikeEmail('01712345678'));
  assert.equal(emailTypoFix('traveladda2.0@gnail.com'), 'traveladda2.0@gmail.com');
  assert.equal(emailTypoFix('X@GMAIL.CON'), 'x@gmail.com');
  assert.equal(emailTypoFix('karim@gmail.com'), null);
  assert.equal(emailTypoFix('nothing'), null);
});

test('login address comes from the server for a phone (normalised) or an e-mail', async () => {
  globalThis.__sb = { rpc: (n, a) => ({ data: n === 'login_id' ? `u${'a'.repeat(20)}@users.traveladda.app` : null, error: null }) };
  assert.equal(await loginEmailFor('+880 1712-345678'), `u${'a'.repeat(20)}@users.traveladda.app`);
  assert.deepEqual(calls().at(-1), ['rpc', 'login_id', { p_ident: '01712345678' }]);
  await loginEmailFor(' Karim@Gmail.com ');
  assert.deepEqual(calls().at(-1), ['rpc', 'login_id', { p_ident: 'karim@gmail.com' }]);
});

test('wrong input never reaches the server', async () => {
  await assert.rejects(loginEmailFor('12345'), { code: 'bad-ident' });
  await assert.rejects(loginEmailFor('karim@'), { code: 'bad-ident' });
  assert.equal(calls().length, 0);
});

test('before database step 016: phone falls back to the old address, e-mail says coming soon', async () => {
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.login_id' } }) };
  assert.equal(await loginEmailFor('01712345678'), '01712345678@users.traveladda.app');
  await assert.rejects(loginEmailFor('karim@gmail.com'), { code: 'email-soon' });
  assert.equal(await newLoginEmail('01712345678'), '01712345678@users.traveladda.app');
});

test('network error is passed on (never treated as success)', async () => {
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: '', message: 'Failed to fetch' } }) };
  await assert.rejects(loginEmailFor('01712345678'), { message: 'Failed to fetch' });
});

test('new accounts get a private random login address (no phone inside, different each time)', async () => {
  globalThis.__sb = { rpc: () => ({ data: 'uxxxxxxxxxxxxxxxxxxxx@users.traveladda.app', error: null }) };
  const a = await newLoginEmail('01712345678');
  const b = await newLoginEmail('01712345678');
  assert.match(a, /^u[0-9a-f]{20}@users\.traveladda\.app$/);
  assert.notEqual(a, b);
  assert.ok(!a.includes('01712345678'));
});
