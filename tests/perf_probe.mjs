// How long the app's most common server calls take on the real database (owner: "loading feels slow", Oct 2026).
// Read-only calls with the haji (H) and leader (L) test accounts. Prints one line per call: median and slowest of 5.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loginId } from './login_id.mjs';

const cfg = fs.readFileSync('src/config.js', 'utf8');
const URL = cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1];
const KEY = cfg.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/)[1];
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ms = async (fn) => { const t = performance.now(); const r = await fn(); return [performance.now() - t, r]; };

const H = mk(); const L = mk();
const [tLogin, hs] = await ms(async () => H.auth.signInWithPassword({ email: await loginId(H, process.env.H_PHONE), password: process.env.H_PW }));
await L.auth.signInWithPassword({ email: await loginId(L, process.env.L_PHONE), password: process.env.L_PW });
const lid = (await L.auth.getUser()).data.user?.id;
const calls = {
  'login (haji)': null,
  'profile': () => H.from('profiles').select('full_name,haji_code,phone,role,status,verified').single(),
  'app_settings': () => H.from('app_settings').select('key,value'),
  'my_notifications': () => H.rpc('my_notifications', { p_limit: 100 }),
  'list_leaders': () => H.rpc('list_leaders', { p_district: null, p_search: null }),
  'leader_public': () => H.rpc('leader_public', { p_leader: lid }),
  'leader_reviews': () => H.rpc('leader_reviews', { p_leader: lid }),
  'list_offers umrah': () => H.rpc('list_offers', { p_kind: 'umrah' }),
  'list_offers hajj': () => H.rpc('list_offers', { p_kind: 'hajj' }),
  'my_contracts': () => H.rpc('my_contracts'),
  'my_groups': () => H.rpc('my_groups'),
  'my_referral': () => H.rpc('my_referral'),
  'app_videos': () => H.from('app_videos').select('route,url'),
  'content_overrides': () => H.from('content_overrides').select('kind,item_id,path,body'),
  'leader_contracts (L)': () => L.rpc('leader_contracts'),
  'leader_money (L)': () => L.rpc('leader_money'),
};
const lines = [`login ${Math.round(tLogin)} ms ${hs.error ? 'ERROR ' + hs.error.message : ''}`];
for (const [name, fn] of Object.entries(calls)) {
  if (!fn) continue;
  const t = [];
  let e = null;
  for (let i = 0; i < 5; i++) { const [d, r] = await ms(fn); t.push(d); if (r.error) e = r.error.message; }
  t.sort((a, b) => a - b);
  lines.push(`${name}: median ${Math.round(t[2])} ms, slowest ${Math.round(t[4])} ms${e ? ' ERROR ' + e : ''}`);
}
console.log(lines.join('\n'));
console.log(`::notice title=PERF::${lines.join('%0A')}`);
