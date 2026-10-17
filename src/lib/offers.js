// Offers & packages (supabase/005_offers.sql). The database enforces every rule; functions throw on failure.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { normalizeDigits } from './phone';

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
export const createOffer = async (o) => check(await supabase.from('offers').insert(o).select('id').single());
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
export async function adminOffers() {
  return check(await supabase.from('offers').select('id,kind,title,price_bdt,depart_on,return_on,active,hidden_by_admin,created_at').order('created_at', { ascending: false }).limit(200)) || [];
}
