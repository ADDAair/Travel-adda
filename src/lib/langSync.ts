// English step 5 (Nov 2026): tells the server which language this person chose, so phone alerts from the server come
// in that language (supabase/036_lang.sql). Sent once after login and again whenever the language changes.
// If the server step is not run yet or there is no internet, nothing breaks; it is tried again next time.
import { supabase } from './supabase';
import { getLang, onLang, type Lang } from './lang';

let sent: Lang | null = null;
export async function syncLang(): Promise<void> {
  const l = getLang();
  if (l === sent) return;
  try {
    const { error } = await supabase.rpc('set_my_lang', { p_lang: l });
    if (!error) sent = l;
  } catch (e) { /* try again next time */ }
}
export const resetLangSync = (): void => { sent = null; };
// Start after login; returns the function that stops it (on logout).
export function startLangSync(): () => void {
  resetLangSync();
  void syncLang();
  const off = onLang(() => { void syncLang(); });
  return () => { off(); resetLangSync(); };
}
