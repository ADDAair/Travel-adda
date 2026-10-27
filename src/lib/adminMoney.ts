// Money alerts and service costs for Travel Adda's own leaders (supabase/026_admin_part4.sql).
import { notReady } from './groups';
import { parsePrice } from './offerRoute';
import { normalizeDigits } from './phone';
import { rpc, fail } from './rpc';

export type AlertKind = 'haji_due' | 'leader_due' | 'not_closed';
export type MoneyAlert = { kind: AlertKind; contract_id: string; contract_no: string; haji_name: string; haji_code: string;
  leader_name: string; leader_code: string; travel_from: string | null; travel_to: string | null; amount: number | string };

const ALERTS: Record<AlertKind, string> = {
  haji_due: '⏳ যাত্রা কাছে, হাজীর টাকা বাকি',
  leader_due: '↗️ লিডারকে তাঁর অংশ দেওয়া বাকি',
  not_closed: '📕 সফর শেষ, কিন্তু হিসাব বন্ধ হয়নি',
};
export const alertText = (k: string): string => ALERTS[k as AlertKind] || k;
export async function moneyAlerts(): Promise<MoneyAlert[]> {
  try { return (await rpc<MoneyAlert[]>('admin_money_alerts')) || []; } catch (e) { if (notReady(e)) return []; throw e; }
}

export type ServiceKind = 'visa' | 'ticket' | 'hotel' | 'transport' | 'food' | 'ziyarah' | 'other';
export const SERVICE_KINDS: ReadonlyArray<{ id: ServiceKind; label: string; icon: string }> = [
  { id: 'visa', label: 'ভিসা', icon: '🛂' },
  { id: 'ticket', label: 'বিমান টিকিট', icon: '✈️' },
  { id: 'hotel', label: 'হোটেল', icon: '🏨' },
  { id: 'transport', label: 'গাড়ি / যাতায়াত', icon: '🚌' },
  { id: 'food', label: 'খাবার', icon: '🍽️' },
  { id: 'ziyarah', label: 'যিয়ারত', icon: '🕌' },
  { id: 'other', label: 'অন্যান্য', icon: '📦' },
];
export const serviceKindLabel = (id: string): string => { const k = SERVICE_KINDS.find((x) => x.id === id); return k ? `${k.icon} ${k.label}` : id; };

// contractId empty = a cost for the leader's whole group
export async function addServiceCost(leaderId: string, contractId: string | null | undefined, kind: string, amount: unknown, note: unknown): Promise<string | null> {
  const a = parsePrice(amount);
  if (!Number.isFinite(a) || !(a > 0)) throw fail('amount');
  if (!SERVICE_KINDS.some((k) => k.id === kind)) throw fail('kind');
  const n = String(note || '').trim();
  if (n.length < 3) throw fail('note');
  return rpc<string>('admin_add_service_cost', { p_leader: leaderId, p_contract: contractId || null, p_kind: kind, p_amount: a, p_note: n });
}
const SERVICE_RESULTS: Record<string, string> = {
  ok: '✅ খরচ লেখা হয়েছে। লিডারের পাওনা থেকে কাটা যাবে।',
  not_own: 'এই খরচ শুধু Travel Adda-র নিজস্ব লিডারের জন্য লেখা যায়।',
  mismatch: 'এই চুক্তিটি এই লিডারের নয়। সঠিক চুক্তি বাছুন।',
};
export const serviceResultText = (r: string | null): string => (r && SERVICE_RESULTS[r]) || 'কাজটি হয়নি।';

export async function deleteServiceCost(id: string, reason: unknown): Promise<string | null> {
  const r = String(reason || '').trim();
  if (r.length < 5) throw fail('reason');
  return rpc<string>('admin_delete_service_cost', { p_id: id, p_reason: r });
}
export type ServiceCost = { id: string; contract_id: string | null; contract_no: string | null; haji_name: string | null; kind: ServiceKind;
  amount: number | string; note: string; created_at: string; created_by_name: string | null };
export const serviceCosts = async (leaderId: string): Promise<ServiceCost[]> => (await rpc<ServiceCost[]>('admin_service_costs', { p_leader: leaderId })) || [];

export type LeaderBalance = { due_total: number; group_costs: number; net: number };
type BalanceRow = { due_total?: number | string; group_costs?: number | string; net?: number | string };
export async function leaderBalance(leaderId: string): Promise<LeaderBalance> {
  const d = await rpc<BalanceRow[] | BalanceRow>('admin_leader_balance', { p_leader: leaderId });
  const r: BalanceRow = (Array.isArray(d) ? d[0] : d) || {};
  return { due_total: Number(r.due_total || 0), group_costs: Number(r.group_costs || 0), net: Number(r.net || 0) };
}

// Contracts a single-haji cost can go on: this leader's running or finished contracts, newest travel first.
// q = search by haji name, haji ID or contract number (Bengali digits allowed).
export type LedgerRow = { contract_id: string; leader_id: string; status: string; contract_no: string; haji_name: string; haji_code: string; travel_from?: string | null };
export function contractChoices(ledgerRows: LedgerRow[] | null | undefined, leaderId: string, q = ''): { id: string; label: string }[] {
  const key = (v: unknown): string => normalizeDigits(String(v || '')).toLowerCase();
  const k = key(q).trim();
  return (ledgerRows || [])
    .filter((c) => c.leader_id === leaderId && (c.status === 'accepted' || c.status === 'completed'))
    .filter((c) => !k || [c.haji_name, c.haji_code, c.contract_no].some((v) => key(v).includes(k)))
    .sort((a, b) => String(b.travel_from || '').localeCompare(String(a.travel_from || '')))
    .map((c) => ({ id: c.contract_id, label: `🕋 ${c.haji_name} (${c.haji_code}) · ${c.contract_no}` }));
}
