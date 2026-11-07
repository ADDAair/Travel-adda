import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { checkFile } from './fileCheck';

const MAX_BYTES = 5 * 1024 * 1024;

// Uploads the photo to the private "avatars" bucket and records its path on the profile.
// Resolves only when BOTH steps really succeeded, so the screen never shows a false success.
const coded = (code: string): Error & { code: string } => Object.assign(new Error(code), { code });
export async function uploadAvatar(uri: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data?.session?.user?.id;
  if (!uid) throw coded('no-session');
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw coded('too-big');
  checkFile(buf, 'image');
  const path = `${uid}/profile.jpg`;
  const up = await supabase.storage.from('avatars').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
  if (up.error) throw up.error;
  // .single() fails when no row was changed (for example if a policy blocked it), so a silent no-op is caught.
  const upd = await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid).select('avatar_path').single();
  if (upd.error) throw upd.error;
  AsyncStorage.setItem('ta.photoOk.v1', 'yes').catch(() => {});
  return path;
}

// The bucket is private, so the picture is shown through a short-lived signed link.
export async function signedAvatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
    return error ? null : data?.signedUrl || null;
  } catch (e) {
    return null;
  }
}

// 'missing' | 'ok'. Any error counts as 'ok' on purpose: a network hiccup (or the database step not yet applied)
// must never lock a person out of the app. The check runs again at the next app start.
// Once a photo is known to exist it is remembered on the phone, so later app starts skip this server call.
const PHOTO_OK = 'ta.photoOk.v1';
export async function photoGateState(timeoutMs = 6000): Promise<'ok' | 'missing'> {
  try { if ((await AsyncStorage.getItem(PHOTO_OK)) === 'yes') return 'ok'; } catch (e) { /* ask the server */ }
  try {
    const q = supabase.from('profiles').select('avatar_path').single()
      .then(({ data, error }): 'ok' | 'missing' => {
        if (error) return 'ok';
        if (data && data.avatar_path) { AsyncStorage.setItem(PHOTO_OK, 'yes').catch(() => {}); return 'ok'; }
        return 'missing';
      });
    const t = new Promise<'ok'>((resolve) => setTimeout(() => resolve('ok'), timeoutMs));
    return await Promise.race([q, t]);
  } catch (e) {
    return 'ok';
  }
}
