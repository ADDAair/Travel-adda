// Who is signed in: name, ID, account type (haji / leader), role, status. Kept on the phone so the app opens offline.
import { createContext, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export const PROFILE_CACHE = 'ta.profileCache.v1';
export const MeCtx = createContext({ me: null, refreshMe: () => {} });
export const useMe = () => useContext(MeCtx);

// Column sets from newest to oldest database step, so the app keeps working before every SQL file is run.
const COLS = [
  'full_name,haji_code,phone,role,status,account_type,phone_verified,email,email_verified,verified',
  'full_name,haji_code,phone,role,status,account_type,phone_verified',
  'full_name,haji_code,phone,role,status,phone_verified',
  'full_name,haji_code,phone,role,status',
];

// The choice made at sign-up ("I am a haji / a group leader") is also kept with the login itself, so a leader
// account still opens the leader screens even before the database step that stores it (007) has been run.
async function signupType() {
  try { const { data } = await supabase.auth.getSession(); return data?.session?.user?.user_metadata?.account_type === 'leader' ? 'leader' : 'haji'; }
  catch (e) { return 'haji'; }
}

export async function loadMe() {
  let cached = null;
  const signedUpAs = await signupType();
  try { cached = JSON.parse((await AsyncStorage.getItem(PROFILE_CACHE)) || 'null'); } catch (e) { cached = null; }
  for (const cols of COLS) {
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ error: { message: 'timeout' } }), 8000));
    // eslint-disable-next-line no-await-in-loop
    const r = await Promise.race([supabase.from('profiles').select(cols).single(), timeout]);
    if (!r.error && r.data) {
      const me = { ...r.data, account_type: r.data.account_type || signedUpAs, offline: false };
      AsyncStorage.setItem(PROFILE_CACHE, JSON.stringify(me)).catch(() => {});
      return me;
    }
    const m = String(r.error?.message || '');
    if (r.error?.code !== '42703' && !/column/i.test(m)) break;    // not a "missing column" problem: stop trying
  }
  return cached ? { ...cached, account_type: cached.account_type || signedUpAs, offline: true } : null;
}

export const isLeaderAccount = (me) => !!me && (me.account_type === 'leader' || me.role === 'leader');
export const isApprovedLeader = (me) => !!me && me.role === 'leader' && me.status === 'active';
export const isStaff = (me) => !!me && (me.role === 'admin' || me.role === 'staff');
