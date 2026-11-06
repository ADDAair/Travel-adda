// Package journey (supabase/020_offer_route.sql), leader search and filters on the Offers page. No network here.
import { toBn, normalizeDigits } from './phone';
import { tr, lbl, monthName } from './lang';

// The package fields this file reads (a haji's list row, a leader's own row or an admin row all have them).
type Offer = {
  from_airport?: string | null; arrive_at?: string | null; first_city?: string | null; makkah_nights?: number | null; madinah_nights?: number | null;
  return_from?: string | null; return_to?: string | null; airline?: string | null; depart_on?: string | null; return_on?: string | null;
  price_bdt?: number | null; title?: string | null; leader_name?: string | null; leader_code?: string | null; agency_name?: string | null;
};
export type RouteForm = { from?: string; arrive?: string; first?: string; mk?: unknown; md?: unknown; back?: string; to?: string; airline?: string | null };
export type RouteStep = { icon: string; title: string; text: string; when?: string };

export const AIRPORTS_BD = [
  { id: 'DAC', label: 'ঢাকা', full: 'হযরত শাহজালাল আন্তর্জাতিক বিমানবন্দর, ঢাকা', en: 'Dhaka', fullEn: 'Hazrat Shahjalal International Airport, Dhaka' },
  { id: 'CGP', label: 'চট্টগ্রাম', full: 'শাহ আমানত আন্তর্জাতিক বিমানবন্দর, চট্টগ্রাম', en: 'Chattogram', fullEn: 'Shah Amanat International Airport, Chattogram' },
  { id: 'ZYL', label: 'সিলেট', full: 'ওসমানী আন্তর্জাতিক বিমানবন্দর, সিলেট', en: 'Sylhet', fullEn: 'Osmani International Airport, Sylhet' },
];
export const AIRPORTS_SA = [
  { id: 'JED', label: 'জেদ্দা', full: 'কিং আবদুল আজিজ বিমানবন্দর, জেদ্দা', en: 'Jeddah', fullEn: 'King Abdulaziz Airport, Jeddah' },
  { id: 'MED', label: 'মদিনা', full: 'প্রিন্স মোহাম্মদ বিন আবদুল আজিজ বিমানবন্দর, মদিনা', en: 'Madinah', fullEn: 'Prince Mohammad bin Abdulaziz Airport, Madinah' },
];
export const CITIES = [
  { id: 'makkah', label: 'মক্কা', icon: '🕋', en: 'Makkah' },
  { id: 'madinah', label: 'মদিনা', icon: '🕌', en: 'Madinah' },
];
export const PRICE_LIMITS = [150000, 200000, 300000];

const name = (list: readonly { id: string; label: string; en?: string }[], id: string | null | undefined): string => lbl(list.find((a) => a.id === id));
const nights = (n: number): string => tr(`${toBn(n)} রাত`, `${n} night${n === 1 ? '' : 's'}`);
export const hasRoute = (o: Offer | null | undefined): boolean => !!(o && o.from_airport && o.makkah_nights != null);

function cityOrder(o: Offer): { c: string; n: number }[] {
  const order = o.first_city === 'madinah' ? ['madinah', 'makkah'] : ['makkah', 'madinah'];
  return order.map((c) => ({ c, n: Number((c === 'makkah' ? o.makkah_nights : o.madinah_nights) || 0) })).filter((x) => x.n > 0);
}

// Steps in travel order: fly out, each holy city with its nights, fly home.
export function routeSteps(o: Offer): RouteStep[] | null {
  if (!hasRoute(o)) return null;
  const out: RouteStep[] = [{ icon: '🛫', title: tr('যাত্রা শুরু', 'Departure'), text: tr(`${name(AIRPORTS_BD, o.from_airport)} থেকে ${name(AIRPORTS_SA, o.arrive_at)}${o.airline ? ` · ${o.airline}` : ''}`, `${name(AIRPORTS_BD, o.from_airport)} to ${name(AIRPORTS_SA, o.arrive_at)}${o.airline ? ` · ${o.airline}` : ''}`), when: o.depart_on || undefined }];
  cityOrder(o).forEach(({ c, n }) => {
    const city = CITIES.find((x) => x.id === c);
    if (city) out.push({ icon: city.icon, title: lbl(city), text: tr(`${nights(n)} থাকা`, `${nights(n)} stay`) });
  });
  out.push({ icon: '🛬', title: tr('দেশে ফেরা', 'Return home'), text: tr(`${name(AIRPORTS_SA, o.return_from)} থেকে ${name(AIRPORTS_BD, o.return_to)}`, `${name(AIRPORTS_SA, o.return_from)} to ${name(AIRPORTS_BD, o.return_to)}`), when: o.return_on || undefined });
  return out;
}

export function routeShort(o: Offer): string {
  if (!hasRoute(o)) return tr('যাত্রাপথ উল্লেখ নেই', 'Route not given');
  const mid = cityOrder(o).map(({ c, n }) => `${name(CITIES, c)} ${nights(n)}`);
  return [name(AIRPORTS_BD, o.from_airport), ...mid, name(AIRPORTS_BD, o.return_to)].join(' → ');
}

const int = (v: unknown): number | null => { const t = normalizeDigits(String(v ?? '')).trim(); return t === '' ? null : /^\d+$/.test(t) ? Number(t) : NaN; };

// Form check. r = { from, arrive, first, mk, md, back, to }; days = whole trip length in days.
export function checkRoute(r: RouteForm, days: number): Record<string, string> {
  const e: Record<string, string> = {};
  if (!r.from) e.from = tr('কোন বিমানবন্দর থেকে যাত্রা শুরু, বাছাই করুন।', 'Choose the airport you leave from.');
  if (!r.arrive) e.arrive = tr('সৌদিতে কোথায় নামবেন, বাছাই করুন।', 'Choose where you land in Saudi Arabia.');
  if (!r.first) e.first = tr('আগে মক্কা না মদিনা, বাছাই করুন।', 'Choose Makkah or Madinah first.');
  if (!r.back) e.back = tr('সৌদির কোন বিমানবন্দর থেকে ফিরবেন, বাছাই করুন।', 'Choose the Saudi airport you return from.');
  if (!r.to) e.to = tr('দেশের কোন বিমানবন্দরে ফিরবেন, বাছাই করুন।', 'Choose the airport you return to at home.');
  const mk = int(r.mk); const md = int(r.md) ?? 0;
  if (mk === null || !Number.isInteger(mk) || mk < 1 || mk > 60) e.mk = tr('মক্কায় কত রাত থাকবেন, সংখ্যায় লিখুন (কমপক্ষে ১)।', 'Write the nights in Makkah as a number (at least 1).');
  if (!Number.isInteger(md) || md < 0 || md > 60) e.md = tr('মদিনায় কত রাত থাকবেন, সংখ্যায় লিখুন (না থাকলে ০)।', 'Write the nights in Madinah as a number (0 if none).');
  else if (!e.mk && mk !== null && days > 1 && mk + md > days - 1) e.md = tr(`মক্কা ও মদিনা মিলিয়ে সর্বোচ্চ ${toBn(days - 1)} রাত হতে পারে (সফর ${toBn(days)} দিনের)।`, `Makkah and Madinah together can be at most ${days - 1} nights (the trip is ${days} days).`);
  return e;
}

export function routeRow(r: RouteForm): Record<string, string | number | null | undefined> {
  const a = String(r.airline || '').trim();
  return { from_airport: r.from, arrive_at: r.arrive, first_city: r.first, makkah_nights: int(r.mk), madinah_nights: int(r.md) ?? 0,
    return_from: r.back, return_to: r.to, airline: a || null };
}

// "TL-00004", "tl০০০০৪", "TL 4"-like input → comparable key
export const leaderKey = (v: unknown): string => normalizeDigits(String(v || '')).toUpperCase().replace(/[^A-Z0-9]/g, '');

export type OfferFilter = { q?: string; month?: string | null; airport?: string | null; maxPrice?: number | null };
export function filterOffers<T extends Offer>(rows: T[] | null | undefined, f: OfferFilter = {}): T[] {
  const q = String(f.q || '').trim();
  const k = leaderKey(q); const ql = q.toLowerCase();
  return (rows || []).filter((o) => {
    if (q) {
      const byId = k.length >= 3 && /\d/.test(k) && leaderKey(o.leader_code) === k;
      const byText = [o.leader_name, o.agency_name, o.title].some((t) => String(t || '').toLowerCase().includes(ql));
      if (!byId && !byText) return false;
    }
    if (f.month && String(o.depart_on || '').slice(0, 7) !== f.month) return false;
    if (f.airport && o.from_airport !== f.airport) return false;
    if (f.maxPrice && Number(o.price_bdt) > f.maxPrice) return false;
    return true;
  });
}

// Every month from this month for a year (so hajis can check any month, even an empty one), plus any later month
// that has a package. Each label says how many packages leave that month.
export function monthOptions(rows: Offer[] | null | undefined, today?: string | null): { id: string; label: string }[] {
  const t = String(today || new Date().toISOString()).slice(0, 7);
  let y = Number(t.slice(0, 4)); let mo = Number(t.slice(5, 7));
  const ids = new Set<string>();
  for (let i = 0; i < 12; i += 1) { ids.add(`${y}-${String(mo).padStart(2, '0')}`); mo += 1; if (mo > 12) { mo = 1; y += 1; } }
  const count: Record<string, number> = {};
  (rows || []).forEach((o) => { const m = String(o.depart_on || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(m)) { count[m] = (count[m] || 0) + 1; if (m >= t) ids.add(m); } });
  return [...ids].sort().map((id) => ({ id, label: tr(`${monthName(Number(id.slice(5)) - 1)} ${toBn(id.slice(0, 4))} (${toBn(count[id] || 0)}টি)`, `${monthName(Number(id.slice(5)) - 1)} ${id.slice(0, 4)} (${count[id] || 0})`) }));
}

// A price the haji types: "১,৮০,০০০", "180000", "২.৫ লাখ", "2 lakh". null when empty, NaN when not a price.
export function parsePrice(v: unknown): number | null {
  const t = normalizeDigits(String(v ?? '')).replace(/[,\s]/g, '').toLowerCase();
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)(লাখ|লক্ষ|lakh|lac)?(টাকা|tk)?$/);   // i18n-ok: words a haji may type
  if (!m) return NaN;
  const n = Math.round(Number(m[1]) * (m[2] ? 100000 : 1));
  return n > 0 && n < 1e8 ? n : NaN;
}

// Hajj happens once a year, so the month choice is only for umrah.
export const monthFilterFor = (kind: string): boolean => kind === 'umrah';
export const monthButtonText = (month: string | null | undefined, options: { id: string; label: string }[] | null | undefined): string => `📅 ${month ? ((options || []).find((x) => x.id === month) || { label: month }).label : tr('সব মাস', 'All months')}`;
