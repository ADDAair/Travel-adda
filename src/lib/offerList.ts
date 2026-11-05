// The haji offer list when many leaders advertise (owner choice Nov 2026): short cards, two "special" cards on top
// and month buttons with a "from" price. Badges are worked out here from the packages themselves: never bought by a
// leader and never invented (no "seats limited" until leaders can enter real seat numbers).
import { toBn } from './phone';

export const FEATURED_MIN = 4;     // special cards only when there are at least this many packages
export const MONTH_BAR_MIN = 11;   // month buttons only for more than 10 packages
export const NEW_DAYS = 7;         // "নতুন" for packages added in the last 7 days

export type Badge = 'cheap' | 'new';
export const BADGE_TEXT: Record<Badge, string> = { cheap: '🏷️ সবচেয়ে কম দাম', new: '🆕 নতুন' };

type Pkg = { id: string; price_bdt?: number | null; depart_on?: string | null; return_on?: string | null; created_at?: string | null };

const BN_MONTH = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const BN_SHORT = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগ', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];

const price = (o: Pkg): number => { const n = Number(o.price_bdt); return Number.isFinite(n) && n > 0 ? n : Infinity; };
const isNew = (o: Pkg, now: number): boolean => {
  const t = Date.parse(String(o.created_at || ''));
  return Number.isFinite(t) && t <= now && now - t <= NEW_DAYS * 86400000;
};

export function badgesFor<T extends Pkg>(rows: T[] | null | undefined, now: number = Date.now()): Record<string, Badge[]> {
  const list = rows || [];
  const min = Math.min(...list.map(price));
  const out: Record<string, Badge[]> = {};
  list.forEach((o) => {
    const b: Badge[] = [];
    if (list.length > 1 && Number.isFinite(min) && price(o) === min) b.push('cheap');
    if (isNew(o, now)) b.push('new');
    if (b.length) out[o.id] = b;
  });
  return out;
}

export function featured<T extends Pkg>(rows: T[] | null | undefined, now: number = Date.now()): { o: T; why: Badge }[] {
  const list = rows || [];
  if (list.length < FEATURED_MIN) return [];
  const cheap = [...list].sort((a, b) => price(a) - price(b))[0];
  const out: { o: T; why: Badge }[] = cheap && Number.isFinite(price(cheap)) ? [{ o: cheap, why: 'cheap' }] : [];
  const fresh = list.filter((o) => o !== cheap && isNew(o, now)).sort((a, b) => Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)))[0];
  if (fresh) out.push({ o: fresh, why: 'new' });
  return out;
}

export function monthBar<T extends Pkg>(rows: T[] | null | undefined): { id: string; label: string; count: number; from: number }[] {
  const list = rows || [];
  if (list.length < MONTH_BAR_MIN) return [];
  const m: Record<string, { count: number; from: number }> = {};
  list.forEach((o) => {
    const id = String(o.depart_on || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(id)) return;
    const x = m[id] || (m[id] = { count: 0, from: Infinity });
    x.count += 1; x.from = Math.min(x.from, price(o));
  });
  const ids = Object.keys(m).sort();
  if (ids.length < 2) return [];
  return ids.map((id) => ({ id, label: `${BN_MONTH[Number(id.slice(5)) - 1]} ${toBn(id.slice(0, 4))}`, count: m[id].count, from: m[id].from }));
}

const dm = (iso: string | null | undefined): string => {
  const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return x ? `${toBn(Number(x[3]))} ${BN_SHORT[Number(x[2]) - 1]}` : '';
};
export const shortDates = (o: { depart_on?: string | null; return_on?: string | null }): string => {
  const a = dm(o.depart_on); const b = dm(o.return_on);
  return a && b ? `${a} – ${b}` : a;
};
export const nightsText = (o: { makkah_nights?: number | null; madinah_nights?: number | null }): string =>
  [o.makkah_nights ? `মক্কা ${toBn(o.makkah_nights)} রাত` : '', o.madinah_nights ? `মদিনা ${toBn(o.madinah_nights)} রাত` : ''].filter(Boolean).join(' · ');
export const walkText = (m: number | null | undefined, place = 'হারাম'): string =>
  (m == null ? '' : m >= 1000 ? `${place} থেকে ${toBn(Number((m / 1000).toFixed(1)))} কিমি` : `${place} থেকে ${toBn(m)} মিটার`);
