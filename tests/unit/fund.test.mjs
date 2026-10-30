// Hajj & Umrah help fund (supabase/027_help_fund.sql) — written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reset } from './stubs/supabase.mjs';
import { fundSummary, donate, myDonations, myConfirmedTotal, applyHelp, helpErrorText, personLabel, helpStatusText,
  decideHelp, reviewDonation, spendFund, fundPayInfo } from '../../src/lib/fund.ts';
import { VIDEO_TOPICS } from '../../src/content/videos.js';

beforeEach(() => { reset(); if (globalThis.__store) globalThis.__store.clear(); });
const rpcs = () => globalThis.__sbCalls.filter((c) => c[0] === 'rpc');
const today = new Date().toISOString().slice(0, 10);

test('summary: numbers come back as numbers; before step 027 it is null (page says "coming soon")', async () => {
  globalThis.__sb = { rpc: () => ({ data: { collected: '25000.00', spent: '15000', balance: '10000', donors: 2, travelled: 1, waiting: [], recent: [], spends: [] }, error: null }) };
  const s = await fundSummary();
  assert.equal(s.collected, 25000); assert.equal(s.balance, 10000); assert.equal(s.donors, 2);
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fund_summary' } }) };
  assert.equal(await fundSummary(), null);
});

test('donating: checked in the app first, Bengali digits allowed, name hidden unless chosen', async () => {
  await assert.rejects(donate({ amount: '৫০', method: 'bkash', ref: 'TX-1', paidOn: today }), (e) => e.code === 'amount');
  await assert.rejects(donate({ amount: '৫০০', method: 'cash', ref: 'TX-1', paidOn: today }), (e) => e.code === 'method');
  await assert.rejects(donate({ amount: '৫০০', method: 'bkash', ref: ' T ', paidOn: today }), (e) => e.code === 'ref');
  await assert.rejects(donate({ amount: '৫০০', method: 'bkash', ref: 'TX-1', paidOn: '2099-01-01' }), (e) => e.code === 'date');
  assert.equal(rpcs().length, 0);
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  await donate({ amount: '৫,০০০', method: 'bkash', ref: ' TX-9 ', paidOn: today });
  assert.deepEqual(rpcs().at(-1), ['rpc', 'donate_fund', { p_amount: 5000, p_method: 'bkash', p_ref: 'TX-9', p_paid_on: today, p_show_name: false }]);
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "fund_ref_uq"' } }) };
  await assert.rejects(donate({ amount: '500', method: 'bkash', ref: 'TX-9', paidOn: today, showName: true }), (e) => e.code === 'duplicate');
});

test('my total counts only confirmed gifts', async () => {
  globalThis.__sb = { rpc: () => ({ data: [{ amount: '5000', status: 'confirmed' }, { amount: '300', status: 'submitted' }, { amount: 100, status: 'rejected' }], error: null }) };
  const rows = await myDonations();
  assert.equal(myConfirmedTotal(rows), 5000);
});

test('applying: short form checked first; reference phone must be a Bangladeshi mobile', async () => {
  const ok = { kind: 'umrah', age: '৬৫', district: 'নোয়াখালী', profession: 'কৃষক', reason: 'আমার ওমরাহ করার খুব ইচ্ছা কিন্তু টাকা নেই',
    wentBefore: false, refName: 'ইমাম সাহেব', refPhone: '০১৭১২-৩৪৫৬৭৮', showName: false };
  await assert.rejects(applyHelp({ ...ok, age: '১২' }), (e) => e.code === 'age');
  await assert.rejects(applyHelp({ ...ok, reason: 'ছোট' }), (e) => e.code === 'reason');
  await assert.rejects(applyHelp({ ...ok, refPhone: '12345' }), (e) => e.code === 'refPhone');
  await assert.rejects(applyHelp({ ...ok, kind: 'visit' }), (e) => e.code === 'kind');
  assert.equal(rpcs().length, 0);
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  assert.equal(await applyHelp(ok), 'ok');
  const a = rpcs().at(-1)[2];
  assert.equal(a.p_age, 65); assert.equal(a.p_ref_phone, '01712345678'); assert.equal(a.p_show_name, false);
  assert.ok(helpErrorText({ code: 'exists' }).includes('আগেই'));
});

test('a person is shown by name only if they agreed; otherwise district and age', () => {
  assert.equal(personLabel({ name: 'করিম মিয়া', district: 'ঢাকা', age: 70 }), 'করিম মিয়া');
  assert.equal(personLabel({ name: null, district: 'নোয়াখালী', age: 65 }), 'নোয়াখালীর ৬৫ বছর বয়সী একজন');
  assert.equal(personLabel({ name: null, district: 'সিলেট', age: 60 }), 'সিলেটের ৬০ বছর বয়সী একজন');
  assert.equal(personLabel({ name: null, district: 'ঢাকা', age: 70 }), 'ঢাকার ৭০ বছর বয়সী একজন');
  assert.ok(helpStatusText('pending').includes('যাচাই'));
  assert.ok(helpStatusText('travelled').includes('আলহামদুলিল্লাহ'));
});

test('admin: a rejection needs a reason; spending needs amount, purpose and reference', async () => {
  await assert.rejects(decideHelp('a1', 'reject', ' না '), (e) => e.code === 'reason');
  await assert.rejects(reviewDonation('d1', false, ''), (e) => e.code === 'reason');
  await assert.rejects(spendFund('a1', '০', 'প্যাকেজ', 'PAY-1'), (e) => e.code === 'amount');
  await assert.rejects(spendFund('a1', '১৫০০০', 'প', 'PAY-1'), (e) => e.code === 'purpose');
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  await spendFund('a1', '১৫,০০০', 'ওমরাহ প্যাকেজ', 'PAY-1');
  assert.deepEqual(rpcs().at(-1), ['rpc', 'admin_spend_fund', { p_app: 'a1', p_amount: 15000, p_purpose: 'ওমরাহ প্যাকেজ', p_ref: 'PAY-1' }]);
});

test('fund account: its own numbers if set, else the normal payment account', async () => {
  globalThis.__sb = { from: () => ({ data: [{ key: 'pay_bkash', value: '01900000000' }, { key: 'fund_bank', value: 'ইসলামী ব্যাংক ১২৩' }], error: null }) };
  assert.deepEqual(await fundPayInfo(), { bank: 'ইসলামী ব্যাংক ১২৩', bkash: '01900000000' });
});

test('the fund page is part of the app (route + video topic)', () => {
  const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  assert.ok(app.includes('<Tab.Screen name="Fund"'));
  assert.ok(VIDEO_TOPICS.Fund);
});
