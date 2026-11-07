// Security step 2 (owner approval 7 Nov 2026): active authorization tests on the TEST server only.
// T05 read another haji's documents/receipts · T06 change/delete another's data · T07 admin functions as a normal user
// T08 change own role/price/status · T09 file links for another's files · T10 file type/size limits
// T11 missing/forged login token · T12 logout and refresh-token reuse · T21 money: same payment twice, someone else's contract
// Accounts: H = haji A (existing CI haji), B = haji B (CI haji 2, made here on first run), L = approved CI leader.
// Only synthetic data; everything created is removed or cancelled at the end (cleanup). Hard request limit below.
import fs from 'node:fs';
import { createHmac } from 'node:crypto';

const cfg = fs.readFileSync('src/config.ts', 'utf8');
const URL = cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1];
const KEY = cfg.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/)[1];
// Safety lock: never run against anything but the test server (ami-haji-test). Checked before any request.
if (!URL.includes('yhavfnaljbiefzofcduj')) { console.error('NOT the test server - stopped, nothing was sent'); process.exit(2); }

const { createClient } = await import('@supabase/supabase-js');
const { loginId } = await import('./login_id.mjs');

const MAX_REQUESTS = 400;
let requests = 0;
const countedFetch = (...a) => { if (++requests > MAX_REQUESTS) throw new Error('request limit reached'); return fetch(...a); };
const mk = (headers) => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: countedFetch, ...(headers ? { headers } : {}) } });
const out = []; let bad = 0;
const check = (id, name, ok, note = '') => { out.push({ id, check: name, ok: !!ok, note: String(note ?? '').slice(0, 200) }); if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', id, name, note ?? ''); };
const info = (id, name, note) => { out.push({ id, check: name, ok: null, info: true, note: String(note ?? '').slice(0, 300) }); console.log('INFO', id, name, note); };
const err = (r) => r?.error?.message;
const empty = (r) => !!r.error || r.data == null || (Array.isArray(r.data) && r.data.length === 0);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
const JPG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');   // a tiny, harmless JPEG

async function signIn(phone, pw) {
  const c = mk(); const r = await c.auth.signInWithPassword({ email: await loginId(c, phone), password: pw });
  return { c, r };
}

// ---------- accounts ----------
const { H_PHONE, H_PW, L_PHONE, L_PW, B_PHONE, B_PW, D_PHONE, D_PW } = process.env;
if (!B_PW || !H_PW || !L_PW) { console.error('test passwords missing'); process.exit(1); }
const h = await signIn(H_PHONE, H_PW), l = await signIn(L_PHONE, L_PW);
let b = await signIn(B_PHONE, B_PW);
if (b.r.error) {   // first run: make haji B exactly like the app does (random login address, phone in the metadata)
  const c = mk(); const rnd = [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const s = await c.auth.signUp({ email: `u${rnd}@users.traveladda.app`, password: B_PW, options: { data: { full_name: 'CI পরীক্ষা হাজী খ (আসল নয়)', phone: B_PHONE, account_type: 'haji' } } });
  console.log('made haji B:', s.error ? s.error.message : 'ok');
  b = await signIn(B_PHONE, B_PW);
}
if (h.r.error || l.r.error || b.r.error) { console.error('login failed', err(h.r), err(l.r), err(b.r)); process.exit(1); }
const H = h.c, L = l.c, B = b.c;
const hid = h.r.data.user.id, bid = b.r.data.user.id;
const bcode = (await B.from('profiles').select('haji_code').single()).data?.haji_code;
const made = { docPath: null, docId: null, rcptPath: null, contract: null, factor: null };
let D = null;

// 6-digit authenticator code (RFC 6238), computed here from the secret the server just gave the CI admin.
// No code is ever typed, shown or shared.
function totp(base32, at = Date.now()) {
  const al = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const ch of base32.replace(/=+$/, '').toUpperCase()) bits += al.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const hm = createHmac('sha1', key).update(ctr).digest(); const o = hm[hm.length - 1] & 15;
  return String((hm.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0');
}

try {
  // ---------- T05 / T09: haji A cannot see haji B's documents ----------
  made.docPath = `${bid}/sec-${stamp}.jpg`;
  let r = await B.storage.from('documents').upload(made.docPath, JPG, { contentType: 'image/jpeg', upsert: false });
  check('T10', 'নিজের ফোল্ডারে ছোট ছবি রাখা যায় (পরীক্ষার শুরু)', !r.error, err(r));
  r = await B.from('user_documents').insert({ doc_type: 'other', file_path: made.docPath }).select('id').single();
  made.docId = r.data?.id;
  check('T05', 'হাজী খ নিজের কাগজের তথ্য রাখতে পারেন', !!made.docId, err(r));

  r = await H.from('user_documents').select('id,file_path').eq('id', made.docId);
  check('T05', 'হাজী ক, খ-এর কাগজের তালিকা দেখতে পান না', empty(r), err(r) || JSON.stringify(r.data));
  r = await H.storage.from('documents').download(made.docPath);
  check('T05', 'হাজী ক, খ-এর কাগজের ফাইল নামাতে পারেন না', !!r.error, err(r));
  r = await H.storage.from('documents').list(bid);
  check('T05', 'হাজী ক, খ-এর ফোল্ডারের ফাইলের নাম দেখতে পান না', empty(r), err(r));
  r = await H.storage.from('documents').createSignedUrl(made.docPath, 60);
  check('T09', 'হাজী ক, খ-এর কাগজের লিংক বানাতে পারেন না', !!r.error || !r.data?.signedUrl, err(r));
  r = await L.storage.from('documents').createSignedUrl(made.docPath, 60);
  check('T09', 'লিডারও হাজীর কাগজের লিংক বানাতে পারেন না', !!r.error || !r.data?.signedUrl, err(r));
  r = await mk().storage.from('documents').createSignedUrl(made.docPath, 60);
  check('T09', 'লগইন ছাড়া কাগজের লিংক বানানো যায় না', !!r.error || !r.data?.signedUrl, err(r));
  r = await H.from('user_documents').insert({ doc_type: 'other', file_path: made.docPath }).select('id');
  check('T09', 'হাজী ক, খ-এর ফাইলকে নিজের কাগজ বলে লিখতে পারেন না', !!r.error, err(r));

  // receipts: same idea
  made.rcptPath = `${bid}/sec-${stamp}.jpg`;
  r = await B.storage.from('receipts').upload(made.rcptPath, JPG, { contentType: 'image/jpeg', upsert: false });
  check('T05', 'হাজী খ নিজের রসিদ রাখতে পারেন', !r.error, err(r));
  r = await H.storage.from('receipts').download(made.rcptPath);
  check('T05', 'হাজী ক, খ-এর রসিদ নামাতে পারেন না', !!r.error, err(r));
  r = await L.storage.from('receipts').createSignedUrl(made.rcptPath, 60);
  check('T09', 'লিডার হাজীর রসিদের লিংক বানাতে পারেন না', !!r.error || !r.data?.signedUrl, err(r));

  // ---------- T06: haji A cannot change or delete haji B's data ----------
  r = await H.storage.from('documents').upload(`${bid}/sec-intruder-${stamp}.jpg`, JPG, { contentType: 'image/jpeg' });
  check('T06', 'হাজী ক, খ-এর ফোল্ডারে ফাইল রাখতে পারেন না', !!r.error, err(r));
  r = await H.storage.from('documents').upload(made.docPath, JPG, { contentType: 'image/jpeg', upsert: true });
  check('T06', 'হাজী ক, খ-এর ফাইলের ওপর অন্য ফাইল বসাতে পারেন না', !!r.error, err(r));
  await H.storage.from('documents').remove([made.docPath]);
  await H.from('user_documents').delete().eq('id', made.docId);
  r = await B.from('user_documents').select('id').eq('id', made.docId);
  const r2 = await B.storage.from('documents').download(made.docPath);
  check('T06', 'হাজী ক, খ-এর কাগজ মুছতে পারেন না (তথ্য ও ফাইল দুটোই আছে)', !r.error && r.data?.length === 1 && !r2.error, err(r) || err(r2));
  const bName = (await B.from('profiles').select('full_name').single()).data?.full_name;
  await H.from('profiles').update({ full_name: 'হ্যাক' }).eq('id', bid);
  r = await B.from('profiles').select('full_name').single();
  check('T06', 'হাজী ক, খ-এর নাম বদলাতে পারেন না', r.data?.full_name === bName, r.data?.full_name);

  // ---------- T10: file type and size limits ----------
  r = await B.storage.from('documents').upload(`${bid}/sec-${stamp}.html`, Buffer.from('<script>alert(1)</script>'), { contentType: 'text/html' });
  check('T10', 'ওয়েব-পাতা (HTML) কাগজ হিসেবে রাখা যায় না', !!r.error, err(r));
  if (!r.error) await B.storage.from('documents').remove([`${bid}/sec-${stamp}.html`]);
  r = await B.storage.from('documents').upload(`${bid}/sec-${stamp}.svg`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { contentType: 'image/svg+xml' });
  check('T10', 'SVG ছবি (ভেতরে কোড থাকতে পারে) রাখা যায় না', !!r.error, err(r));
  if (!r.error) await B.storage.from('documents').remove([`${bid}/sec-${stamp}.svg`]);
  r = await B.storage.from('documents').upload(`${bid}/sec-big-${stamp}.jpg`, Buffer.concat([JPG, Buffer.alloc(5 * 1024 * 1024 + 10)]), { contentType: 'image/jpeg' });
  check('T10', '৫ MB-এর বেশি ফাইল রাখা যায় না', !!r.error, err(r));
  if (!r.error) await B.storage.from('documents').remove([`${bid}/sec-big-${stamp}.jpg`]);
  r = await B.storage.from('documents').upload(`${bid}/sec-fake-${stamp}.jpg`, Buffer.from('<html>not a picture</html>'), { contentType: 'image/jpeg' });
  info('T10', 'ছবি বলে দাবি করা অন্য ফাইল', r.error ? `refused: ${err(r)}` : 'accepted: the server trusts the declared type (it does not look inside the file)');
  if (!r.error) await B.storage.from('documents').remove([`${bid}/sec-fake-${stamp}.jpg`]);

  // ---------- T11: missing or forged login token ----------
  const tok = h.r.data.session.access_token;
  const [hd, pl, sg] = tok.split('.');
  const p = JSON.parse(Buffer.from(pl, 'base64url').toString());
  const forged = [hd, Buffer.from(JSON.stringify({ ...p, sub: bid })).toString('base64url'), sg].join('.');
  r = await mk({ Authorization: `Bearer ${forged}` }).from('user_documents').select('id').eq('id', made.docId);
  check('T11', 'নকল টোকেন (অন্যের আইডি বসানো) দিয়ে কিছু পাওয়া যায় না', empty(r), err(r) || JSON.stringify(r.data));
  r = await mk({ Authorization: 'Bearer abc.def.ghi' }).from('profiles').select('id');
  check('T11', 'ভাঙা টোকেন দিয়ে কিছু পাওয়া যায় না', empty(r), err(r));
  const none = [Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ ...p, sub: bid })).toString('base64url'), ''].join('.');
  r = await mk({ Authorization: `Bearer ${none}` }).from('user_documents').select('id');
  check('T11', 'সই ছাড়া ("alg none") টোকেন চলে না', empty(r), err(r));
  r = await mk().from('user_documents').select('id');
  check('T11', 'লগইন ছাড়া কাগজের তালিকা পাওয়া যায় না', empty(r), err(r));

  // ---------- T08 + T21: money ----------
  for (const c of ((await B.rpc('my_contracts')).data || []).filter((x) => x.status === 'accepted'))
    await B.rpc('cancel_contract', { p_id: c.id, p_reason: 'পুরনো নিরাপত্তা-পরীক্ষার চুক্তি বন্ধ' });   // leftovers of an earlier run
  r = await L.rpc('leader_send_contract', { p_haji_code: bcode, p_kind: 'umrah', p_title: `নিরাপত্তা-পরীক্ষা ${stamp}`, p_price: 100000, p_includes: 'পরীক্ষা মাত্র', p_excludes: null, p_from: null, p_to: null, p_refund: 'পরীক্ষা মাত্র', p_extra: null, p_offer: null });
  const sent = ((await B.rpc('my_contracts')).data || []).find((x) => x.title === `নিরাপত্তা-পরীক্ষা ${stamp}`);
  if (sent) { await B.rpc('haji_respond_contract', { p_id: sent.id, p_accept: true }); made.contract = sent.id; }
  check('T21', 'পরীক্ষার চুক্তি তৈরি ও রাজি (প্রস্তুতি)', !!made.contract, err(r) || r.data);
  if (made.contract) {
    await B.from('haji_contracts').update({ price_bdt: 1 }).eq('id', made.contract);
    r = (await B.rpc('my_contracts')).data?.find((x) => x.id === made.contract);
    check('T08', 'হাজী চুক্তির দাম নিজে বদলাতে পারেন না', Number(r?.price_bdt) === 100000, r?.price_bdt);
    const ref = `SEC${stamp}`;
    r = await B.from('haji_payments').insert({ contract_id: made.contract, amount: 500, method: 'bkash', txn_ref: ref }).select('id,status').single();
    const pid = r.data?.id;
    check('T21', 'হাজী খ নিজের চুক্তিতে টাকা জমার তথ্য দিতে পারেন (প্রস্তুতি)', !!pid && r.data.status === 'submitted', err(r));
    r = await B.from('haji_payments').insert({ contract_id: made.contract, amount: 500, method: 'bkash', txn_ref: ref.toLowerCase() + ' ' });
    check('T21', 'একই লেনদেন নম্বর দুবার জমা দেওয়া যায় না', !!r.error, err(r));
    r = await H.from('haji_payments').insert({ contract_id: made.contract, amount: 500, method: 'nagad', txn_ref: `X${ref}` });
    check('T21', 'হাজী ক, খ-এর চুক্তিতে টাকা জমা লিখতে পারেন না', !!r.error, err(r));
    r = await B.from('haji_payments').insert({ contract_id: made.contract, amount: 500, method: 'nagad', txn_ref: `Y${ref}`, status: 'confirmed' });
    check('T08', 'জমার সময় নিজে "নিশ্চিত" লেখা যায় না', !!r.error, err(r));
    r = await B.from('haji_payments').insert({ contract_id: made.contract, amount: 500, method: 'nagad', txn_ref: `Z${ref}`, haji_id: hid });
    check('T21', 'অন্যের নামে টাকা জমা লেখা যায় না', !!r.error, err(r));
    if (pid) {
      await B.from('haji_payments').update({ status: 'confirmed' }).eq('id', pid);
      for (const [who, c] of [['হাজী', B], ['লিডার', L]]) {
        r = await c.rpc('admin_review_payment', { p_id: pid, p_confirm: true, p_note: 'হ্যাক' });
        check('T07', `${who} টাকা "নিশ্চিত" করার অ্যাডমিন-কাজ চালাতে পারেন না`, !!r.error, err(r) || r.data);
      }
      r = await B.from('haji_payments').select('status').eq('id', pid).single();
      check('T08', 'টাকার অবস্থা এখনো "জমা দেওয়া" (কেউ নিজে নিশ্চিত করতে পারেনি)', r.data?.status === 'submitted', r.data?.status);
    }
  }

  // ---------- T12: logout and refresh token reuse (extra sessions of haji B only) ----------
  const s1 = await signIn(B_PHONE, B_PW);
  const old = s1.r.data.session.refresh_token;
  r = await s1.c.auth.refreshSession({ refresh_token: old });
  check('T12', 'রিফ্রেশ টোকেন একবার চলে (প্রস্তুতি)', !r.error, err(r));
  const r1 = r.data?.session?.refresh_token;
  await sleep(12000);   // past the server's short grace window for retries
  // Supabase by design lets the token JUST before the current one return the SAME current token (for a phone that
  // lost the answer of its last refresh). It must never make a new one, and anything older must be refused.
  r = await mk().auth.refreshSession({ refresh_token: old });
  info('T12', 'ঠিক আগের রিফ্রেশ টোকেন আবার দিলে', r.error ? `refused: ${err(r)}` : (r.data?.session?.refresh_token === r1 ? 'returns the same current token (Supabase design), no new one' : 'gave a NEW token'));
  check('T12', 'ঠিক আগের টোকেন দিয়ে নতুন টোকেন বানানো যায় না', !!r.error || r.data?.session?.refresh_token === r1, 'new token issued');
  r = await s1.c.auth.refreshSession({ refresh_token: r1 });
  const rt3 = r.data?.session?.refresh_token;
  check('T12', 'আসল ফোন আবার নবায়ন করতে পারে (প্রস্তুতি)', !!rt3, err(r));
  await sleep(12000);
  r = await mk().auth.refreshSession({ refresh_token: old });
  check('T12', 'আরও পুরনো (চুরি করা) রিফ্রেশ টোকেন চলে না', !!r.error, err(r) || 'reused!');
  r = await mk().auth.refreshSession({ refresh_token: rt3 });
  info('T12', 'চুরি ধরা পড়ার পর সেই সেশনের নতুন টোকেন', r.error ? `revoked too: ${err(r)}` : 'still works');
  const s2 = await signIn(B_PHONE, B_PW);
  const at2 = s2.r.data.session.access_token, rt2 = s2.r.data.session.refresh_token;
  await s2.c.auth.signOut({ scope: 'local' });
  r = await mk().auth.refreshSession({ refresh_token: rt2 });
  check('T12', 'লগআউটের পর সেই সেশনের রিফ্রেশ টোকেন চলে না', !!r.error, err(r) || 'still works!');
  r = await mk({ Authorization: `Bearer ${at2}` }).from('profiles').select('id');
  info('T12', 'লগআউটের পর পুরনো access token', empty(r) ? 'refused right away' : 'still works until it expires (Supabase default: up to 1 hour)');

  // ---------- T07 (2FA): the CI test admin (made admin by the owner on the TEST server only) ----------
  let d = await signIn(D_PHONE, D_PW);
  if (d.r.error) {
    const c = mk(); const rnd = [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');
    const s = await c.auth.signUp({ email: `u${rnd}@users.traveladda.app`, password: D_PW, options: { data: { full_name: 'CI পরীক্ষা অ্যাডমিন (আসল নয়)', phone: D_PHONE, account_type: 'haji' } } });
    console.log('made CI admin account:', s.error ? s.error.message : 'ok');
    d = await signIn(D_PHONE, D_PW);
  }
  D = d.c;
  const st = d.r.error ? null : (await D.rpc('my_mfa_state')).data;
  if (!st?.staff) info('T07', 'অ্যাডমিন 2FA পরীক্ষা', 'waiting: the owner has not yet made the CI admin (test-server-make-ci-admin.sql)');
  else {
    check('T07', 'শুধু পাসওয়ার্ডে লগইন করা অ্যাডমিনের সেশন 2FA ছাড়া (aal1)', st.aal === 'aal1', st.aal);
    r = await D.rpc('is_admin');
    check('T07', '2FA ছাড়া অ্যাডমিনও "অ্যাডমিন" নন', r.data === false, err(r) || r.data);
    r = await D.rpc('my_perms');
    check('T07', '2FA ছাড়া অ্যাডমিন মেনু ফাঁকা', !r.error && Array.isArray(r.data) && r.data.length === 0, err(r) || JSON.stringify(r.data));
    r = await D.rpc('admin_list_payments', { p_status: null });   // the function answers an empty list without 2FA
    check('T07', '2FA ছাড়া অ্যাডমিন টাকার তালিকা দেখতে পান না (একটাও সারি নয়)', empty(r), err(r) || `${r.data?.length} rows`);
    // a forged token that claims aal2 is refused
    const tk = d.r.data.session.access_token.split('.');
    const pp = JSON.parse(Buffer.from(tk[1], 'base64url').toString());
    const fake = [tk[0], Buffer.from(JSON.stringify({ ...pp, aal: 'aal2' })).toString('base64url'), tk[2]].join('.');
    r = await mk({ Authorization: `Bearer ${fake}` }).rpc('is_admin');
    check('T07', 'নকল টোকেনে "2FA হয়েছে" লিখে দিলে চলে না', !!r.error || r.data !== true, err(r) || r.data);
    // old factors from a run that stopped half-way: unverified ones can be removed with the password session
    for (const f of (await D.auth.mfa.listFactors()).data?.all || []) if (f.status !== 'verified') await D.auth.mfa.unenroll({ factorId: f.id });
    const en = await D.auth.mfa.enroll({ factorType: 'totp', friendlyName: `ci-${stamp}` });
    if (en.error) info('T07', '2FA চালু করা', `could not enroll: ${err(en)}`);
    else {
      made.factor = en.data.id; const secret = en.data.totp.secret;
      let ch = await D.auth.mfa.challenge({ factorId: made.factor });
      r = await D.auth.mfa.verify({ factorId: made.factor, challengeId: ch.data?.id, code: totp(secret) === '000000' ? '111111' : '000000' });
      check('T07', 'ভুল ৬ অঙ্কের কোড চলে না', !!r.error, err(r));
      ch = await D.auth.mfa.challenge({ factorId: made.factor });
      r = await D.auth.mfa.verify({ factorId: made.factor, challengeId: ch.data?.id, code: totp(secret) });
      check('T07', 'সঠিক কোডে 2FA হয় (প্রস্তুতি)', !r.error, err(r));
      const a2 = (await D.rpc('my_mfa_state')).data;
      check('T07', '2FA-র পর সেশন aal2', a2?.aal === 'aal2', a2?.aal);
      r = await D.rpc('is_admin');
      check('T07', '2FA-র পর অ্যাডমিন কাজ করতে পারেন', r.data === true, err(r) || r.data);
      r = await D.rpc('admin_list_payments', { p_status: null });
      check('T07', '2FA-র পর অ্যাডমিন টাকার তালিকা দেখেন (এই পরীক্ষার জমাসহ)', !r.error && r.data?.length > 0, err(r) || `${r.data?.length} rows`);
      const sp = await signIn(D_PHONE, D_PW);   // a thief with only the password, while the factor is on
      r = await sp.c.rpc('is_admin');
      check('T07', '2FA চালু থাকলেও শুধু পাসওয়ার্ডে নতুন লগইন অ্যাডমিন নয়', r.data === false, err(r) || r.data);
      r = await sp.c.auth.mfa.unenroll({ factorId: made.factor });
      check('T07', 'শুধু পাসওয়ার্ডওয়ালা কেউ 2FA মুছে ফেলতে পারে না', !!r.error, err(r));
      await sp.c.auth.signOut({ scope: 'local' });
    }
  }
} catch (e) {
  check('RUN', 'পরীক্ষা মাঝপথে থেমে গেছে', false, e.message);
} finally {
  // ---------- cleanup: remove/cancel everything this run made (all on the test server) ----------
  const c = [];
  if (made.factor && D) c.push(['admin 2FA factor', err(await D.auth.mfa.unenroll({ factorId: made.factor })) || 'ok']);
  if (made.contract) c.push(['contract', (await B.rpc('cancel_contract', { p_id: made.contract, p_reason: 'নিরাপত্তা-পরীক্ষা শেষ, চুক্তি বন্ধ' })).data]);
  if (made.docId) c.push(['doc row', err(await B.from('user_documents').delete().eq('id', made.docId)) || 'ok']);
  if (made.docPath) c.push(['doc file', err(await B.storage.from('documents').remove([made.docPath])) || 'ok']);
  if (made.rcptPath) c.push(['receipt file', err(await B.storage.from('receipts').remove([made.rcptPath])) || 'ok']);
  console.log('cleanup:', JSON.stringify(c));
  fs.mkdirSync('shots-sec', { recursive: true });
  fs.writeFileSync('shots-sec/sec.json', JSON.stringify({ stamp, requests, cleanup: c, checks: out }, null, 1));
  console.log(`\n${out.filter((x) => x.ok === true).length}/${out.filter((x) => x.ok !== null).length} passed, ${requests} requests`);
}
process.exit(bad ? 1 : 0);
