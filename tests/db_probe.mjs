// Read-only check of which database steps (002–005) are live, using the CI haji test account. Changes nothing.
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
fs.mkdirSync('shots-groups', { recursive: true });
fs.writeFileSync('shots-groups/probe.json', JSON.stringify(out, null, 1));
console.log(out);
