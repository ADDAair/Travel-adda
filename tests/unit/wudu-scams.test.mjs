// Wudu duas (before / during / after) and the scam-warning guide — written before the content (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../src/content/duas.js';
import { GUIDES } from '../../src/content/guides.js';
import { EMERGENCY_NUMBERS } from '../../src/content/emergency.js';

const cats = D.CATEGORIES || D.CATS || D.DUA_CATS;
test('wudu has its own tab with duas before, during and after, each with Arabic, pronunciation, meaning and source', () => {
  assert.ok(cats.some((c) => c.id === 'wudu'), 'wudu tab');
  const w = D.duasByCat('wudu');
  ['before-wudu', 'during-wudu', 'after-wudu'].forEach((id) => assert.ok(w.some((d) => d.id === id), id));
  w.forEach((d) => { assert.ok(d.source, d.id); d.parts.forEach((p) => assert.ok(p.ar && p.pron && p.bn, d.id)); });
  const after = w.find((d) => d.id === 'after-wudu');
  assert.ok(after.parts.length >= 3, 'all three after-wudu duas');
  ['মুসলিম ২৩৪', 'তিরমিজি ৫৫', 'নাসাঈ'].forEach((s) => assert.ok(after.source.includes(s), s));
  assert.ok(D.DUAS.filter((d) => d.id === 'after-wudu').length === 1, 'no duplicate');
});

test('honest note: the limb-by-limb duas people circulate have no authentic source', () => {
  const t = JSON.stringify(D.duasByCat('wudu'));
  assert.ok(t.includes('প্রতিটি অঙ্গ') && t.includes('সহিহ'), 'note present');
});

test('scam guide: before travel and in Makkah/Madinah, with what to do; numbers only on the emergency page', () => {
  const g = GUIDES.find((x) => x.id === 'scams');
  assert.ok(g);
  const t = JSON.stringify(g);
  ['ভিসা', 'পারমিট', 'Nusuk', 'পকেটমার', 'হুইলচেয়ার', 'ট্যাক্সি', 'OTP', 'Travel Adda'].forEach((w) => assert.ok(t.includes(w), w));
  assert.ok(g.blocks.some((b) => b.type === 'link' && b.route === 'Map'));
  assert.ok(g.blocks.some((b) => b.type === 'source'));
  assert.ok(!/\b911\b|৯১১/.test(t));
});

test('Nusuk pilgrim care number is on the emergency page', () => {
  assert.ok(EMERGENCY_NUMBERS.some((n) => n.n.replace(/\D/g, '').endsWith('920002814')));
});
