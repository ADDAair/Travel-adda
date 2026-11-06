// Offers & packages (supabase/005_offers.sql). The database enforces every rule; functions throw on failure.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tr } from './lang';
import { supabase } from './supabase';
import { normalizeDigits } from './phone';
import { rows as rowsOf, type RpcRow } from './rpc';
import type { AnyPackage, OwnPackage, TableInsert, TableRow, TableUpdate } from './types';
import { notReady } from './groups';

type Interest = Pick<TableRow<'offer_interests'>, 'id' | 'offer_id' | 'status' | 'created_at'>;   // a haji's call-back request
type Review = { review?: string | null; review_note?: string | null; hidden_by_admin?: boolean | null };
const check = <T>(r: { data: T; error: unknown }): T => { if (r.error) throw r.error; return r.data; };
const coded = (msg: string, code: string): Error & { code: string } => Object.assign(new Error(msg), { code });

// labels are getters, so they follow the chosen language wherever .label is read
export const INCLUDES = [
  { id: 'flight', icon: '✈️', get label() { return tr('বিমান টিকেট', 'Air ticket'); } },
  { id: 'visa', icon: '📄', get label() { return tr('ভিসা', 'Visa'); } },
  { id: 'food', icon: '🍛', get label() { return tr('খাবার', 'Food'); } },
  { id: 'transport', icon: '🚌', get label() { return tr('সৌদির ভেতরে যাতায়াত', 'Transport inside Saudi Arabia'); } },
  { id: 'ziyarah', icon: '🕌', get label() { return tr('যিয়ারত ভ্রমণ', 'Ziyarah tours'); } },
  { id: 'qurbani', icon: '🐑', get label() { return tr('কুরবানি', 'Qurbani'); } },
  { id: 'guide', icon: '🧭', get label() { return tr('আলেম / গাইড', 'Alim / guide'); } },
  { id: 'insurance', icon: '🩺', get label() { return tr('স্বাস্থ্য বিমা', 'Health insurance'); } },
];
// Umrah has no qurbani, so it is never offered as a choice there (the database refuses it too).
export const includesFor = (kind: string) => INCLUDES.filter((x) => kind === 'hajj' || x.id !== 'qurbani');
export const cleanIncludes = (kind: string, ids: string[]): string[] => ids.filter((id) => kind === 'hajj' || id !== 'qurbani');
export const KIND: Record<string, { icon: string; label: string }> = {
  hajj: { icon: '🕋', get label() { return tr('হজ', 'Hajj'); } },
  umrah: { icon: '🔄', get label() { return tr('ওমরাহ', 'Umrah'); } },
};
// Short reference the haji can say on the phone, e.g. "প্যাকেজ নম্বর 3FA9C2".
export const refOf = (id: unknown): string => String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
export const daysOf = (o: { depart_on?: string | null; return_on?: string | null }): number => Math.round((Date.parse(o.return_on || '') - Date.parse(o.depart_on || '')) / 86400000) + 1;

// ---------- Helpline (kept on the phone so the number works without internet) ----------
const HELP_CACHE = 'ta.helpline.v1';
export type Helpline = { phone: string; hours: string; otpLive: boolean };
export async function getHelpline(): Promise<Helpline> {
  try {
    const rows = check(await supabase.from('app_settings').select('key,value')) || [];
    const h: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value || '']));
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
export const listOffers = (kind: string | null) => rowsOf('list_offers', { p_kind: kind });   // typed by src/lib/dbTypes.ts
export async function myInterests(): Promise<Record<string, Interest>> {
  const rows: Interest[] = check(await supabase.from('offer_interests').select('id,offer_id,status,created_at').order('created_at', { ascending: false })) || [];
  const m: Record<string, Interest> = {};
  rows.forEach((r) => { if (r.offer_id && (!m[r.offer_id] || r.status === 'new')) m[r.offer_id] = r; });
  return m;   // offer_id -> latest request (open one first)
}
export const requestCallback = async (offerId: string) => check(await supabase.from('offer_interests').insert({ offer_id: offerId }));
export async function cancelCallback(id: string): Promise<void> {
  const r = check(await supabase.from('offer_interests').delete().eq('id', id).select('id'));
  if (!r || !r.length) throw coded('not deleted', 'not-deleted');
}

// ---------- Leader ----------
export async function myOffers(): Promise<OwnPackage[]> {
  const me = (await supabase.auth.getSession()).data?.session?.user?.id;
  if (!me) return [];
  return check(await supabase.from('offers').select('*').eq('leader_id', me).order('created_at', { ascending: false })) || [];
}
const ROUTE_COLS = ['from_airport', 'arrive_at', 'first_city', 'makkah_nights', 'madinah_nights', 'return_from', 'return_to', 'airline'];
const noRouteYet = (e: { message?: string } | null): boolean => !!e && ROUTE_COLS.some((c) => String(e.message || '').includes(`'${c}'`) || String(e.message || '').includes(`.${c}`) || String(e.message || '').includes(`"${c}"`));
const withoutRoute = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([k]) => !ROUTE_COLS.includes(k))) as T;
export async function createOffer(o: TableInsert<'offers'>): Promise<{ id: string } | null> {
  let r = await supabase.from('offers').insert(o).select('id').single();
  // database step 020 (journey) not run yet: save without the journey rather than failing
  if (r.error && noRouteYet(r.error)) { o = withoutRoute(o); r = await supabase.from('offers').insert(o).select('id').single(); }
  // database step 008 (end date) not run yet: publish without the end date rather than failing
  if (r.error && o.valid_until && /valid_until/.test(r.error.message || '')) { const { valid_until: _x, ...rest } = o; return check(await supabase.from('offers').insert(rest).select('id').single()); }
  return check(r);
}
// Admin check of packages (supabase/019_offer_review.sql). Before 019 every package counts as approved.
export const reviewOf = (o: Review | null | undefined): string => (o && o.review) || 'approved';
export const canEditOffer = (o: Review | null | undefined): boolean => !!o && !o.hidden_by_admin && (reviewOf(o) === 'pending' || reviewOf(o) === 'rejected');
export function reviewLabel(o: Review): string | null {
  const r = reviewOf(o);
  if (r === 'pending') return tr('⏳ অনুমোদনের অপেক্ষায়: অ্যাডমিন দেখার পর হাজীরা দেখবেন', '⏳ Waiting for approval: hajis see it after the admin checks');
  if (r === 'rejected') return tr(`↩️ অ্যাডমিন ফেরত দিয়েছেন। কারণ: ${o.review_note || 'উল্লেখ নেই'}। ঠিক করে আবার জমা দিন।`, `↩️ The admin sent it back. Reason: ${o.review_note || 'not given'}. Correct it and submit again.`);
  return null;
}
const EDITABLE = [...ROUTE_COLS, 'kind', 'title', 'price_bdt', 'depart_on', 'return_on', 'makkah_hotel', 'makkah_distance_m', 'madinah_hotel',
  'madinah_distance_m', 'room_share', 'includes', 'notes', 'valid_until'];
export async function updateOffer(id: string, o: TableUpdate<'offers'>): Promise<void> {
  const fields = Object.fromEntries(Object.entries(o).filter(([k]) => EDITABLE.includes(k))) as TableUpdate<'offers'>;
  let x = await supabase.from('offers').update(fields).eq('id', id).select('id');
  if (x.error && noRouteYet(x.error)) x = await supabase.from('offers').update(withoutRoute(fields)).eq('id', id).select('id');
  const r = check(x);
  if (!r || !r.length) throw coded('not changed', 'not-changed');
}
export function offerErrorText(e: { message?: string; code?: string } | null | undefined): string | null {
  const m = String((e && e.message) || '');
  if (/approved package cannot be changed/.test(m)) return tr('অনুমোদনের পর প্যাকেজ বদলানো যায় না। দরকার হলে এটি লুকিয়ে নতুন প্যাকেজ দিন।', 'A package cannot be changed after approval. If needed, hide it and add a new package.');
  if (/umrah_no_qurbani/.test(m)) return tr('ওমরাহ প্যাকেজে কুরবানি থাকে না। কুরবানি বাদ দিন।', 'Umrah packages have no qurbani. Remove qurbani.');
  if (/journey required/.test(m)) return tr('যাত্রাপথ (বিমানবন্দর, মক্কা ও মদিনায় কত রাত) পূরণ করুন।', 'Fill in the route (airports, nights in Makkah and Madinah).');
  if (/offers_route_nights/.test(m)) return tr('মক্কা ও মদিনার রাত মিলিয়ে সফরের দিনের চেয়ে বেশি হয়ে গেছে।', 'The Makkah and Madinah nights together are more than the trip days.');
  if (/departure date has passed/.test(m)) return tr('যাওয়ার তারিখ পার হয়ে গেছে। নতুন তারিখ দিন।', 'The departure date has passed. Give a new date.');
  if (e && e.code === 'not-changed') return tr('বদলানো যায়নি। প্যাকেজটি হয়তো এর মধ্যে অনুমোদন হয়ে গেছে। পাতাটি আবার খুলে দেখুন।', 'Could not change it. The package may have been approved meanwhile. Open the page again.');
  return null;
}
export async function setOfferActive(id: string, active: boolean): Promise<void> {
  const r = check(await supabase.from('offers').update({ active }).eq('id', id).select('id'));
  if (!r || !r.length) throw coded('not changed', 'not-changed');
}
export async function myInterestCounts(): Promise<Record<string, RpcRow<'my_offer_interest_counts'>>> {
  const rows = await rowsOf('my_offer_interest_counts');
  return Object.fromEntries(rows.map((r) => [r.offer_id, r]));
}

// ---------- Admin ----------
export const adminInterests = () => rowsOf('admin_list_interests');
export const markInterest = async (id: string, note?: string | null) => check(await supabase.rpc('admin_mark_interest', { p_id: id, p_note: note || null }));
export const hideOffer = async (id: string, hide: boolean) => check(await supabase.rpc('admin_hide_offer', { p_offer: id, p_hide: hide }));
export async function adminOffersReview(): Promise<AnyPackage[]> {
  const r = await supabase.rpc('admin_offers_review');
  if (r.error && notReady(r.error)) return adminOffers();      // step 019 not run yet
  return (check(r) || []) as AnyPackage[];
}
export async function reviewOffer(id: string, decision: string, note?: string | null) {
  const n = String(note || '').trim();
  if (decision === 'reject' && n.length < 2) throw coded('reason needed', 'reason');
  return check(await supabase.rpc('admin_review_offer', { p_offer: id, p_decision: decision, p_note: n || null }));
}
export async function adminOffers(): Promise<AnyPackage[]> {   // only some columns are read
  return (check(await supabase.from('offers').select('id,kind,title,price_bdt,depart_on,return_on,active,hidden_by_admin,created_at').order('created_at', { ascending: false }).limit(200)) || []) as AnyPackage[];
}
// true once step 019 (admin check of packages) has been run on the server
export async function offerReviewReady(): Promise<boolean> {
  const r = await supabase.from('offers').select('review').limit(1);
  return !r.error;
}

// 034: the leader says how many seats are left (null = clear). Answers: 'ok' | 'bad_value' | 'not_found'.
export const setOfferSeats = async (id: string, seats: number | null): Promise<string> =>
  String(check(await supabase.rpc('set_offer_seats', { p_offer: id, p_seats: seats })));
