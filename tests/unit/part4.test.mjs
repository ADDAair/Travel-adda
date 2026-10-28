// Admin part 4 (supabase/026_admin_part4.sql) — written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './stubs/supabase.mjs';
import { moneyAlerts, alertText, SERVICE_KINDS, addServiceCost, serviceResultText, deleteServiceCost, leaderBalance } from '../../src/lib/adminMoney.js';
import { auditSearch, notifySegment, segmentSize, monthOk } from '../../src/lib/admin.js';
import { logSos, sosLocationWanted, setSosLocationWanted } from '../../src/lib/sos.js';
import { idleExpired, ADMIN_IDLE_MS } from '../../src/lib/idle.js';
import { mfaStep } from '../../src/lib/mfa.js';

beforeEach(() => { reset(); globalThis.__expo = {}; if (globalThis.__store) globalThis.__store.clear(); });
const calls = () => globalThis.__sbCalls;
const rpcCalls = () => calls().filter((c) => c[0] === 'rpc');

// ---------- money alerts ----------
test('money alerts: plain Bengali for each kind', () => {
  assert.ok(alertText('haji_due').includes('হাজীর'));
  assert.ok(alertText('leader_due').includes('লিডারকে'));
  assert.ok(alertText('not_closed').includes('সফর শেষ'));
});
test('money alerts: empty before step 026 instead of an error', async () => {
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.admin_money_alerts' } }) };
  assert.deepEqual(await moneyAlerts(), []);
});

// ---------- service costs ----------
test('service kinds have Bengali names and icons', () => {
  assert.deepEqual(SERVICE_KINDS.map((k) => k.id), ['visa', 'ticket', 'hotel', 'transport', 'food', 'ziyarah', 'other']);
  SERVICE_KINDS.forEach((k) => { assert.ok(/[ঀ-৿]/.test(k.label)); assert.ok(k.icon); });
});
test('a service cost is checked in the app first (amount, kind, note), then sent', async () => {
  await assert.rejects(addServiceCost('L', null, 'visa', 'abc', 'ভিসা ফি'), (e) => e.code === 'amount');
  await assert.rejects(addServiceCost('L', null, 'visa', '০', 'ভিসা ফি'), (e) => e.code === 'amount');
  await assert.rejects(addServiceCost('L', null, 'visa', '', 'ভিসা ফি'), (e) => e.code === 'amount');      // empty field
  await assert.rejects(addServiceCost('L', null, 'visa', null, 'ভিসা ফি'), (e) => e.code === 'amount');
  await assert.rejects(addServiceCost('L', null, 'gift', '১০০০', 'ভিসা ফি'), (e) => e.code === 'kind');
  await assert.rejects(addServiceCost('L', null, 'visa', '১০০০', ' ক '), (e) => e.code === 'note');
  assert.equal(rpcCalls().length, 0);
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  assert.equal(await addServiceCost('L', 'C1', 'visa', '২০,০০০', ' ভিসা ফি '), 'ok');
  assert.deepEqual(rpcCalls().at(-1), ['rpc', 'admin_add_service_cost', { p_leader: 'L', p_contract: 'C1', p_kind: 'visa', p_amount: 20000, p_note: 'ভিসা ফি' }]);
  await addServiceCost('L', '', 'ticket', '৩০০০০', 'গ্রুপ টিকিট');
  assert.equal(rpcCalls().at(-1)[2].p_contract, null, 'no contract = whole group');
});
test('service cost answers become plain Bengali', () => {
  assert.ok(serviceResultText('ok').includes('লেখা হয়েছে'));
  assert.ok(serviceResultText('not_own').includes('নিজস্ব'));
  assert.ok(serviceResultText('mismatch').includes('চুক্তি'));
});
test('removing a cost needs a reason', async () => {
  await assert.rejects(deleteServiceCost('s1', 'ভুল'), (e) => e.code === 'reason');
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  await deleteServiceCost('s1', ' দুবার লেখা হয়েছিল ');
  assert.deepEqual(rpcCalls().at(-1), ['rpc', 'admin_delete_service_cost', { p_id: 's1', p_reason: 'দুবার লেখা হয়েছিল' }]);
});
test('leader balance returns numbers', async () => {
  globalThis.__sb = { rpc: () => ({ data: [{ due_total: '70000.00', group_costs: '30000.00', net: '40000.00' }], error: null }) };
  assert.deepEqual(await leaderBalance('L'), { due_total: 70000, group_costs: 30000, net: 40000 });
});

// ---------- work record ----------
test('work record search sends the filters (all = null)', async () => {
  globalThis.__sb = { rpc: () => ({ data: [], error: null }) };
  await auditSearch('S', '', 7);
  assert.deepEqual(rpcCalls().at(-1), ['rpc', 'admin_audit_search', { p_actor: 'S', p_action: null, p_days: 7 }]);
});

// ---------- notifications to a part ----------
test('month must be YYYY-MM', () => {
  assert.equal(monthOk('2026-11'), true);
  assert.equal(monthOk('2026-13'), false);
  assert.equal(monthOk('নভেম্বর'), false);
});
test('sending to a part returns how many got it; refusals are coded', async () => {
  globalThis.__sb = { rpc: () => ({ data: 'ok:12', error: null }) };
  assert.equal(await notifySegment('group', 'g1', ' দলের খবর ', ''), 12);
  assert.deepEqual(rpcCalls().at(-1), ['rpc', 'admin_notify_segment', { p_kind: 'group', p_value: 'g1', p_title: 'দলের খবর', p_body: null }]);
  globalThis.__sb = { rpc: () => ({ data: 'too_many', error: null }) };
  await assert.rejects(notifySegment('group', 'g1', 'দলের খবর', ''), (e) => e.code === 'too_many');
  await assert.rejects(notifySegment('group', 'g1', 'ক', ''), (e) => e.code === 'title');
  globalThis.__sb = { rpc: () => ({ data: 5, error: null }) };
  assert.equal(await segmentSize('month', '2026-11'), 5);
});

// ---------- SOS ----------
test('SOS location sharing is off until the haji turns it on', async () => {
  assert.equal(await sosLocationWanted(), false);
  await setSosLocationWanted(true);
  assert.equal(await sosLocationWanted(), true);
});
test('SOS is noted without location when not allowed, and never asks for location', async () => {
  let asked = false;
  globalThis.__expo = { position: () => { asked = true; return { coords: { latitude: 1, longitude: 2, accuracy: 3 } }; } };
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  await logSos({ n: '997', t: 'অ্যাম্বুলেন্স' });
  assert.equal(asked, false);
  assert.deepEqual(rpcCalls().at(-1), ['rpc', 'log_sos', { p_number: '997', p_label: 'অ্যাম্বুলেন্স', p_lat: null, p_lng: null, p_acc: null }]);
});
test('SOS sends the location when allowed and permission is given', async () => {
  await setSosLocationWanted(true);
  globalThis.__expo = { locPerm: () => ({ status: 'granted' }), position: () => ({ coords: { latitude: 21.4225, longitude: 39.8262, accuracy: 30 } }) };
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  await logSos({ n: '+966920002814', t: 'নুসুক' });
  assert.deepEqual(rpcCalls().at(-1)[2], { p_number: '+966920002814', p_label: 'নুসুক', p_lat: 21.4225, p_lng: 39.8262, p_acc: 30 });
});
test('SOS never throws and never waits long: no internet, no permission, slow GPS', async () => {
  await setSosLocationWanted(true);
  globalThis.__expo = { locPerm: () => ({ status: 'denied' }) };
  globalThis.__sb = { rpc: () => { throw new Error('Network request failed'); } };
  await logSos({ n: '911', t: 'জরুরি' });                                   // no throw
  globalThis.__expo = { locPerm: () => ({ status: 'granted' }), position: () => new Promise(() => {}) };
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  const t0 = Date.now();
  await logSos({ n: '911', t: 'জরুরি' }, { gpsWaitMs: 50 });
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(rpcCalls().at(-1)[2].p_lat, null, 'slow GPS: sent without location');
});

// ---------- admin auto-lock ----------
test('the admin panel locks after 15 minutes without use', () => {
  assert.equal(ADMIN_IDLE_MS, 15 * 60 * 1000);
  const t = 1_000_000;
  assert.equal(idleExpired(t, t + ADMIN_IDLE_MS - 1), false);
  assert.equal(idleExpired(t, t + ADMIN_IDLE_MS), true);
  assert.equal(idleExpired(null, t), false);
});
test('after the lock the code is asked again even though the session passed 2FA earlier', async () => {
  globalThis.__sb = { mfa: {
    aal: () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }),
    list: () => ({ data: { all: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] }, error: null }) } };
  assert.deepEqual(await mfaStep(), { step: 'ok' });
  assert.deepEqual(await mfaStep({ again: true }), { step: 'verify', factorId: 'f1' });
});

// Owner's screenshot (Oct 2026): no way to pick a single haji, names cut off.
test('single-haji choices: every running or finished contract of this leader, newest travel first, searchable', async () => {
  const { contractChoices } = await import('../../src/lib/adminMoney.js');
  const rows = [
    { contract_id: 'a', leader_id: 'L', status: 'accepted', contract_no: 'TC-000001', haji_name: 'আব্দুল করিম', haji_code: 'TA-00011', travel_from: '2026-11-02' },
    { contract_id: 'b', leader_id: 'L', status: 'completed', contract_no: 'TC-000002', haji_name: 'রহিমা খাতুন', haji_code: 'TA-00012', travel_from: '2026-12-01' },
    { contract_id: 'c', leader_id: 'L', status: 'cancelled', contract_no: 'TC-000003', haji_name: 'বাতিল হাজী', haji_code: 'TA-00013', travel_from: '2026-11-05' },
    { contract_id: 'd', leader_id: 'X', status: 'accepted', contract_no: 'TC-000004', haji_name: 'অন্য লিডারের হাজী', haji_code: 'TA-00014', travel_from: '2026-11-03' },
  ];
  const all = contractChoices(rows, 'L');
  assert.deepEqual(all.map((c) => c.id), ['b', 'a']);
  assert.ok(all[0].label.includes('রহিমা খাতুন') && all[0].label.includes('TA-00012'));
  assert.deepEqual(contractChoices(rows, 'L', 'করিম').map((c) => c.id), ['a']);
  assert.deepEqual(contractChoices(rows, 'L', 'ta-00012').map((c) => c.id), ['b']);
  assert.deepEqual(contractChoices(rows, 'L', '০০০০০১').map((c) => c.id), ['a'], 'Bengali digits work');
});
