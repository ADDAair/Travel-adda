// One-line summary of the haji's trip for the Home card (the full card is on the "আমার সফর" page).
import { toBn } from './phone';

export const PASSPORT_WARN_DAYS = 183;   // a passport needs about 6 months left for Saudi Arabia

export type TripFacts = { hasContract: boolean; left: number | null; passport: boolean; visa: boolean; passLeft?: number | null };

export function tripSummary(f: TripFacts): string {
  const parts: string[] = [];
  if (f.left != null) parts.push(f.left > 0 ? `যাত্রার আর ${toBn(f.left)} দিন` : f.left === 0 ? 'আজ যাত্রার দিন' : 'সফর চলছে বা শেষ');
  parts.push(f.hasContract ? 'চুক্তি চালু' : 'চুক্তি নেই');
  parts.push(`কাগজ ${toBn((f.passport ? 1 : 0) + (f.visa ? 1 : 0))}/${toBn(2)}`);
  if (f.left == null) parts.push('তারিখ নেই');
  if (f.passLeft != null && f.passLeft < PASSPORT_WARN_DAYS) parts.push('পাসপোর্টের মেয়াদ কম');
  return parts.join(' · ');
}
