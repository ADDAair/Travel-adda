// Reading a haji's help chat during a dispute — only after the haji agrees (supabase/024_admin_part3.sql).
// The database decides; this file only calls it and turns answers into plain Bengali.
import { notReady } from './groups';
import { rpc, fail } from './rpc';

export type ConsentStatus = 'asked' | 'granted' | 'declined' | 'revoked';
export type AdminConsent = { id: string; status: ConsentStatus; reason: string; created_at: string; answered_at: string | null; expires_at: string | null; active: boolean };
export type MyConsent = { id: string; contract_no: string; leader_name: string; reason: string; status: ConsentStatus; created_at: string; expires_at: string | null };
export type ChatLine = { group_name: string; sender_role: 'haji' | 'leader' | 'khadem'; sender_name: string; body: string; created_at: string };

// --- admin side
export async function requestChatConsent(contractId: string, reason: unknown): Promise<string | null> {
  const r = String(reason || '').trim();
  if (r.length < 5) throw fail('reason');
  return rpc<string>('admin_request_chat_consent', { p_contract: contractId, p_reason: r });
}
export const adminChatConsents = async (contractId: string): Promise<AdminConsent[]> => (await rpc<AdminConsent[]>('admin_chat_consents', { p_contract: contractId })) || [];
export const viewHelpChat = async (consentId: string): Promise<ChatLine[]> => (await rpc<ChatLine[]>('admin_view_help_chat', { p_consent: consentId })) || [];

export const requestResultText = (r: string | null): string => (r === 'sent'
  ? '✅ অনুমতি চেয়ে হাজীর কাছে নোটিফিকেশন পাঠানো হয়েছে। তিনি রাজি হলে এখানে "দেখুন" বোতাম আসবে।'
  : r === 'exists' ? 'এই চুক্তির জন্য আগেই অনুমতি চাওয়া হয়েছে বা অনুমতি চালু আছে।' : 'কাজটি হয়নি।');

export function consentStatusText(k: { status: string; active?: boolean } | null | undefined): string {
  if (!k) return '';
  if (k.status === 'asked') return '⏳ হাজীর উত্তরের অপেক্ষায়';
  if (k.status === 'granted') return k.active ? '✅ হাজী অনুমতি দিয়েছেন (৭ দিনের জন্য)' : '⌛ অনুমতির মেয়াদ শেষ';
  if (k.status === 'declined') return '✖️ হাজী রাজি হননি';
  if (k.status === 'revoked') return '↩️ হাজী অনুমতি ফিরিয়ে নিয়েছেন';
  return k.status;
}

// --- haji side
export async function myChatConsents(): Promise<MyConsent[]> {
  try { return (await rpc<MyConsent[]>('my_chat_consents')) || []; } catch (e) { if (notReady(e)) return []; throw e; }
}
export async function respondConsent(id: string, accept: boolean): Promise<string> {
  const r = await rpc<string>('chat_consent_respond', { p_id: id, p_accept: !!accept });
  if (r !== 'ok') throw fail('not_found');
  return r;
}
export async function revokeConsent(id: string): Promise<string> {
  const r = await rpc<string>('chat_consent_revoke', { p_id: id });
  if (r !== 'ok') throw fail('not_found');
  return r;
}
