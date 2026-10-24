// Khadems and each group's private help chat with ready answers (supabase/018_khadem_help.sql).
// Every function throws on failure, so screens never show a false success.
import { supabase } from './supabase';
import { normalizeDigits, toBn } from './phone';

const check = (r) => { if (r.error) throw r.error; return r.data; };
const rpc = async (fn, args) => check(await supabase.rpc(fn, args));
const err = (code) => { const e = new Error(code); e.code = code; return e; };
export const MAX_MESSAGE = 1000;

// null = fine; otherwise the Bengali reason.
export function checkMessage(text) {
  const t = String(text || '').trim();
  if (!t) return 'কিছু লিখুন।';
  if (t.length > MAX_MESSAGE) return `লেখা অনেক বড়। ${toBn(MAX_MESSAGE)} অক্ষরের মধ্যে লিখুন।`;
  return null;
}

export function roleLabel(role, mine = false) {
  if (role === 'leader') return '🧭 লিডার';
  if (role === 'khadem') return '🤝 খাদেম';
  return mine ? '🕋 আপনি' : '🕋 হাজী';
}

// Waiting questions (last message from the haji, still open) first; inside each part newest first.
export function sortInbox(rows) {
  const rank = (r) => (r.status === 'closed' ? 2 : r.last_from_haji ? 0 : 1);
  return [...(rows || [])].sort((a, b) => rank(a) - rank(b) || Date.parse(b.last_at) - Date.parse(a.last_at));
}

export function helpErrorText(e) {
  const m = String((e && e.message) || '').toLowerCase();
  if (m.includes('too many')) return 'অল্প সময়ে অনেক বার্তা পাঠানো হয়েছে। একটু পরে আবার লিখুন।';
  if (m.includes('not a member')) return 'আপনি এখন এই দলে নেই, তাই এখানে লেখা যাবে না।';
  if (m.includes('not allowed')) return 'এই কাজের অনুমতি আপনার নেই। লিডার আপনাকে সরিয়ে দিয়ে থাকতে পারেন।';
  if (m.includes('bad message')) return 'বার্তাটি খালি বা অনেক বড়।';
  if (m.includes('fetch') || m.includes('network')) return 'ইন্টারনেট সংযোগ নেই বা দুর্বল। আপনার লেখা ঘরেই আছে, সংযোগ পেলে আবার পাঠান।';
  return 'কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।';
}

// ---- haji
export async function sendHelp(groupId, text) {
  if (checkMessage(text)) throw err('empty');
  return rpc('help_send', { p_group: groupId, p_body: String(text).trim() });
}
export const myHelpMessages = async (groupId) => (await rpc('help_my_messages', { p_group: groupId })) || [];
export const faqList = async (groupId) => (await rpc('faq_list', { p_group: groupId })) || [];
export const groupKhadems = async (groupId) => (await rpc('group_khadems', { p_group: groupId })) || [];

// ---- leader / khadem
export async function replyHelp(threadId, text) {
  if (checkMessage(text)) throw err('empty');
  return rpc('help_reply', { p_thread: threadId, p_body: String(text).trim() });
}
export const helpInbox = async (groupId) => sortInbox((await rpc('help_inbox', { p_group: groupId })) || []);
export const helpThread = async (threadId) => (await rpc('help_thread', { p_thread: threadId })) || [];
export const setThreadStatus = (threadId, status) => rpc('help_set_status', { p_thread: threadId, p_status: status });
export const myKhademGroups = async () => (await rpc('my_khadem_groups')) || [];
export const khademMembers = async (groupId) => (await rpc('khadem_group_members', { p_group: groupId })) || [];

// ---- leader only
export function addKhadem(groupId, ident) {
  let v = normalizeDigits(ident).trim().toUpperCase();
  if (/^T[AL]-?\d+$/.test(v)) v = v.replace(/^(T[AL])-?/, '$1-');
  else v = v.replace(/[^\d]/g, '').replace(/^880/, '0');
  return rpc('leader_add_khadem', { p_group: groupId, p_ident: v });
}
export const removeKhadem = (groupId, userId) => rpc('leader_remove_khadem', { p_group: groupId, p_user: userId });
// Invitation answers never say whether an account exists (server step 021).
export function khademResultText(r) {
  return {
    sent: 'অনুরোধ পাঠানো হয়েছে। এই নম্বর বা আইডিতে অ্যাকাউন্ট থাকলে তিনি নোটিফিকেশন পাবেন; রাজি হলে নিচের খাদেম তালিকায় নাম দেখাবে।',
    ok: 'খাদেম যোগ হয়েছে। তিনি নোটিফিকেশন পাবেন।',
    self: 'নিজেকে খাদেম করা যায় না, আপনি তো লিডার।',
    bad: 'আইডি (যেমন TA-00042) বা ১১ অঙ্কের মোবাইল নম্বর ঠিকভাবে লিখুন।',
    limit: 'আজ ৫০টি আমন্ত্রণ পাঠানো হয়ে গেছে। কাল আবার পাঠাতে পারবেন।',
  }[r] || 'কাজটি হয়নি। আবার চেষ্টা করুন।';
}
export function inviteResultText(r) {
  return {
    sent: 'আমন্ত্রণ পাঠানো হয়েছে। এই নম্বরে হাজীর অ্যাকাউন্ট থাকলে তিনি "আমার দল" পাতায় আমন্ত্রণ দেখবেন; রাজি হলে দলের তালিকায় নাম আসবে।',
    bad: '১১ অঙ্কের মোবাইল নম্বর ঠিকভাবে লিখুন (যেমন 01712345678)।',
    limit: 'আজ ৫০টি আমন্ত্রণ পাঠানো হয়ে গেছে। কাল আবার পাঠাতে পারবেন।',
  }[r] || 'কাজটি হয়নি। আবার চেষ্টা করুন।';
}
export const myKhademInvites = async () => (await rpc('my_khadem_invites')) || [];
export const khademRespond = async (groupId, accept) => rpc('khadem_respond', { p_group: groupId, p_accept: !!accept });
export const mySentInvites = async (groupId) => (await rpc('my_sent_invites', { p_group: groupId })) || [];
export const cancelInvite = async (id) => rpc('leader_cancel_invite', { p_id: id });
export async function saveFaq(groupId, id, question, answer) {
  const q = String(question || '').trim(); const a = String(answer || '').trim();
  if (q.length < 2 || a.length < 2) throw err('short');
  return rpc('leader_faq_save', { p_group: groupId, p_id: id || null, p_q: q, p_a: a });
}
export const deleteFaq = (id) => rpc('leader_faq_delete', { p_id: id });
