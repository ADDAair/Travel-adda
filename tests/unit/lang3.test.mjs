// English step 3 (owner request, Nov 2026): guides, duas, prayer rules and the other bundled content in English.
// The Bengali content files are not touched; each has an English file (src/content/en/*.ts) of "path → text".
// This test makes sure every Bengali text has its English, the English has no Bengali left, no English is left over
// for a text that no longer exists, and every number (hadith numbers, counts, verses) is the same in both.
// Written first (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLang } from '../../src/lib/lang.js';
import { bengaliTexts, inLang, translate } from '../../src/lib/contentLang.js';
import { stripTr } from './i18nCheck.mjs';

globalThis.require = globalThis.require || (() => 1);   // picture files in ihram.ts (only their number matters)
const BENGALI = /[ঀ-৲৴-৿]/;
const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
beforeEach(async () => { await setLang('bn'); });

export const MODULES = ['duas', 'guides', 'salah', 'ihram', 'hajj', 'umrah', 'privacy', 'quranNames'];
const digits = (s) => (s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).match(/\d+/g) || []).sort();

for (const m of MODULES) {
  test(`${m}: every Bengali text has its English, with the same numbers`, async () => {
    const bn = await import(`../../src/content/${m}.ts`);
    const { EN } = await import(`../../src/content/en/${m}.ts`);
    const want = {};
    for (const [k, v] of Object.entries(bn)) if (typeof v !== 'function') Object.assign(want, bengaliTexts(v, k));
    const missing = Object.keys(want).filter((p) => typeof EN[p] !== 'string');
    assert.deepEqual(missing, [], 'English missing');
    const extra = Object.keys(EN).filter((p) => !(p in want));
    assert.deepEqual(extra, [], 'English for a text that no longer exists');
    const bengali = Object.entries(EN).filter(([, v]) => BENGALI.test(v)).map(([p]) => p);
    assert.deepEqual(bengali, [], 'Bengali left in the English');
    const nums = Object.keys(want).filter((p) => digits(want[p]).join(',') !== digits(EN[p]).join(',') && !/\[n\]/.test(EN[p] || '')).map((p) => `${p}: ${digits(want[p])} vs ${digits(EN[p])}`);
    assert.deepEqual(nums, [], 'numbers differ');
  });
}

test('the copy in English never changes the Bengali original, keeps Arabic and settings', async () => {
  const v = [{ id: 'a', title: 'ছানা', ar: 'سُبْحَانَكَ', icon: '🕌', parts: [{ bn: 'অর্থ', pron: 'সুবহানাকা' }] }];
  const en = { 'X.a.title': 'Sana', 'X.a.parts.0.bn': 'Meaning', 'X.a.parts.0.pron': 'Subhanaka' };
  const t = translate(v, 'X', en);
  assert.deepEqual(t, [{ id: 'a', title: 'Sana', ar: 'سُبْحَانَكَ', icon: '🕌', parts: [{ bn: 'Meaning', pron: 'Subhanaka' }] }]);
  assert.equal(v[0].title, 'ছানা');
  assert.equal(inLang(v, 'X', en), v, 'Bengali: the content itself');
  await setLang('en');
  assert.equal(inLang(v, 'X', en)[0].title, 'Sana');
  assert.equal(inLang(v, 'X', en), inLang(v, 'X', en), 'made once');
});

export const STEP3 = ['src/screens/DuaScreen.tsx', 'src/screens/HajjScreen.tsx', 'src/screens/IhramScreen.tsx', 'src/screens/UmrahScreen.tsx',
  'src/screens/SalahScreen.tsx', 'src/screens/GuidesScreen.tsx', 'src/screens/PrivacyScreen.tsx', 'src/screens/Quran.tsx', 'src/components/guide.tsx'];
const unpaired = (src) => stripTr(src).split('\n')
  .map((l) => (/^\s*\/\//.test(l) || /i18n-ok/.test(l) ? '' : l.replace(/\s\/\/ .*$/, '')))
  .map((l, n) => [n + 1, l]).filter(([, l]) => BENGALI.test(l) && !/\ben: ['"`]/.test(l));
test('step 3 pages: every Bengali text has its English, and the pages use the English content', () => {
  const bad = [];
  for (const f of STEP3) for (const [n, l] of unpaired(read(f))) bad.push(`${f}:${n}: ${l.trim().slice(0, 120)}`);
  assert.deepEqual(bad, []);
  for (const f of STEP3.filter((x) => !x.includes('guide.tsx'))) assert.ok(read(f).includes('inLang('), `${f} uses inLang`);
});
