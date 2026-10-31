// Leaders: give to the help fund and see the account, but no help application (029) — written before the code (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { helpErrorText, fundTabs } from '../../src/lib/fund.ts';

test('the leader\'s offers page shows the fund card too', () => {
  const s = readFileSync(new URL('../../src/screens/LeaderOffersScreen.js', import.meta.url), 'utf8');
  assert.ok(s.includes("import FundCard from '../components/FundCard'") && s.includes('<FundCard'));
});

test('fund page tabs: a leader sees give + account only; a haji also sees apply', () => {
  assert.deepEqual(fundTabs({ role: 'leader' }).map((t) => t.id), ['give', 'report']);
  assert.deepEqual(fundTabs({ role: 'haji', account_type: 'leader' }).map((t) => t.id), ['give', 'report']);
  assert.deepEqual(fundTabs({ role: 'haji', account_type: 'haji' }).map((t) => t.id), ['give', 'apply', 'report']);
  assert.deepEqual(fundTabs(null).map((t) => t.id), ['give', 'apply', 'report']);   // profile not loaded yet: server still checks
  const s = readFileSync(new URL('../../src/screens/FundScreen.tsx', import.meta.url), 'utf8');
  assert.ok(s.includes('fundTabs(') && s.includes('useMe('));
});

test('the server\'s "leader" answer has a plain Bengali message', () => {
  assert.ok(helpErrorText({ code: 'leader' }).includes('লিডার'));
});
