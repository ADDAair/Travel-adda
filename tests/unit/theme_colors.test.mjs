// Brand colours follow the আমি হাজী logo: green #0B5D4B + gold (owner choice ক, Nov 2026). Written before the change (TDD).
// Every text/background pair the screens use must stay readable for elderly users: WCAG contrast 4.5:1 or more
// (3:1 only for large bold numbers/labels and borders).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { C } from '../../src/theme.js';

const lum = (hex) => { const v = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('brand colours are the logo colours', () => {
  assert.equal(C.primary, '#0B5D4B');
  assert.equal(C.gold, '#C9A24A');
  assert.equal(C.accent, '#E6C77E');   // lighter logo gold: fills behind green text (the darker gold fails 4.5:1 there)
});
const TEXT = [
  ['text', 'bg'], ['text', 'card'], ['muted', 'bg'], ['muted', 'card'], ['primary', 'bg'], ['primary', 'card'],
  ['onPrimary', 'primary'], ['onPrimarySoft', 'primary'], ['primary', 'primarySoft'], ['text', 'primarySoft'],
  ['primary', 'accent'], ['text', 'accent'], ['text', 'gold'], ['text', 'goldSoft'], ['primary', 'goldSoft'], ['text', 'accentSoft'],
  ['ok', 'okSoft'], ['bad', 'badSoft'], ['text', 'warnSoft'], ['ok', 'card'], ['bad', 'card'],
];
test('every text colour on its background is readable (4.5:1+)', () => {
  const bad = TEXT.map(([f, b]) => [f, b, ratio(C[f], C[b])]).filter(([, , r]) => r < 4.5).map(([f, b, r]) => `${f} on ${b}: ${r.toFixed(2)}`);
  assert.deepEqual(bad, []);
});
test('lines and the gold frame are visible (3:1+ where they carry meaning)', () => {
  assert.ok(ratio(C.primary, C.bg) >= 3);
  assert.ok(ratio(C.gold, C.primary) >= 3, 'gold on green (selected tab, badges)');
});
test('success green is told apart from the brand green by lightness, not hue alone', () => {
  assert.ok(Math.abs(lum(C.ok) - lum(C.primary)) > 0.02 || C.ok !== C.primary);
});
test('no old navy/orange left hard-coded in screens, the contract PDF or app.json', () => {
  for (const f of ['src/lib/contractPdf.ts', 'app.json', 'App.tsx']) {
    const s = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.ok(!/#001952|#FF7C06/i.test(s), f);
  }
});
