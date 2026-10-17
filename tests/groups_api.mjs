// Security checks on the real database after the two-phone test (phase B). Every "attack" below must be refused.
// H = haji test account, L = approved leader test account. Uses only the publishable key, like the app.
// Nothing here creates lasting records except what is cleaned up again.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const cfg = fs.readFileSync('src/config.js', 'utf8');
const URL = cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1];
const KEY = cfg.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/)[1];
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const email = (p) => `${p}@users.traveladda.app`;
const out = []; let bad = 0;
const check = (name, ok, note = '') => { out.push({ check: name, ok: !!ok, note: String(note ?? '').slice(0, 160) }); if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', name, note ?? ''); };
const refused = (r) => !!r.error || (Array.isArray(r.data) && r.data.length === 0) || r.data === null;
const err = (r) => r.error?.message;

const H = mk(); const L = mk(); const A = mk();
const hs = await H.auth.signInWithPassword({ email: email(process.env.H_PHONE), password: process.env.H_PW });
const ls = await L.auth.signInWithPassword({ email: email(process.env.L_PHONE), password: process.env.L_PW });
if (hs.error || ls.error) { console.log('login failed', hs.error?.message, ls.error?.message); process.exit(1); }
const hid = hs.data.user.id; const lid = ls.data.user.id;
const hcode = (await H.from('profiles').select('haji_code').single()).data.haji_code;
const lcode = (await L.from('profiles').select('haji_code').single()).data.haji_code;

// --- Profiles
let r = await H.from('profiles').update({ role: 'leader' }).eq('id', hid).select('role');
check('হাজী নিজেকে লিডার বানাতে পারেন না', (await H.from('profiles').select('role').single()).data?.role === 'haji', err(r));
r = await H.from('profiles').update({ account_type: 'leader' }).eq('id', hid).select('id');
check('হাজী অ্যাকাউন্টের ধরন বদলাতে পারেন না', (await H.from('profiles').select('account_type').single()).data?.account_type === 'haji', err(r));
r = await H.from('profiles').update({ phone_verified: true }).eq('id', hid).select('id');
check('হাজী নিজে নম্বর "যাচাই করা" বানাতে পারেন না', (await H.from('profiles').select('phone_verified').single()).data?.phone_verified === false, err(r));
r = await L.from('profiles').update({ role: 'admin' }).eq('id', lid).select('id');
check('লিডার নিজেকে অ্যাডমিন বানাতে পারেন না', (await L.from('profiles').select('role').single()).data?.role === 'leader', err(r));
r = await L.from('profiles').select('phone').eq('id', hid);
check('লিডার হাজীর প্রোফাইল সরাসরি পড়তে পারেন না', refused(r), err(r));
r = await H.from('leader_applications').insert({ agency_name: 'হাজীর ভুয়া', license_no: 'X' });
check('হাজী অ্যাকাউন্ট লিডার আবেদন করতে পারে না', !!r.error, err(r));

// --- Directory
r = await H.rpc('list_leaders', { p_district: null, p_search: 'CI লিডার' });
check('তালিকায় লিডার আছেন', !r.error && r.data.some((x) => x.id === lid), err(r));
check('তালিকায় কোনো ফোন নম্বর নেই', !r.error && !r.data.some((x) => Object.keys(x).some((k) => /phone/.test(k))), Object.keys(r.data?.[0] || {}).join(','));
r = await A.rpc('list_leaders', { p_district: null, p_search: null });
check('লগইন ছাড়া তালিকা দেখা যায় না', refused(r), err(r));

// --- Contracts
r = await H.from('haji_contracts').select('*');
check('চুক্তির টেবিল সরাসরি পড়া যায় না', !!r.error, err(r));
r = await H.rpc('leader_send_contract', { p_haji_code: hcode, p_kind: 'umrah', p_title: 'হ্যাক', p_price: 1, p_includes: 'xx', p_excludes: null, p_from: null, p_to: null, p_refund: 'xx', p_extra: null, p_offer: null });
check('হাজী চুক্তি পাঠাতে পারেন না', !!r.error, err(r));
r = await L.rpc('leader_send_contract', { p_haji_code: lcode, p_kind: 'umrah', p_title: 'নিজেকে', p_price: 1, p_includes: 'xx', p_excludes: null, p_from: null, p_to: null, p_refund: 'xx', p_extra: null, p_offer: null });
check('লিডার নিজেকে বা লিডার অ্যাকাউন্টকে চুক্তি পাঠাতে পারেন না', r.data === 'bad_code', err(r) || r.data);
const hc = (await H.rpc('my_contracts')).data || [];
const last = hc[0];
if (last) {
  r = await L.rpc('haji_respond_contract', { p_id: last.id, p_accept: true });
  check('লিডার হাজীর হয়ে রাজি হতে পারেন না', r.data === 'not_found', err(r) || r.data);
  r = await L.rpc('rate_leader', { p_contract: last.id, p_stars: 5, p_comment: 'নিজেকে' });
  check('লিডার নিজেকে রেটিং দিতে পারেন না', r.data === 'not_allowed', err(r) || r.data);
  check('বাতিল চুক্তিতে লিডারের ফোন দেখা যায় না', last.status !== 'cancelled' || !last.leader_phone, last.status);
}
r = await H.from('leader_ratings').select('*');
check('রেটিং টেবিল সরাসরি পড়া যায় না', !!r.error, err(r));
r = await H.from('complaints').select('*');
check('অভিযোগের টেবিল সরাসরি পড়া যায় না', !!r.error, err(r));
r = await L.storage.from('complaint-evidence').list(hid);
check('লিডার হাজীর অভিযোগের প্রমাণ দেখতে পান না', !r.data || r.data.length === 0, err(r));

// --- Referral, groups
r = await H.from('leader_referrals').select('*');
check('রেফারেল টেবিল সরাসরি পড়া যায় না', !!r.error, err(r));
r = await H.rpc('leader_referral_list');
check('হাজী লিডারের রেফারেল তালিকা দেখেন না', refused(r), err(r));
r = await H.rpc('my_groups');
check('চুক্তি ছাড়া দলের লিডারের নম্বর দেখা যায় না', !r.error && r.data.every((g) => !g.leader_phone), err(r));

// --- Reports, blocks, admin
r = await H.from('user_reports').select('*').neq('reporter', hid);
check('অন্যের রিপোর্ট দেখা যায় না', refused(r), err(r));
r = await H.from('user_blocks').insert({ blocker: lid, blocked: hid });
check('অন্যের হয়ে ব্লক করা যায় না', !!r.error, err(r));
for (const [fn, args] of [['admin_list_applications', {}], ['admin_list_complaints', {}], ['admin_list_reports', {}], ['admin_referral_cancels', {}], ['admin_list_interests', {}]]) {
  r = await L.rpc(fn, args);
  check(`লিডার ${fn} দেখতে পান না`, !r.error && r.data.length === 0, err(r));
}
r = await H.rpc('admin_find_users', { p_query: '0130' });
check('হাজী ব্যবহারকারী খুঁজতে পারেন না', !r.error && r.data.length === 0, err(r));
r = await L.rpc('admin_set_user_status', { p_user: hid, p_status: 'suspended', p_reason: 'hack attempt' });
check('লিডার কাউকে বন্ধ করতে পারেন না', !!r.error, err(r));
r = await H.rpc('admin_set_staff', { p_phone: process.env.H_PHONE, p_perms: ['users'] });
check('হাজী নিজেকে স্টাফ বানাতে পারেন না', !!r.error, err(r));
r = await H.rpc('admin_export', { p_kind: 'users' });
check('হাজী এক্সেল ডাউনলোড করতে পারেন না', !!r.error, err(r));
r = await H.rpc('admin_list_audit');
check('হাজী কাজের রেকর্ড দেখেন না', !r.error && r.data.length === 0, err(r));
r = await H.rpc('admin_stats');
check('হাজী পরিসংখ্যান দেখেন না', !r.error && r.data === null, err(r));
r = await H.from('app_texts').insert({ key: 'terms', body: 'hack' });
check('শর্তাবলি কেউ লিখতে পারে না', !!r.error, err(r));
r = await H.rpc('admin_set_text', { p_key: 'terms', p_body: 'hack' });
check('হাজী শর্তাবলি বদলাতে পারেন না', !!r.error, err(r));
r = await H.from('phone_otps').select('*');
check('এসএমএস কোডের টেবিল কেউ পড়তে পারে না', !!r.error || (r.data || []).length === 0, err(r));
r = await A.rpc('my_contracts');
check('লগইন ছাড়া চুক্তি দেখা যায় না', refused(r), err(r));

// --- Payments (008), only when that step has been run
{
  const probe = await H.from('haji_payments').select('id').limit(1);
  if (!probe.error) {
    const mc = (await H.rpc('my_contracts')).data || [];
    const k = mc[0];
    if (k) {
      let x = await H.from('haji_payments').insert({ contract_id: k.id, amount: 100, method: 'bkash', txn_ref: 'CI-NEVER-1' });
      check('চালু নয় এমন চুক্তিতে টাকা জমা দেওয়া যায় না', !!x.error, err(x));
      x = await L.from('haji_payments').insert({ contract_id: k.id, amount: 100, method: 'bkash', txn_ref: 'CI-NEVER-2' });
      check('লিডার হাজীর নামে টাকা জমা দিতে পারেন না', !!x.error, err(x));
      x = await L.rpc('admin_add_payout', { p_contract: k.id, p_payee: 'leader', p_amount: 1, p_ref: 'CI-X', p_note: null });
      check('লিডার নিজেকে টাকা দেওয়া লিখতে পারেন না', !!x.error, err(x));
      x = await L.rpc('admin_set_commission', { p_contract: k.id, p_amount: 0 });
      check('লিডার নিজের কমিশন বদলাতে পারেন না', !!x.error, err(x));
      x = await H.rpc('contract_money', { p_contract: k.id });
      check('হাজী নিজের চুক্তির টাকার হিসাব দেখেন, কমিশন দেখেন না', !x.error && x.data.length === 1 && x.data[0].commission === null, err(x));
    }
    let y = await L.from('haji_payments').select('id');
    check('লিডার হাজীদের রসিদ/জমার তালিকা সরাসরি দেখেন না', refused(y), err(y));
    y = await H.rpc('admin_list_payments', { p_status: null });
    check('হাজী অ্যাডমিনের টাকার তালিকা দেখেন না', !y.error && y.data.length === 0, err(y));
    y = await L.rpc('admin_ledger');
    check('লিডার অ্যাডমিনের হিসাব দেখেন না', !y.error && y.data.length === 0, err(y));
    y = await H.rpc('admin_review_payment', { p_id: '00000000-0000-0000-0000-000000000000', p_confirm: true, p_note: null });
    check('হাজী টাকা "পাওয়া গেছে" করতে পারেন না', !!y.error, err(y));
    y = await H.rpc('admin_set_setting', { p_key: 'pay_bkash', p_value: '01900000000' });
    check('হাজী টাকার অ্যাকাউন্ট নম্বর বদলাতে পারেন না', !!y.error, err(y));
    y = await A.from('haji_payments').select('id');
    check('লগইন ছাড়া টাকার তথ্য দেখা যায় না', refused(y), err(y));
  } else console.log('payments step (008) not run yet:', probe.error.message);
}

fs.writeFileSync('shots-groups/api.json', JSON.stringify(out, null, 1));
console.log(`\n${out.length - bad}/${out.length} passed`);
process.exit(bad ? 1 : 0);
