// Package journey, leader search and filters (src/lib/offerRoute.js) — written before the code (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIRPORTS_BD, AIRPORTS_SA, hasRoute, routeSteps, routeShort, checkRoute, routeRow, filterOffers, monthOptions, PRICE_LIMITS, leaderKey, parsePrice }
  from '../../src/lib/offerRoute.js';

const o = { id: '1', depart_on: '2027-01-20', return_on: '2027-02-03', from_airport: 'DAC', arrive_at: 'JED', first_city: 'makkah',
  makkah_nights: 7, madinah_nights: 5, return_from: 'MED', return_to: 'DAC', airline: 'বিমান বাংলাদেশ', price_bdt: 160000,
  leader_code: 'TL-00004', leader_name: 'আবদুল করিম', agency_name: 'Al Haramain', title: 'রমজান প্যাকেজ' };

test('airport lists: three in Bangladesh, two in Saudi Arabia, Bengali names', () => {
  assert.deepEqual(AIRPORTS_BD.map((a) => a.id), ['DAC', 'CGP', 'ZYL']);
  assert.deepEqual(AIRPORTS_SA.map((a) => a.id), ['JED', 'MED']);
  assert.equal(AIRPORTS_BD[0].label, 'ঢাকা');
});

test('journey steps in travel order, nights in Bengali digits', () => {
  const s = routeSteps(o);
  assert.equal(s.length, 4);
  assert.ok(s[0].text.includes('ঢাকা') && s[0].text.includes('জেদ্দা') && s[0].text.includes('বিমান বাংলাদেশ'));
  assert.ok(s[1].title.includes('মক্কা') && s[1].text.includes('৭ রাত'));
  assert.ok(s[2].title.includes('মদিনা') && s[2].text.includes('৫ রাত'));
  assert.ok(s[3].text.includes('মদিনা') && s[3].text.includes('ঢাকা'));
});

test('madinah first when the package starts in madinah; a city with 0 nights is left out', () => {
  const s = routeSteps({ ...o, first_city: 'madinah', arrive_at: 'MED' });
  assert.ok(s[1].title.includes('মদিনা') && s[2].title.includes('মক্কা'));
  assert.equal(routeSteps({ ...o, madinah_nights: 0 }).length, 3);
});

test('old package without journey: no steps, short text says not stated', () => {
  assert.equal(hasRoute({}), false);
  assert.equal(routeSteps({}), null);
  assert.equal(routeShort({}), 'যাত্রাপথ উল্লেখ নেই');
  assert.equal(routeShort(o), 'ঢাকা → মক্কা ৭ রাত → মদিনা ৫ রাত → ঢাকা');
});

test('journey form check: everything chosen, at least 1 night in Makkah, nights fit the trip', () => {
  const r = { from: 'DAC', arrive: 'JED', first: 'makkah', mk: '৭', md: '৫', back: 'MED', to: 'DAC' };
  assert.deepEqual(checkRoute(r, 15), {});
  assert.ok(checkRoute({ ...r, from: '' }, 15).from);
  assert.ok(checkRoute({ ...r, mk: '0' }, 15).mk);
  assert.ok(checkRoute({ ...r, md: 'x' }, 15).md);
  const e = checkRoute({ ...r, mk: '10', md: '6' }, 15);
  assert.ok(e.md && e.md.includes('১৪'), 'tells how many nights fit');
});

test('form values become database values (Bengali digits accepted)', () => {
  assert.deepEqual(routeRow({ from: 'DAC', arrive: 'JED', first: 'makkah', mk: '৭', md: '', back: 'MED', to: 'DAC', airline: '  ' }),
    { from_airport: 'DAC', arrive_at: 'JED', first_city: 'makkah', makkah_nights: 7, madinah_nights: 0, return_from: 'MED', return_to: 'DAC', airline: null });
});

test('leader search: by ID in any form, or by name / agency', () => {
  assert.equal(leaderKey('tl-০০০০৪'), 'TL00004');
  const rows = [o, { ...o, id: '2', leader_code: 'TL-00009', leader_name: 'রহিম', agency_name: 'Zamzam' }];
  assert.deepEqual(filterOffers(rows, { q: 'TL-00004' }).map((x) => x.id), ['1']);
  assert.deepEqual(filterOffers(rows, { q: 'tl০০০০৪' }).map((x) => x.id), ['1']);
  assert.deepEqual(filterOffers(rows, { q: 'zamzam' }).map((x) => x.id), ['2']);
  assert.deepEqual(filterOffers(rows, { q: 'রহিম' }).map((x) => x.id), ['2']);
  assert.equal(filterOffers(rows, { q: '' }).length, 2);
});

test('filters: month, departure airport, highest price; they combine', () => {
  const rows = [o, { ...o, id: '2', depart_on: '2027-03-01', from_airport: 'CGP', price_bdt: 250000 }, { ...o, id: '3', from_airport: null, price_bdt: 140000 }];
  assert.deepEqual(filterOffers(rows, { month: '2027-01' }).map((x) => x.id), ['1', '3']);
  assert.deepEqual(filterOffers(rows, { airport: 'CGP' }).map((x) => x.id), ['2']);
  assert.deepEqual(filterOffers(rows, { maxPrice: 200000 }).map((x) => x.id), ['1', '3']);
  assert.deepEqual(filterOffers(rows, { month: '2027-01', airport: 'DAC', maxPrice: 200000 }).map((x) => x.id), ['1']);
  assert.deepEqual(PRICE_LIMITS, [150000, 200000, 300000]);
});

test('month choices: every month of the next year (even with no package yet) plus later package months, with counts', () => {
  const rows = [{ depart_on: '2027-03-01' }, { depart_on: '2027-01-20' }, { depart_on: '2027-01-25' }, { depart_on: '2028-02-10' }];
  const m = monthOptions(rows, '2026-10-24');
  assert.equal(m[0].id, '2026-10');
  assert.equal(m[11].id, '2027-09');
  assert.equal(m.at(-1).id, '2028-02', 'a package month beyond the year is still offered');
  assert.equal(m.length, 13);
  const jan = m.find((x) => x.id === '2027-01');
  assert.equal(jan.label, 'জানুয়ারি ২০২৭ (২টি)');
  assert.equal(m.find((x) => x.id === '2026-11').label, 'নভেম্বর ২০২৬ (০টি)');
});

test('typed price: Bengali digits, commas and "লাখ" words become a number; nonsense is refused', () => {
  assert.equal(parsePrice('১,৮০,০০০'), 180000);
  assert.equal(parsePrice('180000'), 180000);
  assert.equal(parsePrice('২.৫ লাখ'), 250000);
  assert.equal(parsePrice('2 lakh'), 200000);
  assert.equal(parsePrice(''), null);
  assert.ok(Number.isNaN(parsePrice('অনেক')));
  assert.ok(Number.isNaN(parsePrice('0')));
});
