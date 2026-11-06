// What this phone keeps, in one place (offline step 1, Nov 2026).
// USER: about the signed-in person — removed together at logout and account deletion, so the next person who signs
//       in on this phone never sees any of it. DEVICE: settings of this phone — kept.
// tests/unit/offline1.test.mjs fails when a new key is used anywhere in src without being put in one of the lists.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { notReady } from './groups';

export const USER_KEYS: readonly string[] = [
  'ta.profileCache.v1', 'ta.groupLeader.v1', 'ta.announce.v1', 'ta.contractLeader.v1', 'ta.trip.v1', 'ta.helpline.v1',
  'ta.tripMoney.v1', 'ta.payInfo.v1', 'ta.notifs.v1', 'ta.pendingEmail.v1', 'ta.pendingReferral', 'ta.pendingTerms.v1',
  'ta.emergency.v1', 'ta.sos.location', 'ta.photoOk.v1', 'ta.pushToken.v1', 'ta.pushSynced.v1',
];
export const USER_PREFIXES: readonly string[] = ['ta.docsCache.', 'ta.off.'];
export const DEVICE_KEYS: readonly string[] = [
  'amihaji.lang', 'ta.onboarded.v1', 'ta.handsOnDone.v1', 'ta.applock.v1', 'ta.push.v1', 'ta.reminders.v1', 'ta.prayerAlarm.v1',
  'ta.prayerLoc.v1', 'ta.content.v1', 'ta.videos.v1', 'ta.lastStartup.v1', 'ta.duaTextScale.v1', 'ta.favDuas.v1',
  'ta.quranLast.v1', 'ta.quranShowPron.v1', 'ta.quranShowTrans.v1', 'ta.tasbih.v1', 'ta.count.sai.v1', 'ta.count.tawaf.v1',
  'ta.umrahStep.v1', 'ta.ihramChecklist.v1', 'ta.ihramRoute.v1', 'ta.packing.v1',
];

export async function clearUserData(): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const gone = all.filter((k) => USER_KEYS.includes(k) || USER_PREFIXES.some((p) => k.startsWith(p)));
    if (gone.length) await AsyncStorage.multiRemove(gone);
  } catch (e) { /* best effort: the next sign-in still only reads copies made for itself (see lastCopy) */ }
}

// ---------- saved copies of the haji's own pages, for use without internet ----------
const COPY = 'ta.off.v1.';
type Copy = { uid: string; at: number; data: unknown };
async function whoAmI(): Promise<string | null> {
  try { const { data } = await supabase.auth.getSession(); return data?.session?.user?.id || null; } catch (e) { return null; }
}
export async function keepCopy(name: string, data: unknown): Promise<number> {
  const at = Date.now();
  const uid = await whoAmI();
  if (!uid) return at;
  try { await AsyncStorage.setItem(COPY + name, JSON.stringify({ uid, at, data } satisfies Copy)); } catch (e) { /* phone full: no copy */ }
  return at;
}
export async function lastCopy<T>(name: string): Promise<{ data: T; at: number } | null> {
  const uid = await whoAmI();
  if (!uid) return null;
  try {
    const c = JSON.parse((await AsyncStorage.getItem(COPY + name)) || 'null') as Copy | null;
    return c && c.uid === uid && Number.isFinite(c.at) ? { data: c.data as T, at: c.at } : null;
  } catch (e) { return null; }
}
// Fresh from the server (and saved), or — when that fails and a copy exists — the copy with the time it was saved.
// A missing database step is passed on as before, so the page can say "শীঘ্রই আসছে" instead of showing old data.
export type WithCopy<T> = { data: T; offline: boolean; at: number };
export async function withCopy<T>(name: string, fetch: () => Promise<T>): Promise<WithCopy<T>> {
  try {
    const data = await fetch();
    const at = await keepCopy(name, data);
    return { data, offline: false, at };
  } catch (e) {
    if (notReady(e)) throw e;
    const c = await lastCopy<T>(name);
    if (!c) throw e;
    return { data: c.data, offline: true, at: c.at };
  }
}
