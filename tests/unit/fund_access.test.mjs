// Giving to the help fund needs Travel Adda's permission (supabase/028_fund_access.sql) — written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reset } from './stubs/supabase.mjs';
import * as F from '../../src/lib/fund.ts';

beforeEach(() => { reset(); if (globalThis.__store) globalThis.__store.clear(); });
const rpcs = () => globalThis.__sbCalls.filter((c) => c[0] === 'rpc');
const today = new Date().toISOString().slice(0, 10);

test('my access: what the server says; before step 028 giving stays open as before', async () => {
  globalThis.__sb = { rpc: () => ({ data: { mode: 'approved', status: 'requested', can: false }, error: null }) };
  assert.deepEqual(await F.donateAccess(), { mode: 'approved', status: 'requested', can: false });
  assert.deepEqual(rpcs().at(-1), ['rpc', 'my_donate_access', undefined]);
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.my_donate_access' } }) };
  assert.deepEqual(await F.donateAccess(), { mode: 'open', status: 'none', can: true });
  globalThis.__sb = { rpc: () => ({ data: null, error: { message: 'Network request failed' } }) };
  await assert.rejects(F.donateAccess());          // a real failure is not turned into "allowed"
});

test('the Give tab explains every state in plain Bengali, with one clear next step', () => {
  const t = (mode, status, can) => F.donateAccessText({ mode, status, can });
  assert.equal(t('approved', 'allowed', true), null);   // allowed: just the form
  assert.equal(t('open', 'none', true), null);
  const none = t('approved', 'none', false);
  assert.ok(none.title.includes('দান করতে Travel Adda-র অনুমতি লাগে')); assert.equal(none.canAsk, true);
  const asked = t('approved', 'requested', false);
  assert.ok(asked.title.includes('অনুরোধ পাঠানো হয়েছে')); assert.equal(asked.canAsk, false);
  const closed = t('closed', 'allowed', false);
  assert.ok(closed.title.includes('বন্ধ')); assert.equal(closed.canAsk, false);
  const blocked = t('open', 'blocked', false);
  assert.ok(blocked.body.includes('হেল্পলাইন')); assert.equal(blocked.canAsk, false);
});

test('asking for permission: each answer turns into a clear message', async () => {
  globalThis.__sb = { rpc: () => ({ data: 'requested', error: null }) };
  assert.equal(await F.requestDonateAccess(), 'requested');
  assert.deepEqual(rpcs().at(-1), ['rpc', 'request_donate_access', undefined]);
  for (const c of ['requested', 'already', 'allowed', 'blocked', 'closed', 'limit']) assert.ok(F.requestAccessText(c).length > 10, c);
  assert.ok(F.requestAccessText('limit').includes('কাল'));
});

test('donating without permission shows the permission message, not a false success', async () => {
  globalThis.__sb = { rpc: () => ({ data: 'not_allowed', error: null }) };
  await assert.rejects(F.donate({ amount: '৫০০', method: 'bkash', ref: 'TX-1', paidOn: today }), (e) => e.code === 'not_allowed');
  assert.ok(F.helpErrorText({ code: 'not_allowed' }).includes('অনুমতি'));
});

test('admin: three modes only; the mode goes to the settings function', async () => {
  assert.deepEqual(F.DONATE_MODES.map((m) => m.key), ['approved', 'open', 'closed']);
  for (const m of F.DONATE_MODES) assert.ok(m.label.length > 5 && m.hint.length > 10);
  await assert.rejects(F.setDonateMode('everyone'), (e) => e.code === 'mode');
  assert.equal(rpcs().length, 0);
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  await F.setDonateMode('open');
  assert.deepEqual(rpcs().at(-1), ['rpc', 'admin_set_setting', { p_key: 'fund_donate_mode', p_value: 'open' }]);
});

test('admin: search by ID / phone / name (at least 3 letters); turn a person on, off or clear', async () => {
  await assert.rejects(F.donorAccess('ab'), (e) => e.code === 'short');
  assert.equal(rpcs().length, 0);
  globalThis.__sb = { rpc: () => ({ data: [{ user_id: 'u1', status: 'requested' }], error: null }) };
  assert.equal((await F.donorAccess('  TA-1234 ')).length, 1);
  assert.deepEqual(rpcs().at(-1), ['rpc', 'admin_donor_access', { p_query: 'TA-1234' }]);
  await F.donorAccess('০১৭১২৩৪৫৬৭৮');                       // Bengali digits work too
  assert.deepEqual(rpcs().at(-1)[2], { p_query: '01712345678' });
  await F.donorAccess('১২');                                   // just the ID number
  assert.deepEqual(rpcs().at(-1)[2], { p_query: '12' });
  await F.donorAccess('');                                    // empty: the list of requests / allowed / blocked
  assert.deepEqual(rpcs().at(-1)[2], { p_query: null });
  await assert.rejects(F.setDonorAccess('u1', 'maybe'), (e) => e.code === 'status');
  await F.setDonorAccess('u1', 'blocked', ' ভুয়া নম্বর ');
  assert.deepEqual(rpcs().at(-1), ['rpc', 'admin_set_donor_access', { p_user: 'u1', p_status: 'blocked', p_note: 'ভুয়া নম্বর' }]);
  await F.setDonorAccess('u1', null);
  assert.deepEqual(rpcs().at(-1)[2], { p_user: 'u1', p_status: null, p_note: null });
  for (const s of ['none', 'requested', 'allowed', 'blocked']) assert.ok(F.accessStatusText(s).length > 3, s);
});

test('screens: Give tab checks permission; admin fund page has the permission part; rule written down', () => {
  const give = readFileSync(new URL('../../src/screens/FundScreen.tsx', import.meta.url), 'utf8');
  assert.ok(give.includes('donateAccess(') && give.includes('requestDonateAccess(') && give.includes('অনুমতি চাই'));
  const admin = readFileSync(new URL('../../src/screens/AdminFund.tsx', import.meta.url), 'utf8');
  assert.ok(admin.includes('setDonateMode(') && admin.includes('donorAccess(') && admin.includes('setDonorAccess('));
  assert.ok(F.FUND_RULES.join(' ').includes('অনুমতি'));
  const sql = readFileSync(new URL('../../supabase/028_fund_access.sql', import.meta.url), 'utf8');
  assert.ok(/enable row level security/.test(sql));
});
