// Payments through Travel Adda (supabase/008_payments.sql). The haji pays Travel Adda's official account and records it
// here with a receipt; staff confirm it; Travel Adda keeps the commission and pays the leader. Every function throws on
// failure, so screens never show a false success.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { uid, randomId, shrink } from './docs';
import { rpc, check, fail, type DbResult } from './rpc';

const MAX_BYTES = 5 * 1024 * 1024;

export type PayMethod = 'bkash' | 'nagad' | 'bank' | 'office';
export type PayStatus = 'submitted' | 'confirmed' | 'rejected';
export const PAY_METHODS: ReadonlyArray<{ id: PayMethod; icon: string; label: string }> = [
  { id: 'bkash', icon: '📱', label: 'বিকাশ' },
  { id: 'nagad', icon: '📱', label: 'নগদ' },
  { id: 'bank', icon: '🏦', label: 'ব্যাংক' },
  { id: 'office', icon: '🏢', label: 'অফিসে নগদ' },
];
export const methodLabel = (id: string): string => (PAY_METHODS.find((m) => m.id === id) || { label: id }).label;
export const PAY_STATUS: Record<PayStatus, { icon: string; label: string }> = {
  submitted: { icon: '⏳', label: 'যাচাই চলছে' },
  confirmed: { icon: '✅', label: 'টাকা পাওয়া গেছে' },
  rejected: { icon: '✖️', label: 'মেলেনি' },
};

// The parts of the Supabase client used here, typed (the database itself has no generated types yet).
type Query<T> = PromiseLike<DbResult<T>> & {
  select: (cols: string) => Query<T>; eq: (col: string, v: unknown) => Query<T>; in: (col: string, v: unknown[]) => Query<T>;
  order: (col: string, o: { ascending: boolean }) => Query<T>; insert: (row: Record<string, unknown>) => Query<T>;
};
type Bucket = {
  upload: (path: string, body: ArrayBuffer, o: { contentType: string }) => PromiseLike<{ error: unknown }>;
  remove: (paths: string[]) => Promise<unknown>;
  createSignedUrl: (path: string, sec: number) => PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>;
};
type Db = { from: <T>(table: string) => Query<T>; storage: { from: (bucket: string) => Bucket } };
const db = supabase as unknown as Db;

// Where to send the money (set by the admin). Kept on the phone so it shows without internet.
export type PayInfo = { bank: string; bkash: string };
const INFO_KEY = 'ta.payInfo.v1';
export async function payInfo(): Promise<PayInfo> {
  try {
    const rows = check(await db.from<{ key: string; value: string }[]>('app_settings').select('key,value').in('key', ['pay_bank', 'pay_bkash'])) || [];
    const m: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const v: PayInfo = { bank: m.pay_bank || '', bkash: m.pay_bkash || '' };
    AsyncStorage.setItem(INFO_KEY, JSON.stringify(v)).catch(() => {});
    return v;
  } catch (e) {
    try { const v = JSON.parse((await AsyncStorage.getItem(INFO_KEY)) || 'null') as PayInfo | null; if (v) return v; } catch (x) { /* none */ }
    throw e;
  }
}

// ---------- Haji ----------
export type MyPayment = { id: string; amount: number | string; method: PayMethod; txn_ref: string; paid_on: string; status: PayStatus; admin_note: string | null; created_at: string };
export async function myPayments(contractId: string): Promise<MyPayment[]> {
  return check(await db.from<MyPayment[]>('haji_payments').select('id,amount,method,txn_ref,paid_on,status,admin_note,created_at').eq('contract_id', contractId).order('created_at', { ascending: false })) || [];
}
export type ContractMoney = { price_bdt: number | string; paid_in: number | string; pending_in: number | string; commission: number | string | null;
  paid_to_leader: number | string; refunded: number | string; due_to_leader: number | string | null; still_to_pay: number | string };
export async function contractMoney(contractId: string): Promise<ContractMoney | null> {
  const r = await rpc<ContractMoney[]>('contract_money', { p_contract: contractId });
  return r && r[0] ? r[0] : null;
}
// file = { uri, kind: 'image' | 'pdf' } or null. The receipt is uploaded first; if saving the payment fails it is removed.
export type Receipt = { uri: string; kind: 'image' | 'pdf' };
export async function submitPayment({ contractId, amount, method, ref, paidOn, file }:
  { contractId: string; amount: number; method: PayMethod; ref: string; paidOn: string; file?: Receipt | null }): Promise<void> {
  const me = await uid();
  let path: string | null = null;
  if (file) {
    const pdf = file.kind === 'pdf';
    const src: string = pdf ? file.uri : await shrink(file.uri);
    const buf = await (await fetch(src)).arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw fail('too-big');
    path = `${me}/${randomId()}.${pdf ? 'pdf' : 'jpg'}`;
    const up = await db.storage.from('receipts').upload(path, buf, { contentType: pdf ? 'application/pdf' : 'image/jpeg' });
    if (up.error) throw up.error;
  }
  const ins = await db.from<null>('haji_payments').insert({ contract_id: contractId, amount, method, txn_ref: ref.trim(), paid_on: paidOn, receipt_path: path });
  if (ins.error) {
    if (path) await db.storage.from('receipts').remove([path]).catch(() => {});
    throw ins.error;
  }
}

// ---------- Leader ----------
export type LeaderMoneyRow = { contract_id: string; contract_no: string; haji_name: string; haji_code: string; kind: 'in' | 'out'; what: string; amount: number | string; at: string; ref: string | null };
export const leaderMoney = async (): Promise<LeaderMoneyRow[]> => (await rpc<LeaderMoneyRow[]>('leader_money')) || [];

// ---------- Admin (needs the 'payments' permission) ----------
type Row = Record<string, unknown>;
export const listPayments = async (status?: string | null): Promise<Row[]> => (await rpc<Row[]>('admin_list_payments', { p_status: status || null })) || [];
export const reviewPayment = (id: string, confirm: boolean, note?: string | null) => rpc<string>('admin_review_payment', { p_id: id, p_confirm: confirm, p_note: note || null });
export const ledger = async (): Promise<Row[]> => (await rpc<Row[]>('admin_ledger')) || [];
export const leaderRates = async (): Promise<Row[]> => (await rpc<Row[]>('admin_leader_rates')) || [];
export const setLeaderRate = (leaderId: string, pct: number, note?: string | null) => rpc<string>('admin_set_leader_rate', { p_leader: leaderId, p_pct: pct, p_note: note || null });
export const setCommission = (contractId: string, amount: number | null) => rpc<string>('admin_set_commission', { p_contract: contractId, p_amount: amount });
export const addPayout = (contractId: string, payee: 'leader' | 'haji', amount: number, ref: string, note?: string | null) =>
  rpc<string>('admin_add_payout', { p_contract: contractId, p_payee: payee, p_amount: amount, p_ref: ref, p_note: note || null });
export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await db.storage.from('receipts').createSignedUrl(path, 300);
  if (error || !data) throw error || new Error('no url');
  return data.signedUrl;
}
