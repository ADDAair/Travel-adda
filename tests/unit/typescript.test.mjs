// TypeScript, step by step (owner request Oct 2026). Step 1: money and security code first.
// Written before the move (TDD): it fails until these files are TypeScript and the type check is part of CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const STEP1 = ['src/lib/mfa', 'src/lib/chatConsent', 'src/lib/adminMoney', 'src/lib/payments'];
// Step 2: login, password, account deletion, app lock, phone codes, SOS, admin tools
// Step 3: contracts & leaders, groups, help chat
const STEP3 = ['src/lib/market', 'src/lib/groups', 'src/lib/help'];
const STEP2 = ['src/lib/account', 'src/lib/applock', 'src/lib/password', 'src/lib/login', 'src/lib/otp', 'src/lib/sos', 'src/lib/admin'];

test('step 1 files are TypeScript (and the old JavaScript copy is gone)', () => {
  for (const f of STEP1) {
    assert.ok(existsSync(new URL(`${f}.ts`, root)), `${f}.ts missing`);
    assert.ok(!existsSync(new URL(`${f}.js`, root)), `${f}.js must be removed`);
  }
});
test('step 2 and 3 files are TypeScript (and the old JavaScript copy is gone)', () => {
  for (const f of [...STEP2, ...STEP3]) {
    assert.ok(existsSync(new URL(`${f}.ts`, root)), `${f}.ts missing`);
    assert.ok(!existsSync(new URL(`${f}.js`, root)), `${f}.js must be removed`);
  }
});
// Step 4 (Nov 2026): every remaining file in src/lib — the whole app logic is now TypeScript.
const STEP4 = ['idle', 'prefs', 'phone', 'appVersion', 'dates', 'notify', 'videoLinks', 'keyboard', 'supabase', 'docReminders', 'me',
  'contractPdf', 'avatar', 'leaderKinds', 'location', 'upazilas', 'notifications', 'contentEdit', 'offerRoute', 'push', 'offers',
  'reminders', 'docs', 'prayer'].map((f) => `src/lib/${f}`);
test('step 4: all of src/lib is TypeScript (no JavaScript left there)', async () => {
  for (const f of STEP4) {
    assert.ok(existsSync(new URL(`${f}.ts`, root)), `${f}.ts missing`);
    assert.ok(!existsSync(new URL(`${f}.js`, root)), `${f}.js must be removed`);
  }
  const { readdirSync } = await import('node:fs');
  assert.deepEqual(readdirSync(new URL('src/lib/', root)).filter((f) => f.endsWith('.js')), []);
});
test('step 4: the prayer-time cross-check reads the TypeScript files', () => {
  const s = readFileSync(new URL('tests/prayer.test.mjs', root), 'utf8');
  assert.ok(s.includes('src/lib/prayer.ts') && s.includes('src/lib/phone.ts'));
});
// Step 5 (Nov 2026): screens, money and security first — login, password reset, phone check, admin 2FA, chat consent,
// payments box and the admin money page.
const STEP5 = ['src/screens/AuthScreen', 'src/screens/ForgotPassword', 'src/screens/VerifyPhoneScreen', 'src/screens/AdminMfa',
  'src/screens/ChatConsentScreen', 'src/components/PaymentBox', 'src/screens/AdminMoney'];
test('step 5: money and security screens are TypeScript (.tsx)', () => {
  for (const f of STEP5) {
    assert.ok(existsSync(new URL(`${f}.tsx`, root)), `${f}.tsx missing`);
    assert.ok(!existsSync(new URL(`${f}.js`, root)), `${f}.js must be removed`);
  }
});
// Step 6 (Nov 2026): leader and contract screens.
const STEP6 = ['src/screens/LeaderScreen', 'src/screens/LeaderContractsScreen', 'src/screens/MyLeaderScreen', 'src/screens/LeaderApplyScreen',
  'src/screens/LeaderOffersScreen', 'src/screens/LeadersScreen', 'src/screens/LeaderMeScreen'];
test('step 6: leader and contract screens are TypeScript (.tsx)', () => {
  for (const f of STEP6) {
    assert.ok(existsSync(new URL(`${f}.tsx`, root)), `${f}.tsx missing`);
    assert.ok(!existsSync(new URL(`${f}.js`, root)), `${f}.js must be removed`);
  }
});
// Step 7 (Nov 2026): the admin panel.
const STEP7 = ['src/screens/AdminScreen', 'src/screens/AdminTools', 'src/screens/AdminPart4', 'src/screens/AdminNotify',
  'src/screens/AdminContent', 'src/screens/AdminSpeed'];
test('step 7: admin screens are TypeScript (.tsx)', () => {
  for (const f of STEP7) {
    assert.ok(existsSync(new URL(`${f}.tsx`, root)), `${f}.tsx missing`);
    assert.ok(!existsSync(new URL(`${f}.js`, root)), `${f}.js must be removed`);
  }
});
// Step 8 (Nov 2026, last step): everything else — all screens, components, content and the app itself.
test('step 8: no JavaScript left anywhere in src, the app root is App.tsx, and the type check covers it', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const left = [];
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = new URL(f, dir); if (statSync(p).isDirectory()) walk(new URL(`${f}/`, dir)); else if (f.endsWith('.js')) left.push(p.pathname); } };
  walk(new URL('src/', root));
  assert.deepEqual(left, []);
  assert.ok(existsSync(new URL('App.tsx', root)) && !existsSync(new URL('App.js', root)));
  const ts = JSON.parse(readFileSync(new URL('tsconfig.json', root), 'utf8'));
  assert.ok(ts.include.includes('App.tsx'));
  assert.ok(readFileSync(new URL('tools/fetch_quran.py', root), 'utf8').includes('loaders.ts'), 'the Quran generator writes TypeScript too');
});
test('strict type checking is on and runs in CI', () => {
  const ts = JSON.parse(readFileSync(new URL('tsconfig.json', root), 'utf8'));
  assert.equal(ts.compilerOptions.strict, true);
  assert.equal(ts.compilerOptions.noEmit, true);
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.ok(pkg.scripts.typecheck && pkg.scripts.typecheck.includes('tsc'));
  assert.ok(pkg.devDependencies && pkg.devDependencies.typescript);
  assert.ok(readFileSync(new URL('.github/workflows/check.yml', root), 'utf8').includes('npm run typecheck'));
});
