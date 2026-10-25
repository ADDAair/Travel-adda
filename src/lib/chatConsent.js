// Reading a haji's help chat during a dispute — only after the haji agrees (supabase/024_admin_part3.sql).
// The database decides; this file only calls it and turns answers into plain Bengali.
import { supabase } from './supabase';
import { notReady } from './groups';

const check = (r) => { if (r.error) throw r.error; return r.data; };
const rpc = async (fn, args) => check(await supabase.rpc(fn, args));
const fail = (code) => Object.assign(new Error(code), { code });

// --- admin side
export async function requestChatConsent(contractId, reason) {
  const r = String(reason || '').trim();
  if (r.length < 5) throw fail('reason');
  return rpc('admin_request_chat_consent', { p_contract: contractId, p_reason: r });
}
export const adminChatConsents = async (contractId) => (await rpc('admin_chat_consents', { p_contract: contractId })) || [];
export const viewHelpChat = async (consentId) => (await rpc('admin_view_help_chat', { p_consent: consentId })) || [];

export const requestResultText = (r) => (r === 'sent'
  ? '✅ অনুমতি চেয়ে হাজীর কাছে নোটিফিকেশন পাঠানো হয়েছে। তিনি রাজি হলে এখানে "দেখুন" বোতাম আসবে।'
  : r === 'exists' ? 'এই চুক্তির জন্য আগেই অনুমতি চাওয়া হয়েছে বা অনুমতি চালু আছে।' : 'কাজটি হয়নি।');

export function consentStatusText(k) {
  if (!k) return '';
  if (k.status === 'asked') return '⏳ হাজীর উত্তরের অপেক্ষায়';
  if (k.status === 'granted') return k.active ? '✅ হাজী অনুমতি দিয়েছেন (৭ দিনের জন্য)' : '⌛ অনুমতির মেয়াদ শেষ';
  if (k.status === 'declined') return '✖️ হাজী রাজি হননি';
  if (k.status === 'revoked') return '↩️ হাজী অনুমতি ফিরিয়ে নিয়েছেন';
  return k.status;
}

// --- haji side
export async function myChatConsents() {
  try { return (await rpc('my_chat_consents')) || []; } catch (e) { if (notReady(e)) return []; throw e; }
}
export async function respondConsent(id, accept) {
  const r = await rpc('chat_consent_respond', { p_id: id, p_accept: !!accept });
  if (r !== 'ok') throw fail('not_found');
  return r;
}
export async function revokeConsent(id) {
  const r = await rpc('chat_consent_revoke', { p_id: id });
  if (r !== 'ok') throw fail('not_found');
  return r;
}
