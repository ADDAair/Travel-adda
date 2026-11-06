// English step 4 (owner request, Nov 2026): the leader's and khadem's pages. Same rule as step 2: every Bengali text
// has its English right beside it (tr('বাংলা', 'English') or a table row with `en`). Written first (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTr } from './i18nCheck.mjs';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const BENGALI = /[ঀ-৲৴-৿]/;
const unpaired = (src) => stripTr(src).split('\n')
  .map((l) => (/^\s*\/\//.test(l) || /i18n-ok/.test(l) ? '' : l.replace(/\s\/\/ .*$/, '')))
  .map((l, n) => [n + 1, l]).filter(([, l]) => BENGALI.test(l) && !/\ben: ['"`]/.test(l));

export const STEP4 = ['src/screens/LeaderScreen.tsx', 'src/screens/LeaderOffersScreen.tsx', 'src/screens/LeaderContractsScreen.tsx',
  'src/screens/LeaderApplyScreen.tsx', 'src/screens/LeaderMeScreen.tsx', 'src/screens/GroupStaffScreen.tsx', 'src/screens/KhademHomeScreen.tsx',
  'src/screens/HelpInboxScreen.tsx', 'src/lib/leaderKinds.ts', 'src/components/WorkAreaFields.tsx', 'src/lib/chatConsent.ts'];

test('step 4 files (leader and khadem): every Bengali text has its English next to it', () => {
  const bad = [];
  for (const f of STEP4) for (const [n, l] of unpaired(read(f))) bad.push(`${f}:${n}: ${l.trim().slice(0, 120)}`);
  assert.deepEqual(bad, []);
});
