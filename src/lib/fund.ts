// Hajj & Umrah help fund (supabase/027_help_fund.sql; giving needs permission since 028_fund_access.sql). Sadaqah only — not a zakat fund.
// The database checks every rule; this file checks the forms first (so mistakes are caught before sending) and turns
// answers into plain Bengali (or English when chosen). Every function throws on failure, so screens never show a false success.
import { supabase } from './supabase';
import { notReady } from './groups';
import { parsePrice } from './offerRoute';
import { normalizePhone, isValidBdPhone, normalizeDigits, toBn } from './phone';
import { rpc, fail, rows, firstRow } from './rpc';
import { tr, lbl, monthName } from './lang';
import { districtName } from './market';

import type { RpcRow } from './dbTypes';
const num = (v: unknown): number => Number(v || 0);

export type FundPerson = { kind: 'umrah' | 'hajj'; age: number; district: string; status?: string; name: string | null; since?: string };
export type FundSummary = { collected: number; spent: number; balance: number; donors: number; travelled: number;
  waiting: FundPerson[]; recent: { amount: number; name: string | null; at: string }[];
  spends: (FundPerson & { amount: number; purpose: string; at: string })[] };

export async function fundSummary(): Promise<FundSummary | null> {
  try {
    // fund_summary answers one JSON object (supabase/027_help_fund.sql)
    type Raw = { collected?: number; spent?: number; balance?: number; donors?: number; travelled?: number; waiting?: FundPerson[];
      recent?: { amount: number; name: string | null; at: string }[]; spends?: (FundPerson & { amount: number; purpose: string; at: string })[] };
    const s = ((await rpc<Raw>('fund_summary')) || {}) as Raw;
    return { collected: num(s.collected), spent: num(s.spent), balance: num(s.balance), donors: num(s.donors), travelled: num(s.travelled),
      waiting: s.waiting || [], recent: (s.recent || []).map((r) => ({ ...r, amount: num(r.amount) })),
      spends: (s.spends || []).map((r) => ({ ...r, amount: num(r.amount) })) };
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
  let r: string | null;
  try {
    r = await rpc<string>('donate_fund', { p_amount: amount, p_method: f.method, p_ref: ref, p_paid_on: f.paidOn, p_show_name: !!f.showName });
  } catch (e) {
    if (/fund_ref_uq|duplicate/i.test(String((e as { message?: string }).message || ''))) throw fail('duplicate');
    throw e;
  }
  if (r === 'not_allowed' || r === 'limit') throw fail(r);
  return r;
}

// ---------- permission to give (028) ----------
export type DonateMode = 'approved' | 'open' | 'closed';
export type DonateAccess = { mode: DonateMode; status: 'none' | 'requested' | 'allowed' | 'blocked'; can: boolean };
export async function donateAccess(): Promise<DonateAccess> {
  try {
    const a = ((await rpc<Partial<DonateAccess>>('my_donate_access')) || {}) as Partial<DonateAccess>;
    return { mode: a.mode || 'approved', status: a.status || 'none', can: a.can === true };
  } catch (e) {
    if (notReady(e)) return { mode: 'open', status: 'none', can: true };   // step 028 not run yet: giving works as before
    throw e;
  }
}
export type AccessMessage = { icon: string; title: string; body: string; canAsk: boolean };
// null = may give now (show the form); otherwise what to show instead of the form.
export function donateAccessText(a: DonateAccess): AccessMessage | null {
  if (a.can) return null;
  if (a.mode === 'closed') return { icon: '⏸️', title: tr('এখন তহবিলে দান নেওয়া বন্ধ আছে', 'Donations to the fund are closed now'),
    body: tr('Travel Adda আবার চালু করলে এখানে দান করতে পারবেন। তহবিলের হিসাব "হিসাব" অংশে দেখা যাবে।', 'When Travel Adda opens it again, you can donate here. The fund accounts are in the "Accounts" part.'), canAsk: false };
  if (a.status === 'blocked') return { icon: '🚫', title: tr('আপনার আইডি থেকে দান নেওয়া বন্ধ আছে', 'Donations from your ID are stopped'),
    body: tr('কিছু জানার থাকলে Travel Adda-র হেল্পলাইনে ফোন করুন।', 'If you have a question, call the Travel Adda helpline.'), canAsk: false };
  if (a.status === 'requested') return { icon: '⏳', title: tr('অনুমতির অনুরোধ পাঠানো হয়েছে', 'Permission request sent'),
    body: tr('Travel Adda দেখে অনুমতি দিলে আপনাকে নোটিফিকেশন পাঠানো হবে। তারপর এখানেই দান করতে পারবেন।', 'When Travel Adda gives permission, you will get a notification. Then you can donate right here.'), canAsk: false };
  return { icon: '🔐', title: tr('দান করতে Travel Adda-র অনুমতি লাগে', 'Donating needs Travel Adda\'s permission'),
    body: tr('নিচের বোতাম চাপলে Travel Adda জানতে পারবে। অনুমতি দিলে নোটিফিকেশন পাবেন।', 'Tap the button below and Travel Adda will know. You will get a notification when permission is given.'), canAsk: true };
}
export const requestDonateAccess = async (): Promise<string | null> => rpc<string>('request_donate_access');
const REQ: Record<string, string> = {
  get requested() { return tr('অনুরোধ পাঠানো হয়েছে। Travel Adda অনুমতি দিলে নোটিফিকেশন পাবেন।', 'Request sent. You will get a notification when Travel Adda gives permission.'); },
  get already() { return tr('আপনার অনুরোধ আগেই পাঠানো আছে। Travel Adda দেখে জানাবে।', 'Your request was already sent. Travel Adda will look at it and let you know.'); },
  get allowed() { return tr('আপনার অনুমতি আছে। এখন দান করতে পারবেন।', 'You have permission. You can donate now.'); },
  get blocked() { return tr('আপনার আইডি থেকে দান নেওয়া বন্ধ আছে। হেল্পলাইনে যোগাযোগ করুন।', 'Donations from your ID are stopped. Contact the helpline.'); },
  get closed() { return tr('এখন তহবিলে দান নেওয়া বন্ধ আছে।', 'Donations to the fund are closed now.'); },
  get limit() { return tr('আজ আর অনুরোধ পাঠানো যাবে না। কাল আবার চেষ্টা করুন।', 'No more requests can be sent today. Try again tomorrow.'); },
};
export const requestAccessText = (code: string | null): string => REQ[code || ''] || tr('কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।', 'It did not work. Try again a little later.');
export const myDonations = () => rows('my_donations');
export const myConfirmedTotal = (rows: { status: string; amount: unknown }[]): number => rows.filter((r) => r.status === 'confirmed').reduce((s, r) => s + num(r.amount), 0);

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
export async function myHelpApplication(): Promise<RpcRow<'my_help_application'> | null> {
  try { return await firstRow('my_help_application'); } catch (e) { if (notReady(e)) return null; throw e; }
}
export async function withdrawHelp(): Promise<void> {
  if ((await rpc<string>('withdraw_help')) !== 'ok') throw fail('not_found');
}

const ERR: Record<string, string> = {
  get amount() { return tr('টাকার পরিমাণ লিখুন (কমপক্ষে ১০০ টাকা)।', 'Write the amount (at least Tk 100).'); }, get method() { return tr('কীভাবে টাকা পাঠিয়েছেন, বাছুন।', 'Choose how you sent the money.'); },
  get ref() { return tr('লেনদেন নম্বর (TrxID) বা রসিদ নম্বর লিখুন।', 'Write the transaction number (TrxID) or receipt number.'); }, get date() { return tr('টাকা পাঠানোর তারিখ ঠিক করুন (গত ৬০ দিনের মধ্যে)।', 'Choose the date you sent the money (within the last 60 days).'); },
  get duplicate() { return tr('এই লেনদেন নম্বর আগেই জমা দেওয়া হয়েছে।', 'This transaction number has already been sent.'); }, get limit() { return tr('আজ অনেকবার জমা দেওয়া হয়েছে। কাল আবার চেষ্টা করুন।', 'Too many sent today. Try again tomorrow.'); },
  get kind() { return tr('হজ না ওমরাহ, বাছুন।', 'Choose Hajj or Umrah.'); }, get age() { return tr('বয়স সংখ্যায় লিখুন (১৮ থেকে ১১০)।', 'Write the age in numbers (18 to 110).'); }, get district() { return tr('জেলার নাম লিখুন।', 'Write the district name.'); }, get profession() { return tr('পেশা লিখুন।', 'Write the profession.'); },
  get reason() { return tr('কেন সাহায্য দরকার, অন্তত ১৫ অক্ষরে লিখুন।', 'Write why help is needed, in at least 15 letters.'); }, get refName() { return tr('পরিচিত একজনের নাম লিখুন (যেমন মসজিদের ইমাম)।', 'Write the name of someone who knows you (e.g. the mosque imam).'); },
  get refPhone() { return tr('পরিচিত মানুষের ১১ অঙ্কের মোবাইল নম্বর লিখুন।', 'Write that person\'s 11-digit mobile number.'); }, get exists() { return tr('আপনার একটি আবেদন আগেই চালু আছে।', 'You already have an open application.'); },
  get not_allowed() { return tr('দান করতে Travel Adda-র অনুমতি লাগে। "অনুমতি চাই" বোতাম চাপুন।', 'Donating needs Travel Adda\'s permission. Tap the "Ask for permission" button.'); },
  get short() { return tr('আইডি নম্বর, মোবাইল নম্বর বা নামের অন্তত ৩ অক্ষর লিখুন।', 'Write the ID number, mobile number or at least 3 letters of the name.'); }, get status() { return tr('অবস্থা বাছুন।', 'Choose a status.'); }, get mode() { return tr('একটি নিয়ম বাছুন।', 'Choose a rule.'); },
  get leader() { return tr('লিডার আইডি থেকে সাহায্যের আবেদন করা যায় না। আপনি চাইলে দান করতে পারেন।', 'A leader ID cannot apply for help. You can donate if you wish.'); },
  get reason_admin() { return tr('কারণ অন্তত ৫ অক্ষরে লিখুন।', 'Write the reason in at least 5 letters.'); }, get purpose() { return tr('কী কাজে খরচ, লিখুন (যেমন: ওমরাহ প্যাকেজ)।', 'Write what it is spent on (e.g. an Umrah package).'); }, get not_found() { return tr('এটি আর পাওয়া যায়নি।', 'This is no longer available.'); },
};
export function helpErrorText(e: unknown): string {
  const x = (e || {}) as { code?: string; message?: string };
  if (x.code && ERR[x.code]) return ERR[x.code];
  if (/not enough in the fund/i.test(String(x.message || ''))) return tr('তহবিলে এত টাকা নেই।', 'The fund does not have this much money.');
  if (/network|fetch/i.test(String(x.message || ''))) return tr('ইন্টারনেট সংযোগ নেই। আপনার লেখা ঘরেই আছে, আবার চেষ্টা করুন।', 'No internet connection. Your text is still in the box; try again.');
  return tr('কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।', 'It did not work. Try again a little later.');
}

// "নোয়াখালীর ৬৫ বছর বয়সী একজন" unless the person agreed to show the name.
const of = (place: string): string => (/[\u09BE-\u09CC\u0985-\u0994]$/.test(place) ? `${place}র` : `${place}ের`);   // i18n-ok: Bengali only (ঢাকার, সিলেটের)
export const personLabel = (p: { name?: string | null; district?: string; age?: number }): string =>
  (p.name ? p.name : tr(`${of(String(p.district || '').trim())} ${toBn(p.age ?? '')} বছর বয়সী একজন`, `A ${p.age ?? ''}-year-old from ${districtName(String(p.district || '').trim())}`));
export const kindLabel = (k: string): string => (k === 'hajj' ? tr('🕋 হজ', '🕋 Hajj') : tr('🕌 ওমরাহ', '🕌 Umrah'));
const STATUS: Record<string, string> = {
  get pending() { return tr('⏳ যাচাই চলছে — Travel Adda আপনার দেওয়া পরিচিত মানুষকে ফোন করবে', '⏳ Being checked — Travel Adda will call the person you named'); },
  get approved() { return tr('✅ অনুমোদিত — তহবিলে টাকা হলে যোগাযোগ করা হবে', '✅ Approved — you will be contacted when the fund has money'); },
  get rejected() { return tr('✖️ এবার গ্রহণ করা যায়নি', '✖️ Could not be accepted this time'); },
  get funded() { return tr('💚 তহবিল থেকে টাকা দেওয়া হয়েছে', '💚 Money given from the fund'); },
  get travelled() { return tr('🕋 আলহামদুলিল্লাহ, সফর সম্পন্ন', '🕋 Alhamdulillah, journey completed'); },
  get withdrawn() { return tr('↩️ আপনি আবেদন ফিরিয়ে নিয়েছেন', '↩️ You withdrew the application'); },
};
export const helpStatusText = (s: string): string => STATUS[s] || s;

// The fund page's parts. Leaders give and see the account but don't apply for help (029; the server checks too).
export type FundTab = { id: 'give' | 'apply' | 'report'; label: string };
export function fundTabs(me: { role?: string; account_type?: string } | null): FundTab[] {
  const leader = !!me && (me.role === 'leader' || me.account_type === 'leader');
  return [{ id: 'give', label: tr('দান করুন', 'Donate') }, ...(leader ? [] : [{ id: 'apply' as const, label: tr('আবেদন', 'Apply') }]), { id: 'report', label: tr('হিসাব', 'Accounts') }];
}

// ---------- Travel Adda ----------
const list = rows;      // typed by the function name (src/lib/dbTypes.ts)
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

// Who may give (028): the mode for everyone, then one person at a time.
export const DONATE_MODES: readonly { key: DonateMode; icon: string; label: string; hint: string }[] = [
  { key: 'approved', icon: '🔐', get label() { return tr('শুধু অনুমতি পাওয়া আইডি', 'Only IDs with permission'); }, get hint() { return tr('Travel Adda যাদের চালু করেছে, শুধু তারাই দান করতে পারবেন।', 'Only those Travel Adda has allowed can donate.'); } },
  { key: 'open', icon: '✅', get label() { return tr('সবার জন্য খোলা', 'Open to everyone'); }, get hint() { return tr('সবাই দান করতে পারবেন, শুধু যাদের বন্ধ করা হয়েছে তারা ছাড়া।', 'Everyone can donate, except those who were stopped.'); } },
  { key: 'closed', icon: '⏸️', get label() { return tr('সবার জন্য বন্ধ', 'Closed to everyone'); }, get hint() { return tr('কেউ দান করতে পারবেন না, অনুমতি পাওয়া আইডিও না।', 'Nobody can donate, not even IDs with permission.'); } },
];
export async function setDonateMode(mode: string): Promise<string | null> {
  if (!DONATE_MODES.some((m) => m.key === mode)) throw fail('mode');
  return rpc<string>('admin_set_setting', { p_key: 'fund_donate_mode', p_value: mode });
}
export async function donorAccess(query: string): Promise<RpcRow<'admin_donor_access'>[]> {
  const q = String(query || '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).trim();   // i18n-ok: Bengali digits → English
  if (q && q.length < 3 && !/^\d+$/.test(q)) throw fail('short');                                     // "12" = ID TA-00012
  return list('admin_donor_access', { p_query: q || null });
}
export async function setDonorAccess(userId: string, status: 'allowed' | 'blocked' | null, note?: string | null): Promise<string | null> {
  if (status !== null && status !== 'allowed' && status !== 'blocked') throw fail('status');
  const n = String(note || '').trim();
  return rpc<string>('admin_set_donor_access', { p_user: userId, p_status: status, p_note: n || null });
}
const ACCESS: Record<string, string> = { get none() { return tr('— কিছু ঠিক করা নেই', '— Nothing set'); }, get requested() { return tr('⏳ অনুমতি চেয়েছেন', '⏳ Asked for permission'); }, get allowed() { return tr('✅ দান করতে পারবেন', '✅ Can donate'); }, get blocked() { return tr('🚫 দান বন্ধ', '🚫 Donations stopped'); } };
export const accessStatusText = (s: string): string => ACCESS[s] || s;

// Where donors send money: the fund's own account if set, else Travel Adda's normal payment account.
export async function fundPayInfo(): Promise<{ bank: string; bkash: string }> {
  const r = await supabase.from('app_settings').select('key,value').in('key', ['fund_bank', 'fund_bkash', 'pay_bank', 'pay_bkash']);
  if (r.error) throw r.error;
  const m: Record<string, string> = Object.fromEntries((r.data || []).map((x) => [x.key, x.value]));
  return { bank: m.fund_bank || m.pay_bank || '', bkash: m.fund_bkash || m.pay_bkash || '' };
}

// ---------- date choice and rules ----------
// The last n days (Bangladesh time), newest first: { ymd: '2026-10-31', label: 'আজ — ৩১ অক্টোবর ২০২৬' }.
export function recentDates(now: Date = new Date(), n = 60): { ymd: string; label: string }[] {
  const bd = new Date(now.getTime() + 6 * 3600000);     // Bangladesh is UTC+6 all year
  const out: { ymd: string; label: string }[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(Date.UTC(bd.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate() - i));
    const text = `${toBn(d.getUTCDate())} ${monthName(d.getUTCMonth())} ${toBn(d.getUTCFullYear())}`;
    out.push({ ymd: d.toISOString().slice(0, 10), label: i === 0 ? tr(`আজ — ${text}`, `Today — ${text}`) : i === 1 ? tr(`গতকাল — ${text}`, `Yesterday — ${text}`) : text });
  }
  return out;
}

// Shown on the fund page; sending a gift or an application means agreeing to these.
const RULES: readonly { label: string; en: string }[] = [
  { label: 'এটি সদকার তহবিল, যাকাতের নয়। যাকাতের টাকা এখানে দেবেন না।', en: 'This is a sadaqah fund, not a zakat fund. Do not give zakat money here.' },
  { label: 'দান শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে পাঠান। Travel Adda টাকা মিলিয়ে নিশ্চিত করলে তবেই মোট জমায় যোগ হয়।', en: 'Send gifts only to Travel Adda\'s official account. A gift is added to the total only after Travel Adda checks and confirms it.' },
  { label: 'দেওয়া সদকা ফেরত দেওয়া হয় না। ভুল করে বেশি বা ভুল নম্বরে পাঠালে সাথে সাথে হেল্পলাইনে জানান।', en: 'Sadaqah that has been given is not returned. If you sent too much or to a wrong number by mistake, tell the helpline at once.' },
  { label: 'কাকে, কখন, কত টাকা দেওয়া হবে, তা Travel Adda যাচাই করে ঠিক করে। প্রতিটি খরচ সবাই দেখতে পান।', en: 'Travel Adda checks and decides who gets money, when and how much. Everyone can see every spending.' },
  { label: 'দাতা ও আবেদনকারীর নাম দেখানো হয় কেবল তিনি রাজি হলে। ফোন নম্বর ও আবেদনের কারণ কখনো প্রকাশ্যে আসে না।', en: 'Donors\' and applicants\' names are shown only if they agree. Phone numbers and the reasons in applications are never made public.' },
  { label: 'দান করতে Travel Adda-র অনুমতি লাগতে পারে। অনুমতি না থাকলে "অনুমতি চাই" বোতাম চাপুন।', en: 'Donating may need Travel Adda\'s permission. Without permission, tap the "Ask for permission" button.' },
  { label: 'ভুয়া আবেদন বা ভুয়া লেনদেন নম্বর দিলে আবেদন বাতিল হবে এবং অ্যাকাউন্ট বন্ধ করা হতে পারে।', en: 'A fake application or a fake transaction number cancels the application, and the account may be closed.' },
];
export const fundRules = (): string[] => RULES.map(lbl);
