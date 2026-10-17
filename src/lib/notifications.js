// Notification box (supabase/009_notifications.sql): my own notices + general notices from Travel Adda.
// A tiny shared store keeps the unread number, so the bell in every page header shows the same count.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { notReady } from './groups';

const check = (r) => { if (r.error) throw r.error; return r.data; };
const rpc = async (fn, args) => check(await supabase.rpc(fn, args));
const CACHE = 'ta.notifs.v1';

export const KIND_ICON = { info: 'ℹ️', contract: '📜', payment: '💳', leader: '🧭', complaint: '🚩', group: '👥', admin: '📣' };

// ---------- shared unread count ----------
let unread = 0;
let ready = false;              // false until the database step exists (then the bell stays hidden)
const subs = new Set();
const emit = () => subs.forEach((f) => f({ unread, ready }));
export async function refreshUnread() {
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
let timer = null; let appSub = null; let last = 0;
function start() {
  timer = setInterval(() => { if (AppState.currentState === 'active') refreshUnread(); }, 60000);
  appSub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshUnread(); });
}
function stop() { clearInterval(timer); timer = null; if (appSub) appSub.remove(); appSub = null; }
export function useUnread() {
  const [v, setV] = useState({ unread, ready });
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
export async function listNotifications() {
  try {
    const rows = (await rpc('my_notifications', { p_limit: 100 })) || [];
    AsyncStorage.setItem(CACHE, JSON.stringify(rows)).catch(() => {});
    unread = rows.filter((r) => !r.is_read).length; ready = true; emit();
    return { rows, offline: false };
  } catch (e) {
    if (notReady(e)) throw e;
    try { const c = JSON.parse((await AsyncStorage.getItem(CACHE)) || 'null'); if (Array.isArray(c)) return { rows: c, offline: true }; } catch (x) { /* none */ }
    throw e;
  }
}
export async function markRead(n) {
  if (n.is_read) return;
  await rpc('mark_notification', { p_id: n.id, p_source: n.source, p_hide: false });
  unread = Math.max(0, unread - 1); emit();
}
export async function hideNotification(n) {
  await rpc('mark_notification', { p_id: n.id, p_source: n.source, p_hide: true });
  if (!n.is_read) { unread = Math.max(0, unread - 1); emit(); }
}
export async function markAllRead() {
  await rpc('mark_all_notifications_read');
  unread = 0; emit();
}

// ---------- admin / 'notify' staff ----------
export const audienceSize = (aud) => rpc('admin_audience_size', { p_audience: aud });
export const sendNotification = (aud, title, body, target, important) => rpc('admin_send_notification', {
  p_audience: aud, p_title: title, p_body: body || null, p_target: target || null, p_important: !!important,
});
export const listBroadcasts = async () => (await rpc('admin_list_broadcasts')) || [];
export const withdrawBroadcast = (id) => rpc('admin_withdraw_broadcast', { p_id: id });
