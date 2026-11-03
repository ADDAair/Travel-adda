// The real "আমি হাজী" logo (owner's logo artifact, Nov 2026) replaces the temporary icon. Written before the change (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
// PNG header: width, height, colour type (6 = RGBA with transparency, 2 = RGB)
const png = (f) => { const b = readFileSync(new URL(f, root)); assert.equal(b.toString('latin1', 1, 4), 'PNG', f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] }; };

test('app icon, Android adaptive icon and the in-app mark are the new logo files', () => {
  assert.deepEqual(png('assets/icon.png'), { w: 1024, h: 1024, type: 2 });              // full square, green background
  const a = png('assets/adaptive-icon.png'); assert.equal(a.w, 1024); assert.equal(a.type, 6);   // transparent foreground
  const m = png('assets/logo-mark.png'); assert.equal(m.type, 6); assert.ok(m.w >= 256 && m.h >= 256);
  const n = png('assets/notification-icon.png'); assert.deepEqual([n.w, n.h, n.type], [96, 96, 6]);
});
test('brand green behind the icon and in the notification colour', () => {
  const a = JSON.parse(read('app.json')).expo;
  assert.equal(a.android.adaptiveIcon.backgroundColor, '#0B5D4B');
  assert.ok(read('app.config.js').includes("color: '#0B5D4B'"));
});
test('the in-app logo shows the real mark (no hand-drawn letter tile)', () => {
  const s = read('src/components/Logo.tsx');
  assert.ok(s.includes("require('../../assets/logo-mark.png')"));
  assert.ok(s.includes('accessibilityLabel="আমি হাজী লোগো"'));
  assert.ok(!/>\s*(T|আ)\s*<\/Text>/.test(s), 'no letter tile');
});
test('the start screen uses the brand green and says who runs the app', () => {
  const s = read('App.tsx');
  assert.ok(/splash: \{[^}]*backgroundColor: '#0B5D4B'/.test(s));
  assert.ok(s.includes('{T.byline}'));
});
test('the source logo files are kept in the project for later use (store listing, print)', () => {
  for (const f of ['assets/brand/ami-haji-logo-vertical.png', 'assets/brand/ami-haji-logo-vertical-green.png']) assert.ok(existsSync(new URL(f, root)), f);
});
