// Admin → ব্যবহারকারী: short count of registered hajis and group leaders (supabase/031_user_counts.sql). Written first (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './stubs/supabase.mjs';
import { userCounts } from '../../src/lib/admin.js';

beforeEach(() => { reset(); });

test('reads the three numbers from the database', async () => {
  globalThis.__sb = { rpc: (fn) => ({ data: fn === 'admin_user_counts' ? { hajis: 1250, leaders: 37, leaders_pending: 4 } : null, error: null }) };
  assert.deepEqual(await userCounts(), { hajis: 1250, leaders: 37, leadersPending: 4 });
});
test('numbers sent as text are turned into numbers; missing ones are 0', async () => {
  globalThis.__sb = { rpc: () => ({ data: { hajis: '12', leaders: null }, error: null }) };
  assert.deepEqual(await userCounts(), { hajis: 12, leaders: 0, leadersPending: 0 });
});
test('before step 031 is run: null (the card is simply not shown), not an error', async () => {
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.admin_user_counts' } }) };
  assert.equal(await userCounts(), null);
});
test('a real failure (e.g. no permission) is passed on, never shown as 0', async () => {
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: '42501', message: 'not allowed' } }) };
  await assert.rejects(userCounts());
});
test('the ব্যবহারকারী tab shows the counts card above the search (icon + words, screen-reader label)', async () => {
  const { readFileSync } = await import('node:fs');
  const s = readFileSync(new URL('../../src/screens/AdminScreen.tsx', import.meta.url), 'utf8');
  const tab = s.slice(s.indexOf('function UsersTab'), s.indexOf('function UsersTab') + 4000);
  assert.ok(tab.includes('<UserCountsCard'), 'UsersTab must show the card');
  assert.ok(tab.indexOf('<UserCountsCard') < tab.indexOf('label="নাম, আইডি বা মোবাইল নম্বর"'), 'card comes before the search');
  const card = s.slice(s.indexOf('function UserCountsCard'));
  assert.ok(card.includes('userCounts()') && card.includes('accessibilityLabel') && card.includes('হাজী') && card.includes('লিডার'));
});
