// Qibla compass on the phone (owner Nov 2026: "কিবলা ... একটু ভুল করতেছে") — written before the code (TDD).
// The direction itself (great-circle bearing) is checked against the "adhan" library in tests/prayer.test.mjs; here
// the compass side: raw phone headings jump by several degrees, so they are smoothed (also across 359° → 0°), and
// "you face the qibla" must not flicker on and off at the edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { qiblaBearing } from '../../src/lib/prayer.ts';
import { smoothHeading, qiblaTurn, compassWeak, ALIGN_ON, ALIGN_OFF } from '../../src/lib/qibla.ts';

const near = (a, b, d = 0.6) => Math.abs(a - b) <= d;

test('known qibla directions (degrees from true north)', () => {
  assert.ok(near(qiblaBearing(23.8103, 90.4125), 277.6), 'Dhaka ≈ 277.6°');
  assert.ok(near(qiblaBearing(22.87, 91.28), 278.7), 'Companiganj ≈ 278.7°');
  assert.ok(near(qiblaBearing(24.4672, 39.6111), 176.2), 'Madinah ≈ 176° (almost south)');
  assert.ok(near(qiblaBearing(21.5433, 39.1728), 101.1), 'Jeddah ≈ 101° (east)');
});

test('smoothing: first value as is; then moves part of the way; never the long way round 0°', () => {
  assert.equal(smoothHeading(null, 120), 120);
  const s = smoothHeading(100, 120, 0.25);
  assert.ok(near(s, 105, 0.01));
  const w = smoothHeading(355, 5, 0.5);          // 355° → 5° is 10° clockwise, not 350° back
  assert.ok(near(w, 0, 0.01) || near(w, 360, 0.01), String(w));
  const v = smoothHeading(5, 355, 0.5);
  assert.ok(near(v, 0, 0.01) || near(v, 360, 0.01), String(v));
  for (const x of [smoothHeading(359, 2, 0.9), smoothHeading(1, 358, 0.9)]) assert.ok(x >= 0 && x < 360, String(x));
  assert.equal(smoothHeading(100, NaN), 100);    // a broken reading is ignored
});

test('a jumping compass settles near the true direction', () => {
  let h = null;
  const raw = [270, 284, 268, 290, 262, 281, 275, 286, 266, 279, 283, 271, 277, 288, 265, 280];   // ±12° noise around 277
  for (const r of raw) h = smoothHeading(h, r);
  assert.ok(near(h, 277, 4), String(h));
});

test('turn advice: right / left by the shortest way; "facing" switches on at 5° and off only after 9°', () => {
  assert.equal(ALIGN_ON, 5); assert.equal(ALIGN_OFF, 9);
  let t = qiblaTurn(277.6, 250, false);
  assert.equal(t.side, 'right'); assert.equal(t.deg, 28); assert.equal(t.aligned, false);
  t = qiblaTurn(277.6, 300, false);
  assert.equal(t.side, 'left'); assert.equal(t.deg, 22);
  t = qiblaTurn(10, 350, false);                 // across north: 20° to the right
  assert.equal(t.side, 'right'); assert.equal(t.deg, 20);
  assert.equal(qiblaTurn(277.6, 274, false).aligned, true);
  assert.equal(qiblaTurn(277.6, 270, false).aligned, false);    // 7.6° off, was not facing: still not facing
  assert.equal(qiblaTurn(277.6, 270, true).aligned, true);      // 7.6° off, was facing: stays (no flicker)
  assert.equal(qiblaTurn(277.6, 267, true).aligned, false);     // 10.6° off: off
});

test('weak compass warning: Android reports 0–3 (3 = best), iPhone reports degrees of error', () => {
  assert.equal(compassWeak(3, 'android'), false);
  assert.equal(compassWeak(1, 'android'), true);
  assert.equal(compassWeak(0, 'android'), true);
  assert.equal(compassWeak(5, 'ios'), false);       // ±5° is good on iPhone (the old check showed a warning here)
  assert.equal(compassWeak(30, 'ios'), true);
  assert.equal(compassWeak(-1, 'ios'), true);       // iPhone: negative = not calibrated
  assert.equal(compassWeak(undefined, 'android'), false);
});

test('the qibla page uses the smoothed heading and these rules', () => {
  const s = readFileSync(new URL('../../src/screens/PrayerScreen.tsx', import.meta.url), 'utf8');
  assert.ok(s.includes('smoothHeading(') && s.includes('qiblaTurn(') && s.includes('compassWeak('));
});
