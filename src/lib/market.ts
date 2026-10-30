// Leader directory, referral code, contracts between one haji and one leader, ratings, complaints, report & block
// (supabase/007_marketplace.sql). The database checks every rule; these functions only call it and throw on failure.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { uid, randomId, shrink } from './docs';
import { notReady } from './groups';
import { rpc, check } from './rpc';

type Row = Record<string, any>;   // server rows (the database has no generated types yet)
const list = async (fn: string, args?: Record<string, unknown>): Promise<Row[]> => (await rpc<Row[]>(fn, args)) || [];
const first = async (fn: string, args?: Record<string, unknown>): Promise<Row | null> => { const r = await rpc<Row[]>(fn, args); return r && r[0] ? r[0] : null; };

// Bangladesh's 64 districts, for the leader's address and the directory filter.
export const DISTRICTS: readonly string[] = [
  'ঢাকা', 'গাজীপুর', 'নারায়ণগঞ্জ', 'নরসিংদী', 'মুন্সিগঞ্জ', 'মানিকগঞ্জ', 'টাঙ্গাইল', 'কিশোরগঞ্জ', 'ফরিদপুর', 'গোপালগঞ্জ', 'মাদারীপুর', 'শরীয়তপুর', 'রাজবাড়ী',
  'চট্টগ্রাম', 'কক্সবাজার', 'কুমিল্লা', 'ব্রাহ্মণবাড়িয়া', 'চাঁদপুর', 'নোয়াখালী', 'ফেনী', 'লক্ষ্মীপুর', 'রাঙ্গামাটি', 'খাগড়াছড়ি', 'বান্দরবান',
  'সিলেট', 'মৌলভীবাজার', 'হবিগঞ্জ', 'সুনামগঞ্জ',
  'রাজশাহী', 'নাটোর', 'নওগাঁ', 'চাঁপাইনবাবগঞ্জ', 'পাবনা', 'সিরাজগঞ্জ', 'বগুড়া', 'জয়পুরহাট',
  'খুলনা', 'যশোর', 'সাতক্ষীরা', 'বাগেরহাট', 'নড়াইল', 'মাগুরা', 'ঝিনাইদহ', 'কুষ্টিয়া', 'চুয়াডাঙ্গা', 'মেহেরপুর',
  'বরিশাল', 'পটুয়াখালী', 'ভোলা', 'পিরোজপুর', 'বরগুনা', 'ঝালকাঠি',
  'রংপুর', 'দিনাজপুর', 'কুড়িগ্রাম', 'গাইবান্ধা', 'নীলফামারী', 'লালমনিরহাট', 'ঠাকুরগাঁও', 'পঞ্চগড়',
  'ময়মনসিংহ', 'জামালপুর', 'শেরপুর', 'নেত্রকোনা',
];
export const REPORT_REASONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'fraud', label: 'প্রতারণা বা টাকা নিয়ে সমস্যা' },
  { id: 'abuse', label: 'খারাপ ব্যবহার বা হুমকি' },
  { id: 'fake', label: 'ভুয়া তথ্য বা ভুয়া পরিচয়' },
  { id: 'spam', label: 'বিরক্তিকর বার্তা' },
  { id: 'other', label: 'অন্য কারণ' },
];
export const CONTRACT_STATUS: Record<string, { icon: string; label: string }> = {
  sent: { icon: '📩', label: 'হাজীর উত্তরের অপেক্ষায়' },
  accepted: { icon: '✅', label: 'চুক্তি চালু আছে' },
  declined: { icon: '✖️', label: 'হাজী রাজি হননি' },
  withdrawn: { icon: '↩️', label: 'লিডার ফিরিয়ে নিয়েছেন' },
  cancelled: { icon: '⛔', label: 'চুক্তি বাতিল' },
  completed: { icon: '🏁', label: 'সফর শেষ, চুক্তি সম্পন্ন' },
};

// ---------- Directory ----------
export const listLeaders = (district?: string | null, search?: string | null) => list('list_leaders', { p_district: district || null, p_search: search || null });
export const leaderPublic = (id: string) => first('leader_public', { p_leader: id });
export const leaderReviews = (id: string) => list('leader_reviews', { p_leader: id });
export async function myLeaderCallRequest(leaderId: string): Promise<Row | null> {
  const rows: Row[] = check(await supabase.from('offer_interests').select('id,status,created_at').eq('leader_id', leaderId).is('offer_id', null).order('created_at', { ascending: false }).limit(1)) || [];
  return rows[0] || null;
}
export const requestLeaderCall = async (leaderId: string) => check(await supabase.from('offer_interests').insert({ leader_id: leaderId }));

// ---------- Referral ----------
const REF_KEY = 'ta.pendingReferral';
export const rememberReferral = (code: string) => AsyncStorage.setItem(REF_KEY, code).catch(() => {});
export const setReferral = (code: unknown) => rpc<string>('set_referral', { p_code: String(code || '').toUpperCase().replace(/\s/g, '') });
export const myReferral = () => first('my_referral');
export const requestReferralCancel = (reason: string) => rpc('request_referral_cancel', { p_reason: reason });
export const leaderReferralList = () => list('leader_referral_list');
export const leaderDecideReferral = (hajiId: string, ok: boolean) => rpc('leader_decide_referral', { p_haji: hajiId, p_confirm: ok });
// Attach a code typed at sign-up. Returns a message for Home, or null when there was nothing to do.
export async function processPendingReferral(): Promise<{ kind: 'ok' | 'warn'; text: string } | null> {
  let code: string | null = null;
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
export type ContractDraft = { hajiCode: string; kind: string; title: string; price: number; includes: string; excludes?: string | null;
  from?: string | null; to?: string | null; refund: string; extra?: string | null; offerId?: string | null };
export const sendContract = (c: ContractDraft) => rpc<string>('leader_send_contract', {
  p_haji_code: c.hajiCode, p_kind: c.kind, p_title: c.title, p_price: c.price, p_includes: c.includes, p_excludes: c.excludes || null,
  p_from: c.from || null, p_to: c.to || null, p_refund: c.refund, p_extra: c.extra || null, p_offer: c.offerId || null,
});
export const withdrawContract = (id: string) => rpc('leader_withdraw_contract', { p_id: id });
export const respondContract = (id: string, accept: boolean) => rpc('haji_respond_contract', { p_id: id, p_accept: accept });
export const cancelContract = (id: string, reason: string) => rpc('cancel_contract', { p_id: id, p_reason: reason });
export const completeContract = (id: string) => rpc('leader_complete_contract', { p_id: id });
// The leader of my ACTIVE contract is kept on this phone, so the Emergency page can call them without internet.
const CONTRACT_LEADER = 'ta.contractLeader.v1';
export async function myContracts(): Promise<Row[]> {
  const rows = await list('my_contracts');
  const a = rows.find((c) => c.status === 'accepted');
  try {
    if (a && a.leader_phone) await AsyncStorage.setItem(CONTRACT_LEADER, JSON.stringify({ id: a.id, name: a.leader_name, phone: a.leader_phone, travel_from: a.travel_from, title: a.title }));
    else await AsyncStorage.removeItem(CONTRACT_LEADER);
  } catch (e) { /* best effort */ }
  return rows;
}
export type CachedLeader = { id: string; name: string; phone: string; travel_from?: string | null; title?: string };
export async function cachedContractLeader(): Promise<CachedLeader | null> {
  try { const v = JSON.parse((await AsyncStorage.getItem(CONTRACT_LEADER)) || 'null') as CachedLeader | null; return v && v.phone ? v : null; } catch (e) { return null; }
}
export const leaderContracts = () => list('leader_contracts');

// ---------- Rating & complaints ----------
export const rateLeader = (contractId: string, stars: number, comment?: string | null) => rpc('rate_leader', { p_contract: contractId, p_stars: stars, p_comment: comment || null });
export const myComplaints = () => list('my_complaints');
const MAX_EVIDENCE = 20 * 1024 * 1024;
type EvidenceKind = 'image' | 'audio' | 'video';
const MIME: Record<EvidenceKind, string> = { image: 'image/jpeg', audio: 'audio/mp4', video: 'video/mp4' };
// files: [{ uri, kind: 'image'|'audio'|'video', mime?, name? }]. Returns { id, uploaded, failed }.
export type Evidence = { uri: string; kind: EvidenceKind; mime?: string; name?: string };
export async function fileComplaint(contractId: string, body: string, files: Evidence[] = []): Promise<{ id: string | null; uploaded: number; failed: number }> {
  const id = await rpc<string>('file_complaint', { p_contract: contractId, p_body: body.trim() });
  const me = await uid();
  let uploaded = 0; let failed = 0;
  for (const f of files) {
    try {
      const src: string = f.kind === 'image' ? await shrink(f.uri) : f.uri;
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
export async function isBlocked(otherId: string): Promise<boolean> {
  const rows: Row[] = check(await supabase.from('user_blocks').select('blocked').eq('blocked', otherId)) || [];
  return rows.length > 0;
}
export const block = async (otherId: string) => check(await supabase.from('user_blocks').insert({ blocked: otherId }));
export async function unblock(otherId: string): Promise<void> { check(await supabase.from('user_blocks').delete().eq('blocked', otherId)); }
export const report = async (targetId: string, reason: string, details?: string | null) => check(await supabase.from('user_reports').insert({ target: targetId, reason, details: (details || '').trim() || null }));

// ---------- Terms (readable before sign-up) ----------
// kind 'haji' | 'leader' (supabase/012_terms.sql). Before step 012 the single old text 'terms' is used for both.
export type TermsText = { key: string; body: string; updated_at: string };
export async function getTerms(kind: 'haji' | 'leader' = 'haji'): Promise<TermsText | null> {
  const key = kind === 'leader' ? 'terms_leader' : 'terms_haji';
  const r = await supabase.from('app_texts').select('key,body,updated_at').in('key', [key, 'terms']);
  if (r.error || !r.data) return null;
  const rows = r.data as TermsText[];
  return rows.find((x) => x.key === key) || rows.find((x) => x.key === 'terms') || null;
}
// Records the agreement on the server. 'ok' | 'none' (no such text) | 'soon' (step 012 not run). Throws only on network errors.
export async function agreeTerms(kind: string): Promise<string> {
  const { data, error } = await supabase.rpc('agree_terms', { p_key: kind === 'leader' ? 'terms_leader' : 'terms_haji' });
  if (error) { if (notReady(error)) return 'soon'; throw error; }
  return data as string;
}
export async function myTermsStatus(): Promise<Record<string, { at: string; current: boolean }> | null> {
  const { data, error } = await supabase.rpc('my_terms');
  if (error) { if (notReady(error)) return null; throw error; }
  const out: Record<string, { at: string; current: boolean }> = {};
  ((data || []) as Row[]).forEach((r) => { out[r.key === 'terms_leader' ? 'leader' : 'haji'] = { at: r.agreed_at, current: !!r.current_version }; });
  return out;
}
// The sign-up agreement is sent once the new account can talk to the server (right after the first login).
const TERMS_KEY = 'ta.pendingTerms.v1';
export const rememberTermsAgreement = (kind: string) => AsyncStorage.setItem(TERMS_KEY, kind).catch(() => {});
export async function processPendingTerms(): Promise<void> {
  let kind: string | null = null;
  try { kind = await AsyncStorage.getItem(TERMS_KEY); } catch (e) { return; }
  if (!kind) return;
  try { await agreeTerms(kind); await AsyncStorage.removeItem(TERMS_KEY); } catch (e) { /* no internet: next time */ }
}
