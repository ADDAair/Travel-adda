// Notification box (supabase/009_notifications.sql): my own notices + general notices from Travel Adda.
// A tiny shared store keeps the unread number, so the bell in every page header shows the same count.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { notReady } from './groups';

import { rpc as call } from './rpc';

type Row = Record<string, any>;   // server rows
const rpc = <T = any>(fn: string, args?: Record<string, unknown>) => call<T>(fn, args);
const CACHE = 'ta.notifs.v1';

export const KIND_ICON: Record<string, string> = { info: 'ℹ️', contract: '📜', payment: '💳', leader: '🧭', complaint: '🚩', group: '👥', admin: '📣' };

// ---------- shared unread count ----------
let unread = 0;
let ready = false;              // false until the database step exists (then the bell stays hidden)
type Unread = { unread: number; ready: boolean };
const subs = new Set<(v: Unread) => void>();
const emit = () => subs.forEach((f) => f({ unread, ready }));
export async function refreshUnread(): Promise<number> {
  try {
    const n = await rpc('my_unread_count');
    unread = Number(n) || 0; ready = true;
  } catch (e) {
    if (notReady(e)) ready = false;      // otherwise keep the last known number (no internet)
  }
  emit();
  return unread;
}
// One timer for the whole app, however many bells are on screen (every page header has one).
let timer: ReturnType<typeof setInterval> | null = null; let appSub: { remove: () => void } | null = null; let last = 0;
// Every 5 minutes while the app is open, and when it comes back to the front (at most once a minute).
// (With 1 lakh people a 1-minute check alone would be ~1,700 requests per second; phone alerts refresh it anyway.)
const POLL = 5 * 60000;
function maybeRefresh() { if (Date.now() - last > 60000) { last = Date.now(); refreshUnread(); } }
function start() {
  timer = setInterval(() => { if (AppState.currentState === 'active') { last = Date.now(); refreshUnread(); } }, POLL + Math.floor(Math.random() * 30000));
  appSub = AppState.addEventListener('change', (s) => { if (s === 'active') maybeRefresh(); });
}
function stop() { if (timer) clearInterval(timer); timer = null; if (appSub) appSub.remove(); appSub = null; }
export function useUnread(): Unread {
  const [v, setV] = useState<Unread>({ unread, ready });
  useEffect(() => {
    subs.add(setV);
    if (subs.size === 1) start();
    if (Date.now() - last > 10000) { last = Date.now(); refreshUnread(); } else setV({ unread, ready });
    return () => { subs.delete(setV); if (subs.size === 0) stop(); };
  }, []);
  return v;
}

export function resetUnread() { unread = 0; ready = false; last = 0; emit(); }

// ---------- list (kept on the phone for reading without internet) ----------
export async function listNotifications(): Promise<{ rows: Row[]; offline: boolean }> {
  try {
    const rows = (await rpc<Row[]>('my_notifications', { p_limit: 100 })) || [];
    AsyncStorage.setItem(CACHE, JSON.stringify(rows)).catch(() => {});
    unread = rows.filter((r) => !r.is_read).length; ready = true; emit();
    return { rows, offline: false };
  } catch (e) {
    if (notReady(e)) throw e;
    try { const c = JSON.parse((await AsyncStorage.getItem(CACHE)) || 'null'); if (Array.isArray(c)) return { rows: c, offline: true }; } catch (x) { /* none */ }
    throw e;
  }
}
export async function markRead(n: Row): Promise<void> {
  if (n.is_read) return;
  await rpc('mark_notification', { p_id: n.id, p_source: n.source, p_hide: false });
  unread = Math.max(0, unread - 1); emit();
}
export async function hideNotification(n: Row): Promise<void> {
  await rpc('mark_notification', { p_id: n.id, p_source: n.source, p_hide: true });
  if (!n.is_read) { unread = Math.max(0, unread - 1); emit(); }
}
export async function markAllRead(): Promise<void> {
  await rpc('mark_all_notifications_read');
  unread = 0; emit();
}

// ---------- admin / 'notify' staff ----------
export const audienceSize = (aud: string) => rpc('admin_audience_size', { p_audience: aud });
export const sendNotification = (aud: string, title: string, body?: string | null, target?: string | null, important?: boolean) => rpc('admin_send_notification', {
  p_audience: aud, p_title: title, p_body: body || null, p_target: target || null, p_important: !!important,
});
export const listBroadcasts = async (): Promise<Row[]> => (await rpc<Row[]>('admin_list_broadcasts')) || [];
export const withdrawBroadcast = (id: string) => rpc('admin_withdraw_broadcast', { p_id: id });
