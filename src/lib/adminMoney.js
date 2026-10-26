// Money alerts and service costs for Travel Adda's own leaders (supabase/026_admin_part4.sql).
import { supabase } from './supabase';
import { notReady } from './groups';
import { parsePrice } from './offerRoute';

const check = (r) => { if (r.error) throw r.error; return r.data; };
const rpc = async (fn, args) => check(await supabase.rpc(fn, args));
const fail = (code) => Object.assign(new Error(code), { code });

const ALERTS = {
  haji_due: '⏳ যাত্রা কাছে, হাজীর টাকা বাকি',
  leader_due: '↗️ লিডারকে তাঁর অংশ দেওয়া বাকি',
  not_closed: '📕 সফর শেষ, কিন্তু হিসাব বন্ধ হয়নি',
};
export const alertText = (k) => ALERTS[k] || k;
export async function moneyAlerts() {
  try { return (await rpc('admin_money_alerts')) || []; } catch (e) { if (notReady(e)) return []; throw e; }
}

export const SERVICE_KINDS = [
  { id: 'visa', label: 'ভিসা', icon: '🛂' },
  { id: 'ticket', label: 'বিমান টিকিট', icon: '✈️' },
  { id: 'hotel', label: 'হোটেল', icon: '🏨' },
  { id: 'transport', label: 'গাড়ি / যাতায়াত', icon: '🚌' },
  { id: 'food', label: 'খাবার', icon: '🍽️' },
  { id: 'ziyarah', label: 'যিয়ারত', icon: '🕌' },
  { id: 'other', label: 'অন্যান্য', icon: '📦' },
];
export const serviceKindLabel = (id) => { const k = SERVICE_KINDS.find((x) => x.id === id); return k ? `${k.icon} ${k.label}` : id; };

// contractId empty = a cost for the leader's whole group
export async function addServiceCost(leaderId, contractId, kind, amount, note) {
  const a = parsePrice(amount);
  if (!Number.isFinite(a) || !(a > 0)) throw fail('amount');
  if (!SERVICE_KINDS.some((k) => k.id === kind)) throw fail('kind');
  const n = String(note || '').trim();
  if (n.length < 3) throw fail('note');
  return rpc('admin_add_service_cost', { p_leader: leaderId, p_contract: contractId || null, p_kind: kind, p_amount: a, p_note: n });
}
export const serviceResultText = (r) => ({
  ok: '✅ খরচ লেখা হয়েছে। লিডারের পাওনা থেকে কাটা যাবে।',
  not_own: 'এই খরচ শুধু Travel Adda-র নিজস্ব লিডারের জন্য লেখা যায়।',
  mismatch: 'এই চুক্তিটি এই লিডারের নয়। সঠিক চুক্তি বাছুন।',
}[r] || 'কাজটি হয়নি।');

export async function deleteServiceCost(id, reason) {
  const r = String(reason || '').trim();
  if (r.length < 5) throw fail('reason');
  return rpc('admin_delete_service_cost', { p_id: id, p_reason: r });
}
export const serviceCosts = async (leaderId) => (await rpc('admin_service_costs', { p_leader: leaderId })) || [];
export async function leaderBalance(leaderId) {
  const d = await rpc('admin_leader_balance', { p_leader: leaderId });
  const r = (Array.isArray(d) ? d[0] : d) || {};
  return { due_total: Number(r.due_total || 0), group_costs: Number(r.group_costs || 0), net: Number(r.net || 0) };
}
