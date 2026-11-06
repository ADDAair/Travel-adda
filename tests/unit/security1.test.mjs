// Security step 1 (owner approval, Nov 2026, after the read-only security review):
// F2 — the test APK must not be signed with the public "Android Debug" key; it is re-signed in CI with Travel Adda's
//      own test key, made from a GitHub secret (never in the code, never in chat).
// F3 — the documents page (passport, visa) blocks screenshots and hides itself in the recent-apps list.
// Written first (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { X509Certificate, createPrivateKey, sign, verify } from 'node:crypto';
import { makeTestSigningKey } from '../../tools/test_signing_key.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, 'utf8');
const SEED = 'a'.repeat(40);

test('the same secret always gives the same key and certificate (so updates keep working)', () => {
  const a = makeTestSigningKey(SEED), b = makeTestSigningKey(SEED);
  assert.ok(a.certDer.equals(b.certDer), 'certificate bytes identical');
  assert.ok(a.keyPk8.equals(b.keyPk8), 'key bytes identical');
  const c = makeTestSigningKey('b'.repeat(40));
  assert.ok(!c.certDer.equals(a.certDer), 'another secret gives another key');
});

test('the certificate is a valid, self-signed Travel Adda test certificate, not "Android Debug"', () => {
  const { certDer, keyPk8 } = makeTestSigningKey(SEED);
  const x = new X509Certificate(certDer);
  assert.match(x.subject, /CN=Ami Haji Test/);
  assert.doesNotMatch(x.subject + x.issuer, /Android Debug/);
  assert.ok(x.verify(x.publicKey), 'signed by its own key');
  assert.equal(x.publicKey.asymmetricKeyDetails.modulusLength, 2048);
  assert.ok(new Date(x.validTo).getUTCFullYear() >= 2075, 'valid for a long time');
  const key = createPrivateKey({ key: keyPk8, format: 'der', type: 'pkcs8' });
  const msg = Buffer.from('apk');
  assert.ok(verify('sha256', msg, x.publicKey, sign('sha256', msg, key)), 'the key belongs to the certificate');
});

test('a missing or short secret is refused (never a weak or empty key)', () => {
  assert.throws(() => makeTestSigningKey(''));
  assert.throws(() => makeTestSigningKey('short'));
  assert.throws(() => makeTestSigningKey(undefined));
});

test('the APK build re-signs with the own key, stops without the secret, and checks the result', () => {
  const w = read('.github/workflows/build-apk.yml');
  assert.ok(w.includes('secrets.CI_TEST_SECRET'), 'the key comes from a GitHub secret');
  assert.ok(w.includes('tools/test_signing_key.mjs'), 'made by the tool');
  assert.match(w, /apksigner"? sign[^\n]*--key[^\n]*--cert/, 'apksigner signs with key + cert');
  assert.match(w, /Android Debug[\s\S]*exit 1/, 'a debug-signed APK fails the build');
  assert.match(w, /rm -f[^\n]*\.pk8/, 'the key file is deleted after signing');
  assert.match(w, /no signing secret[\s\S]*exit 1/i, 'no secret = no APK (never silently debug-signed)');
});

test('no signing key or keystore file is in the repository', () => {
  const tracked = execSync('git ls-files', { cwd: ROOT }).toString().split('\n');
  assert.deepEqual(tracked.filter((f) => /\.(pk8|jks|keystore|p12|pem)$/i.test(f)), []);
});

test('the documents page blocks screenshots (and the recent-apps preview)', () => {
  const s = read('src/screens/DocsScreen.tsx');
  assert.ok(s.includes("from 'expo-screen-capture'"), 'uses expo-screen-capture');
  assert.ok(s.includes('usePreventScreenCapture('), 'turned on while the page is open');
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies['expo-screen-capture'], 'the package is installed');
  assert.ok(existsSync(ROOT + 'tests/unit/stubs/expo.mjs') && read('tests/unit/stubs/expo.mjs').includes('usePreventScreenCapture'), 'test stub');
});
