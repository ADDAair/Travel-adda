// Push notifications: the phone shows Travel Adda's notices even when the app is closed (supabase/011_push.sql).
// The notification box (🔔) keeps working without this; push only adds the phone alert.
// Nothing here ever throws to the screens: every function answers with a plain state word.
import { Platform, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { notReady } from './groups';
import app from '../../app.json';

const KEY = 'ta.push.v1';            // 'on' | 'off' (this phone's choice); missing = not asked yet
const TOKEN = 'ta.pushToken.v1';
export const pushSupported = Platform.OS === 'android' || Platform.OS === 'ios';
const projectId = app?.expo?.extra?.eas?.projectId;

async function channels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('notices', {
    name: 'Travel Adda নোটিফিকেশন', importance: Notifications.AndroidImportance.HIGH, sound: 'default', vibrationPattern: [0, 250, 150, 250],
  });
  await Notifications.setNotificationChannelAsync('important', {
    name: 'জরুরি নোটিশ', importance: Notifications.AndroidImportance.MAX, sound: 'default', vibrationPattern: [0, 400, 200, 400],
  });
}

async function register() {
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = data;
  const { data: r, error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  if (error) throw error;
  if (r !== 'ok') throw new Error('bad token');
  await AsyncStorage.setItem(TOKEN, token);
  return token;
}

// What the screen should show: 'on' | 'off' | 'unset' (never asked) | 'denied' (blocked in phone settings)
// | 'unavailable' (this build / phone cannot receive push) | 'soon' (database step 011 not run yet)
export async function pushState() {
  if (!pushSupported) return 'unavailable';
  let pref = null;
  try { pref = await AsyncStorage.getItem(KEY); } catch (e) { pref = null; }
  try {
    const { data, error } = await supabase.rpc('my_push_count');
    if (error) { if (notReady(error)) return 'soon'; }
    else if (pref === 'on' && Number(data) === 0) return 'off';   // removed on the server (e.g. another account logged in on this phone)
  } catch (e) { /* offline: trust this phone's choice */ }
  if (pref === 'on') {
    try { const p = await Notifications.getPermissionsAsync(); if (!p.granted) return 'denied'; } catch (e) { /* ignore */ }
    return 'on';
  }
  return pref === 'off' ? 'off' : 'unset';
}

// Turn on: asks the phone for permission (Android 13+ shows its own question), then registers this phone.
export async function enablePush() {
  if (!pushSupported) return 'unavailable';
  try {
    await channels();
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && p.canAskAgain !== false) p = await Notifications.requestPermissionsAsync();
    if (!p.granted) return 'denied';
  } catch (e) { return 'denied'; }
  try {
    await register();
    await AsyncStorage.setItem(KEY, 'on');
    return 'on';
  } catch (e) {
    if (notReady(e)) return 'soon';
    const m = String(e?.message || e);
    // No Firebase setup in this build (or no Google services on the phone): push cannot work here.
    if (/firebase|FCM|google-services|FirebaseApp|SERVICE_NOT_AVAILABLE|projectId/i.test(m)) {
      await AsyncStorage.setItem(KEY, 'off').catch(() => {});   // the Home card stops asking; the 🔔 page can try again in a later version
      return 'unavailable';
    }
    return 'error';           // usually no internet; the person can try again
  }
}

export async function disablePush() {
  try {
    const t = await AsyncStorage.getItem(TOKEN);
    if (t) { const { error } = await supabase.rpc('unregister_push_token', { p_token: t }); if (error && !notReady(error)) throw error; }
    await AsyncStorage.setItem(KEY, 'off');
    return 'off';
  } catch (e) { return 'error'; }
}

export async function notNow() { try { await AsyncStorage.setItem(KEY, 'off'); } catch (e) { /* ignore */ } }

// Called when the app opens / after login: keeps the server copy fresh (tokens can change). Silent.
// At most once a day (with 1 lakh people, re-registering at every app open would be pure extra load).
const SYNCED = 'ta.pushSynced.v1';
export async function syncPush() {
  if (!pushSupported) return;
  try {
    if ((await AsyncStorage.getItem(KEY)) !== 'on') return;
    const lastSync = Number(await AsyncStorage.getItem(SYNCED)) || 0;
    if (Date.now() - lastSync < 24 * 3600000 && (await AsyncStorage.getItem(TOKEN))) return;
    const p = await Notifications.getPermissionsAsync();
    if (!p.granted) return;
    await channels();
    await register();
    await AsyncStorage.setItem(SYNCED, String(Date.now()));
  } catch (e) { /* next time */ }
}
// This phone's saved choice only (no server call): 'on' | 'off' | null (never asked).
export async function pushPref() { try { return await AsyncStorage.getItem(KEY); } catch (e) { return null; } }

// Before logout: this phone must stop getting this account's notices. Keeps the phone's on/off choice.
export async function pushLogout() {
  try {
    const t = await AsyncStorage.getItem(TOKEN);
    if (t) await Promise.race([supabase.rpc('unregister_push_token', { p_token: t }), new Promise((r) => setTimeout(r, 4000))]);
    await AsyncStorage.multiRemove([TOKEN, SYNCED]);
  } catch (e) { /* the next login on this phone moves the token anyway */ }
}

export const openPhoneSettings = () => Linking.openSettings().catch(() => {});

// Is this tap on a Travel Adda push (not a prayer / document reminder)?
export const isPushTap = (resp) => resp?.notification?.request?.content?.data?.route === 'Notifications';
