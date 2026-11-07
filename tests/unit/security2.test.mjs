// Security step 2 (owner approval 7 Nov 2026): active authorization tests T05–T12 and T21, ONLY on the test server.
// Written first (TDD): the workflow and the script must refuse to run against anything but the test server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, 'utf8');

test('the security workflow switches to the test server before the script runs, and never names the real one', () => {
  assert.ok(existsSync(ROOT + '.github/workflows/security-tests.yml'), 'workflow exists');
  const w = read('.github/workflows/security-tests.yml');
  const sw = w.indexOf('node tools/use_test_server.mjs');
  assert.ok(sw > 0, 'switch step exists');
  assert.ok(w.indexOf('tests/security2.mjs') > sw, 'the script runs after the switch');
  assert.match(w, /grep -q yhavfnaljbiefzofcduj src\/config\.ts \|\| exit 1/);
  assert.ok(!w.includes('lmwsfnzpgujozkxkmkwu'), 'never names the real server');
  assert.doesNotMatch(w, /schedule:/, 'runs only when started by hand (each run is an approved test)');
});

test('the script itself stops before any request unless the config points at the test server', () => {
  const s = read('tests/security2.mjs');
  const guard = s.indexOf("includes('yhavfnaljbiefzofcduj')");
  assert.ok(guard > 0, 'has the address guard');
  const firstCall = Math.min(...['createClient(', '.rpc(', '.auth.', '.storage.'].map((k) => { const i = s.indexOf(k, s.indexOf('const URL')); return i < 0 ? Infinity : i; }));
  assert.ok(guard < firstCall, 'the guard comes before the first server call');
  assert.match(s, /process\.exit\(2\)/, 'and exits');
  assert.ok(!s.includes('lmwsfnzpgujozkxkmkwu'));
});

test('the script cleans up what it creates and caps its own request count', () => {
  const s = read('tests/security2.mjs');
  assert.match(s, /cleanup/i);
  assert.match(s, /cancel_contract/, 'the test contract is cancelled at the end');
  assert.match(s, /storage\.from\('documents'\)\.remove/, 'the test document file is removed');
  assert.match(s, /MAX_REQUESTS\s*=\s*\d+/, 'a hard request limit');
});

test('admin 2FA part: the test admin needs a real authenticator code, and the factor is removed again at the end', () => {
  const s = read('tests/security2.mjs');
  assert.match(s, /mfa\.enroll\(/, 'enrolls an authenticator (TOTP) for the CI test admin');
  assert.match(s, /mfa\.unenroll\(/, 'and removes it in the cleanup');
  assert.match(s, /function totp\(/, 'computes the 6-digit code itself (no code is ever typed or shared)');
  assert.ok(s.lastIndexOf('mfa.unenroll(') > s.indexOf('} finally {'), 'unenroll is part of the cleanup');
  const sql = read('tests/sql/test-server-make-ci-admin.sql');
  assert.match(sql, /count\(\*\)[\s\S]*> 20[\s\S]*raise exception/, 'stops on the real server (more than 20 users)');
  assert.match(sql, /01300000007/, 'only the CI test admin phone');
});
