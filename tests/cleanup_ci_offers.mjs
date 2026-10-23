// Always runs after the e2e test: hides every package of the CI leader account so real users never see test data.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const cfg = fs.readFileSync('src/config.js', 'utf8');
const sb = createClient(cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1], cfg.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/)[1], { auth: { persistSession: false } });
const { loginId } = await import('./login_id.mjs');
const s = await sb.auth.signInWithPassword({ email: await loginId(sb, process.env.L_PHONE), password: process.env.L_PW });
if (s.error) { console.log('cleanup: no login', s.error.message); process.exit(0); }
const r = await sb.from('offers').update({ active: false }).eq('leader_id', s.data.user.id).eq('active', true).select('id');
console.log('cleanup: hidden CI packages =', r.error ? r.error.message : r.data.length);
