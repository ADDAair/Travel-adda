// Speed check from this phone: how long the app's common server calls take on this phone and this internet.
// Read-only calls only. Used by the admin panel to find out why loading feels slow.
import { toBn } from './phone';

export type Timing = { times: number[]; median: number | null; errors: number };
type Answer = { error?: unknown } | null | undefined;

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Runs fn n times one after another. A failed call is counted, never thrown.
export async function timeCall(fn: () => PromiseLike<Answer>, n = 3, now: () => number = () => Date.now()): Promise<Timing> {
  const times: number[] = []; let errors = 0;
  for (let i = 0; i < n; i += 1) {
    const t = now();
    try { const r = await fn(); times.push(now() - t); if (r && r.error) errors += 1; } catch (e) { errors += 1; }
  }
  const ok = times.length && errors < n ? times : [];
  return { times, median: median(ok), errors };
}

export type Verdict = 'fast' | 'okay' | 'slow' | 'failed';
export const speedVerdict = (ms: number | null): Verdict => (ms == null ? 'failed' : ms < 500 ? 'fast' : ms < 1200 ? 'okay' : 'slow');

export function speedText(t: { median: number | null; errors: number }): string {
  const v = speedVerdict(t.errors && t.median == null ? null : t.median);
  if (v === 'failed') return '❌ হয়নি (ইন্টারনেট বা সার্ভারে সমস্যা)';
  const sec = toBn(((t.median || 0) / 1000).toFixed(1));
  const label = v === 'fast' ? '✅ দ্রুত' : v === 'okay' ? '🟡 চলনসই' : '🐢 ধীর';
  return `${label} — ${sec} সেকেন্ড${t.errors ? ` (${toBn(t.errors)} বার ব্যর্থ)` : ''}`;
}
