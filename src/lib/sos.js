// SOS record (supabase/026_admin_part4.sql): when a haji calls an emergency number from the app, Travel Adda is told.
// The location is sent only if the haji turned it on. This never delays or blocks the call: it runs after the
// phone app has been opened, never throws, and waits at most a few seconds for GPS.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { supabase } from './supabase';

const KEY = 'ta.sos.location';
export async function sosLocationWanted() {
  try { return (await AsyncStorage.getItem(KEY)) === 'yes'; } catch (e) { return false; }
}
export async function setSosLocationWanted(v) {
  try { await AsyncStorage.setItem(KEY, v ? 'yes' : 'no'); } catch (e) { /* stays off */ }
}

const within = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);

async function position(waitMs) {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm || perm.status !== 'granted') return null;
    const p = await within(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), waitMs);
    const c = p && p.coords;
    if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
    return { lat: Math.round(c.latitude * 1e6) / 1e6, lng: Math.round(c.longitude * 1e6) / 1e6, acc: Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : null };
  } catch (e) { return null; }
}

// entry = { n: number, t: label }
export async function logSos(entry, { gpsWaitMs = 4000 } = {}) {
  try {
    const loc = (await sosLocationWanted()) ? await position(gpsWaitMs) : null;
    await supabase.rpc('log_sos', { p_number: String(entry.n).replace(/[^\d+]/g, ''), p_label: String(entry.t || '').slice(0, 60),
      p_lat: loc ? loc.lat : null, p_lng: loc ? loc.lng : null, p_acc: loc ? loc.acc : null });
  } catch (e) { /* offline or not signed in: the call itself already happened */ }
}
