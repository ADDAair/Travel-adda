// Permanent account deletion (Google Play requires it inside the app).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// 1) delete the user's own files (storage policies allow only their own folder)
// 2) call delete_my_account() (supabase/003_delete_account.sql), which removes the login, profile and document rows
// 3) clear this app's data on the phone and sign out locally.
// Throws on failure; nothing is reported as deleted unless step 2 really succeeded.
export async function deleteMyAccount() {
  const { data } = await supabase.auth.getSession();
  const uid = data && data.session && data.session.user ? data.session.user.id : null;
  if (!uid) { const e = new Error('no session'); e.code = 'no-session'; throw e; }

  for (const bucket of ['avatars', 'documents']) {
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
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}
