// Location for prayer times and qibla. Used only on this phone; never uploaded anywhere.
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CITIES } from '../content/cities';
import { distanceKm } from './prayer';

const KEY = 'ta.prayerLoc.v1';

export async function loadSavedLocation() {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng)) return v;
  } catch (e) { /* fall through */ }
  return null;
}

export async function saveLocation(loc) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(loc)); } catch (e) { /* the screen still works for this session */ }
}

// Nearest listed city within 60 km, so a GPS position gets a friendly name without any internet lookup.
export function nearLabel(lat, lng) {
  let best = null;
  for (const c of CITIES) {
    const km = distanceKm(lat, lng, c.lat, c.lng);
    if (km <= 60 && (!best || km < best.km)) best = { km, c };
  }
  return best ? best.c.near : 'আপনার বর্তমান অবস্থান';
}

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

// Returns { lat, lng } or { error: 'denied' | 'blocked' | 'off' | 'nofix' }.
export async function getGpsLocation() {
  let perm;
  try { perm = await Location.requestForegroundPermissionsAsync(); } catch (e) { return { error: 'nofix' }; }
  if (!perm || perm.status !== 'granted') return { error: perm && perm.canAskAgain === false ? 'blocked' : 'denied' };
  try { if (!(await Location.hasServicesEnabledAsync())) return { error: 'off' }; } catch (e) { /* continue */ }
  let pos = null;
  try { pos = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeout(20000)]); } catch (e) { pos = null; }
  if (!pos) { try { pos = await Location.getLastKnownPositionAsync(); } catch (e) { pos = null; } }
  if (!pos || !pos.coords) return { error: 'nofix' };
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

// Compass heading. Calls back with { heading, accuracy }; returns a function that stops it, or null when not available.
export async function watchHeading(cb) {
  try {
    const sub = await Location.watchHeadingAsync((h) => {
      const heading = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      if (Number.isFinite(heading)) cb({ heading, accuracy: h.accuracy });
    });
    return () => { try { sub.remove(); } catch (e) { /* already stopped */ } };
  } catch (e) {
    return null;
  }
}
