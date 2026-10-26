// Security checks on the real database after the two-phone test (phase B). Every "attack" below must be refused.
// H = haji test account, L = approved leader test account. Uses only the publishable key, like the app.
// Nothing here creates lasting records except what is cleaned up again.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loginId } from './login_id.mjs';

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
const hs = await H.auth.signInWithPassword({ email: await loginId(H, process.env.H_PHONE), password: process.env.H_PW });
const ls = await L.auth.signInWithPassword({ email: await loginId(L, process.env.L_PHONE), password: process.env.L_PW });
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

// --- Notifications (009)
{
  const probe = await H.rpc('my_unread_count');
  if (!probe.error) {
    let x = await H.from('user_notifications').insert({ user_id: lid, title: 'ভুয়া নোটিশ' });
    check('অন্যের নোটিফিকেশন বক্সে কিছু লেখা যায় না', !!x.error, err(x));
    x = await L.from('user_notifications').select('id').eq('user_id', hid);
    check('অন্যের নোটিফিকেশন পড়া যায় না', refused(x), err(x));
    x = await H.rpc('admin_send_notification', { p_audience: 'all', p_title: 'ভুয়া', p_body: null, p_target: null, p_important: true });
    check('হাজী সবাইকে নোটিফিকেশন পাঠাতে পারেন না', !!x.error, err(x));
    x = await L.rpc('admin_send_notification', { p_audience: 'haji', p_title: 'ভুয়া', p_body: null, p_target: null, p_important: false });
    check('লিডার সবাইকে নোটিফিকেশন পাঠাতে পারেন না', !!x.error, err(x));
    x = await H.from('broadcasts').select('id');
    check('নোটিশের মূল টেবিল সরাসরি পড়া যায় না', !!x.error || refused(x), err(x));
    x = await A.rpc('my_notifications', { p_limit: 10 });
    check('লগইন ছাড়া নোটিফিকেশন দেখা যায় না', refused(x), err(x));
  } else console.log('notifications step (009) not run yet:', probe.error.message);
}

// --- Without logging in (anyone on the internet with the public key): every table and every private list must be closed
{
  const tables = ['profiles', 'leader_applications', 'leader_profiles', 'groups', 'group_members', 'contracts', 'contract_acceptances',
    'group_announcements', 'user_documents', 'offers', 'offer_interests', 'haji_contracts', 'haji_payments', 'payouts', 'leader_rates',
    'complaints', 'complaint_files', 'leader_ratings', 'leader_referrals', 'user_blocks', 'user_reports', 'admin_staff', 'admin_audit',
    'phone_otps', 'app_settings', 'user_notifications', 'broadcasts', 'broadcast_reads', 'push_tokens', 'push_log', 'push_outbox',
    'terms_agreements', 'app_private', 'group_staff', 'help_threads', 'help_messages', 'group_faq', 'leader_invites', 'khadem_invites'];
  const open = [];
  for (const t of tables) {
    const x = await A.from(t).select('*').limit(1);
    if (!x.error && Array.isArray(x.data) && x.data.length) open.push(t);
    const w = await A.from(t).insert({});
    if (!w.error) open.push(t + ' (লেখা)');
  }
  check('লগইন ছাড়া কোনো টেবিল পড়া বা লেখা যায় না', open.length === 0, open.join(', '));
  const rpcs = [['admin_find_users', { p_query: '017' }], ['admin_list_applications', {}], ['admin_export', { p_kind: 'users' }],
    ['list_leaders', { p_district: null, p_search: null }], ['my_contracts', {}], ['admin_stats', {}], ['admin_ledger', {}]];
  const leak = [];
  for (const [f, a] of rpcs) { const x = await A.rpc(f, a); if (!refused(x) && !(Array.isArray(x.data) && x.data.length === 0)) leak.push(f); }
  check('লগইন ছাড়া কোনো তালিকা বা অ্যাডমিন কাজ চলে না', leak.length === 0, leak.join(', '));
  const files = [];
  for (const b of ['documents', 'avatars', 'leader-docs', 'complaint-evidence', 'receipts']) {
    const x = await A.storage.from(b).list(hid, { limit: 5 });
    if (!x.error && x.data && x.data.length) files.push(b);
    const u = await A.storage.from(b).upload(`${hid}/anon-test.jpg`, new Uint8Array([255, 216, 255]), { contentType: 'image/jpeg' });
    if (!u.error) { files.push(b + ' (আপলোড)'); await A.storage.from(b).remove([`${hid}/anon-test.jpg`]); }
  }
  check('লগইন ছাড়া কারো ফাইল দেখা বা রাখা যায় না', files.length === 0, files.join(', '));
}

// --- Signed in, but someone else's files (H's folder seen by L and the other way round)
{
  const files = [];
  for (const b of ['documents', 'leader-docs', 'complaint-evidence', 'receipts']) {
    const x = await L.storage.from(b).list(hid, { limit: 5 });
    if (!x.error && x.data && x.data.length) files.push(b);
    const u = await L.storage.from(b).upload(`${hid}/l-test.jpg`, new Uint8Array([255, 216, 255]), { contentType: 'image/jpeg' });
    if (!u.error) { files.push(b + ' (আপলোড)'); await L.storage.from(b).remove([`${hid}/l-test.jpg`]); }
  }
  check('লিডার হাজীর ফোল্ডারে ফাইল দেখতে বা রাখতে পারেন না', files.length === 0, files.join(', '));
  const y = await H.storage.from('nonexistent-bucket').upload(`${hid}/x.jpg`, new Uint8Array([1]), { contentType: 'image/jpeg' });
  check('অজানা ফাইল-বাক্সে কিছু রাখা যায় না', !!y.error, y.error?.message);
}

// --- 016: login by phone or e-mail never reveals who uses the app, nor a phone number
{
  const k = await A.rpc('login_id', { p_ident: process.env.H_PHONE });
  if (!k.error) {
    const fake = await A.rpc('login_id', { p_ident: '01399999999' });
    const fakeMail = await A.rpc('login_id', { p_ident: 'nobody-ci@example.com' });
    const re = /^u[0-9a-f]{20}@users\.traveladda\.app$/;
    check('লগইন ঠিকানায় ফোন নম্বর নেই, আর অ্যাকাউন্ট আছে কি না বোঝা যায় না (০১৬)',
      re.test(k.data) && re.test(fake.data) && re.test(fakeMail.data) && !String(k.data).includes(process.env.H_PHONE), `${k.data} / ${fake.data}`);
    let x = await H.from('profiles').update({ email: 'hack@example.com', email_verified: true }).eq('id', hid).select('id');
    check('কেউ নিজে ইমেইল "যাচাই করা" বানাতে পারে না (০১৬)', !!x.error || refused(x), err(x));
    x = await H.from('profiles').update({ login_key: 'u00000000000000000000' }).eq('id', hid).select('id');
    check('কেউ নিজের লগইন চাবি বদলাতে পারে না (০১৬)', !!x.error || refused(x), err(x));
  } else console.log('step 016 not run yet:', k.error.message);
}

// --- 017: leader kind is set only by the admin's approval; nobody may claim "Travel Adda"
{
  const k = await L.from('leader_profiles').select('leader_kind').eq('user_id', lid).single();
  if (!k.error) {
    let x = await L.from('leader_profiles').update({ leader_kind: 'travel_adda' }).eq('user_id', lid).select('user_id');
    check('লিডার নিজেকে "Travel Adda-র নিজস্ব লিডার" বানাতে পারেন না (০১৭)', !!x.error || refused(x), err(x));
    x = await L.from('leader_profiles').update({ agency_name: 'Travel Adda' }).eq('user_id', lid).select('user_id');
    check('লিডার এজেন্সির নাম "Travel Adda" করতে পারেন না (০১৭)', !!x.error || refused(x), err(x));
    x = await H.from('leader_applications').insert({ leader_kind: 'travel_adda', doc_path: `${hid}/nid.jpg` });
    check('হাজী অ্যাকাউন্ট Travel Adda লিডার আবেদন করতে পারে না (০১৭)', !!x.error, err(x));
  } else console.log('step 017 not run yet:', k.error.message);
}

// --- 019: a leader can never approve their own package
{
  const fake = '00000000-0000-0000-0000-000000000001';
  const probe = await L.from('offers').select('review').limit(1);
  if (!probe.error) {
    let x = await L.from('offers').update({ review: 'approved' }).eq('id', fake).select('id');
    check('লিডার নিজের প্যাকেজ নিজে অনুমোদন দিতে পারেন না (০১৯)', !!x.error, err(x));
    x = await L.rpc('admin_review_offer', { p_offer: fake, p_decision: 'approve', p_note: null });
    check('লিডার অ্যাডমিনের অনুমোদন বোতাম চালাতে পারেন না (০১৯)', !!x.error, err(x));
    x = await H.rpc('admin_offers_review');
    check('হাজী অপেক্ষায় থাকা প্যাকেজের তালিকা দেখতে পারেন না (০১৯)', !!x.error, err(x));
  } else console.log('step 019 not run yet:', probe.error.message);
}

// --- 022: admin tools stay admin-only; video links are read-only for everyone else
{
  const p = await H.from('app_videos').select('route').limit(1);
  if (!p.error) {
    const fake = '00000000-0000-0000-0000-000000000001';
    const calls = [['admin_find_contracts', { p_query: '' }], ['admin_contract_detail', { p_id: fake }], ['admin_user_detail', { p_user: fake }],
      ['admin_counts', {}], ['admin_list_ratings', { p_query: null }], ['admin_groups', { p_query: null }],
      ['admin_hide_rating', { p_contract: fake, p_hide: true, p_reason: 'পরীক্ষা পরীক্ষা' }], ['admin_set_leader_listed', { p_user: fake, p_listed: false, p_reason: 'পরীক্ষা পরীক্ষা' }],
      ['admin_set_video', { p_route: 'Home', p_url: 'https://evil.example/x.mp4' }], ['admin_add_contract_note', { p_id: fake, p_note: 'হ্যাক করার চেষ্টা' }]];
    const open = [];
    for (const [fn, args] of calls) { for (const who of [H, L]) { const r = await who.rpc(fn, args); if (!r.error) open.push(fn); } }
    check('অ্যাডমিনের নতুন কাজগুলো হাজী বা লিডার চালাতে পারেন না (০২২)', open.length === 0, open.join(', '));
    const w = await H.from('app_videos').insert({ route: 'Home', url: 'https://evil.example/x.mp4' });
    check('ভিডিও লিংক অ্যাডমিন ছাড়া কেউ বসাতে পারেন না (০২২)', !!w.error, err(w));
  } else console.log('step 022 not run yet:', p.error.message);
}

// --- 023: admin & staff need 2FA; a password-only session reports aal1 and gets no admin menu
{
  const p = await H.rpc('my_mfa_state');
  if (!p.error) {
    check('পাসওয়ার্ড-লগইনের সেশন 2FA ছাড়া (aal1) বলে চেনা যায় (০২৩)', p.data && p.data.aal === 'aal1' && p.data.staff === false, JSON.stringify(p.data));
    const m = await L.rpc('my_perms');
    check('2FA ছাড়া কারও অ্যাডমিন মেনু খোলে না (০২৩)', !m.error && Array.isArray(m.data) && m.data.length === 0, err(m) || JSON.stringify(m.data));
    const a = await H.rpc('is_admin');
    check('2FA ছাড়া কেউ অ্যাডমিন নন (০২৩)', !a.error && a.data === false, err(a) || String(a.data));
  } else console.log('step 023 not run yet:', p.error.message);
}

// --- 024: chat reading only with the haji's consent; guide/dua text only by the admin
{
  const p = await H.rpc('my_chat_consents');
  if (!p.error) {
    const fake = '00000000-0000-0000-0000-000000000001';
    const open = [];
    for (const [fn, args] of [['admin_request_chat_consent', { p_contract: fake, p_reason: 'হ্যাক করার চেষ্টা' }], ['admin_chat_consents', { p_contract: fake }],
      ['admin_view_help_chat', { p_consent: fake }], ['admin_set_content', { p_kind: 'guide', p_item: 'health', p_path: 'title', p_body: 'হ্যাক' }]]) {
      for (const who of [H, L]) { const r = await who.rpc(fn, args); if (!r.error) open.push(fn); }
    }
    check('হাজী বা লিডার অন্যের প্রশ্ন-উত্তর পড়তে বা গাইড বদলাতে পারেন না (০২৪)', open.length === 0, open.join(', '));
    let x = await H.from('chat_consents').select('id').limit(1);
    check('অনুমতির তালিকা সরাসরি পড়া যায় না (০২৪)', !!x.error, err(x));
    x = await H.from('content_overrides').insert({ kind: 'guide', item_id: 'health', path: 'title', body: 'হ্যাক' });
    check('গাইডের লেখা সরাসরি বদলানো যায় না (০২৪)', !!x.error, err(x));
    x = await H.rpc('chat_consent_respond', { p_id: fake, p_accept: true });
    check('অন্যের অনুমতির অনুরোধে উত্তর দেওয়া যায় না (০২৪)', !x.error && x.data === 'not_found', err(x) || x.data);
  } else console.log('step 024 not run yet:', p.error.message);
}

// --- 026: money alerts, service costs, work-record search, notifications to a part, SOS list: staff only
{
  const p = await H.rpc('admin_money_alerts');
  if (!p.error || !/could not find/i.test(p.error.message || '')) {
    const fake = '00000000-0000-0000-0000-000000000001';
    const open = [];
    for (const [fn, args] of [['admin_money_alerts', {}], ['admin_add_service_cost', { p_leader: fake, p_contract: null, p_kind: 'visa', p_amount: 1, p_note: 'হ্যাক চেষ্টা' }],
      ['admin_service_costs', { p_leader: fake }], ['admin_leader_balance', { p_leader: fake }], ['admin_delete_service_cost', { p_id: fake, p_reason: 'হ্যাক চেষ্টা' }],
      ['admin_audit_search', { p_actor: null, p_action: null, p_days: 30 }], ['admin_audit_actors', {}], ['admin_segment_size', { p_kind: 'month', p_value: '2026-11' }],
      ['admin_notify_segment', { p_kind: 'month', p_value: '2026-11', p_title: 'ভুয়া', p_body: null }], ['admin_sos_list', { p_days: 7 }], ['segment_users', { p_kind: 'month', p_value: '2026-11' }]]) {
      for (const who of [H, L]) { const r = await who.rpc(fn, args); if (!r.error) open.push(fn); }
    }
    check('টাকার বকেয়া, সেবা-খরচ, কাজের রেকর্ড, নোটিফিকেশন ও জরুরি রেকর্ড শুধু স্টাফের (০২৬)', open.length === 0, open.join(', '));
    let x = await L.from('service_costs').select('id').limit(1);
    check('লিডার সেবা-খরচের তালিকা দেখতে পারেন না (০২৬)', !!x.error, err(x));
    x = await H.from('sos_events').select('id').limit(1);
    check('জরুরি রেকর্ড সরাসরি পড়া যায় না (০২৬)', !!x.error, err(x));
    x = await H.rpc('log_sos', { p_number: 'abc', p_label: 'পরীক্ষা', p_lat: null, p_lng: null, p_acc: null });   // bad number: refused, nothing saved, nobody told
    check('ভুল নম্বরে জরুরি রেকর্ড হয় না (০২৬)', !!x.error, err(x));
  } else console.log('step 026 not run yet:', p.error.message);
}

// --- 021: invitations never reveal who owns a number; rating helper internal; delete needs a fresh password (not called here)
{
  const p = await H.rpc('my_khadem_invites');
  if (!p.error) {
    const fake = '00000000-0000-0000-0000-000000000001';
    let x = await H.rpc('rating_counts', { p_contract: fake });
    check('রেটিং গণনার ভেতরের নিয়ম বাইরে থেকে চালানো যায় না (০২১)', !!x.error, err(x));
    x = await H.rpc('my_sent_invites', { p_group: fake });
    check('হাজী অন্য দলের পাঠানো আমন্ত্রণ দেখতে পারেন না (০২১)', !!x.error, err(x));
    x = await H.rpc('leader_cancel_invite', { p_id: fake });
    check('অন্যের আমন্ত্রণ বাতিল করা যায় না (০২১)', !x.error && x.data === 'not_found', err(x) || x.data);
    x = await H.rpc('khadem_respond', { p_group: fake, p_accept: true });
    check('অনুরোধ ছাড়া নিজে নিজে খাদেম হওয়া যায় না (০২১)', !x.error && x.data === 'not_found', err(x) || x.data);
    const open = [];
    for (const t of ['leader_invites', 'khadem_invites']) { const r = await H.from(t).select('*').limit(1); if (!r.error && r.data && r.data.length) open.push(t); }
    check('আমন্ত্রণের টেবিল সরাসরি পড়া যায় না (০২১)', open.length === 0, open.join(', '));
  } else console.log('step 021 not run yet:', p.error.message);
}

// --- 020: the package list says who the leader is, never a phone
{
  const x = await H.rpc('list_offers', { p_kind: 'umrah' });
  if (!x.error && x.data && x.data.length && 'leader_code' in x.data[0]) {
    check('প্যাকেজের তালিকায় লিডারের আইডি ও রেটিং আছে (০২০)', x.data.every((o) => o.leader_code && 'rating_avg' in o), '');
    check('প্যাকেজের তালিকায় কোনো ফোন নম্বর নেই (০২০)', x.data.every((o) => !Object.keys(o).some((k) => /phone/i.test(k))), Object.keys(x.data[0]).join(','));
  } else console.log('step 020 not run yet or no packages:', x.error ? x.error.message : 'no rows');
}

// --- 018: khadems and help chat stay inside the group
{
  const p = await H.rpc('my_khadem_groups');
  if (!p.error) {
    const fake = '00000000-0000-0000-0000-000000000001';
    let x = await L.rpc('leader_add_khadem', { p_group: fake, p_ident: process.env.H_PHONE });
    check('অন্যের দলে খাদেম যোগ করা যায় না (০১৮)', !!x.error, err(x));
    x = await H.rpc('help_inbox', { p_group: fake });
    check('হাজী অন্য দলের প্রশ্নের তালিকা দেখতে পারেন না (০১৮)', !!x.error, err(x));
    x = await H.rpc('help_send', { p_group: fake, p_body: 'দলের বাইরে থেকে' });
    check('দলের বাইরে থেকে প্রশ্ন পাঠানো যায় না (০১৮)', !!x.error, err(x));
    const open = [];
    for (const t of ['group_staff', 'help_threads', 'help_messages', 'group_faq']) { const r = await H.from(t).select('*').limit(1); if (!r.error && r.data && r.data.length) open.push(t); }
    check('খাদেম/চ্যাটের টেবিল সরাসরি পড়া যায় না (০১৮)', open.length === 0, open.join(', '));
  } else console.log('step 018 not run yet:', p.error.message);
}

// --- 015: helper questions about other people are internal only (shown as "not run yet" until 015 is run)
{
  const x = await H.rpc('blocked_between', { a: lid, b: hid });
  const y = await H.rpc('has_accepted_contract', { p_a: lid, p_b: hid });
  const z = await H.rpc('active_referral_leader', { p_haji: hid });
  const closed = !!x.error && !!y.error && !!z.error;
  if (closed) check('অন্যদের সম্পর্কে প্রশ্নের ভেতরের ফাংশন বাইরে থেকে চলে না (০১৫)', true);
  else console.log('step 015 not run yet: helper functions still callable', x.error?.message, y.error?.message, z.error?.message);
}

fs.writeFileSync('shots-groups/api.json', JSON.stringify(out, null, 1));
console.log(`\n${out.length - bad}/${out.length} passed`);
process.exit(bad ? 1 : 0);
