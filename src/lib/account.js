// Permanent account deletion (Google Play requires it inside the app).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { clearLocalDocs } from './docs';
import { cancelEverything } from './notify';

// 1) (after the password) delete the user's own files (storage policies allow only their own folder)
// 2) call delete_my_account() (supabase/003_delete_account.sql), which removes the login, profile and document rows
// 3) clear this app's data on the phone and sign out locally.
// Throws on failure; nothing is reported as deleted unless step 2 really succeeded.
// 0) the password is checked FIRST with a fresh sign-in (the server also demands a password from the last 10 minutes),
//    so a wrong password never deletes any file.
const fail = (code) => { const e = new Error(code); e.code = code; return e; };
export async function deleteMyAccount(password) {
  if (!String(password || '').trim()) throw fail('password-needed');
  const { data } = await supabase.auth.getSession();
  const user = data && data.session && data.session.user ? data.session.user : null;
  const uid = user ? user.id : null;
  if (!uid) throw fail('no-session');
  const re = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (re.error) throw fail(/invalid/i.test(String(re.error.message || '')) ? 'wrong-password' : 'auth-failed');

  for (const bucket of ['avatars', 'documents', 'leader-docs']) {
    try {
      const { data: files } = await supabase.storage.from(bucket).list(uid, { limit: 1000 });
      if (files && files.length) await supabase.storage.from(bucket).remove(files.map((f) => `${uid}/${f.name}`));
    } catch (e) { /* a missing bucket or empty folder is fine */ }
  }

  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;

  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('ta.') && k !== 'ta.onboarded.v1');
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch (e) { /* local cleanup is best effort */ }
  await clearLocalDocs();
  await cancelEverything();   // prayer and document reminders
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}
