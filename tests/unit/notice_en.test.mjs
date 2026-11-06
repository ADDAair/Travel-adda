// English step 5 (owner request, Nov 2026): the server's own notices (contract, money, group, fund...) also come in
// English for people who chose English. The server keeps one English rule for each Bengali notice text (036_lang.sql).
// This test reads every notify_user(...) call in the SQL files and checks that each Bengali piece of text in it is
// covered by a rule in 036, so a new notice cannot be added without its English. Written first (TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../../supabase/', import.meta.url);
const BENGALI = /[ঀ-৲৴-৿]/;
const files = readdirSync(DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f) && f < '036').sort();
const rules = readFileSync(new URL('036_lang.sql', DIR), 'utf8');
// Bengali bits of the rules, with the regex escapes removed, so "\(" in a rule matches "(" in a notice
const ruleText = rules.replace(/\\([().?*+\[\]|^$])/g, '$1');

// the arguments of every notify_user(...) call and of the announcement notice
function pieces(sql) {
  const out = [];
  const re = /notify_user\(([\s\S]*?)\);|select m\.user_id, 'group', ([\s\S]*?) from public\.group_members/g;
  let m;
  while ((m = re.exec(sql))) {
    const args = m[1] || m[2];
    for (const s of args.match(/'(?:[^']|'')*'/g) || []) {
      const t = s.slice(1, -1).replace(/''/g, "'");
      if (BENGALI.test(t)) out.push(t);
    }
  }
  return out;
}

test('every Bengali piece of every server notice has an English rule in 036', () => {
  const missing = [];
  for (const f of files) {
    for (const p of pieces(readFileSync(new URL(f, DIR), 'utf8'))) {
      // a piece is covered when the rule text contains it (fixed words) or, for very short words (হাজী, লিডার), when used in a rule
      if (!ruleText.includes(p.trim())) missing.push(`${f}: ${p}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('036 adds the language to the profile, a safe way to set it, and English push texts', () => {
  assert.ok(/add column if not exists lang text/.test(rules));
  assert.ok(/check \(lang in \('bn', 'en'\)\)/.test(rules));
  assert.ok(/create or replace function public\.set_my_lang\(p_lang text\)/.test(rules));
  assert.ok(/create or replace function public\.my_notices_en\(/.test(rules));
  assert.ok(/create or replace function public\.trg_push_user_notice\(\)/.test(rules) && rules.includes('Open the app to see the details'));
  assert.ok(/alter table public\.notice_en enable row level security/.test(rules), 'RLS on the new table');
  assert.ok(/revoke all on function public\.notice_to_en\(text\) from public, anon, authenticated/.test(rules), 'rules are used by the server only');
});
