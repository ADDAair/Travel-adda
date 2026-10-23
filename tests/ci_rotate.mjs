// Moves the CI test accounts to the password from CI_TEST_SECRET (see tests/ci_pw.sh). Safe to run every time.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const cfg = fs.readFileSync('src/config.js', 'utf8');
const mk = () => createClient(cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1], cfg.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/)[1], { auth: { persistSession: false, autoRefreshToken: false } });
const env = process.env;
for (const [who, phone, pw, old] of [['haji', env.H_PHONE, env.H_PW, env.H_OLD_PW], ['leader', env.L_PHONE, env.L_PW, env.L_OLD_PW]]) {
  if (pw === old) { console.log(who, 'old scheme (no secret yet)'); continue; }
  const c = mk(); const email = `${phone}@users.traveladda.app`;
  if (!(await c.auth.signInWithPassword({ email, password: pw })).error) { console.log(who, 'already on the new password'); continue; }
  const o = await c.auth.signInWithPassword({ email, password: old });
  if (o.error) { console.log(who, 'cannot log in with old or new password:', o.error.message); continue; }
  const u = await c.auth.updateUser({ password: pw });
  console.log(who, u.error ? `password change failed: ${u.error.message}` : 'moved to the new password');
}
