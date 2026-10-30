// Hajj & Umrah help fund (supabase/027_help_fund.sql). Sadaqah only — not a zakat fund.
// The database checks every rule; this file checks the forms first (so mistakes are caught before sending) and turns
// answers into plain Bengali. Every function throws on failure, so screens never show a false success.
import { supabase } from './supabase';
import { notReady } from './groups';
import { parsePrice } from './offerRoute';
import { normalizePhone, isValidBdPhone, normalizeDigits, toBn } from './phone';
import { rpc, fail } from './rpc';

type Row = Record<string, any>;   // server rows (the database has no generated types yet)
const num = (v: unknown): number => Number(v || 0);

export type FundPerson = { kind: 'umrah' | 'hajj'; age: number; district: string; status?: string; name: string | null; since?: string };
export type FundSummary = { collected: number; spent: number; balance: number; donors: number; travelled: number;
  waiting: FundPerson[]; recent: { amount: number; name: string | null; at: string }[];
  spends: (FundPerson & { amount: number; purpose: string; at: string })[] };

export async function fundSummary(): Promise<FundSummary | null> {
  try {
    const s = (await rpc<Row>('fund_summary')) || {};
    return { collected: num(s.collected), spent: num(s.spent), balance: num(s.balance), donors: num(s.donors), travelled: num(s.travelled),
      waiting: s.waiting || [], recent: (s.recent || []).map((r: Row) => ({ ...r, amount: num(r.amount) })),
      spends: (s.spends || []).map((r: Row) => ({ ...r, amount: num(r.amount) })) };
  } catch (e) { if (notReady(e)) return null; throw e; }
}

// ---------- donor ----------
export const DONATE_METHODS = ['bkash', 'nagad', 'bank', 'office'] as const;
export type DonateForm = { amount: unknown; method: string; ref: unknown; paidOn: string; showName?: boolean };
const ymdOk = (d: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`); const now = Date.now();
  return Number.isFinite(t) && t <= now + 86400000 && t >= now - 61 * 86400000;
};
export async function donate(f: DonateForm): Promise<string | null> {
  const amount = parsePrice(f.amount);
  if (amount === null || !Number.isFinite(amount) || amount < 100) throw fail('amount');
  if (!(DONATE_METHODS as readonly string[]).includes(f.method)) throw fail('method');
  const ref = String(f.ref || '').trim();
  if (ref.length < 3) throw fail('ref');
  if (!ymdOk(f.paidOn)) throw fail('date');
  try {
    return await rpc<string>('donate_fund', { p_amount: amount, p_method: f.method, p_ref: ref, p_paid_on: f.paidOn, p_show_name: !!f.showName });
  } catch (e) {
    if (/fund_ref_uq|duplicate/i.test(String((e as { message?: string }).message || ''))) throw fail('duplicate');
    throw e;
  }
}
export const myDonations = async (): Promise<Row[]> => (await rpc<Row[]>('my_donations')) || [];
export const myConfirmedTotal = (rows: Row[]): number => rows.filter((r) => r.status === 'confirmed').reduce((s, r) => s + num(r.amount), 0);

// ---------- applicant ----------
export type HelpForm = { kind: string; age: unknown; district: string; profession: string; reason: string; wentBefore: boolean;
  refName: string; refPhone: string; showName: boolean };
export async function applyHelp(f: HelpForm): Promise<string | null> {
  if (f.kind !== 'umrah' && f.kind !== 'hajj') throw fail('kind');
  const age = Number(normalizeDigits(String(f.age ?? '')));
  if (!Number.isInteger(age) || age < 18 || age > 110) throw fail('age');
  if (String(f.district || '').trim().length < 2) throw fail('district');
  if (String(f.profession || '').trim().length < 2) throw fail('profession');
  const reason = String(f.reason || '').trim();
  if (reason.length < 15 || reason.length > 800) throw fail('reason');
  if (String(f.refName || '').trim().length < 2) throw fail('refName');
  const phone = normalizePhone(f.refPhone);
  if (!isValidBdPhone(phone)) throw fail('refPhone');
  return rpc<string>('apply_help', { p_kind: f.kind, p_age: age, p_district: f.district.trim(), p_profession: f.profession.trim(), p_reason: reason,
    p_went_before: !!f.wentBefore, p_ref_name: f.refName.trim(), p_ref_phone: phone, p_show_name: !!f.showName });
}
export async function myHelpApplication(): Promise<Row | null> {
  try { const r = await rpc<Row[]>('my_help_application'); return r && r[0] ? r[0] : null; } catch (e) { if (notReady(e)) return null; throw e; }
}
export async function withdrawHelp(): Promise<void> {
  if ((await rpc<string>('withdraw_help')) !== 'ok') throw fail('not_found');
}

const ERR: Record<string, string> = {
  amount: 'টাকার পরিমাণ লিখুন (কমপক্ষে ১০০ টাকা)।', method: 'কীভাবে টাকা পাঠিয়েছেন, বাছুন।',
  ref: 'লেনদেন নম্বর (TrxID) বা রসিদ নম্বর লিখুন।', date: 'টাকা পাঠানোর তারিখ ঠিক করুন (গত ৬০ দিনের মধ্যে)।',
  duplicate: 'এই লেনদেন নম্বর আগেই জমা দেওয়া হয়েছে।', limit: 'আজ অনেকবার জমা দেওয়া হয়েছে। কাল আবার চেষ্টা করুন।',
  kind: 'হজ না ওমরাহ, বাছুন।', age: 'বয়স সংখ্যায় লিখুন (১৮ থেকে ১১০)।', district: 'জেলার নাম লিখুন।', profession: 'পেশা লিখুন।',
  reason: 'কেন সাহায্য দরকার, অন্তত ১৫ অক্ষরে লিখুন।', refName: 'পরিচিত একজনের নাম লিখুন (যেমন মসজিদের ইমাম)।',
  refPhone: 'পরিচিত মানুষের ১১ অঙ্কের মোবাইল নম্বর লিখুন।', exists: 'আপনার একটি আবেদন আগেই চালু আছে।',
  reason_admin: 'কারণ অন্তত ৫ অক্ষরে লিখুন।', purpose: 'কী কাজে খরচ, লিখুন (যেমন: ওমরাহ প্যাকেজ)।', not_found: 'এটি আর পাওয়া যায়নি।',
};
export function helpErrorText(e: unknown): string {
  const x = (e || {}) as { code?: string; message?: string };
  if (x.code && ERR[x.code]) return ERR[x.code];
  if (/not enough in the fund/i.test(String(x.message || ''))) return 'তহবিলে এত টাকা নেই।';
  if (/network|fetch/i.test(String(x.message || ''))) return 'ইন্টারনেট সংযোগ নেই। আপনার লেখা ঘরেই আছে, আবার চেষ্টা করুন।';
  return 'কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।';
}

// "নোয়াখালীর ৬৫ বছর বয়সী একজন" unless the person agreed to show the name.
const of = (place: string): string => (/[\u09BE-\u09CC\u0985-\u0994]$/.test(place) ? `${place}র` : `${place}ের`);   // ঢাকার, সিলেটের
export const personLabel = (p: { name?: string | null; district?: string; age?: number }): string =>
  (p.name ? p.name : `${of(String(p.district || '').trim())} ${toBn(p.age ?? '')} বছর বয়সী একজন`);
export const kindLabel = (k: string): string => (k === 'hajj' ? '🕋 হজ' : '🕌 ওমরাহ');
const STATUS: Record<string, string> = {
  pending: '⏳ যাচাই চলছে — Travel Adda আপনার দেওয়া পরিচিত মানুষকে ফোন করবে',
  approved: '✅ অনুমোদিত — তহবিলে টাকা হলে যোগাযোগ করা হবে',
  rejected: '✖️ এবার গ্রহণ করা যায়নি',
  funded: '💚 তহবিল থেকে টাকা দেওয়া হয়েছে',
  travelled: '🕋 আলহামদুলিল্লাহ, সফর সম্পন্ন',
  withdrawn: '↩️ আপনি আবেদন ফিরিয়ে নিয়েছেন',
};
export const helpStatusText = (s: string): string => STATUS[s] || s;

// ---------- Travel Adda ----------
const list = async (fn: string, args?: Record<string, unknown>): Promise<Row[]> => (await rpc<Row[]>(fn, args)) || [];
export const helpApplications = (status: string | null) => list('admin_help_applications', { p_status: status });
export async function decideHelp(id: string, decision: 'approve' | 'reject', note?: string | null): Promise<string | null> {
  const n = String(note || '').trim();
  if (decision === 'reject' && n.length < 5) throw fail('reason');
  return rpc<string>('admin_decide_help', { p_id: id, p_decision: decision, p_note: n || null });
}
export const helpTravelled = (id: string) => rpc<string>('admin_help_travelled', { p_id: id });
export const fundDonations = (status: string | null) => list('admin_fund_donations', { p_status: status });
export async function reviewDonation(id: string, confirm: boolean, note?: string | null): Promise<string | null> {
  const n = String(note || '').trim();
  if (!confirm && n.length < 5) throw fail('reason');
  return rpc<string>('admin_review_donation', { p_id: id, p_confirm: confirm, p_note: n || null });
}
export async function spendFund(appId: string, amount: unknown, purpose: unknown, ref: unknown): Promise<string | null> {
  const a = parsePrice(amount);
  if (a === null || !Number.isFinite(a) || a <= 0) throw fail('amount');
  const p = String(purpose || '').trim(); if (p.length < 3) throw fail('purpose');
  const r = String(ref || '').trim(); if (r.length < 3) throw fail('ref');
  return rpc<string>('admin_spend_fund', { p_app: appId, p_amount: a, p_purpose: p, p_ref: r });
}

// Where donors send money: the fund's own account if set, else Travel Adda's normal payment account.
export async function fundPayInfo(): Promise<{ bank: string; bkash: string }> {
  const r = await supabase.from('app_settings').select('key,value').in('key', ['fund_bank', 'fund_bkash', 'pay_bank', 'pay_bkash']);
  if (r.error) throw r.error;
  const m: Record<string, string> = Object.fromEntries(((r.data || []) as Row[]).map((x) => [x.key, x.value]));
  return { bank: m.fund_bank || m.pay_bank || '', bkash: m.fund_bkash || m.pay_bkash || '' };
}
