// How the leader application is sent to the server (src/lib/groups.js applyLeader) — written before the change (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './stubs/supabase.mjs';
import { applyLeader } from '../../src/lib/groups.js';

const area = { district: 'নোয়াখালী', upazila: 'কোম্পানীগঞ্জ', union: 'চরহাজারী' };
let inserted;
beforeEach(() => {
  reset(); inserted = [];
  globalThis.__sb = {
    session: { user: { id: 'u1' } },
    from: (table, ops) => {
      const ins = ops.find((o) => o[0] === 'insert');
      if (ins) inserted.push(ins[1]);
      return globalThis.__answer ? globalThis.__answer(ins && ins[1]) : { data: { id: 'app1' }, error: null };
    },
  };
  globalThis.__answer = null;
});

test('Travel Adda leader: only kind, profession, area and the NID path are sent', async () => {
  await applyLeader({ kind: 'travel_adda', agency: 'x', umrah: 'y', area, profession: 'ইমাম' });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].leader_kind, 'travel_adda');
  assert.equal(inserted[0].profession, 'ইমাম');
  assert.equal(inserted[0].union_name, 'চরহাজারী');
  assert.ok(!('agency_name' in inserted[0]) && !('umrah_license' in inserted[0]));
});

test('agency leader: office data and licence numbers are sent', async () => {
  await applyLeader({ kind: 'agency', agency: 'Al Haramain', umrah: 'U-1', hajj: '', area, profession: '' });
  assert.deepEqual([inserted[0].leader_kind, inserted[0].agency_name, inserted[0].license_no, inserted[0].profession], ['agency', 'Al Haramain', 'U-1', null]);
});

test('before step 017: an agency application is still sent (without the new fields); a Travel Adda one says "coming soon"', async () => {
  globalThis.__answer = (row) => (row && ('leader_kind' in row || 'profession' in row)
    ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'leader_kind' column" } } : { data: { id: 'app2' }, error: null });
  const r = await applyLeader({ kind: 'agency', agency: 'Al Haramain', umrah: 'U-1', area, profession: 'ইমাম' });
  assert.deepEqual(r, { id: 'app2' });
  assert.ok(!('leader_kind' in inserted.at(-1)));
  await assert.rejects(applyLeader({ kind: 'travel_adda', area }), { code: 'kinds-soon' });
});

test('a refusal by the server is passed on, never shown as success', async () => {
  globalThis.__answer = () => ({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } });
  await assert.rejects(applyLeader({ kind: 'agency', agency: 'Al Haramain', umrah: 'U-1', area }), { code: '42501' });
});
