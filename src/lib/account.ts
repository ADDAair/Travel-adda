// Account pause / resume and deletion (Google Play requires deletion inside the app).
// 035 (owner, Nov 2026): a person can pause ("বন্ধ রাখা") and resume; a deletion request pauses the account at once
// and the server removes it after 30 days (logging in and resuming cancels it).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { clearLocalDocs } from './docs';
import { cancelEverything } from './notify';
import { fail } from './rpc';
import { notReady } from './groups';
import { toBn } from './phone';

// 1) (after the password) delete the user's own files (storage policies allow only their own folder)
// 2) call request_account_deletion() (035): the account is paused now and removed by the server after 30 days
//    (before 035 is run, the old delete_my_account() is used, which removed it at once)
// 3) clear this app's data on the phone and sign out locally.
// Throws on failure; nothing is reported as deleted unless step 2 really succeeded.
// 0) the password is checked FIRST with a fresh sign-in (the server also demands a password from the last 10 minutes),
//    so a wrong password never deletes any file.
// The password is checked with a fresh sign-in (the server also wants a password from the last 10 minutes).
async function checkPassword(password: string): Promise<string> {
  if (!String(password || '').trim()) throw fail('password-needed');
  const { data } = await supabase.auth.getSession();
  const user = data && data.session && data.session.user ? data.session.user : null;
  const uid = user ? user.id : null;
  if (!user || !uid) throw fail('no-session');
  const re = await supabase.auth.signInWithPassword({ email: String(user.email || ''), password });
  if (re.error) throw fail(/invalid/i.test(String(re.error.message || '')) ? 'wrong-password' : 'auth-failed');
  return uid;
}

// Answers: 'ok' | 'has_contract' | 'not_active' | 'password_needed'
export async function pauseMyAccount(password: string): Promise<string> {
  await checkPassword(password);
  const { data, error } = await supabase.rpc('pause_my_account');
  if (error) throw error;
  return String(data);
}

// Answers: 'ok' | 'not_paused'. Also cancels a deletion request.
export async function resumeMyAccount(): Promise<string> {
  const { data, error } = await supabase.rpc('resume_my_account');
  if (error) throw error;
  return String(data);
}

export const pauseText = (a: string): string => ({
  ok: 'অ্যাকাউন্ট বন্ধ রাখা হয়েছে। আবার লগইন করে "অ্যাকাউন্ট আবার চালু করুন" চাপলেই সব আগের মতো ফিরে আসবে।',
  has_contract: 'চলমান চুক্তি থাকায় এখন অ্যাকাউন্ট বন্ধ রাখা যাবে না। চুক্তি শেষ বা বাতিল হলে আবার চেষ্টা করুন।',
  not_active: 'অ্যাকাউন্টটি এখন চালু নেই, তাই বন্ধ করা যাবে না।',
  password_needed: 'নিরাপত্তার জন্য পাসওয়ার্ড আবার লিখে চেষ্টা করুন।',
} as Record<string, string>)[a] || 'এখন করা যায়নি। একটু পরে আবার চেষ্টা করুন।';

// The removal day in Bangladesh time, e.g. "৬ ডিসেম্বর ২০২৬".
const BN_MONTH = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
export function deleteDay(iso: string | null | undefined): string {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 6 * 3600000);
  return `${toBn(d.getUTCDate())} ${BN_MONTH[d.getUTCMonth()]} ${toBn(d.getUTCFullYear())}`;
}

export async function deleteMyAccount(password: string): Promise<void> {
  const uid = await checkPassword(password);

  for (const bucket of ['avatars', 'documents', 'leader-docs']) {
    try {
      const { data: files } = await supabase.storage.from(bucket).list(uid, { limit: 1000 });
      if (files && files.length) await supabase.storage.from(bucket).remove(files.map((f: { name: string }) => `${uid}/${f.name}`));
    } catch (e) { /* a missing bucket or empty folder is fine */ }
  }

  const r = await supabase.rpc('request_account_deletion');
  if (r.error) {
    if (!notReady(r.error)) throw r.error;
    const old = await supabase.rpc('delete_my_account');   // 035 not run yet: the old instant deletion
    if (old.error) throw old.error;
  } else if (r.data !== 'ok') throw new Error(r.data === 'password_needed' ? 'password needed' : `deletion refused: ${String(r.data)}`);

  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('ta.') && k !== 'ta.onboarded.v1');
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch (e) { /* local cleanup is best effort */ }
  await clearLocalDocs();
  await cancelEverything();   // prayer and document reminders
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}
