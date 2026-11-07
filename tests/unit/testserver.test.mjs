// Test server (owner approval, Nov 2026, security review finding F1): the nightly two-phone test and its security
// checks run on a separate Supabase project (ami-haji-test, Mumbai), never on the real one. Written first (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pointConfig, TEST_SERVER, REAL_URL } from '../../tools/use_test_server.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, 'utf8');

test('the test server is a different project from the real one, with only a publishable key', () => {
  assert.match(TEST_SERVER.url, /^https:\/\/yhavfnaljbiefzofcduj\.supabase\.co$/);
  assert.match(TEST_SERVER.key, /^sb_publishable_[A-Za-z0-9_-]{20,}$/);
  assert.notEqual(TEST_SERVER.url, REAL_URL);
  assert.ok(read('src/config.ts').includes(REAL_URL), 'the app itself still uses the real server');
});

test('pointConfig swaps both values and refuses to leave the real server in place', () => {
  const out = pointConfig(read('src/config.ts'), TEST_SERVER);
  assert.ok(out.includes(TEST_SERVER.url) && out.includes(TEST_SERVER.key));
  assert.ok(!out.includes('lmwsfnzpgujozkxkmkwu'), 'no trace of the real server');
  assert.throws(() => pointConfig("export const X = 1;", TEST_SERVER), 'an unknown config file is an error, not a silent no-op');
});

test('the nightly e2e switches to the test server before building and before any script talks to a server', () => {
  const w = read('.github/workflows/groups-e2e.yml');
  const sw = w.indexOf('node tools/use_test_server.mjs');
  assert.ok(sw > 0, 'the switch step exists');
  for (const later of ['expo export', 'ci_rotate.mjs', 'db_probe.mjs', 'groups_e2e.py', 'groups_api.mjs', 'cleanup_ci_offers.mjs'])
    assert.ok(w.indexOf(later) > sw, `${later} runs after the switch`);
  assert.ok(w.includes('lmwsfnzpgujozkxkmkwu') === false, 'the workflow never names the real server');
  assert.match(w, /grep -q yhavfnaljbiefzofcduj src\/config\.ts \|\| exit 1/, 'and checks the switch really happened');
});
