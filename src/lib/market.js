// Leader directory, referral code, contracts between one haji and one leader, ratings, complaints, report & block
// (supabase/007_marketplace.sql). The database checks every rule; these functions only call it and throw on failure.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { uid, randomId, shrink } from './docs';
import { notReady } from './groups';

const check = (r) => { if (r.error) throw r.error; return r.data; };
const rpc = async (fn, args) => check(await supabase.rpc(fn, args));

// Bangladesh's 64 districts, for the leader's address and the directory filter.
export const DISTRICTS = [
  'ঢাকা', 'গাজীপুর', 'নারায়ণগঞ্জ', 'নরসিংদী', 'মুন্সিগঞ্জ', 'মানিকগঞ্জ', 'টাঙ্গাইল', 'কিশোরগঞ্জ', 'ফরিদপুর', 'গোপালগঞ্জ', 'মাদারীপুর', 'শরীয়তপুর', 'রাজবাড়ী',
  'চট্টগ্রাম', 'কক্সবাজার', 'কুমিল্লা', 'ব্রাহ্মণবাড়িয়া', 'চাঁদপুর', 'নোয়াখালী', 'ফেনী', 'লক্ষ্মীপুর', 'রাঙ্গামাটি', 'খাগড়াছড়ি', 'বান্দরবান',
  'সিলেট', 'মৌলভীবাজার', 'হবিগঞ্জ', 'সুনামগঞ্জ',
  'রাজশাহী', 'নাটোর', 'নওগাঁ', 'চাঁপাইনবাবগঞ্জ', 'পাবনা', 'সিরাজগঞ্জ', 'বগুড়া', 'জয়পুরহাট',
  'খুলনা', 'যশোর', 'সাতক্ষীরা', 'বাগেরহাট', 'নড়াইল', 'মাগুরা', 'ঝিনাইদহ', 'কুষ্টিয়া', 'চুয়াডাঙ্গা', 'মেহেরপুর',
  'বরিশাল', 'পটুয়াখালী', 'ভোলা', 'পিরোজপুর', 'বরগুনা', 'ঝালকাঠি',
  'রংপুর', 'দিনাজপুর', 'কুড়িগ্রাম', 'গাইবান্ধা', 'নীলফামারী', 'লালমনিরহাট', 'ঠাকুরগাঁও', 'পঞ্চগড়',
  'ময়মনসিংহ', 'জামালপুর', 'শেরপুর', 'নেত্রকোনা',
];
export const REPORT_REASONS = [
  { id: 'fraud', label: 'প্রতারণা বা টাকা নিয়ে সমস্যা' },
  { id: 'abuse', label: 'খারাপ ব্যবহার বা হুমকি' },
  { id: 'fake', label: 'ভুয়া তথ্য বা ভুয়া পরিচয়' },
  { id: 'spam', label: 'বিরক্তিকর বার্তা' },
  { id: 'other', label: 'অন্য কারণ' },
];
export const CONTRACT_STATUS = {
  sent: { icon: '📩', label: 'হাজীর উত্তরের অপেক্ষায়' },
  accepted: { icon: '✅', label: 'চুক্তি চালু আছে' },
  declined: { icon: '✖️', label: 'হাজী রাজি হননি' },
  withdrawn: { icon: '↩️', label: 'লিডার ফিরিয়ে নিয়েছেন' },
  cancelled: { icon: '⛔', label: 'চুক্তি বাতিল' },
  completed: { icon: '🏁', label: 'সফর শেষ, চুক্তি সম্পন্ন' },
};

// ---------- Directory ----------
export const listLeaders = async (district, search) => (await rpc('list_leaders', { p_district: district || null, p_search: search || null })) || [];
export async function leaderPublic(id) { const r = await rpc('leader_public', { p_leader: id }); return r && r[0] ? r[0] : null; }
export const leaderReviews = async (id) => (await rpc('leader_reviews', { p_leader: id })) || [];
export async function myLeaderCallRequest(leaderId) {
  const rows = check(await supabase.from('offer_interests').select('id,status,created_at').eq('leader_id', leaderId).is('offer_id', null).order('created_at', { ascending: false }).limit(1)) || [];
  return rows[0] || null;
}
export const requestLeaderCall = async (leaderId) => check(await supabase.from('offer_interests').insert({ leader_id: leaderId }));

// ---------- Referral ----------
const REF_KEY = 'ta.pendingReferral';
export const rememberReferral = (code) => AsyncStorage.setItem(REF_KEY, code).catch(() => {});
export const setReferral = (code) => rpc('set_referral', { p_code: String(code || '').toUpperCase().replace(/\s/g, '') });
export async function myReferral() { const r = await rpc('my_referral'); return r && r[0] ? r[0] : null; }
export const requestReferralCancel = (reason) => rpc('request_referral_cancel', { p_reason: reason });
export const leaderReferralList = async () => (await rpc('leader_referral_list')) || [];
export const leaderDecideReferral = (hajiId, ok) => rpc('leader_decide_referral', { p_haji: hajiId, p_confirm: ok });
// Attach a code typed at sign-up. Returns a message for Home, or null when there was nothing to do.
export async function processPendingReferral() {
  let code = null;
  try { code = await AsyncStorage.getItem(REF_KEY); } catch (e) { return null; }
  if (!code) return null;
  try {
    const r = await setReferral(code);
    await AsyncStorage.removeItem(REF_KEY).catch(() => {});
    if (r === 'ok') return { kind: 'ok', text: 'রেফারেল কোড যুক্ত হয়েছে। লিডার নিশ্চিত করলে "লিডার ও চুক্তি" পাতায় দেখবেন।' };
    if (r === 'already') return null;
    return { kind: 'warn', text: `"${code}" কোডে কোনো লিডার পাওয়া যায়নি। "লিডার ও চুক্তি" পাতা থেকে সঠিক কোড দিন।` };
  } catch (e) {
    if (notReady(e)) return null;          // database step not run yet: keep the code and try again later
    return null;                           // no internet: try again next time
  }
}

// ---------- Contracts ----------
export const sendContract = (c) => rpc('leader_send_contract', {
  p_haji_code: c.hajiCode, p_kind: c.kind, p_title: c.title, p_price: c.price, p_includes: c.includes, p_excludes: c.excludes || null,
  p_from: c.from || null, p_to: c.to || null, p_refund: c.refund, p_extra: c.extra || null, p_offer: c.offerId || null,
});
export const withdrawContract = (id) => rpc('leader_withdraw_contract', { p_id: id });
export const respondContract = (id, accept) => rpc('haji_respond_contract', { p_id: id, p_accept: accept });
export const cancelContract = (id, reason) => rpc('cancel_contract', { p_id: id, p_reason: reason });
export const completeContract = (id) => rpc('leader_complete_contract', { p_id: id });
// The leader of my ACTIVE contract is kept on this phone, so the Emergency page can call them without internet.
const CONTRACT_LEADER = 'ta.contractLeader.v1';
export async function myContracts() {
  const rows = (await rpc('my_contracts')) || [];
  const a = rows.find((c) => c.status === 'accepted');
  try {
    if (a && a.leader_phone) await AsyncStorage.setItem(CONTRACT_LEADER, JSON.stringify({ id: a.id, name: a.leader_name, phone: a.leader_phone, travel_from: a.travel_from, title: a.title }));
    else await AsyncStorage.removeItem(CONTRACT_LEADER);
  } catch (e) { /* best effort */ }
  return rows;
}
export async function cachedContractLeader() {
  try { const v = JSON.parse((await AsyncStorage.getItem(CONTRACT_LEADER)) || 'null'); return v && v.phone ? v : null; } catch (e) { return null; }
}
export const leaderContracts = async () => (await rpc('leader_contracts')) || [];

// ---------- Rating & complaints ----------
export const rateLeader = (contractId, stars, comment) => rpc('rate_leader', { p_contract: contractId, p_stars: stars, p_comment: comment || null });
export const myComplaints = async () => (await rpc('my_complaints')) || [];
const MAX_EVIDENCE = 20 * 1024 * 1024;
const MIME = { image: 'image/jpeg', audio: 'audio/mp4', video: 'video/mp4' };
// files: [{ uri, kind: 'image'|'audio'|'video', mime?, name? }]. Returns { id, uploaded, failed }.
export async function fileComplaint(contractId, body, files = []) {
  const id = await rpc('file_complaint', { p_contract: contractId, p_body: body.trim() });
  const me = await uid();
  let uploaded = 0; let failed = 0;
  for (const f of files) {
    try {
      const src = f.kind === 'image' ? await shrink(f.uri) : f.uri;
      const buf = await (await fetch(src)).arrayBuffer();
      if (buf.byteLength > MAX_EVIDENCE) { failed++; continue; }
      const ext = f.kind === 'image' ? 'jpg' : (String(f.name || '').split('.').pop() || (f.kind === 'audio' ? 'm4a' : 'mp4')).toLowerCase().slice(0, 5);
      const path = `${me}/${randomId()}.${ext}`;
      const mime = f.kind === 'image' ? 'image/jpeg' : (f.mime || MIME[f.kind]);
      const up = await supabase.storage.from('complaint-evidence').upload(path, buf, { contentType: mime });
      if (up.error) { failed++; continue; }
      const r = await supabase.rpc('add_complaint_file', { p_complaint: id, p_path: path, p_kind: f.kind });
      if (r.error || r.data !== 'ok') { await supabase.storage.from('complaint-evidence').remove([path]).catch(() => {}); failed++; continue; }
      uploaded++;
    } catch (e) { failed++; }
  }
  return { id, uploaded, failed };
}

// ---------- Report & block ----------
export async function isBlocked(otherId) {
  const rows = check(await supabase.from('user_blocks').select('blocked').eq('blocked', otherId)) || [];
  return rows.length > 0;
}
export const block = async (otherId) => check(await supabase.from('user_blocks').insert({ blocked: otherId }));
export async function unblock(otherId) { check(await supabase.from('user_blocks').delete().eq('blocked', otherId)); }
export const report = async (targetId, reason, details) => check(await supabase.from('user_reports').insert({ target: targetId, reason, details: (details || '').trim() || null }));

// ---------- Terms (readable before sign-up) ----------
export async function getTerms() {
  const r = await supabase.from('app_texts').select('body,updated_at').eq('key', 'terms').maybeSingle();
  if (r.error) return null;
  return r.data || null;
}
