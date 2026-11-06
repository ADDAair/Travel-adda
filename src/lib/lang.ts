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
