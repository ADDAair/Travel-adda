// Prayer history (owner, Nov 2026): at the end of every prayer, from the Qur'an and authentic hadith only, each with its
// source. The popular but unproven "which prophet first prayed which prayer" story is NOT included (owner's choice).
// Everything that was there before stays. Written before the content (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SALAH, SALAH_GROUPS } from '../../src/content/salah.js';

const sec = (id) => SALAH.find((s) => s.id === id);
const hist = (id) => (sec(id).blocks.find((b) => b.type === 'history') || {}).items || [];

test('every prayer ends with a history part, every item has a source', () => {
  for (const id of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah', 'witr', 'nafl', 'eid']) {
    const b = sec(id).blocks;
    assert.equal(b[b.length - 1].type, 'history', `${id}: history comes last`);
    assert.ok(hist(id).length >= 1, id);
    for (const it of hist(id)) { assert.ok(it.title && it.text, id); assert.ok(it.source && it.source.length > 3, `${id}: ${it.title} needs a source`); }
  }
});
test('the main facts are there', () => {
  const all = (id) => hist(id).map((x) => x.text + ' ' + x.source).join(' ');
  assert.ok(/মিরাজ/.test(all('origin')) && /৫০/.test(all('origin')) && /বুখারি ৩৪৯/.test(all('origin')));
  assert.ok(/জিবরাইল/.test(all('dhuhr')) && /আবু দাউদ ৩৯৩/.test(all('dhuhr')));
  assert.ok(/আসআদ ইবনে যুরারা/.test(all('jumuah')) && /৬২:৯/.test(all('jumuah')));
  assert.ok(/মুযযাম্মিল/.test(all('nafl')));
  assert.ok(/উমর/.test(all('nafl')) && /বুখারি ২০১০/.test(all('nafl')));
  assert.ok(/কিবলা/.test(all('origin')) && /আজান/.test(all('origin')));
});
test('the unproven "first prayed by prophet X" story is not included', () => {
  const txt = JSON.stringify(SALAH);
  assert.ok(!/আদম \(আ\.\)[^"]{0,40}ফজর|ফজর[^"]{0,40}আদম \(আ\.\)/.test(txt));
  assert.ok(!/ইউনুস \(আ\.\)[^"]{0,40}আসর|আসর[^"]{0,40}ইউনুস \(আ\.\)/.test(txt));
});
test('the general story ("নামাজ ফরজ হওয়ার ইতিহাস") is first in the list; old parts unchanged', () => {
  assert.deepEqual(SALAH_GROUPS[0].ids, ['origin']);
  assert.deepEqual(SALAH_GROUPS.slice(1).map((g) => g.ids), [['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'], ['jumuah', 'witr', 'nafl', 'eid'], ['wudu', 'method', 'women', 'makruh']]);
  assert.equal(sec('fajr').blocks[0].type, 'rakat');
});
test('the screen draws the history part with its own heading', () => {
  const s = readFileSync(new URL('../../src/screens/SalahScreen.tsx', import.meta.url), 'utf8');
  assert.ok(s.includes("b.type === 'history'") && s.includes('📜 ইতিহাস'));
});
