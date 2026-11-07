// Offline step 2: a small strip under the page title on every page while the server cannot be reached.
// While offline it checks again by itself every 15 seconds, so it goes away as soon as the internet is back.
import React, { useEffect, useState, type JSX } from 'react';
import { Text, View } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';
import { isOffline, onNetChange, markOnline, netStripText } from '../lib/netState';
import { C, F, S } from '../theme';

async function checkAgain(): Promise<void> {
  try { await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY } }); markOnline(); } catch (e) { /* still offline */ }
}

export function NetStrip(): JSX.Element | null {
  const [off, setOff] = useState(isOffline());
  useEffect(() => onNetChange(setOff), []);
  useEffect(() => {
    if (!off) return undefined;
    const t = setInterval(checkAgain, 15000);
    return () => clearInterval(t);
  }, [off]);
  if (!off) return null;
  const text = netStripText();
  return (
    <View accessible accessibilityRole="alert" accessibilityLiveRegion="polite" accessibilityLabel={text}
      style={{ backgroundColor: C.warnSoft, borderBottomWidth: 2, borderColor: C.warn, paddingHorizontal: S.md, paddingVertical: S.sm }}>
      <Text style={{ color: C.text, fontSize: F.body, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}
