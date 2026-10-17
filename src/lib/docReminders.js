// Phone reminders before a passport or visa expires: 6 months, 1 month and 1 week before, at 10 in the morning.
// Made on the phone (no server). Re-made whenever the document list is loaded online or a date changes.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { notifySupported, cancelDocs, DOC_PREFIX } from './notify';
import { typeOf } from './docs';

const STEPS = [
  { days: 180, text: 'মেয়াদ শেষ হতে আর ৬ মাস বাকি। সৌদি ভিসার জন্য পাসপোর্টের মেয়াদ অন্তত ৬ মাস থাকতে হয়।' },
  { days: 30, text: 'মেয়াদ শেষ হতে আর ১ মাস বাকি।' },
  { days: 7, text: 'মেয়াদ শেষ হতে আর ১ সপ্তাহ বাকি।' },
];

export async function scheduleDocReminders(rows, { ask = false } = {}) {
  if (!notifySupported) return { ok: false, reason: 'unsupported' };
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && ask) p = await Notifications.requestPermissionsAsync();
    await cancelDocs();
    if (!p.granted) return { ok: false, reason: 'denied' };
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('docs', { name: 'কাগজের মেয়াদ', importance: Notifications.AndroidImportance.DEFAULT });
    }
    const now = Date.now();
    let n = 0;
    for (const r of rows || []) {
      if (!r.expires_on || !['passport', 'visa'].includes(r.doc_type)) continue;
      const [y, m, d] = r.expires_on.split('-').map(Number);
      for (const s of STEPS) {
        if (s.days === 180 && r.doc_type !== 'passport') continue;
        const at = new Date(y, m - 1, d - s.days, 10, 0, 0).getTime();
        if (at <= now + 60000) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: `${DOC_PREFIX}${r.id}-${s.days}`,
          content: { title: `${typeOf(r.doc_type).icon} ${typeOf(r.doc_type).label}: মেয়াদ মনে করিয়ে দিচ্ছি`, body: s.text, sound: 'default' },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: 'docs' },
        });
        n++;
      }
    }
    return { ok: true, count: n };
  } catch (e) { return { ok: false, reason: 'failed' }; }
}
