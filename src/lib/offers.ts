// Offers & packages (supabase/005_offers.sql). The database enforces every rule; functions throw on failure.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { normalizeDigits } from './phone';
import { rows } from './rpc';
import type { OwnPackage, ReviewPackage } from './types';
import { notReady } from './groups';

type Row = Record<string, any>;   // server rows (the database has no generated types yet)
const check = <T>(r: { data: T; error: unknown }): T => { if (r.error) throw r.error; return r.data; };
const coded = (msg: string, code: string): Error & { code: string } => Object.assign(new Error(msg), { code });

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
export const includesFor = (kind: string) => INCLUDES.filter((x) => kind === 'hajj' || x.id !== 'qurbani');
export const cleanIncludes = (kind: string, ids: string[]): string[] => ids.filter((id) => kind === 'hajj' || id !== 'qurbani');
export const KIND: Record<string, { icon: string; label: string }> = { hajj: { icon: '🕋', label: 'হজ' }, umrah: { icon: '🔄', label: 'ওমরাহ' } };
// Short reference the haji can say on the phone, e.g. "প্যাকেজ নম্বর 3FA9C2".
export const refOf = (id: unknown): string => String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
export const daysOf = (o: Row): number => Math.round((Date.parse(o.return_on) - Date.parse(o.depart_on)) / 86400000) + 1;

// ---------- Helpline (kept on the phone so the number works without internet) ----------
const HELP_CACHE = 'ta.helpline.v1';
export type Helpline = { phone: string; hours: string; otpLive: boolean };
export async function getHelpline(): Promise<Helpline> {
  try {
    const rows: Row[] = check(await supabase.from('app_settings').select('key,value')) || [];
    const h: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const v = { phone: h.helpline_phone || '', hours: h.helpline_hours || '', otpLive: h.otp_live === 'yes' };
    AsyncStorage.setItem(HELP_CACHE, JSON.stringify(v)).catch(() => {});
    return v;
  } catch (e) {
    try { const v = JSON.parse((await AsyncStorage.getItem(HELP_CACHE)) || 'null'); if (v) return v; } catch (x) { /* none */ }
    throw e;
  }
}
export const setSetting = async (key: string, value: string | null) => check(await supabase.rpc('admin_set_setting', { p_key: key, p_value: value }));
export const cleanHelpline = (v: unknown): string => normalizeDigits(v).replace(/[^\d+]/g, '');

// ---------- Haji ----------
export const listOffers = (kind: string | null) => rows('list_offers', { p_kind: kind });   // typed by src/lib/dbTypes.ts
export async function myInterests(): Promise<Record<string, Row>> {
  const rows: Row[] = check(await supabase.from('offer_interests').select('id,offer_id,status,created_at').order('created_at', { ascending: false })) || [];
  const m: Record<string, Row> = {};
  rows.forEach((r) => { if (!m[r.offer_id] || r.status === 'new') m[r.offer_id] = r; });
  return m;   // offer_id -> latest request (open one first)
}
export const requestCallback = async (offerId: string) => check(await supabase.from('offer_interests').insert({ offer_id: offerId }));
export async function cancelCallback(id: string): Promise<void> {
  const r: Row[] | null = check(await supabase.from('offer_interests').delete().eq('id', id).select('id'));
  if (!r || !r.length) throw coded('not deleted', 'not-deleted');
}

// ---------- Leader ----------
export async function myOffers(): Promise<OwnPackage[]> {
  const me = (await supabase.auth.getSession()).data?.session?.user?.id;
  return check(await supabase.from('offers').select('*').eq('leader_id', me).order('created_at', { ascending: false })) || [];
}
const ROUTE_COLS = ['from_airport', 'arrive_at', 'first_city', 'makkah_nights', 'madinah_nights', 'return_from', 'return_to', 'airline'];
const noRouteYet = (e: { message?: string } | null): boolean => !!e && ROUTE_COLS.some((c) => String(e.message || '').includes(`'${c}'`) || String(e.message || '').includes(`.${c}`) || String(e.message || '').includes(`"${c}"`));
const withoutRoute = (o: Row): Row => Object.fromEntries(Object.entries(o).filter(([k]) => !ROUTE_COLS.includes(k)));
export async function createOffer(o: Row): Promise<Row | null> {
  let r = await supabase.from('offers').insert(o).select('id').single();
  // database step 020 (journey) not run yet: save without the journey rather than failing
  if (r.error && noRouteYet(r.error)) { o = withoutRoute(o); r = await supabase.from('offers').insert(o).select('id').single(); }
  // database step 008 (end date) not run yet: publish without the end date rather than failing
  if (r.error && o.valid_until && /valid_until/.test(r.error.message || '')) { const { valid_until: _x, ...rest } = o; return check(await supabase.from('offers').insert(rest).select('id').single()); }
  return check(r);
}
// Admin check of packages (supabase/019_offer_review.sql). Before 019 every package counts as approved.
export const reviewOf = (o: Row | null | undefined): string => (o && o.review) || 'approved';
export const canEditOffer = (o: Row | null | undefined): boolean => !!o && !o.hidden_by_admin && (reviewOf(o) === 'pending' || reviewOf(o) === 'rejected');
export function reviewLabel(o: Row): string | null {
  const r = reviewOf(o);
  if (r === 'pending') return '⏳ অনুমোদনের অপেক্ষায়: অ্যাডমিন দেখার পর হাজীরা দেখবেন';
  if (r === 'rejected') return `↩️ অ্যাডমিন ফেরত দিয়েছেন। কারণ: ${o.review_note || 'উল্লেখ নেই'}। ঠিক করে আবার জমা দিন।`;
  return null;
}
const EDITABLE = [...ROUTE_COLS, 'kind', 'title', 'price_bdt', 'depart_on', 'return_on', 'makkah_hotel', 'makkah_distance_m', 'madinah_hotel',
  'madinah_distance_m', 'room_share', 'includes', 'notes', 'valid_until'];
export async function updateOffer(id: string, o: Row): Promise<void> {
  const fields = Object.fromEntries(Object.entries(o).filter(([k]) => EDITABLE.includes(k)));
  let x = await supabase.from('offers').update(fields).eq('id', id).select('id');
  if (x.error && noRouteYet(x.error)) x = await supabase.from('offers').update(withoutRoute(fields)).eq('id', id).select('id');
  const r: Row[] | null = check(x);
  if (!r || !r.length) throw coded('not changed', 'not-changed');
}
export function offerErrorText(e: { message?: string; code?: string } | null | undefined): string | null {
  const m = String((e && e.message) || '');
  if (/approved package cannot be changed/.test(m)) return 'অনুমোদনের পর প্যাকেজ বদলানো যায় না। দরকার হলে এটি লুকিয়ে নতুন প্যাকেজ দিন।';
  if (/umrah_no_qurbani/.test(m)) return 'ওমরাহ প্যাকেজে কুরবানি থাকে না। কুরবানি বাদ দিন।';
  if (/journey required/.test(m)) return 'যাত্রাপথ (বিমানবন্দর, মক্কা ও মদিনায় কত রাত) পূরণ করুন।';
  if (/offers_route_nights/.test(m)) return 'মক্কা ও মদিনার রাত মিলিয়ে সফরের দিনের চেয়ে বেশি হয়ে গেছে।';
  if (/departure date has passed/.test(m)) return 'যাওয়ার তারিখ পার হয়ে গেছে। নতুন তারিখ দিন।';
  if (e && e.code === 'not-changed') return 'বদলানো যায়নি। প্যাকেজটি হয়তো এর মধ্যে অনুমোদন হয়ে গেছে। পাতাটি আবার খুলে দেখুন।';
  return null;
}
export async function setOfferActive(id: string, active: boolean): Promise<void> {
  const r: Row[] | null = check(await supabase.from('offers').update({ active }).eq('id', id).select('id'));
  if (!r || !r.length) throw coded('not changed', 'not-changed');
}
export async function myInterestCounts(): Promise<Record<string, Row>> {
  const rows: Row[] = check(await supabase.rpc('my_offer_interest_counts')) || [];
  return Object.fromEntries(rows.map((r) => [r.offer_id, r]));
}

// ---------- Admin ----------
export const adminInterests = async (): Promise<Row[]> => check(await supabase.rpc('admin_list_interests')) || [];
export const markInterest = async (id: string, note?: string | null) => check(await supabase.rpc('admin_mark_interest', { p_id: id, p_note: note || null }));
export const hideOffer = async (id: string, hide: boolean) => check(await supabase.rpc('admin_hide_offer', { p_offer: id, p_hide: hide }));
export async function adminOffersReview(): Promise<(ReviewPackage | OwnPackage)[]> {
  const r = await supabase.rpc('admin_offers_review');
  if (r.error && notReady(r.error)) return adminOffers();      // step 019 not run yet
  return check(r) || [];
}
export async function reviewOffer(id: string, decision: string, note?: string | null) {
  const n = String(note || '').trim();
  if (decision === 'reject' && n.length < 2) throw coded('reason needed', 'reason');
  return check(await supabase.rpc('admin_review_offer', { p_offer: id, p_decision: decision, p_note: n || null }));
}
export async function adminOffers(): Promise<OwnPackage[]> {   // only some columns are read
  return check(await supabase.from('offers').select('id,kind,title,price_bdt,depart_on,return_on,active,hidden_by_admin,created_at').order('created_at', { ascending: false }).limit(200)) || [];
}
// true once step 019 (admin check of packages) has been run on the server
export async function offerReviewReady(): Promise<boolean> {
  const r = await supabase.from('offers').select('review').limit(1);
  return !r.error;
}
