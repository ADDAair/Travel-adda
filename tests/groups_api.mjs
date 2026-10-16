// Security checks on the real database after the UI test (phase B). Every "attack" below must be refused.
// H = haji test account, L = leader test account. Uses only the publishable key, like the app.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const cfg = fs.readFileSync('src/config.js', 'utf8');
const URL = cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1];
const KEY = cfg.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/)[1];
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const email = (p) => `${p}@users.traveladda.app`;
const out = []; let bad = 0;
const check = (name, ok, note = '') => { out.push({ check: name, ok: !!ok, note: String(note).slice(0, 160) }); if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', name, note); };
const refused = (r) => !!r.error || (Array.isArray(r.data) && r.data.length === 0) || r.data === null;

const H = mk(); const L = mk(); const A = mk();
const hs = await H.auth.signInWithPassword({ email: email(process.env.H_PHONE), password: process.env.H_PW });
const ls = await L.auth.signInWithPassword({ email: email(process.env.L_PHONE), password: process.env.L_PW });
if (hs.error || ls.error) { console.log('login failed', hs.error?.message, ls.error?.message); process.exit(1); }
const hid = hs.data.user.id; const lid = ls.data.user.id;

// Leader's own data (allowed)
const lg = await L.from('groups').select('id,name,join_code').order('created_at', { ascending: false }).limit(2);
check('লিডার নিজের দলগুলো দেখতে পান', !lg.error && lg.data.length === 2, lg.error?.message);
const [g2, g1] = lg.data;   // g1 = invite group (H removed), g2 = code group (H left)
const lc = await L.from('contracts').select('id').eq('group_id', g1.id);
check('লিডার নিজের দলের শর্ত দেখতে পান', !lc.error && lc.data.length >= 1, lc.error?.message);
const cid = lc.data[0].id;

// Haji must not be able to...
let r = await H.from('profiles').update({ role: 'leader' }).eq('id', hid).select('role');
const hp = await H.from('profiles').select('role').eq('id', hid).single();
check('হাজী নিজেকে লিডার বানাতে পারেন না', hp.data?.role === 'haji', r.error?.message || hp.data?.role);
r = await H.from('profiles').update({ role: 'admin' }).eq('id', hid).select('role');
const hp2 = await H.from('profiles').select('role').eq('id', hid).single();
check('হাজী নিজেকে অ্যাডমিন বানাতে পারেন না', hp2.data?.role === 'haji', r.error?.message);
r = await H.rpc('admin_list_applications');
check('হাজী লিডার আবেদনের তালিকা দেখতে পান না', !r.error && r.data.length === 0, r.error?.message);
r = await H.rpc('review_leader_application', { p_app: '00000000-0000-0000-0000-000000000000', p_approve: true, p_note: null });
check('হাজী আবেদন অনুমোদন করতে পারেন না', !!r.error, r.error?.message);
r = await H.from('leader_applications').select('id').neq('user_id', hid);
check('হাজী অন্যের লিডার আবেদন দেখতে পান না', refused(r), r.error?.message);
r = await H.from('group_members').select('*');
check('হাজী সদস্য তালিকার টেবিল সরাসরি পড়তে পারেন না', !!r.error, r.error?.message);
r = await H.from('group_members').insert({ group_id: g1.id, user_id: hid, status: 'active' });
check('হাজী নিজেকে সরাসরি সদস্য বানাতে পারেন না (সরানোর পরেও)', !!r.error, r.error?.message);
r = await H.from('groups').select('id,join_code');
check('হাজী লিডারের দল ও কোড দেখতে পান না', refused(r), r.error?.message);
r = await H.from('groups').insert({ name: 'হ্যাক দল' });
check('হাজী দল বানাতে পারেন না', !!r.error, r.error?.message);
r = await H.rpc('group_members_for_leader', { p_group: g1.id });
check('হাজী অন্যের দলের সদস্যদের ফোন দেখতে পান না', refused(r), r.error?.message);
r = await H.rpc('invite_by_phone', { p_group: g2.id, p_phone: process.env.H_PHONE });
check('হাজী লিডারের দলে আমন্ত্রণ পাঠাতে পারেন না', !!r.error, r.error?.message);
r = await H.rpc('remove_member', { p_group: g1.id, p_user: lid });
check('হাজী কাউকে দল থেকে সরাতে পারেন না', !!r.error, r.error?.message);
r = await H.from('contracts').select('id').eq('group_id', g1.id);
check('দল থেকে সরানো হাজী আর সেই দলের শর্ত দেখেন না', refused(r), r.error?.message);
r = await H.from('contract_acceptances').insert({ contract_id: cid });
check('সরানো হাজী আবার সম্মতি দিতে পারেন না', !!r.error, r.error?.message);
r = await H.from('contracts').insert({ group_id: g1.id, title: 'ভুয়া', price_bdt: 1, includes: 'xx', refund_policy: 'xx' });
check('হাজী শর্ত লিখতে পারেন না', !!r.error, r.error?.message);
r = await H.from('contract_acceptances').select('contract_id,accepted_at').eq('contract_id', cid);
check('হাজীর নিজের সম্মতির রেকর্ড থেকে যায়', !r.error && r.data.length === 1, r.error?.message);

// Leader must not be able to...
r = await L.from('contracts').update({ price_bdt: 1 }).eq('id', cid).select('id');
check('লিডার শর্ত (দাম) বদলাতে পারেন না', refused(r), r.error?.message);
r = await L.from('contracts').delete().eq('id', cid).select('id');
check('লিডার শর্ত মুছতে পারেন না', refused(r), r.error?.message);
r = await L.from('contract_acceptances').delete().eq('contract_id', cid).select('contract_id');
check('লিডার হাজীর সম্মতি মুছতে পারেন না', refused(r), r.error?.message);
r = await L.from('contract_acceptances').insert({ contract_id: cid, user_id: hid });
check('লিডার হাজীর নামে সম্মতি দিতে পারেন না', !!r.error, r.error?.message);
r = await L.from('groups').update({ join_code: 'AAAAAAAA' }).eq('id', g1.id).select('id');
check('লিডার কোড নিজে বসাতে পারেন না', !!r.error, r.error?.message);
r = await L.rpc('admin_list_applications');
check('লিডার অ্যাডমিন তালিকা দেখতে পান না', !r.error && r.data.length === 0, r.error?.message);
r = await L.from('profiles').update({ role: 'admin' }).eq('id', lid).select('role');
const lp = await L.from('profiles').select('role').eq('id', lid).single();
check('লিডার নিজেকে অ্যাডমিন বানাতে পারেন না', lp.data?.role === 'leader', r.error?.message);
r = await L.from('profiles').select('id,phone').eq('id', hid);
check('লিডার হাজীর প্রোফাইল টেবিল সরাসরি পড়তে পারেন না', refused(r), r.error?.message);
r = await L.rpc('join_group', { p_code: g1.join_code });
check('লিডার নিজের দলে হাজী হয়ে ঢোকেন না', r.data === 'own_group', r.error?.message || r.data);
r = await L.rpc('group_members_for_leader', { p_group: g2.id });
check('লিডার দল ছেড়ে যাওয়া হাজীর অবস্থা দেখেন', !r.error && r.data.some((m) => m.user_id === hid && m.status === 'left'), r.error?.message);

// Offers (005), only when that step has been run
const probe = await H.rpc('list_offers', { p_kind: 'umrah' });
if (!probe.error) {
  const lo = await L.from('offers').select('id').order('created_at', { ascending: false }).limit(1);
  const oid = lo.data && lo.data[0] && lo.data[0].id;
  check('অফার তালিকায় লিডারের ফোন বা আইডি নেই', !probe.data.length || !Object.keys(probe.data[0]).some((k) => /phone|leader/.test(k)), Object.keys(probe.data[0] || {}).join(','));
  r = await H.from('offers').insert({ kind: 'umrah', title: 'হাজীর ভুয়া', price_bdt: 1, depart_on: '2030-01-01', return_on: '2030-01-05' });
  check('হাজী প্যাকেজ দিতে পারেন না', !!r.error, r.error?.message);
  r = await L.from('offers').insert({ leader_id: hid, kind: 'umrah', title: 'অন্যের নামে', price_bdt: 1, depart_on: '2030-01-01', return_on: '2030-01-05' });
  check('লিডার অন্যের নামে প্যাকেজ দিতে পারেন না', !!r.error, r.error?.message);
  if (oid) {
    r = await L.from('offers').update({ price_bdt: 1 }).eq('id', oid).select('id');
    check('প্রকাশিত প্যাকেজের দাম বদলানো যায় না', refused(r), r.error?.message);
    r = await L.from('offers').update({ hidden_by_admin: false }).eq('id', oid).select('id');
    check('লিডার অ্যাডমিনের লুকানো উঠাতে পারেন না', refused(r), r.error?.message);
    r = await L.from('offers').delete().eq('id', oid).select('id');
    check('লিডার প্যাকেজ মুছতে পারেন না', refused(r), r.error?.message);
    r = await H.from('offers').update({ active: true }).eq('id', oid).select('id');
    check('হাজী অন্যের প্যাকেজ দেখাতে/লুকাতে পারেন না', refused(r), r.error?.message);
    r = await H.from('offer_interests').insert({ offer_id: oid });
    check('লুকানো প্যাকেজে "ফোন করুন" অনুরোধ যায় না', !!r.error, r.error?.message);
    r = await H.rpc('admin_hide_offer', { p_offer: oid, p_hide: false });
    check('হাজী অ্যাডমিনের মতো প্যাকেজ লুকাতে/দেখাতে পারেন না', !!r.error, r.error?.message);
  }
  r = await L.from('offer_interests').select('*');
  check('লিডার আগ্রহী হাজীদের নাম-নম্বর দেখেন না', refused(r), r.error?.message);
  r = await L.rpc('admin_list_interests');
  check('লিডার অ্যাডমিনের অনুরোধ তালিকা দেখেন না', !r.error && r.data.length === 0, r.error?.message);
  r = await H.rpc('admin_set_setting', { p_key: 'helpline_phone', p_value: '01900000000' });
  check('হাজী হেল্পলাইন নম্বর বদলাতে পারেন না', !!r.error, r.error?.message);
  r = await L.rpc('admin_set_setting', { p_key: 'helpline_phone', p_value: '01900000000' });
  check('লিডার হেল্পলাইন নম্বর বদলাতে পারেন না', !!r.error, r.error?.message);
  r = await H.from('app_settings').insert({ key: 'helpline_phone', value: '0190' });
  check('হেল্পলাইন টেবিলে সরাসরি লেখা যায় না', !!r.error, r.error?.message);
  r = await A.rpc('list_offers', { p_kind: 'umrah' });
  check('লগইন ছাড়া প্যাকেজ তালিকা দেখা যায় না', refused(r), r.error?.message);
} else {
  console.log('offers step (005) not run yet:', probe.error.message);
}

// Not signed in
r = await A.rpc('my_groups');
check('লগইন ছাড়া কেউ কিছু দেখতে পায় না', refused(r), r.error?.message);
r = await A.rpc('join_group', { p_code: g2.join_code });
check('লগইন ছাড়া কোড দিয়ে ঢোকা যায় না', !!r.error, r.error?.message);

fs.writeFileSync('shots-groups/api.json', JSON.stringify(out, null, 1));
console.log(`\n${out.length - bad}/${out.length} passed`);
process.exit(bad ? 1 : 0);
