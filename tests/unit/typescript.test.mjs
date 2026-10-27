// TypeScript, step by step (owner request Oct 2026). Step 1: money and security code first.
// Written before the move (TDD): it fails until these files are TypeScript and the type check is part of CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const STEP1 = ['src/lib/mfa', 'src/lib/chatConsent', 'src/lib/adminMoney', 'src/lib/payments'];

test('step 1 files are TypeScript (and the old JavaScript copy is gone)', () => {
  for (const f of STEP1) {
    assert.ok(existsSync(new URL(`${f}.ts`, root)), `${f}.ts missing`);
    assert.ok(!existsSync(new URL(`${f}.js`, root)), `${f}.js must be removed`);
  }
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
