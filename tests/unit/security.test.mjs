// Security-audit fixes on the app side (Oct 2026) — written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './stubs/supabase.mjs';
import { deleteMyAccount } from '../../src/lib/account.js';
import { khademResultText, inviteResultText, myKhademInvites, khademRespond, mySentInvites, cancelInvite } from '../../src/lib/help.js';
import { lockWanted, setLockWanted, canLock, unlock } from '../../src/lib/applock.js';

beforeEach(() => { reset(); globalThis.__expo = {}; });
const calls = () => globalThis.__sbCalls;
const session = { user: { id: 'u1', email: 'uabc@users.traveladda.app' } };

test('delete account: no password, nothing happens', async () => {
  globalThis.__sb = { session };
  await assert.rejects(deleteMyAccount('  '), (e) => e.code === 'password-needed');
  assert.equal(calls().filter((c) => c[0] !== 'from').length, 0);
});

test('delete account: wrong password stops BEFORE any file or the account is touched', async () => {
  globalThis.__sb = { session, signIn: () => ({ data: null, error: { message: 'Invalid login credentials' } }) };
  await assert.rejects(deleteMyAccount('ভুল-পাসওয়ার্ড'), (e) => e.code === 'wrong-password');
  assert.ok(!calls().some((c) => c[0] === 'rpc'), 'account not deleted');
});

test('delete account: the password is checked first (fresh sign-in), then the account is deleted', async () => {
  globalThis.__sb = { session, signIn: () => ({ data: { session }, error: null }), rpc: () => ({ data: null, error: null }) };
  await deleteMyAccount('ঠিক-পাসওয়ার্ড1');
  const i = calls().findIndex((c) => c[0] === 'signIn'); const j = calls().findIndex((c) => c[0] === 'rpc' && c[1] === 'delete_my_account');
  assert.ok(i >= 0 && j > i, 'sign-in before delete');
  assert.deepEqual(calls()[i][1], { email: 'uabc@users.traveladda.app', password: 'ঠিক-পাসওয়ার্ড1' });
});

test('invitation answers never say whether an account exists', () => {
  assert.ok(khademResultText('sent').includes('রাজি'));
  assert.ok(!khademResultText('sent').includes('পাওয়া যায়নি'));
  assert.ok(khademResultText('limit').includes('৫০'));
  assert.ok(inviteResultText('sent').includes('অ্যাকাউন্ট থাকলে'));
  assert.ok(inviteResultText('bad').includes('১১'));
});

test('khadem invitations: list, agree / decline, sent list, cancel', async () => {
  globalThis.__sb = { rpc: (n) => ({ data: n === 'my_khadem_invites' || n === 'my_sent_invites' ? [{ id: 'i1' }] : 'ok', error: null }) };
  assert.equal((await myKhademInvites()).length, 1);
  assert.equal(await khademRespond('g1', true), 'ok');
  assert.deepEqual(calls().at(-1), ['rpc', 'khadem_respond', { p_group: 'g1', p_accept: true }]);
  assert.equal((await mySentInvites('g1')).length, 1);
  assert.equal(await cancelInvite('i1'), 'ok');
  assert.deepEqual(calls().at(-1), ['rpc', 'leader_cancel_invite', { p_id: 'i1' }]);
});

test('app lock: off by default, remembered securely, and opens only after the phone says OK', async () => {
  const store = {};
  globalThis.__expo = { getItemAsync: (k) => store[k] ?? null, setItemAsync: (k, v) => { store[k] = v; }, deleteItemAsync: (k) => { delete store[k]; },
    hasHardware: () => true, isEnrolled: () => true, level: () => 3, authenticate: () => ({ success: true }) };
  assert.equal(await lockWanted(), false);
  await setLockWanted(true);
  assert.equal(await lockWanted(), true);
  assert.equal(await canLock(), true);
  assert.equal(await unlock(), true);
  globalThis.__expo.authenticate = () => ({ success: false, error: 'user_cancel' });
  assert.equal(await unlock(), false);
  globalThis.__expo.level = () => 0;           // phone has no screen lock at all
  assert.equal(await canLock(), false);
});
