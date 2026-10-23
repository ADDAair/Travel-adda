// Read-only check of which database steps (002–015) are live, using the CI haji test account. Changes nothing.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const cfg = fs.readFileSync('src/config.js', 'utf8');
const sb = createClient(cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1], cfg.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/)[1], { auth: { persistSession: false } });
const out = {};
const s = await sb.auth.signInWithPassword({ email: `${process.env.H_PHONE}@users.traveladda.app`, password: process.env.H_PW });
out.login = s.error ? s.error.message : 'ok';
const msg = (r) => (r.error ? `${r.error.code || ''} ${r.error.message}` : 'ok');
out['002 avatar_path'] = msg(await sb.from('profiles').select('avatar_path').limit(1));
out['003 delete_my_account'] = 'not called (would delete); checked via 004/005';
out['004 my_groups'] = msg(await sb.rpc('my_groups'));
out['004 leader_applications'] = msg(await sb.from('leader_applications').select('id').limit(1));
out['004 contracts'] = msg(await sb.from('contracts').select('id').limit(1));
out['005 list_offers'] = msg(await sb.rpc('list_offers', { p_kind: 'umrah' }));
out['005 app_settings'] = msg(await sb.from('app_settings').select('key').limit(1));
out['006 announcements'] = msg(await sb.from('group_announcements').select('id').limit(1));
out['006 phone_verified'] = msg(await sb.from('profiles').select('phone_verified').limit(1));
out['007 leader_profiles'] = msg(await sb.from('leader_profiles').select('user_id').limit(1));
out['007 my_contracts'] = msg(await sb.rpc('my_contracts'));
out['008 haji_payments'] = msg(await sb.from('haji_payments').select('id').limit(1));
out['009 notifications'] = msg(await sb.rpc('my_unread_count'));
out['011 push'] = msg(await sb.rpc('my_push_count'));
out['012 terms'] = msg(await sb.rpc('my_terms'));
out['014 work area (union)'] = msg(await sb.from('leader_profiles').select('union_name').limit(1));
out['014 directory union'] = msg(await sb.rpc('list_leaders', { p_district: null, p_search: null }).select('union_name').limit(1));
{ const x = await sb.rpc('blocked_between', { a: '00000000-0000-0000-0000-000000000000', b: '00000000-0000-0000-0000-000000000001' }); out['015 security'] = x.error ? 'ok (helpers closed)' : 'NOT RUN (helpers still open)'; }
try { const f = await sb.functions.invoke('phone-otp', { body: { action: 'ping' } }); out['otp function'] = f.error ? `${f.error.name} ${f.error.context?.status || ''}` : JSON.stringify(f.data); } catch (e) { out['otp function'] = String(e); }
// The CI leader account: what it chose at sign-up vs. what the database says (step 010 fixes old leader sign-ups).
if (process.env.L_PHONE) {
  const sl = createClient(cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1], cfg.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/)[1], { auth: { persistSession: false } });
  const l = await sl.auth.signInWithPassword({ email: `${process.env.L_PHONE}@users.traveladda.app`, password: process.env.L_PW });
  if (l.error) out['leader login'] = l.error.message;
  else {
    out['leader signed up as'] = l.data.user?.user_metadata?.account_type || '(not recorded)';
    const r = await sl.from('profiles').select('account_type,role,haji_code').eq('id', l.data.user.id).single();
    out['leader in database'] = r.error ? r.error.message : `${r.data.account_type} / ${r.data.role} / ${r.data.haji_code}`;
  }
}
fs.mkdirSync('shots-groups', { recursive: true });
fs.writeFileSync('shots-groups/probe.json', JSON.stringify(out, null, 1));
console.log(out);
