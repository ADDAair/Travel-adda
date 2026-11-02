// App renamed to "আমি হাজী – Ami Haji" (owner, Nov 2026). Written before the change (TDD).
// The APP gets the new name; the COMPANY behind it stays Travel Adda (payments, helpline, licence, notices, contract).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const files = [];
const walk = (d) => { for (const f of readdirSync(new URL(d, root))) { const p = `${d}${f}`; if (statSync(new URL(p, root)).isDirectory()) walk(`${p}/`); else if (/\.tsx?$/.test(f)) files.push(p); } };
walk('src/'); files.push('App.tsx');

test('phone shows the new name; new package id (before the first Play Store upload)', () => {
  const a = JSON.parse(read('app.json')).expo;
  assert.equal(a.name, 'আমি হাজী');
  assert.equal(a.android.package, 'app.amihaji.hajumrah');
  assert.equal(a.ios.bundleIdentifier, 'app.amihaji.hajumrah');
});
test('app name and company are separate strings', async () => {
  const { T } = await import('../../src/strings.js');
  assert.equal(T.appName, 'আমি হাজী');
  assert.equal(T.appNameFull, 'আমি হাজী – Ami Haji');
  assert.equal(T.company, 'Travel Adda');
  assert.ok(T.byline.includes('Travel Adda'), 'the start screen says who runs the app');
});
test('start screen and login show the app name with "a Travel Adda service"', () => {
  assert.ok(read('App.tsx').includes('{T.appName}') && read('App.tsx').includes('{T.byline}'));
  assert.ok(read('src/screens/AuthScreen.tsx').includes('{T.byline}'));
});
test('no place calls the APP "Travel Adda" any more', () => {
  const bad = [/Travel Adda অ্যাপ/, /Travel Adda-তে আপনাকে স্বাগতম/, /Travel Adda অ্যাকাউন্ট থাকলে/, /একটি Travel Adda অ্যাকাউন্টে/, /Travel Adda-র নতুন সংস্করণ/,
    /Travel Adda না খুললে/, /সেটিংসে Travel Adda/, /হাজী Travel Adda ব্যবহার/, /"Travel Adda লোগো"/, /'Travel Adda নোটিফিকেশন'/, /appName: 'Travel Adda'/];
  const left = [];
  for (const f of files) read(f).split('\n').forEach((l, i) => { if (bad.some((re) => re.test(l))) left.push(`${f}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  assert.deepEqual(left, []);
});
test('the company name stays where money, help and responsibility are meant', () => {
  assert.ok(read('src/components/PaymentBox.tsx').includes('টাকা শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে দিন'));
  assert.ok(read('src/screens/OffersScreen.tsx').includes('Travel Adda টিম আপনাকে ফোন করবে'));
  assert.ok(read('src/lib/contractPdf.ts').includes('Travel Adda – হজ/ওমরাহ চুক্তি'));
});
test('the APK build checks the push file for the new package', () => {
  const y = read('.github/workflows/build-apk.yml');
  assert.ok(y.includes("'app.amihaji.hajumrah'") && !y.includes("'app.traveladda.hajumrah'"));
});
test('privacy text names the app and who runs it', async () => {
  const p = read('src/content/privacy.ts');
  assert.ok(p.includes('আমি হাজী – Ami Haji') && p.includes('Travel Adda'));
});
