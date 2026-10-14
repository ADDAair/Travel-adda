import 'react-native-get-random-values';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import aesjs from 'aes-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

// Session is stored encrypted: the AES key lives in the device's secure keystore,
// the (large) encrypted session lives in AsyncStorage.
class LargeSecureStore {
  async _encrypt(key, value) {
    const k = crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(k, new aesjs.Counter(1));
    const enc = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(k));
    return aesjs.utils.hex.fromBytes(enc);
  }
  async _decrypt(key, value) {
    const kHex = await SecureStore.getItemAsync(key);
    if (!kHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(kHex), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
  }
  async getItem(key) {
    const enc = await AsyncStorage.getItem(key);
    if (!enc) return null;
    try { return await this._decrypt(key, enc); } catch (e) { return null; }
  }
  async setItem(key, value) { await AsyncStorage.setItem(key, await this._encrypt(key, value)); }
  async removeItem(key) { await AsyncStorage.removeItem(key); await SecureStore.deleteItemAsync(key); }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: new LargeSecureStore(), autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
