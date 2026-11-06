// Owner request (Nov 2026): "এখন ব্যবহার করুন" on Home and the lists inside মীকাত ও ইহরাম, হজের দিনগুলো and
// আরও গাইড use the same tile design as "সহায়ক টুল" (icon + Bengali label, gold frame, 3 per row). Written first (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('one shared tile grid: gold frame, 3 per row, big enough to tap, label for screen readers', () => {
  const t = read('src/components/TileGrid.tsx');
  assert.ok(t.includes('export function TileGrid'), 'exports TileGrid');
  assert.ok(t.includes('C.gold'), 'gold frame like সহায়ক টুল');
  assert.ok(/width: '33\.33+%'/.test(t), 'exactly three tiles per row with a fixed width (last row does not stretch)');
  const mh = Number((t.match(/minHeight: (\d+)/) || [])[1]);
  assert.ok(mh >= 96, 'tile at least 96 high (touch target ≥ 48)');
  assert.ok(t.includes('accessibilityRole="button"'));
  assert.ok(/accessibilityLabel=\{T\.tile\.a11y\([\s\S]{0,60}x\.title, x\.what/.test(t), 'the short description is still read aloud (in the chosen language)');
  assert.ok(t.includes('importantForAccessibility="no"'), 'emoji icon is not read aloud');
  assert.ok(t.includes('toBn('), 'order numbers in Bengali digits');
});

test('Home: "এখন ব্যবহার করুন" and "সহায়ক টুল" both use the tile grid; no long cards left in that section', () => {
  const h = read('src/screens/HomeScreen.tsx');
  assert.ok(h.includes("from '../components/TileGrid'"));
  assert.equal((h.match(/<TileGrid/g) || []).length, 2, 'two grids on Home');
  assert.ok(!/READY[\s\S]{0,300}খুলুন ›/.test(h.slice(h.indexOf('এখন ব্যবহার করুন'))), 'old long cards removed');
  assert.ok(h.includes("x.route === 'Dua' ? { tutorialDone: false }"), 'dua tutorial step still works');
  assert.ok(h.includes('hajiOnly'), 'leader accounts still do not see the haji-only tile');
});

test('Ihram, Hajj and More guides lists use the same tile grid; Ihram and Hajj keep their order numbers', () => {
  for (const [f, numbered] of [['IhramScreen', true], ['HajjScreen', true], ['GuidesScreen', false]]) {
    const s = read(`src/screens/${f}.tsx`);
    assert.ok(s.includes("from '../components/TileGrid'"), f);
    assert.ok(s.includes('<TileGrid'), `${f} uses the grid`);
    assert.equal(/<TileGrid[^>]*numbered/.test(s), numbered, `${f} numbered=${numbered}`);
    assert.ok(!s.includes('<Text style={st.openT}>খুলুন ›</Text>') && !s.includes('<Text style={st.open}>খুলুন ›</Text>'), `${f}: old rows removed`);
  }
});

test('frame colour: green (main colour) for main features and guide lists; gold only for সহায়ক টুল', () => {
  const t = read('src/components/TileGrid.tsx');
  assert.ok(/tone\?: 'green' \| 'gold'/.test(t), 'TileGrid has a tone choice');
  assert.ok(/tone = 'green'/.test(t), 'green is the default');
  assert.ok(t.includes('C.primary'), 'green frame uses the app main colour');
  const h = read('src/screens/HomeScreen.tsx');
  const grids = h.match(/<TileGrid[^\n]*/g) || [];
  assert.equal(grids.filter((g) => g.includes('tone="gold"')).length, 1, 'one gold grid on Home');
  assert.ok(/<TileGrid tone="gold" items=\{TOOLS/.test(h), 'the gold one is সহায়ক টুল');
  for (const f of ['IhramScreen', 'HajjScreen', 'GuidesScreen']) {
    assert.ok(!read(`src/screens/${f}.tsx`).includes('tone="gold"'), `${f} uses green`);
  }
});
