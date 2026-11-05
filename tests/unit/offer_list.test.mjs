// Offer page for many packages (owner choice Nov 2026: options 1+2+3): short cards, two "special" cards on top
// (cheapest, newest) and month buttons with "from" price once there are many packages. Badges are computed by the
// app only (never bought, never fake). Written first (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { badgesFor, featured, monthBar, shortDates, nightsText, walkText, FEATURED_MIN, MONTH_BAR_MIN, NEW_DAYS } from '../../src/lib/offerList.js';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-05T12:00:00Z');
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const P = (id, price, dep, created, extra = {}) => ({ id, price_bdt: price, depart_on: dep, return_on: dep, created_at: created, ...extra });

test('limits: special cards from 4 packages, month buttons from more than 10, "new" for 7 days', () => {
  assert.equal(FEATURED_MIN, 4); assert.equal(MONTH_BAR_MIN, 11); assert.equal(NEW_DAYS, 7);
});

test('badges: the cheapest package (ties all get it) and packages added in the last 7 days', () => {
  const rows = [P('a', 160000, '2027-01-20', ago(30)), P('b', 175000, '2026-12-05', ago(2)), P('c', 160000, '2027-02-01', ago(8))];
  const b = badgesFor(rows, NOW);
  assert.deepEqual(b.a, ['cheap']); assert.deepEqual(b.b, ['new']); assert.deepEqual(b.c, ['cheap']);
});

test('no "cheapest" badge when there is only one package (nothing to compare), "new" still works', () => {
  assert.deepEqual(badgesFor([P('a', 160000, '2027-01-20', ago(1))], NOW), { a: ['new'] });
  assert.deepEqual(badgesFor([], NOW), {});
});

test('a broken or future date never makes a package "new"', () => {
  const b = badgesFor([P('a', 1, '2027-01-01', 'bad'), P('b', 2, '2027-01-01', ago(-3)), P('c', 3, '2027-01-01', null)], NOW);
  assert.deepEqual(b.a, ['cheap']); assert.equal(b.b, undefined); assert.equal(b.c, undefined);
});

test('special cards: only from 4 packages; cheapest first, then the newest other one', () => {
  const three = [P('a', 3, '2027-01-01', ago(1)), P('b', 2, '2027-01-01', ago(9)), P('c', 1, '2027-01-01', ago(20))];
  assert.deepEqual(featured(three, NOW), []);
  const four = [...three, P('d', 5, '2027-01-01', ago(0.5))];
  assert.deepEqual(featured(four, NOW).map((x) => [x.o.id, x.why]), [['c', 'cheap'], ['d', 'new']]);
  const noNew = four.map((x) => ({ ...x, created_at: ago(30) }));
  assert.deepEqual(featured(noNew, NOW).map((x) => x.why), ['cheap'], 'no new package: only one special card');
});

test('month buttons: only for more than 10 packages over 2+ months; each says count and "from" price', () => {
  const many = Array.from({ length: 11 }, (_, i) => P(`p${i}`, 150000 + i * 1000, i < 6 ? '2027-01-10' : '2026-12-03', ago(30)));
  const bar = monthBar(many);
  assert.deepEqual(bar.map((m) => m.id), ['2026-12', '2027-01'], 'in date order');
  assert.equal(bar[0].label, 'ডিসেম্বর ২০২৬');
  assert.equal(bar[0].count, 5); assert.equal(bar[1].count, 6);
  assert.equal(bar[1].from, 150000); assert.equal(bar[0].from, 156000);
  assert.deepEqual(monthBar(many.slice(0, 10)), [], '10 packages: no buttons');
  assert.deepEqual(monthBar(many.map((x) => ({ ...x, depart_on: '2027-01-10' }))), [], 'one month only: no buttons');
});

test('short lines on the card: dates, nights, walking distance (Bengali digits)', () => {
  assert.equal(shortDates({ depart_on: '2027-01-20', return_on: '2027-02-03' }), '২০ জানু – ৩ ফেব্রু');
  assert.equal(shortDates({ depart_on: '2027-12-28', return_on: '2028-01-10' }), '২৮ ডিসে – ১০ জানু');
  assert.equal(shortDates({ depart_on: null, return_on: null }), '');
  assert.equal(nightsText({ makkah_nights: 10, madinah_nights: 5 }), 'মক্কা ১০ রাত · মদিনা ৫ রাত');
  assert.equal(nightsText({ makkah_nights: 10, madinah_nights: null }), 'মক্কা ১০ রাত');
  assert.equal(nightsText({}), '');
  assert.equal(walkText(800), 'হারাম থেকে ৮০০ মিটার');
  assert.equal(walkText(1200), 'হারাম থেকে ১.২ কিমি');
  assert.equal(walkText(null), '');
});

test('the offer page uses the short cards, special cards and month buttons; badges come from the app', () => {
  const s = read('src/screens/OffersScreen.tsx');
  assert.ok(s.includes("from '../lib/offerList'"));
  assert.ok(s.includes('badgesFor(rows') && s.includes('featured(rows') && s.includes('monthBar(rows'));
  assert.ok(s.includes('<Featured') && s.includes('<MonthBar'));
  const c = read('src/components/OfferCard.tsx');
  const l = read('src/lib/offerList.ts');
  assert.ok(l.includes('সবচেয়ে কম দাম') && l.includes('নতুন'), 'badge words');
  assert.ok(c.includes('BADGE_TEXT[b]'), 'card shows the badge words');
  assert.ok(c.includes('walkText(') && c.includes('nightsText(') && c.includes('shortDates('), 'short card lines');
  assert.ok(!/আসন (বাকি|সীমিত)/.test(c + s + l), 'no seat badge until leaders can enter real seats');
});

test('owner request: month (কোন মাসে যাবেন) and quick price (অথবা এক চাপে বাছুন) are chosen from dropdowns, not rows of buttons', () => {
  const s = read('src/screens/OffersScreen.tsx');
  assert.ok(/function Dropdown\b/.test(s), 'one shared dropdown');
  assert.ok(s.includes('accessibilityState={{ expanded: open }}'), 'screen reader hears open / closed');
  assert.ok(/<Dropdown[^>]*label="অথবা এক চাপে বাছুন"/.test(s), 'quick price is a dropdown');
  assert.ok(!/<Pills label="অথবা এক চাপে বাছুন"/.test(s), 'no row of price buttons');
  const bar = s.slice(s.indexOf('function MonthBar'), s.indexOf('function HajiOffers'));
  assert.ok(bar.includes('<Dropdown') && !bar.includes('<Pill '), 'month buttons became a dropdown');
  assert.ok(bar.includes('থেকে'), 'each month still says the "from" price');
  assert.ok(/monthFilterFor\(kind\) && !bar\.length \? <MonthDropdown/.test(s), 'only one month choice on the page at a time');
});
