// Home shows "আমার সফর" as a short summary; tapping opens the full trip page (owner choice, Nov 2026). Written first (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tripSummary } from '../../src/lib/trip.js';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('nothing yet: no contract, no papers, no date', () => {
  assert.equal(tripSummary({ hasContract: false, left: null, passport: false, visa: false }), 'চুক্তি নেই · কাগজ ০/২ · তারিখ নেই');
});
test('days left first, then contract and papers', () => {
  assert.equal(tripSummary({ hasContract: true, left: 12, passport: true, visa: false }), 'যাত্রার আর ১২ দিন · চুক্তি চালু · কাগজ ১/২');
  assert.equal(tripSummary({ hasContract: true, left: 0, passport: true, visa: true }), 'আজ যাত্রার দিন · চুক্তি চালু · কাগজ ২/২');
  assert.equal(tripSummary({ hasContract: false, left: -3, passport: false, visa: true }), 'সফর চলছে বা শেষ · চুক্তি নেই · কাগজ ১/২');
});
test('a passport about to expire is mentioned (it matters most)', () => {
  assert.equal(tripSummary({ hasContract: false, left: 40, passport: true, visa: false, passLeft: 100 }), 'যাত্রার আর ৪০ দিন · চুক্তি নেই · কাগজ ১/২ · পাসপোর্টের মেয়াদ কম');
});
test('Home uses the short card; the full card lives on its own page "আমার সফর"', async () => {
  const { bn } = await import('../../src/strings.js');   // texts moved to the dictionary (English added, Nov 2026)
  const home = read('src/screens/HomeScreen.tsx');
  assert.ok(home.includes('<TripSummary') && !home.includes('<TripCard'));
  const sum = read('src/components/TripSummary.tsx');
  assert.ok(sum.includes("navigation.navigate('Trip')") && sum.includes('accessibilityRole="button"') && sum.includes('T.common.open') && bn.common.open === 'খুলুন ›');
  const app = read('App.tsx');
  assert.ok(/name="Trip" component=\{TripScreen\} options=\{\{ title: T\.titles\.Trip \}\}/.test(app) && bn.titles.Trip === 'আমার সফর');
  assert.ok(read('src/screens/TripScreen.tsx').includes('<TripCard'));
});
