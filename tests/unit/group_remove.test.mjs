// Leader removes a group made by mistake (supabase/030_group_remove.sql) — written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reset } from './stubs/supabase.mjs';
import { removeGroup, reopenGroup, removeGroupText } from '../../src/lib/groups.ts';

beforeEach(() => { reset(); });
const rpcs = () => globalThis.__sbCalls.filter((c) => c[0] === 'rpc');

test('remove: asks the server, which decides delete (empty) or close (has history)', async () => {
  globalThis.__sb = { rpc: () => ({ data: 'deleted', error: null }) };
  assert.equal(await removeGroup('g1'), 'deleted');
  assert.deepEqual(rpcs().at(-1), ['rpc', 'leader_remove_group', { p_group: 'g1' }]);
  globalThis.__sb = { rpc: () => ({ data: 'ok', error: null }) };
  await reopenGroup('g1');
  assert.deepEqual(rpcs().at(-1), ['rpc', 'leader_reopen_group', { p_group: 'g1' }]);
  globalThis.__sb = { rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.leader_remove_group' } }) };
  await assert.rejects(removeGroup('g1'), (e) => e.code === 'soon');      // before step 030: says "coming soon"
});

test('every answer has a plain Bengali message', () => {
  assert.ok(removeGroupText('deleted').includes('মুছে'));
  assert.ok(removeGroupText('closed').includes('বন্ধ'));
  assert.ok(removeGroupText('already_closed').includes('বন্ধ'));
  assert.ok(removeGroupText('not_found').length > 5);
});

test('the group page has the remove and reopen buttons, with a confirmation', () => {
  const s = readFileSync(new URL('../../src/screens/LeaderScreen.tsx', import.meta.url), 'utf8');
  assert.ok(s.includes('removeGroup(') && s.includes('reopenGroup(') && s.includes('দল বাদ দিন'));
  assert.match(s, /confirm\([^)]*দল/);
});
