// "More guides" content (src/content/guides.js) and the emergency hotel card fields — written before the content (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDES } from '../../src/content/guides.js';
import { EMERGENCY_FIELDS, LOST_CARD_ROWS } from '../../src/content/emergency.js';

const KNOWN = new Set(['notice', 'source', 'steps', 'phrases', 'checklist', 'places', 'link']);
const text = (g) => JSON.stringify(g);
const NEW = ['haram', 'nabawi', 'nusuk', 'lost', 'hotels', 'transport', 'zamzam'];

test('every guide has a unique id, an icon, a Bengali title and only known block types', () => {
  const ids = GUIDES.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, 'no guide twice');
  GUIDES.forEach((g) => {
    assert.ok(g.icon && g.title && g.what, g.id);
    g.blocks.forEach((b) => assert.ok(KNOWN.has(b.type), `${g.id}: ${b.type}`));
  });
});

test('the new guides exist and each names its sources', () => {
  NEW.forEach((id) => {
    const g = GUIDES.find((x) => x.id === id);
    assert.ok(g, id);
    assert.ok(g.blocks.some((b) => b.type === 'source'), `${id} has a source`);
  });
});

test('unsure facts (gate colours, toilet places) are marked as a general idea to check on the spot', () => {
  ['haram', 'nabawi'].forEach((id) => {
    const t = text(GUIDES.find((x) => x.id === id));
    assert.ok(t.includes('টয়লেট'), `${id} talks about toilets`);
    assert.ok(t.includes('সাধারণ ধারণা'), `${id} says it is a general idea`);
    assert.ok(t.includes('রং') || t.includes('রঙ'), `${id} answers the colour question`);
  });
});

test('gate guide states the verified main gates', () => {
  const t = text(GUIDES.find((x) => x.id === 'haram'));
  ['বাদশাহ আবদুল আজিজ', 'সাফা', 'মারওয়া', 'বাব উমরাহ', 'বাদশাহ ফাহাদ', 'বাদশাহ আবদুল্লাহ'].forEach((w) => assert.ok(t.includes(w), w));
  const n = text(GUIDES.find((x) => x.id === 'nabawi'));
  ['বাবুস সালাম', 'বাবুল বাকি', 'বাবুন নিসা', '৪২'].forEach((w) => assert.ok(n.includes(w), w));
});

test('Rawdah needs a Nusuk booking — said plainly, with steps', () => {
  const g = GUIDES.find((x) => x.id === 'nusuk');
  assert.ok(text(g).includes('রওজা'));
  assert.ok(g.blocks.some((b) => b.type === 'steps' && b.steps.length >= 4));
});

test('no duplicates: emergency numbers live only on the emergency page; the lost guide links there', () => {
  NEW.forEach((id) => assert.ok(!/\b911\b|৯১১/.test(text(GUIDES.find((x) => x.id === id))), `${id} must not repeat 911`));
  const lost = GUIDES.find((x) => x.id === 'lost');
  assert.ok(lost.blocks.some((b) => b.type === 'link' && b.route === 'Map'));
  assert.ok(!text(lost).match(/\+966|0\d{2}-\d/), 'no unverified phone numbers');
});

test('hotel card also keeps the nearest Haram gate and the group meeting place, shown on the lost card in Arabic', () => {
  const k = EMERGENCY_FIELDS.map((f) => f.k);
  ['hotelName', 'hotelAddr', 'madHotel', 'madAddr', 'nearGate', 'meetPlace'].forEach((x) => assert.ok(k.includes(x), x));
  const rows = LOST_CARD_ROWS.map((r) => r.k);
  assert.ok(rows.includes('nearGate') && rows.includes('meetPlace'));
  LOST_CARD_ROWS.forEach((r) => assert.ok(/[؀-ۿ]/.test(r.ar), `${r.k} has Arabic`));
});

test('Saudi Visa Bio fingerprint guide: official app, application number first, all 10 fingers, clear steps and fixes', () => {
  const g = GUIDES.find((x) => x.id === 'visabio');
  assert.ok(g, 'guide exists');
  const t = text(g);
  ['Saudi Visa Bio', 'পররাষ্ট্র মন্ত্রণালয়', 'আবেদন নম্বর', '১০টি আঙুল', 'ওমরাহ'].forEach((w) => assert.ok(t.includes(w), w));
  const steps = g.blocks.filter((b) => b.type === 'steps').flatMap((b) => b.steps);
  assert.ok(steps.length >= 8, 'step by step');
  assert.ok(g.blocks.some((b) => b.type === 'source'));
  assert.ok(t.includes('নকল'), 'warns about fake apps / sellers');
});
