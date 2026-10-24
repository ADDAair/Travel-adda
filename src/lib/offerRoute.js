// Package journey (supabase/020_offer_route.sql), leader search and filters on the Offers page. No network here.
import { toBn, normalizeDigits } from './phone';

export const AIRPORTS_BD = [
  { id: 'DAC', label: 'ঢাকা', full: 'হযরত শাহজালাল আন্তর্জাতিক বিমানবন্দর, ঢাকা' },
  { id: 'CGP', label: 'চট্টগ্রাম', full: 'শাহ আমানত আন্তর্জাতিক বিমানবন্দর, চট্টগ্রাম' },
  { id: 'ZYL', label: 'সিলেট', full: 'ওসমানী আন্তর্জাতিক বিমানবন্দর, সিলেট' },
];
export const AIRPORTS_SA = [
  { id: 'JED', label: 'জেদ্দা', full: 'কিং আবদুল আজিজ বিমানবন্দর, জেদ্দা' },
  { id: 'MED', label: 'মদিনা', full: 'প্রিন্স মোহাম্মদ বিন আবদুল আজিজ বিমানবন্দর, মদিনা' },
];
export const CITIES = [{ id: 'makkah', label: 'মক্কা', icon: '🕋' }, { id: 'madinah', label: 'মদিনা', icon: '🕌' }];
export const PRICE_LIMITS = [150000, 200000, 300000];
const BN_MONTH = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

const name = (list, id) => (list.find((a) => a.id === id) || {}).label || '';
const nights = (n) => `${toBn(n)} রাত`;
export const hasRoute = (o) => !!(o && o.from_airport && o.makkah_nights != null);

function cityOrder(o) {
  const order = o.first_city === 'madinah' ? ['madinah', 'makkah'] : ['makkah', 'madinah'];
  return order.map((c) => ({ c, n: c === 'makkah' ? o.makkah_nights : o.madinah_nights })).filter((x) => x.n > 0);
}

// Steps in travel order: fly out, each holy city with its nights, fly home.
export function routeSteps(o) {
  if (!hasRoute(o)) return null;
  const out = [{ icon: '🛫', title: 'যাত্রা শুরু', text: `${name(AIRPORTS_BD, o.from_airport)} থেকে ${name(AIRPORTS_SA, o.arrive_at)}${o.airline ? ` · ${o.airline}` : ''}`, when: o.depart_on }];
  cityOrder(o).forEach(({ c, n }) => {
    const city = CITIES.find((x) => x.id === c);
    out.push({ icon: city.icon, title: city.label, text: `${nights(n)} থাকা` });
  });
  out.push({ icon: '🛬', title: 'দেশে ফেরা', text: `${name(AIRPORTS_SA, o.return_from)} থেকে ${name(AIRPORTS_BD, o.return_to)}`, when: o.return_on });
  return out;
}

export function routeShort(o) {
  if (!hasRoute(o)) return 'যাত্রাপথ উল্লেখ নেই';
  const mid = cityOrder(o).map(({ c, n }) => `${name(CITIES, c)} ${nights(n)}`);
  return [name(AIRPORTS_BD, o.from_airport), ...mid, name(AIRPORTS_BD, o.return_to)].join(' → ');
}

const int = (v) => { const t = normalizeDigits(String(v ?? '')).trim(); return t === '' ? null : /^\d+$/.test(t) ? Number(t) : NaN; };

// Form check. r = { from, arrive, first, mk, md, back, to }; days = whole trip length in days.
export function checkRoute(r, days) {
  const e = {};
  if (!r.from) e.from = 'কোন বিমানবন্দর থেকে যাত্রা শুরু, বাছাই করুন।';
  if (!r.arrive) e.arrive = 'সৌদিতে কোথায় নামবেন, বাছাই করুন।';
  if (!r.first) e.first = 'আগে মক্কা না মদিনা, বাছাই করুন।';
  if (!r.back) e.back = 'সৌদির কোন বিমানবন্দর থেকে ফিরবেন, বাছাই করুন।';
  if (!r.to) e.to = 'দেশের কোন বিমানবন্দরে ফিরবেন, বাছাই করুন।';
  const mk = int(r.mk); const md = int(r.md) ?? 0;
  if (!Number.isInteger(mk) || mk < 1 || mk > 60) e.mk = 'মক্কায় কত রাত থাকবেন, সংখ্যায় লিখুন (কমপক্ষে ১)।';
  if (!Number.isInteger(md) || md < 0 || md > 60) e.md = 'মদিনায় কত রাত থাকবেন, সংখ্যায় লিখুন (না থাকলে ০)।';
  else if (!e.mk && days > 1 && mk + md > days - 1) e.md = `মক্কা ও মদিনা মিলিয়ে সর্বোচ্চ ${toBn(days - 1)} রাত হতে পারে (সফর ${toBn(days)} দিনের)।`;
  return e;
}

export function routeRow(r) {
  const a = String(r.airline || '').trim();
  return { from_airport: r.from, arrive_at: r.arrive, first_city: r.first, makkah_nights: int(r.mk), madinah_nights: int(r.md) ?? 0,
    return_from: r.back, return_to: r.to, airline: a || null };
}

// "TL-00004", "tl০০০০৪", "TL 4"-like input → comparable key
export const leaderKey = (v) => normalizeDigits(String(v || '')).toUpperCase().replace(/[^A-Z0-9]/g, '');

export function filterOffers(rows, f = {}) {
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

export function monthOptions(rows) {
  const ids = [...new Set((rows || []).map((o) => String(o.depart_on || '').slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort();
  return ids.map((id) => ({ id, label: `${BN_MONTH[Number(id.slice(5)) - 1]} ${toBn(id.slice(0, 4))}` }));
}
