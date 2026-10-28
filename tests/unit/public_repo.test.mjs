// Before the code is shown publicly (owner decision Oct 2026): all rights reserved, no way for outsiders to run our
// CI with its secrets, and test passwords hidden in public logs. Written before the change (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('all rights reserved: LICENSE, package.json and README say so', () => {
  assert.ok(existsSync(new URL('LICENSE', root)));
  const lic = read('LICENSE');
  assert.ok(/All rights reserved/i.test(lic) && /সর্বস্বত্ব সংরক্ষিত|সব অধিকার সংরক্ষিত/.test(lic));
  assert.ok(!/MIT|Apache|GPL|permission is hereby granted/i.test(lic), 'no open-source licence text');
  assert.equal(JSON.parse(read('package.json')).license, 'UNLICENSED');
  assert.ok(/All rights reserved/i.test(read('README.md')));
});
test('security contact exists (SECURITY.md) and asks people not to test on real users', () => {
  const s = read('SECURITY.md');
  assert.ok(/traveladda/i.test(s) && /আসল|real/i.test(s));
});
test('no workflow can be started by an outsider (no pull_request / pull_request_target / issue triggers)', () => {
  for (const f of readdirSync(new URL('.github/workflows/', root))) {
    const w = read(`.github/workflows/${f}`);
    assert.ok(!/pull_request|issue_comment|issues:|fork|workflow_run/.test(w.split('jobs:')[0]), `${f} has an outside trigger`);
  }
});
test('derived test passwords are masked in public CI logs', () => {
  const s = read('tests/ci_pw.sh');
  assert.ok(/::add-mask::\$H_PW/.test(s) && /::add-mask::\$L_PW/.test(s));
});
