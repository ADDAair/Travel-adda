// One-line summary of the haji's trip for the Home card (the full card is on the "আমার সফর" page).
import { toBn } from './phone';
import { tr } from './lang';

export const PASSPORT_WARN_DAYS = 183;   // a passport needs about 6 months left for Saudi Arabia

export type TripFacts = { hasContract: boolean; left: number | null; passport: boolean; visa: boolean; passLeft?: number | null };

export function tripSummary(f: TripFacts): string {
  const parts: string[] = [];
  if (f.left != null) parts.push(f.left > 0 ? tr(`যাত্রার আর ${toBn(f.left)} দিন`, `${f.left} days to go`) : f.left === 0 ? tr('আজ যাত্রার দিন', 'travel day today') : tr('সফর চলছে বা শেষ', 'trip on or ended'));
  parts.push(f.hasContract ? tr('চুক্তি চালু', 'contract active') : tr('চুক্তি নেই', 'no contract'));
  parts.push(tr(`কাগজ ${toBn((f.passport ? 1 : 0) + (f.visa ? 1 : 0))}/${toBn(2)}`, `papers ${(f.passport ? 1 : 0) + (f.visa ? 1 : 0)}/2`));
  if (f.left == null) parts.push(tr('তারিখ নেই', 'no date'));
  if (f.passLeft != null && f.passLeft < PASSPORT_WARN_DAYS) parts.push(tr('পাসপোর্টের মেয়াদ কম', 'passport expires soon'));
  return parts.join(' · ');
}
