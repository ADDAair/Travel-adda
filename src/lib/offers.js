// Offers & packages (supabase/005_offers.sql). The database enforces every rule; functions throw on failure.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { normalizeDigits } from './phone';
import { notReady } from './groups';

const check = (r) => { if (r.error) throw r.error; return r.data; };

export const INCLUDES = [
  { id: 'flight', icon: '✈️', label: 'বিমান টিকেট' },
  { id: 'visa', icon: '📄', label: 'ভিসা' },
  { id: 'food', icon: '🍛', label: 'খাবার' },
  { id: 'transport', icon: '🚌', label: 'সৌদির ভেতরে যাতায়াত' },
  { id: 'ziyarah', icon: '🕌', label: 'যিয়ারত ভ্রমণ' },
  { id: 'qurbani', icon: '🐑', label: 'কুরবানি' },
  { id: 'guide', icon: '🧭', label: 'আলেম / গাইড' },
  { id: 'insurance', icon: '🩺', label: 'স্বাস্থ্য বিমা' },
];
// Umrah has no qurbani, so it is never offered as a choice there (the database refuses it too).
export const includesFor = (kind) => INCLUDES.filter((x) => kind === 'hajj' || x.id !== 'qurbani');
export const cleanIncludes = (kind, ids) => ids.filter((id) => kind === 'hajj' || id !== 'qurbani');
export const KIND = { hajj: { icon: '🕋', label: 'হজ' }, umrah: { icon: '🔄', label: 'ওমরাহ' } };
// Short reference the haji can say on the phone, e.g. "প্যাকেজ নম্বর 3FA9C2".
export const refOf = (id) => String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
export const daysOf = (o) => Math.round((Date.parse(o.return_on) - Date.parse(o.depart_on)) / 86400000) + 1;

// ---------- Helpline (kept on the phone so the number works without internet) ----------
const HELP_CACHE = 'ta.helpline.v1';
export async function getHelpline() {
  try {
    const rows = check(await supabase.from('app_settings').select('key,value')) || [];
    const h = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const v = { phone: h.helpline_phone || '', hours: h.helpline_hours || '', otpLive: h.otp_live === 'yes' };
    AsyncStorage.setItem(HELP_CACHE, JSON.stringify(v)).catch(() => {});
    return v;
  } catch (e) {
    try { const v = JSON.parse((await AsyncStorage.getItem(HELP_CACHE)) || 'null'); if (v) return v; } catch (x) { /* none */ }
    throw e;
  }
}
export const setSetting = async (key, value) => check(await supabase.rpc('admin_set_setting', { p_key: key, p_value: value }));
export const cleanHelpline = (v) => normalizeDigits(v).replace(/[^\d+]/g, '');

// ---------- Haji ----------
export const listOffers = async (kind) => check(await supabase.rpc('list_offers', { p_kind: kind })) || [];
export async function myInterests() {
  const rows = check(await supabase.from('offer_interests').select('id,offer_id,status,created_at').order('created_at', { ascending: false })) || [];
  const m = {};
  rows.forEach((r) => { if (!m[r.offer_id] || r.status === 'new') m[r.offer_id] = r; });
  return m;   // offer_id -> latest request (open one first)
}
export const requestCallback = async (offerId) => check(await supabase.from('offer_interests').insert({ offer_id: offerId }));
export async function cancelCallback(id) {
  const r = check(await supabase.from('offer_interests').delete().eq('id', id).select('id'));
  if (!r || !r.length) { const e = new Error('not deleted'); e.code = 'not-deleted'; throw e; }
}

// ---------- Leader ----------
export async function myOffers() {
  const me = (await supabase.auth.getSession()).data?.session?.user?.id;
  return check(await supabase.from('offers').select('*').eq('leader_id', me).order('created_at', { ascending: false })) || [];
}
const ROUTE_COLS = ['from_airport', 'arrive_at', 'first_city', 'makkah_nights', 'madinah_nights', 'return_from', 'return_to', 'airline'];
const noRouteYet = (e) => !!e && ROUTE_COLS.some((c) => String(e.message || '').includes(`'${c}'`) || String(e.message || '').includes(`.${c}`) || String(e.message || '').includes(`"${c}"`));
const withoutRoute = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !ROUTE_COLS.includes(k)));
export async function createOffer(o) {
  let r = await supabase.from('offers').insert(o).select('id').single();
  // database step 020 (journey) not run yet: save without the journey rather than failing
  if (r.error && noRouteYet(r.error)) { o = withoutRoute(o); r = await supabase.from('offers').insert(o).select('id').single(); }
  // database step 008 (end date) not run yet: publish without the end date rather than failing
  if (r.error && o.valid_until && /valid_until/.test(r.error.message || '')) { const { valid_until: _x, ...rest } = o; return check(await supabase.from('offers').insert(rest).select('id').single()); }
  return check(r);
}
// Admin check of packages (supabase/019_offer_review.sql). Before 019 every package counts as approved.
export const reviewOf = (o) => (o && o.review) || 'approved';
export const canEditOffer = (o) => !!o && !o.hidden_by_admin && (reviewOf(o) === 'pending' || reviewOf(o) === 'rejected');
export function reviewLabel(o) {
  const r = reviewOf(o);
  if (r === 'pending') return '⏳ অনুমোদনের অপেক্ষায়: অ্যাডমিন দেখার পর হাজীরা দেখবেন';
  if (r === 'rejected') return `↩️ অ্যাডমিন ফেরত দিয়েছেন। কারণ: ${o.review_note || 'উল্লেখ নেই'}। ঠিক করে আবার জমা দিন।`;
  return null;
}
const EDITABLE = [...ROUTE_COLS, 'kind', 'title', 'price_bdt', 'depart_on', 'return_on', 'makkah_hotel', 'makkah_distance_m', 'madinah_hotel',
  'madinah_distance_m', 'room_share', 'includes', 'notes', 'valid_until'];
export async function updateOffer(id, o) {
  const fields = Object.fromEntries(Object.entries(o).filter(([k]) => EDITABLE.includes(k)));
  let x = await supabase.from('offers').update(fields).eq('id', id).select('id');
  if (x.error && noRouteYet(x.error)) x = await supabase.from('offers').update(withoutRoute(fields)).eq('id', id).select('id');
  const r = check(x);
  if (!r || !r.length) { const e = new Error('not changed'); e.code = 'not-changed'; throw e; }
}
export function offerErrorText(e) {
  const m = String((e && e.message) || '');
  if (/approved package cannot be changed/.test(m)) return 'অনুমোদনের পর প্যাকেজ বদলানো যায় না। দরকার হলে এটি লুকিয়ে নতুন প্যাকেজ দিন।';
  if (/umrah_no_qurbani/.test(m)) return 'ওমরাহ প্যাকেজে কুরবানি থাকে না। কুরবানি বাদ দিন।';
  if (/journey required/.test(m)) return 'যাত্রাপথ (বিমানবন্দর, মক্কা ও মদিনায় কত রাত) পূরণ করুন।';
  if (/offers_route_nights/.test(m)) return 'মক্কা ও মদিনার রাত মিলিয়ে সফরের দিনের চেয়ে বেশি হয়ে গেছে।';
  if (/departure date has passed/.test(m)) return 'যাওয়ার তারিখ পার হয়ে গেছে। নতুন তারিখ দিন।';
  if (e && e.code === 'not-changed') return 'বদলানো যায়নি। প্যাকেজটি হয়তো এর মধ্যে অনুমোদন হয়ে গেছে। পাতাটি আবার খুলে দেখুন।';
  return null;
}
export async function setOfferActive(id, active) {
  const r = check(await supabase.from('offers').update({ active }).eq('id', id).select('id'));
  if (!r || !r.length) { const e = new Error('not changed'); e.code = 'not-changed'; throw e; }
}
export async function myInterestCounts() {
  const rows = check(await supabase.rpc('my_offer_interest_counts')) || [];
  return Object.fromEntries(rows.map((r) => [r.offer_id, r]));
}

// ---------- Admin ----------
export const adminInterests = async () => check(await supabase.rpc('admin_list_interests')) || [];
export const markInterest = async (id, note) => check(await supabase.rpc('admin_mark_interest', { p_id: id, p_note: note || null }));
export const hideOffer = async (id, hide) => check(await supabase.rpc('admin_hide_offer', { p_offer: id, p_hide: hide }));
export async function adminOffersReview() {
  const r = await supabase.rpc('admin_offers_review');
  if (r.error && notReady(r.error)) return adminOffers();      // step 019 not run yet
  return check(r) || [];
}
export async function reviewOffer(id, decision, note) {
  const n = String(note || '').trim();
  if (decision === 'reject' && n.length < 2) { const e = new Error('reason needed'); e.code = 'reason'; throw e; }
  return check(await supabase.rpc('admin_review_offer', { p_offer: id, p_decision: decision, p_note: n || null }));
}
export async function adminOffers() {
  return check(await supabase.from('offers').select('id,kind,title,price_bdt,depart_on,return_on,active,hidden_by_admin,created_at').order('created_at', { ascending: false }).limit(200)) || [];
}
// true once step 019 (admin check of packages) has been run on the server
export async function offerReviewReady() {
  const r = await supabase.from('offers').select('review').limit(1);
  return !r.error;
}
