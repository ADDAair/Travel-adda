// Totals for hajis and leaders (supabase/032_public_counts.sql, owner choice Nov 2026).
//  - Hajis' Home: "১২,০০০+ হাজী 'আমি হাজী' অ্যাপ ব্যবহার করছেন" — a ROUNDED total, only after the admin's minimum is reached.
//  - Leader panel: the leader's own numbers (hajis in his groups, running contracts, call requests this month).
// Neither is ever allowed to break a page: on any failure they are simply not shown.
import { call } from './rpc';
import { tr } from './lang';
import { toBn, normalizeDigits } from './phone';

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const bnCount = (n: number): string => toBn(Math.round(n).toLocaleString('en-IN'));

export async function hajiCountPublic(): Promise<number | null> {
  try {
    const n = await call('haji_count_public');
    return n == null ? null : num(n);
  } catch (e) { return null; }   // offline or step 032 not run: no line
}
export const hajiCountText = (n: number | null | undefined): string | null =>
  (n ? tr(`${bnCount(n)}+ হাজী "আমি হাজী" অ্যাপ ব্যবহার করছেন`, `${n.toLocaleString('en-IN')}+ hajis are using the "Ami Haji" app`) : null);

// Admin's minimum: '' turns the line off; null = not a sensible whole number (1 … 10 কোটি).
export function cleanCountMin(v: unknown): string | null {
  const t = normalizeDigits(String(v ?? '')).replace(/[,\s]/g, '');
  if (t === '') return '';
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 100000000 ? String(n) : null;
}

export type LeaderStats = { hajis: number; contracts: number; callsMonth: number };
export async function leaderMyStats(): Promise<LeaderStats | null> {
  try {
    const d = await call('leader_my_stats');
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const o = d as Record<string, unknown>;
    return { hajis: num(o.hajis), contracts: num(o.contracts), callsMonth: num(o.calls_month) };
  } catch (e) { return null; }   // not an approved leader, offline, or step 032 not run: the card is hidden
}
