// New contact e-mail for the app (owner, Nov 2026): amihaji.bd@gmail.com. Written before the change (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRIVACY_CONTACT } from '../../src/content/privacy.js';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
test('privacy page shows the new contact e-mail', () => {
  assert.equal(PRIVACY_CONTACT, 'amihaji.bd@gmail.com');
});
test('the printed privacy policy and the default terms use it too; the old one is gone', () => {
  for (const f of ['docs/privacy-policy-bn.md', 'supabase/012_terms.sql']) {
    const s = read(f);
    assert.ok(s.includes('amihaji.bd@gmail.com'), f);
    assert.ok(!s.includes('traveladda.z@gmail.com'), f);
  }
});
test('step 033 changes the e-mail inside the terms already saved, without asking everyone to agree again', () => {
  const s = read('supabase/033_contact_email.sql');
  assert.ok(s.includes("replace(body, 'traveladda.z@gmail.com', 'amihaji.bd@gmail.com')"));
  assert.ok(!/updated_at\s*=/.test(s), 'updated_at (the version people agreed to) must not change');
});
test('the printed privacy policy is made from the app text (tool works with TypeScript) and names the app', () => {
  const tool = read('tools/privacy_md.mjs');
  assert.ok(!tool.includes("privacy.js', 'utf8'"), 'reads the .ts file through the test hooks');
  assert.ok(read('docs/privacy-policy-bn.md').startsWith('# আমি হাজী – Ami Haji'));
});
