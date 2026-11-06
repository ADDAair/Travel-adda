import AsyncStorage from '@react-native-async-storage/async-storage';

// The app language (owner request, Nov 2026): Bengali first, English as the second language.
// This file only keeps the choice; the texts are in src/strings.ts (Bengali) and src/stringsEn.ts (English).
export type Lang = 'bn' | 'en';
export const LANG_KEY = 'amihaji.lang';
export const LANGS: Lang[] = ['bn', 'en'];

// Shown in both languages on purpose (the chooser and the switch must be readable before a language is chosen).
export const LANG_NAMES: Record<Lang, { name: string; short: string; a11y: string }> = {
  bn: { name: 'বাংলা', short: 'বাং', a11y: 'বাংলায় দেখুন। Switch to Bengali' },
  en: { name: 'English', short: 'EN', a11y: 'Switch to English। ইংরেজিতে দেখুন' },
};
export const CHOOSE_TITLE = 'ভাষা বেছে নিন\nChoose your language';
export const CHOOSE_NOTE = 'পরে "আমার তথ্য" পাতা বা উপরের বোতাম থেকে বদলানো যাবে।\nYou can change it later from the top bar or "My info".';

let current: Lang = 'bn';
const listeners = new Set<(l: Lang) => void>();
export const getLang = (): Lang => current;
export function onLang(f: (l: Lang) => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }
function apply(l: Lang): void { current = l; listeners.forEach((f) => { try { f(l); } catch (e) { /* one listener never stops the others */ } }); }

export async function setLang(l: Lang): Promise<void> {
  apply(l);
  try { await AsyncStorage.setItem(LANG_KEY, l); } catch (e) { /* kept for this session at least */ }
}

// The saved choice, or null on the first start (the app then asks).
export async function loadLang(): Promise<Lang | null> {
  let v: string | null = null;
  try { v = await AsyncStorage.getItem(LANG_KEY); } catch (e) { v = null; }
  if (v === 'bn' || v === 'en') { apply(v); return v; }
  return null;
}

// Suggested in the chooser: English phones get English, everything else Bengali (most hajis read Bengali).
export function deviceLang(locale?: string): Lang {
  let loc = locale;
  if (loc === undefined) { try { loc = Intl.DateTimeFormat().resolvedOptions().locale; } catch (e) { loc = ''; } }
  return /^en\b/i.test(String(loc || '')) ? 'en' : 'bn';
}

// The text in the chosen language, with the English written right next to the Bengali (pages and helpers).
// Call it while drawing (never at file level), so a language change shows at once.
export const tr = (bn: string, en: string): string => (current === 'en' ? en : bn);
// For tables that keep both: { label: 'পাসপোর্ট', en: 'Passport' }
export const lbl = (x: { label: string; en?: string } | null | undefined): string => (x ? (current === 'en' && x.en ? x.en : x.label) : '');

// Shared date and money words for both languages.
const BN_D = '০১২৩৪৫৬৭৮৯';
const dig = (s: unknown): string => (current === 'en' ? String(s) : String(s).replace(/\d/g, (d) => BN_D[Number(d)]));
const MONTHS: Record<Lang, string[]> = {
  bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const MONTHS_SHORT: Record<Lang, string[]> = {
  bn: ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগ', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
export const monthName = (i: number): string => MONTHS[current][i] || '';
export const monthShort = (i: number): string => MONTHS_SHORT[current][i] || '';
// "১,৬০,০০০ টাকা" / "Tk 1,60,000" (Bangladeshi grouping in both)
export const takaText = (n: unknown, maxFrac = 0): string => {
  const s = Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: maxFrac });
  return current === 'en' ? `Tk ${s}` : `${dig(s)} টাকা`;
};

// Hadith and Quran references ("মুসলিম ১১৬২") in the chosen language: book names and digits only.
const BOOKS: [string, string][] = [   // i18n-ok: Bengali book names the app reads and turns into English
  ['সহিহ বুখারি', 'Sahih al-Bukhari'], ['বুখারি', 'Bukhari'], ['মুসলিম', 'Muslim'], ['আবু দাউদ', 'Abu Dawud'], ['তিরমিযি', 'Tirmidhi'], ['তিরমিজি', 'Tirmidhi'],   // i18n-ok
  ['ইবনে মাজাহ', 'Ibn Majah'], ['নাসায়ি', "Nasa'i"], ['বাইহাকি', 'Bayhaqi'], ['দারাকুতনি', 'Daraqutni'], ['আহমদ', 'Ahmad'],   // i18n-ok
  ['সূরা বাকারা', 'Surah al-Baqarah'], ['সূরা আলে ইমরান', 'Surah Al Imran'], ['সূরা হজ', 'Surah al-Hajj'], ['সূরা তাওবা', 'Surah at-Tawbah'], ['সূরা ফাতহ', 'Surah al-Fath'], ['সূরা', 'Surah'],   // i18n-ok
];
export const refText = (s: string | null | undefined): string => {
  const v = String(s || '');
  if (current !== 'en') return v;
  let out = v;
  for (const [b, e] of BOOKS) out = out.split(b).join(e);
  return out.replace(/[০-৯]/g, (d) => String(BN_D.indexOf(d)));
};
