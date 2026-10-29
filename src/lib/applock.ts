// Optional lock for private pages (documents): the phone's own fingerprint / face / screen PIN must say OK.
// The choice is kept in the phone's secure store. Off by default; if the phone has no screen lock, it cannot be used.
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const KEY = 'ta.applock.v1';
export async function lockWanted(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(KEY)) === 'on'; } catch (e) { return false; }
}
export async function setLockWanted(on: boolean): Promise<void> {
  if (on) await SecureStore.setItemAsync(KEY, 'on'); else await SecureStore.deleteItemAsync(KEY);
}
// true when the phone has some screen lock (fingerprint, face, PIN, pattern or password)
export async function canLock(): Promise<boolean> {
  try { return Number(await LocalAuthentication.getEnrolledLevelAsync()) > 0; } catch (e) { return false; }
}
export async function unlock(reason = 'কাগজপত্র খুলতে ফোনের আঙুলের ছাপ বা পিন দিন'): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'বাতিল', disableDeviceFallback: false });
    return !!(r && r.success);
  } catch (e) { return false; }
}
