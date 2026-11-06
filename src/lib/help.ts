// Khadems and each group's private help chat with ready answers (supabase/018_khadem_help.sql).
// Every function throws on failure, so screens never show a false success.
import { normalizeDigits, toBn } from './phone';
import { tr } from './lang';

import { rpc, fail as err, rows } from './rpc';

const list = rows;      // typed by the function name (src/lib/dbTypes.ts)
export const MAX_MESSAGE = 1000;

// null = fine; otherwise the Bengali reason.
export function checkMessage(text: unknown): string | null {
  const t = String(text || '').trim();
  if (!t) return tr('কিছু লিখুন।', 'Write something.');
  if (t.length > MAX_MESSAGE) return tr(`লেখা অনেক বড়। ${toBn(MAX_MESSAGE)} অক্ষরের মধ্যে লিখুন।`, `The text is too long. Write within ${MAX_MESSAGE} letters.`);
  return null;
}

export function roleLabel(role: string, mine = false): string {
  if (role === 'leader') return tr('🧭 লিডার', '🧭 Leader');
  if (role === 'khadem') return tr('🤝 খাদেম', '🤝 Khadem');
  return mine ? tr('🕋 আপনি', '🕋 You') : tr('🕋 হাজী', '🕋 Haji');
}

// Waiting questions (last message from the haji, still open) first; inside each part newest first.
export function sortInbox<T extends { status: string; last_from_haji?: boolean | null; last_at?: string | null }>(rows: T[] | null | undefined): T[] {
  const rank = (r: T): number => (r.status === 'closed' ? 2 : r.last_from_haji ? 0 : 1);
  return [...(rows || [])].sort((a, b) => rank(a) - rank(b) || Date.parse(b.last_at || '') - Date.parse(a.last_at || ''));
}

export function helpErrorText(e: unknown): string {
  const m = String(((e || {}) as { message?: unknown }).message || '').toLowerCase();
  if (m.includes('too many')) return tr('অল্প সময়ে অনেক বার্তা পাঠানো হয়েছে। একটু পরে আবার লিখুন।', 'Too many messages in a short time. Write again a little later.');
  if (m.includes('not a member')) return tr('আপনি এখন এই দলে নেই, তাই এখানে লেখা যাবে না।', 'You are no longer in this group, so you cannot write here.');
  if (m.includes('not allowed')) return tr('এই কাজের অনুমতি আপনার নেই। লিডার আপনাকে সরিয়ে দিয়ে থাকতে পারেন।', 'You are not allowed to do this. The leader may have removed you.');
  if (m.includes('bad message')) return tr('বার্তাটি খালি বা অনেক বড়।', 'The message is empty or too long.');
  if (m.includes('fetch') || m.includes('network')) return tr('ইন্টারনেট সংযোগ নেই বা দুর্বল। আপনার লেখা ঘরেই আছে, সংযোগ পেলে আবার পাঠান।', 'No or weak internet. Your text is still in the box; send it again when connected.');
  return tr('কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।', 'It did not work. Try again a little later.');
}

// ---- haji
export async function sendHelp(groupId: string, text: unknown) {
  if (checkMessage(text)) throw err('empty');
  return rpc<string>('help_send', { p_group: groupId, p_body: String(text).trim() });
}
export const myHelpMessages = (groupId: string) => list('help_my_messages', { p_group: groupId });
export const faqList = (groupId: string) => list('faq_list', { p_group: groupId });
export const groupKhadems = (groupId: string) => list('group_khadems', { p_group: groupId });

// ---- leader / khadem
export async function replyHelp(threadId: string, text: unknown) {
  if (checkMessage(text)) throw err('empty');
  return rpc<string>('help_reply', { p_thread: threadId, p_body: String(text).trim() });
}
export const helpInbox = async (groupId: string) => sortInbox(await list('help_inbox', { p_group: groupId }));
export const helpThread = (threadId: string) => list('help_thread', { p_thread: threadId });
export const setThreadStatus = (threadId: string, status: 'open' | 'closed') => rpc('help_set_status', { p_thread: threadId, p_status: status });
export const myKhademGroups = () => list('my_khadem_groups');
export const khademMembers = (groupId: string) => list('khadem_group_members', { p_group: groupId });

// ---- leader only
export function addKhadem(groupId: string, ident: unknown) {
  let v = normalizeDigits(String(ident ?? '')).trim().toUpperCase();
  if (/^T[AL]-?\d+$/.test(v)) v = v.replace(/^(T[AL])-?/, '$1-');
  else v = v.replace(/[^\d]/g, '').replace(/^880/, '0');
  return rpc<string>('leader_add_khadem', { p_group: groupId, p_ident: v });
}
export const removeKhadem = (groupId: string, userId: string) => rpc('leader_remove_khadem', { p_group: groupId, p_user: userId });
// Invitation answers never say whether an account exists (server step 021).
export function khademResultText(r: string | null): string {
  return ({
    sent: tr('অনুরোধ পাঠানো হয়েছে। এই নম্বর বা আইডিতে অ্যাকাউন্ট থাকলে তিনি নোটিফিকেশন পাবেন; রাজি হলে নিচের খাদেম তালিকায় নাম দেখাবে।', 'Request sent. If this number or ID has an account, they will get a notification; if they agree, the name shows in the khadem list below.'),
    ok: tr('খাদেম যোগ হয়েছে। তিনি নোটিফিকেশন পাবেন।', 'Khadem added. They will get a notification.'),
    self: tr('নিজেকে খাদেম করা যায় না, আপনি তো লিডার।', 'You cannot make yourself a khadem; you are the leader.'),
    bad: tr('আইডি (যেমন TA-00042) বা ১১ অঙ্কের মোবাইল নম্বর ঠিকভাবে লিখুন।', 'Write the ID (e.g. TA-00042) or the 11-digit mobile number correctly.'),
    limit: tr('আজ ৫০টি আমন্ত্রণ পাঠানো হয়ে গেছে। কাল আবার পাঠাতে পারবেন।', '50 invitations have been sent today. You can send more tomorrow.'),
  } as Record<string, string>)[r || ''] || tr('কাজটি হয়নি। আবার চেষ্টা করুন।', 'It did not work. Try again.');
}
export function inviteResultText(r: string | null): string {
  return ({
    sent: tr('আমন্ত্রণ পাঠানো হয়েছে। এই নম্বরে হাজীর অ্যাকাউন্ট থাকলে তিনি "আমার দল" পাতায় আমন্ত্রণ দেখবেন; রাজি হলে দলের তালিকায় নাম আসবে।', 'Invitation sent. If this number has a haji account, they will see it on the "My group" page; if they agree, the name joins the group list.'),
    bad: tr('১১ অঙ্কের মোবাইল নম্বর ঠিকভাবে লিখুন (যেমন 01712345678)।', 'Write the 11-digit mobile number correctly (e.g. 01712345678).'),
    limit: tr('আজ ৫০টি আমন্ত্রণ পাঠানো হয়ে গেছে। কাল আবার পাঠাতে পারবেন।', '50 invitations have been sent today. You can send more tomorrow.'),
  } as Record<string, string>)[r || ''] || tr('কাজটি হয়নি। আবার চেষ্টা করুন।', 'It did not work. Try again.');
}
export const myKhademInvites = () => list('my_khadem_invites');
export const khademRespond = async (groupId: string, accept: boolean) => rpc<string>('khadem_respond', { p_group: groupId, p_accept: !!accept });
export const mySentInvites = (groupId: string) => list('my_sent_invites', { p_group: groupId });
export const cancelInvite = async (id: string) => rpc<string>('leader_cancel_invite', { p_id: id });
export async function saveFaq(groupId: string, id: string | null, question: unknown, answer: unknown) {
  const q = String(question || '').trim(); const a = String(answer || '').trim();
  if (q.length < 2 || a.length < 2) throw err('short');
  return rpc('leader_faq_save', { p_group: groupId, p_id: id || null, p_q: q, p_a: a });
}
export const deleteFaq = (id: string) => rpc('leader_faq_delete', { p_id: id });
