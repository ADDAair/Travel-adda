// The haji offer list when many leaders advertise (owner choice Nov 2026): short cards, two "special" cards on top
// and month buttons with a "from" price. Badges are worked out here from the packages themselves: never bought by a
// leader and never invented. Seats (034) are the number the leader gave, shown only while it is recent.
import { toBn } from './phone';

export const FEATURED_MIN = 4;     // special cards only when there are at least this many packages
export const MONTH_BAR_MIN = 11;   // month buttons only for more than 10 packages
export const NEW_DAYS = 7;         // "নতুন" for packages added in the last 7 days
export const SEATS_FEW = 10;       // "⏳ আসন বাকি" when this many seats or fewer are left
export const SEATS_FRESH_DAYS = 14; // a seat number older than this is not shown (it may be wrong by now)

export type Badge = 'cheap' | 'new' | 'seats' | 'full';
export const BADGE_TEXT: Record<Badge, string> = { cheap: '🏷️ সবচেয়ে কম দাম', new: '🆕 নতুন', seats: '⏳ আসন বাকি', full: '⛔ আসন শেষ' };

type Pkg = { id: string; price_bdt?: number | null; depart_on?: string | null; return_on?: string | null; created_at?: string | null;
  seats_left?: number | null; seats_updated_at?: string | null };
type Seats = { seats_left?: number | null; seats_updated_at?: string | null };

// Seats the leader said are left, or null when he did not say it in the last 14 days.
export function seatsNow(o: Seats, now: number = Date.now()): number | null {
  if (o.seats_left == null || !Number.isFinite(Number(o.seats_left))) return null;
  const t = Date.parse(String(o.seats_updated_at || ''));
  if (!Number.isFinite(t) || t > now + 60000 || now - t > SEATS_FRESH_DAYS * 86400000) return null;
  return Number(o.seats_left);
}
const full = (o: Pkg, now: number): boolean => seatsNow(o, now) === 0;
export const badgeText = (b: Badge, o?: Seats, now: number = Date.now()): string =>
  (b === 'seats' && o && seatsNow(o, now) != null ? `${BADGE_TEXT.seats} ${toBn(seatsNow(o, now))}টি` : BADGE_TEXT[b]);

const BN_MONTH = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const BN_SHORT = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগ', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];

const price = (o: Pkg): number => { const n = Number(o.price_bdt); return Number.isFinite(n) && n > 0 ? n : Infinity; };
const isNew = (o: Pkg, now: number): boolean => {
  const t = Date.parse(String(o.created_at || ''));
  return Number.isFinite(t) && t <= now && now - t <= NEW_DAYS * 86400000;
};

export function badgesFor<T extends Pkg>(rows: T[] | null | undefined, now: number = Date.now()): Record<string, Badge[]> {
  const list = rows || [];
  const open = list.filter((o) => !full(o, now));
  const min = Math.min(...open.map(price));
  const out: Record<string, Badge[]> = {};
  list.forEach((o) => {
    const b: Badge[] = [];
    const n = seatsNow(o, now);
    if (n === 0) { out[o.id] = ['full']; return; }
    if (list.length > 1 && Number.isFinite(min) && price(o) === min) b.push('cheap');
    if (isNew(o, now)) b.push('new');
    if (n != null && n <= SEATS_FEW) b.push('seats');
    if (b.length) out[o.id] = b;
  });
  return out;
}

export function featured<T extends Pkg>(rows: T[] | null | undefined, now: number = Date.now()): { o: T; why: Badge }[] {
  if ((rows || []).length < FEATURED_MIN) return [];
  const list = (rows || []).filter((o) => !full(o, now));
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

// The line on the package page: "৭টি আসন বাকি · লিডার জানিয়েছেন ৩ নভেম্বর" (empty when not said recently).
export function seatsLine(o: Seats, now: number = Date.now()): string {
  const n = seatsNow(o, now);
  if (n == null) return '';
  const d = new Date(String(o.seats_updated_at));
  const when = `${toBn(d.getDate())} ${BN_MONTH[d.getMonth()]}`;   // the phone's own day (Bangladesh)
  return `${n === 0 ? 'সব আসন শেষ' : `${toBn(n)}টি আসন বাকি`} · লিডার জানিয়েছেন ${when}`;
}
