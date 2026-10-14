// Small per-device settings (not sensitive): tutorial progress.
import AsyncStorage from '@react-native-async-storage/async-storage';
const K = { onboarded: 'ta.onboarded.v1', handsOn: 'ta.handsOnDone.v1' };
async function get(k) { try { return (await AsyncStorage.getItem(k)) === '1'; } catch (e) { return false; } }
async function set(k, v) { try { if (v) await AsyncStorage.setItem(k, '1'); else await AsyncStorage.removeItem(k); } catch (e) {} }
export const prefs = {
  isOnboarded: () => get(K.onboarded), setOnboarded: (v) => set(K.onboarded, v),
  isHandsOnDone: () => get(K.handsOn), setHandsOnDone: (v) => set(K.handsOn, v),
};
