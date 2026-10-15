import { supabase } from './supabase';

const MAX_BYTES = 5 * 1024 * 1024;

// Uploads the photo to the private "avatars" bucket and records its path on the profile.
// Resolves only when BOTH steps really succeeded, so the screen never shows a false success.
export async function uploadAvatar(uri) {
  const { data } = await supabase.auth.getSession();
  const uid = data?.session?.user?.id;
  if (!uid) { const e = new Error('no session'); e.code = 'no-session'; throw e; }
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) { const e = new Error('too big'); e.code = 'too-big'; throw e; }
  const path = `${uid}/profile.jpg`;
  const up = await supabase.storage.from('avatars').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
  if (up.error) throw up.error;
  // .single() fails when no row was changed (for example if a policy blocked it), so a silent no-op is caught.
  const upd = await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid).select('avatar_path').single();
  if (upd.error) throw upd.error;
  return path;
}

// The bucket is private, so the picture is shown through a short-lived signed link.
export async function signedAvatarUrl(path) {
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
export async function photoGateState(timeoutMs = 6000) {
  try {
    const q = supabase.from('profiles').select('avatar_path').single()
      .then(({ data, error }) => (error ? 'ok' : (data && data.avatar_path ? 'ok' : 'missing')));
    const t = new Promise((resolve) => setTimeout(() => resolve('ok'), timeoutMs));
    return await Promise.race([q, t]);
  } catch (e) {
    return 'ok';
  }
}
