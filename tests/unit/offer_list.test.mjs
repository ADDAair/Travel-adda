// Offer page for many packages (owner choice Nov 2026: options 1+2+3): short cards, two "special" cards on top
// (cheapest, newest) and month buttons with "from" price once there are many packages. Badges are computed by the
// app only (never bought, never fake). Written first (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { badgesFor, featured, monthBar, shortDates, nightsText, walkText, FEATURED_MIN, MONTH_BAR_MIN, NEW_DAYS, SEATS_FEW, SEATS_FRESH_DAYS, seatsNow, badgeText, seatsLine } from '../../src/lib/offerList.js';

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
  assert.ok(c.includes('badgeText(b, o)'), 'card shows the badge words (with the seat number)');
  assert.ok(c.includes('walkText(') && c.includes('nightsText(') && c.includes('shortDates('), 'short card lines');
  assert.ok(!/আসন সীমিত/.test(c + s + l), 'never a vague "seats limited"; only the number the leader gave');
});

test('owner request: month (কোন মাসে যাবেন) and quick price (অথবা এক চাপে বাছুন) are chosen from dropdowns, not rows of buttons', () => {
  const s = read('src/screens/OffersScreen.tsx');
  assert.ok(/function Dropdown\b/.test(s), 'one shared dropdown');
  assert.ok(s.includes('accessibilityState={{ expanded: open }}'), 'screen reader hears open / closed');
  assert.ok(/<Dropdown[^>]*label=\{tr\('অথবা এক চাপে বাছুন'/.test(s), 'quick price is a dropdown');
  assert.ok(!/<Pills label="অথবা এক চাপে বাছুন"/.test(s), 'no row of price buttons');
  const bar = s.slice(s.indexOf('function MonthBar'), s.indexOf('function HajiOffers'));
  assert.ok(bar.includes('<Dropdown') && !bar.includes('<Pill '), 'month buttons became a dropdown');
  assert.ok(bar.includes('থেকে'), 'each month still says the "from" price');
  assert.ok(/monthFilterFor\(kind\) && !bar\.length \? <MonthDropdown/.test(s), 'only one month choice on the page at a time');
});

// 034: the leader says how many seats are left. Shown only when he said it recently (a stale number is hidden).
const SEAT = (id, price, seats, daysAgo) => ({ id, price_bdt: price, depart_on: '2027-01-10', created_at: ago(30), seats_left: seats, seats_updated_at: daysAgo == null ? null : ago(daysAgo) });

test('seat limits: badge for 10 or fewer seats, number counts for 14 days', () => {
  assert.equal(SEATS_FEW, 10); assert.equal(SEATS_FRESH_DAYS, 14);
});

test('seats count only when the leader said it in the last 14 days', () => {
  assert.equal(seatsNow(SEAT('a', 1, 5, 2), NOW), 5);
  assert.equal(seatsNow(SEAT('a', 1, 0, 2), NOW), 0);
  assert.equal(seatsNow(SEAT('a', 1, 5, 15), NOW), null, 'old number is not shown');
  assert.equal(seatsNow(SEAT('a', 1, null, null), NOW), null);
  assert.equal(seatsNow(SEAT('a', 1, 5, -2), NOW), null, 'a future time is not trusted');
  assert.equal(seatsNow({ id: 'x' }, NOW), null, 'before 034 is run nothing breaks');
});

test('badges: few seats left, seats full; a full package is never "cheapest" or special', () => {
  const rows = [SEAT('a', 100, 0, 1), SEAT('b', 200, 4, 1), SEAT('c', 300, 40, 1), SEAT('d', 400, 3, 20)];
  const b = badgesFor(rows, NOW);
  assert.deepEqual(b.a, ['full']);
  assert.deepEqual(b.b, ['cheap', 'seats']);
  assert.equal(b.c, undefined, '40 seats: no badge');
  assert.equal(b.d, undefined, 'stale number: no badge');
  assert.ok(!featured(rows, NOW).some((x) => x.o.id === 'a'));
  assert.equal(featured(rows, NOW)[0].o.id, 'b');
});

test('badge words and the line on the package page', () => {
  assert.equal(badgeText('seats', SEAT('b', 1, 4, 1), NOW), '⏳ আসন বাকি ৪টি');
  assert.equal(badgeText('full'), '⛔ আসন শেষ');
  assert.equal(badgeText('cheap'), '🏷️ সবচেয়ে কম দাম');
  assert.equal(seatsLine({ seats_left: 7, seats_updated_at: '2026-11-03T08:00:00Z' }, NOW), '৭টি আসন বাকি · লিডার জানিয়েছেন ৩ নভেম্বর');
  assert.equal(seatsLine({ seats_left: 0, seats_updated_at: '2026-11-03T08:00:00Z' }, NOW), 'সব আসন শেষ · লিডার জানিয়েছেন ৩ নভেম্বর');
  assert.equal(seatsLine({ seats_left: 7, seats_updated_at: '2026-10-01T08:00:00Z' }, NOW), '');
});

test('the leader can say seats on his own package page (server function), the haji page shows it', () => {
  const lib = read('src/lib/offers.ts');
  assert.ok(lib.includes("supabase.rpc('set_offer_seats'"));
  const l = read('src/screens/LeaderOffersScreen.tsx');
  assert.ok(l.includes('<SeatsBox') && l.includes('আসন সংখ্যা জানান'));
  assert.ok(l.includes("'bad_value'") && l.includes("'not_found'"), 'each server answer has its own Bengali message');
  const c = read('src/components/OfferCard.tsx');
  assert.ok(c.includes('seatsLine('), 'package page shows seats with the date');
});
