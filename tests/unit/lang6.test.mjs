// English step 6 (owner request, Nov 2026): the admin panel, and the last phone-made texts (prayer and document
// reminders, alert channels, fingerprint lock). Same check as steps 2-4: no Bengali text without its English.
// Written first (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTr } from './i18nCheck.mjs';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const BENGALI = /[ঀ-৲৴-৿]/;
const unpaired = (src) => stripTr(src).split('\n')
  .map((l) => (/^\s*\/\//.test(l) || /i18n-ok/.test(l) ? '' : l.replace(/\s\/\/ .*$/, '')))
  .map((l, n) => [n + 1, l]).filter(([, l]) => BENGALI.test(l) && !/\ben: ['"`]/.test(l));

export const STEP6 = ['src/lib/reminders.ts', 'src/lib/docReminders.ts', 'src/lib/push.ts', 'src/lib/applock.ts', 'src/lib/dates.ts', 'src/lib/phone.ts',
  'src/components/Logo.tsx', 'src/lib/admin.ts', 'src/lib/adminMoney.ts', 'src/lib/mfa.ts', 'src/lib/speed.ts', 'src/lib/startup.ts', 'src/lib/contentEdit.ts',
  'src/screens/AdminScreen.tsx', 'src/screens/AdminTools.tsx', 'src/screens/AdminMoney.tsx', 'src/screens/AdminPart4.tsx', 'src/screens/AdminFund.tsx',
  'src/screens/AdminNotify.tsx', 'src/screens/AdminMfa.tsx', 'src/screens/AdminContent.tsx', 'src/screens/AdminSpeed.tsx'];

test('step 6 files: every Bengali text has its English next to it', () => {
  const bad = [];
  for (const f of STEP6) for (const [n, l] of unpaired(read(f))) bad.push(`${f}:${n}: ${l.trim().slice(0, 120)}`);
  assert.deepEqual(bad, []);
});

test('prayer reminders are made again when the language changes', () => {
  assert.ok(/onLang\(\(\) => \{ refreshReminders\(\); \}\)/.test(read('App.tsx')));
});
