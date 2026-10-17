// Small helpers so prayer reminders and document reminders never delete each other.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const notifySupported = Platform.OS === 'android' || Platform.OS === 'ios';
export const DOC_PREFIX = 'doc-';

// Cancels scheduled notifications whose identifier matches. Never throws.
export async function cancelWhere(match) {
  if (!notifySupported) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(all.filter((n) => match(String(n.identifier || ''))).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
  } catch (e) { /* nothing scheduled or not supported */ }
}
export const cancelPrayer = () => cancelWhere((id) => !id.startsWith(DOC_PREFIX));
export const cancelDocs = () => cancelWhere((id) => id.startsWith(DOC_PREFIX));
export async function cancelEverything() {
  if (!notifySupported) return;
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (e) { /* ignore */ }
}
