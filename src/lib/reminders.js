// Prayer-time reminders as local notifications, made on the phone (no server, no internet).
// The next 7 days are scheduled and re-made every time the app opens or the place changes.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ORDER, prayerTimes, tzFor, localYMD, fmtTime, isFriday } from './prayer';
import { loadSavedLocation } from './location';
import { cancelPrayer } from './notify';

const KEY = 'ta.reminders.v1';
const CHANNEL = 'prayer';
const DAYS = 7;
export const remindersSupported = Platform.OS === 'android' || Platform.OS === 'ios';

if (remindersSupported) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
  } catch (e) { /* reminders simply stay off */ }
}

export async function remindersOn() {
  try { return (await AsyncStorage.getItem(KEY)) === '1'; } catch (e) { return false; }
}

async function schedule(loc) {
  await cancelPrayer();   // document-expiry reminders are kept
  if (!loc) return 0;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'নামাজের সময়', importance: Notifications.AndroidImportance.HIGH, sound: 'default', vibrationPattern: [0, 300, 200, 300],
    });
  }
  const now = Date.now();
  const tz = tzFor(loc.lat, loc.lng, -new Date(now).getTimezoneOffset());
  let n = 0;
  for (let d = 0; d < DAYS; d++) {
    const day = localYMD(now + d * 86400000, tz);
    const t = prayerTimes({ lat: loc.lat, lng: loc.lng, ...day });
    for (const o of ORDER) {
      if (o.notPrayer || t[o.key] <= now + 30000) continue;
      const f = fmtTime(t[o.key], tz, o.key);
      const jumuah = o.key === 'dhuhr' && isFriday(day);
      await Notifications.scheduleNotificationAsync({
        content: jumuah
          ? { title: '🕌 জুমার ওয়াক্ত শুরু হয়েছে', body: `${f.part} ${f.time} · ${loc.label} · জামাতে যাওয়ার প্রস্তুতি নিন`, sound: 'default' }
          : { title: `🕌 ${o.gen} সময় হয়েছে`, body: `${f.part} ${f.time} · ${loc.label}`, sound: 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(t[o.key]), channelId: CHANNEL },
      });
      n++;
    }
  }
  // Reminders are made only for 7 days at a time. If the app is not opened, they would stop silently,
  // so a day before the end the phone asks the person to open the app once.
  if (n > 0) {
    const day = localYMD(now + (DAYS - 2) * 86400000, tz);
    const at = prayerTimes({ lat: loc.lat, lng: loc.lng, ...day }).isha + 45 * 60000;
    if (at > now) {
      await Notifications.scheduleNotificationAsync({
        content: { title: '🔔 নামাজের রিমাইন্ডার চালু রাখতে অ্যাপটি একবার খুলুন', body: 'Travel Adda না খুললে কাল থেকে নামাজের রিমাইন্ডার আসবে না। খুললেই আবার ৭ দিনের জন্য চালু হবে।', sound: 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: CHANNEL },
      });
    }
  }
  return n;
}

// Returns { ok: true } or { error: 'unsupported' | 'denied' | 'blocked' | 'failed' }.
export async function enableReminders(loc) {
  if (!remindersSupported) return { error: 'unsupported' };
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted) p = await Notifications.requestPermissionsAsync();
    if (!p.granted) return { error: p.canAskAgain === false ? 'blocked' : 'denied' };
    const n = await schedule(loc);
    if (n === 0) return { error: 'failed' };
    await AsyncStorage.setItem(KEY, '1');
    return { ok: true };
  } catch (e) {
    return { error: 'failed' };
  }
}

export async function disableReminders() {
  try { await AsyncStorage.setItem(KEY, '0'); } catch (e) { /* ignore */ }
  if (remindersSupported) await cancelPrayer();
}

// Called when the app opens and when the place changes. Silent: never asks for permission here.
export async function refreshReminders(loc) {
  if (!remindersSupported || !(await remindersOn())) return;
  try {
    const p = await Notifications.getPermissionsAsync();
    if (!p.granted) return;
    await schedule(loc || (await loadSavedLocation()));
  } catch (e) { /* keep the old schedule */ }
}
