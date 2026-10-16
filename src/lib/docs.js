// "My documents": passport, visa, ticket... stored in the PRIVATE "documents" bucket (supabase/001_core.sql).
// Database policies let each user see, add and delete only their own rows and files.
// Opened photos are also kept inside this app's private folder on the phone, so they open without internet.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as IM from 'expo-image-manipulator';
import { supabase } from './supabase';

export const DOC_TYPES = [
  { id: 'passport', icon: '🛂', label: 'পাসপোর্ট' },
  { id: 'visa', icon: '📄', label: 'ভিসা' },
  { id: 'ticket', icon: '✈️', label: 'বিমানের টিকেট' },
  { id: 'hotel_voucher', icon: '🏨', label: 'হোটেল ভাউচার' },
  { id: 'other', icon: '📎', label: 'অন্যান্য (টিকার সনদ ইত্যাদি)' },
];
export const typeOf = (id) => DOC_TYPES.find((t) => t.id === id) || DOC_TYPES[4];

const MAX_BYTES = 5 * 1024 * 1024;
const LOCAL = Platform.OS === 'web' ? null : `${FileSystem.documentDirectory}docs/`;
const cacheKey = (uid) => `ta.docsCache.v1.${uid}`;
const isPdf = (path) => /\.pdf$/i.test(path);
export const docIsPdf = (row) => isPdf(row.file_path);

async function uid() {
  const { data } = await supabase.auth.getSession();
  const id = data && data.session && data.session.user ? data.session.user.id : null;
  if (!id) { const e = new Error('no session'); e.code = 'no-session'; throw e; }
  return id;
}

function randomId() {
  const b = global.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// Photos are made smaller (long side 1800 px, JPEG) so they upload fast on weak mobile data and stay under 5 MB.
async function shrink(uri) {
  try {
    if (IM.ImageManipulator && IM.ImageManipulator.manipulate) {
      const ctx = IM.ImageManipulator.manipulate(uri);
      ctx.resize({ width: 1800 });
      const img = await ctx.renderAsync();
      const out = await img.saveAsync({ compress: 0.7, format: IM.SaveFormat.JPEG });
      return out.uri;
    }
    if (IM.manipulateAsync) {
      const out = await IM.manipulateAsync(uri, [{ resize: { width: 1800 } }], { compress: 0.7, format: IM.SaveFormat.JPEG });
      return out.uri;
    }
  } catch (e) { /* fall back to the original picture; the size check below still protects the upload */ }
  return uri;
}

async function ensureLocalDir() {
  if (!LOCAL) return;
  const info = await FileSystem.getInfoAsync(LOCAL);
  if (!info.exists) await FileSystem.makeDirectoryAsync(LOCAL, { intermediates: true });
}
const localPath = (row) => (LOCAL ? `${LOCAL}${row.file_path.split('/').pop()}` : null);

/**
 * Upload one document. file = { uri, kind: 'image' | 'pdf' }. Resolves with the new row only after BOTH the file
 * and the database row are saved; if the row fails, the uploaded file is removed again so nothing is left half-done.
 */
export async function uploadDoc(type, file) {
  const me = await uid();
  const pdf = file.kind === 'pdf';
  const src = pdf ? file.uri : await shrink(file.uri);
  const buf = await (await fetch(src)).arrayBuffer();
  if (buf.byteLength > MAX_BYTES) { const e = new Error('too big'); e.code = 'too-big'; throw e; }
  const path = `${me}/${randomId()}.${pdf ? 'pdf' : 'jpg'}`;
  const up = await supabase.storage.from('documents').upload(path, buf, { contentType: pdf ? 'application/pdf' : 'image/jpeg', upsert: false });
  if (up.error) throw up.error;
  const ins = await supabase.from('user_documents').insert({ doc_type: type, file_path: path }).select('id,doc_type,file_path,created_at').single();
  if (ins.error) {
    await supabase.storage.from('documents').remove([path]).catch(() => {});
    throw ins.error;
  }
  if (!pdf && LOCAL) {
    try { await ensureLocalDir(); await FileSystem.copyAsync({ from: src, to: localPath(ins.data) }); } catch (e) { /* online viewing still works */ }
  }
  return ins.data;
}

// Returns { rows, offline }. When the internet is not available, the last list saved on this phone is shown.
export async function listDocs() {
  const me = await uid();
  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ error: { message: 'timeout' } }), 10000));
    const r = await Promise.race([supabase.from('user_documents').select('id,doc_type,file_path,created_at').order('created_at', { ascending: false }), timeout]);
    if (r.error) throw r.error;
    AsyncStorage.setItem(cacheKey(me), JSON.stringify(r.data || [])).catch(() => {});
    return { rows: r.data || [], offline: false };
  } catch (e) {
    try {
      const cached = JSON.parse((await AsyncStorage.getItem(cacheKey(me))) || 'null');
      if (Array.isArray(cached)) return { rows: cached, offline: true };
    } catch (err) { /* fall through */ }
    throw e;
  }
}

/**
 * Where to show a document from: { uri, local } or throws (e.code 'offline' when there is no internet and no copy).
 * Photos opened once are saved in the app's private folder for next time.
 */
export async function openDoc(row) {
  const lp = localPath(row);
  if (lp) {
    try { const info = await FileSystem.getInfoAsync(lp); if (info.exists) return { uri: lp, local: true }; } catch (e) { /* download below */ }
  }
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(row.file_path, 300);
  if (error || !data || !data.signedUrl) { const e = new Error('offline'); e.code = 'offline'; throw e; }
  if (lp && !isPdf(row.file_path)) {
    try { await ensureLocalDir(); const d = await FileSystem.downloadAsync(data.signedUrl, lp); if (d && d.status === 200) return { uri: lp, local: true }; } catch (e) { /* show online */ }
  }
  return { uri: data.signedUrl, local: false };
}

// Deletes the row and the file (and this phone's copy). Throws if the server did not confirm.
export async function deleteDoc(row) {
  const del = await supabase.from('user_documents').delete().eq('id', row.id).select('id');
  if (del.error) throw del.error;
  if (!del.data || del.data.length === 0) { const e = new Error('not deleted'); e.code = 'not-deleted'; throw e; }
  await supabase.storage.from('documents').remove([row.file_path]).catch(() => {});
  const lp = localPath(row);
  if (lp) await FileSystem.deleteAsync(lp, { idempotent: true }).catch(() => {});
}

// On logout / account deletion: remove every document copy and the cached list from this phone.
export async function clearLocalDocs() {
  if (LOCAL) await FileSystem.deleteAsync(LOCAL, { idempotent: true }).catch(() => {});
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('ta.docsCache.'));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch (e) { /* best effort */ }
}
