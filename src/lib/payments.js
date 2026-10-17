// Payments through Travel Adda (supabase/008_payments.sql). The haji pays Travel Adda's official account and records it
// here with a receipt; staff confirm it; Travel Adda keeps the commission and pays the leader. Every function throws on
// failure, so screens never show a false success.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { uid, randomId, shrink } from './docs';

const check = (r) => { if (r.error) throw r.error; return r.data; };
const rpc = async (fn, args) => check(await supabase.rpc(fn, args));
const MAX_BYTES = 5 * 1024 * 1024;

export const PAY_METHODS = [
  { id: 'bkash', icon: '📱', label: 'বিকাশ' },
  { id: 'nagad', icon: '📱', label: 'নগদ' },
  { id: 'bank', icon: '🏦', label: 'ব্যাংক' },
  { id: 'office', icon: '🏢', label: 'অফিসে নগদ' },
];
export const methodLabel = (id) => (PAY_METHODS.find((m) => m.id === id) || { label: id }).label;
export const PAY_STATUS = {
  submitted: { icon: '⏳', label: 'যাচাই চলছে' },
  confirmed: { icon: '✅', label: 'টাকা পাওয়া গেছে' },
  rejected: { icon: '✖️', label: 'মেলেনি' },
};

// Where to send the money (set by the admin). Kept on the phone so it shows without internet.
const INFO_KEY = 'ta.payInfo.v1';
export async function payInfo() {
  try {
    const rows = check(await supabase.from('app_settings').select('key,value').in('key', ['pay_bank', 'pay_bkash'])) || [];
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const v = { bank: m.pay_bank || '', bkash: m.pay_bkash || '' };
    AsyncStorage.setItem(INFO_KEY, JSON.stringify(v)).catch(() => {});
    return v;
  } catch (e) {
    try { const v = JSON.parse((await AsyncStorage.getItem(INFO_KEY)) || 'null'); if (v) return v; } catch (x) { /* none */ }
    throw e;
  }
}

// ---------- Haji ----------
export async function myPayments(contractId) {
  return check(await supabase.from('haji_payments').select('id,amount,method,txn_ref,paid_on,status,admin_note,created_at').eq('contract_id', contractId).order('created_at', { ascending: false })) || [];
}
export async function contractMoney(contractId) {
  const r = await rpc('contract_money', { p_contract: contractId });
  return r && r[0] ? r[0] : null;
}
// file = { uri, kind: 'image' | 'pdf' } or null. The receipt is uploaded first; if saving the payment fails it is removed.
export async function submitPayment({ contractId, amount, method, ref, paidOn, file }) {
  const me = await uid();
  let path = null;
  if (file) {
    const pdf = file.kind === 'pdf';
    const src = pdf ? file.uri : await shrink(file.uri);
    const buf = await (await fetch(src)).arrayBuffer();
    if (buf.byteLength > MAX_BYTES) { const e = new Error('too big'); e.code = 'too-big'; throw e; }
    path = `${me}/${randomId()}.${pdf ? 'pdf' : 'jpg'}`;
    const up = await supabase.storage.from('receipts').upload(path, buf, { contentType: pdf ? 'application/pdf' : 'image/jpeg' });
    if (up.error) throw up.error;
  }
  const ins = await supabase.from('haji_payments').insert({ contract_id: contractId, amount, method, txn_ref: ref.trim(), paid_on: paidOn, receipt_path: path });
  if (ins.error) {
    if (path) await supabase.storage.from('receipts').remove([path]).catch(() => {});
    throw ins.error;
  }
}

// ---------- Leader ----------
export const leaderMoney = async () => (await rpc('leader_money')) || [];

// ---------- Admin (needs the 'payments' permission) ----------
export const listPayments = async (status) => (await rpc('admin_list_payments', { p_status: status || null })) || [];
export const reviewPayment = (id, confirm, note) => rpc('admin_review_payment', { p_id: id, p_confirm: confirm, p_note: note || null });
export const ledger = async () => (await rpc('admin_ledger')) || [];
export const leaderRates = async () => (await rpc('admin_leader_rates')) || [];
export const setLeaderRate = (leaderId, pct, note) => rpc('admin_set_leader_rate', { p_leader: leaderId, p_pct: pct, p_note: note || null });
export const setCommission = (contractId, amount) => rpc('admin_set_commission', { p_contract: contractId, p_amount: amount });
export const addPayout = (contractId, payee, amount, ref, note) => rpc('admin_add_payout', { p_contract: contractId, p_payee: payee, p_amount: amount, p_ref: ref, p_note: note || null });
export async function receiptUrl(path) {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 300);
  if (error || !data) throw error || new Error('no url');
  return data.signedUrl;
}
