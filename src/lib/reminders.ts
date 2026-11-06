// Prayer-time reminders as local notifications, made on the phone (no server, no internet).
// The next 7 days are scheduled and re-made every time the app opens or the place changes.
import { Platform } from 'react-native';
import { tr, getLang } from './lang';
import { placeName } from './location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ORDER, prayerTimes, tzFor, localYMD, fmtTime, isFriday } from './prayer';
import { loadSavedLocation, type Place } from './location';
import { cancelPrayer } from './notify';

const KEY = 'ta.reminders.v1';
const CHANNEL = 'prayer';
// Alarm: a separate loud channel (Android channels cannot change sound later) with our own tone (no copyrighted adhan).
const ALARM_CHANNEL = 'prayer-alarm';
const ALARM_KEY = 'ta.prayerAlarm.v1';
export const ALARM_SOUND = 'prayer_alarm.wav';
const PRAYER_KEYS: string[] = ORDER.filter((o) => !o.notPrayer).map((o) => o.key);

export async function getAlarms(): Promise<Record<string, boolean>> {
  try { const v: Record<string, boolean> = JSON.parse((await AsyncStorage.getItem(ALARM_KEY)) || '{}'); return Object.fromEntries(Object.entries(v).filter(([k, on]) => PRAYER_KEYS.includes(k) && on)); }
  catch (e) { return {}; }
}
export async function setAlarm(key: string, on: boolean): Promise<void> {
  if (!PRAYER_KEYS.includes(key)) throw new Error('not a prayer');
  const a = await getAlarms();
  if (on) a[key] = true; else delete a[key];
  await AsyncStorage.setItem(ALARM_KEY, JSON.stringify(a));
}
async function makeAlarmChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
    name: tr('নামাজের অ্যালার্ম', 'Prayer alarm'), importance: Notifications.AndroidImportance.MAX, sound: ALARM_SOUND,
    vibrationPattern: [0, 800, 400, 800, 400, 800, 400, 800], enableVibrate: true,
    audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationCategoryAsync(ALARM_CHANNEL, [
    { identifier: 'snooze10', buttonTitle: tr('১০ মিনিট পরে আবার', 'Again in 10 minutes'), options: { opensAppToForeground: true } },
    { identifier: 'stop', buttonTitle: tr('বন্ধ করুন', 'Stop'), options: { opensAppToForeground: false } },
  ]);
}
type Content = { title: string; body: string; sound?: string };
const alarmContent = (c: Content) => ({ ...c, title: c.title.replace(/^🕌/, '⏰'), sound: ALARM_SOUND, categoryIdentifier: ALARM_CHANNEL,
  priority: Notifications.AndroidNotificationPriority.MAX });
// "১০ মিনিট পরে আবার" pressed on an alarm: ring once more in 10 minutes.
export async function snoozeAlarm(resp: Notifications.NotificationResponse | null | undefined): Promise<void> {
  if (!resp || resp.actionIdentifier !== 'snooze10') return;
  const c: { title?: string | null; body?: string | null } = (resp.notification && resp.notification.request && resp.notification.request.content) || {};
  try {
    await makeAlarmChannel();
    await Notifications.scheduleNotificationAsync({
      content: alarmContent({ title: String(c.title || tr('🕌 নামাজের সময়', '🕌 Prayer time')), body: c.body || '' }),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 10 * 60000), channelId: ALARM_CHANNEL },
    });
  } catch (e) { /* nothing else to do */ }
}
const DAYS = 7;
export const remindersSupported = Platform.OS === 'android' || Platform.OS === 'ios';

if (remindersSupported) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
  } catch (e) { /* reminders simply stay off */ }
}

export async function remindersOn(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEY)) === '1'; } catch (e) { return false; }
}

export type ReminderPlace = Place;
async function schedule(loc: ReminderPlace | null | undefined): Promise<number> {
  await cancelPrayer();   // document-expiry reminders are kept
  if (!loc) return 0;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: tr('নামাজের সময়', 'Prayer times'), importance: Notifications.AndroidImportance.HIGH, sound: 'default', vibrationPattern: [0, 300, 200, 300],
    });
  }
  const alarms = await getAlarms();
  if (Object.keys(alarms).length) await makeAlarmChannel();
  const now = Date.now();
  const tz = tzFor(loc.lat, loc.lng, -new Date(now).getTimezoneOffset());
  const where = placeName({ kind: 'gps', ...loc });   // the place name in the chosen language
  let n = 0;
  for (let d = 0; d < DAYS; d++) {
    const day = localYMD(now + d * 86400000, tz);
    const t = prayerTimes({ lat: loc.lat, lng: loc.lng, ...day });
    for (const o of ORDER) {
      if (o.notPrayer || t[o.key] <= now + 30000) continue;
      const f = fmtTime(t[o.key], tz, o.key);
      const jumuah = o.key === 'dhuhr' && isFriday(day);
      const en = getLang() === 'en';
      const at = en ? `${f.time} ${f.part}` : `${f.part} ${f.time}`;
      const content: Content = jumuah
        ? { title: tr('🕌 জুমার ওয়াক্ত শুরু হয়েছে', "🕌 Jumu'ah time has begun"), body: tr(`${at} · ${where} · জামাতে যাওয়ার প্রস্তুতি নিন`, `${at} · ${where} · get ready for the congregation`), sound: 'default' }
        : { title: tr(`🕌 ${o.gen} সময় হয়েছে`, `🕌 Time for ${o.gen}`), body: `${at} · ${where}`, sound: 'default' };
      const alarm = !!alarms[o.key];
      await Notifications.scheduleNotificationAsync({
        content: alarm ? alarmContent(content) : content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(t[o.key]), channelId: alarm ? ALARM_CHANNEL : CHANNEL },
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
        content: { title: tr('🔔 নামাজের রিমাইন্ডার চালু রাখতে অ্যাপটি একবার খুলুন', '🔔 Open the app once to keep prayer reminders on'), body: tr('"আমি হাজী" অ্যাপ না খুললে কাল থেকে নামাজের রিমাইন্ডার আসবে না। খুললেই আবার ৭ দিনের জন্য চালু হবে।', 'If the "Ami Haji" app is not opened, prayer reminders stop from tomorrow. Opening it turns them on again for 7 days.'), sound: 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: CHANNEL },
      });
    }
  }
  return n;
}

// Returns { ok: true } or { error: 'unsupported' | 'denied' | 'blocked' | 'failed' }.
export async function enableReminders(loc: ReminderPlace | null | undefined): Promise<{ ok?: true; error?: 'unsupported' | 'denied' | 'blocked' | 'failed' }> {
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

export async function disableReminders(): Promise<void> {
  try { await AsyncStorage.setItem(KEY, '0'); } catch (e) { /* ignore */ }
  if (remindersSupported) await cancelPrayer();
}

// Called when the app opens and when the place changes. Silent: never asks for permission here.
export async function refreshReminders(loc?: ReminderPlace | null): Promise<void> {
  if (!remindersSupported || !(await remindersOn())) return;
  try {
    const p = await Notifications.getPermissionsAsync();
    if (!p.granted) return;
    await schedule(loc || (await loadSavedLocation()));
  } catch (e) { /* keep the old schedule */ }
}
