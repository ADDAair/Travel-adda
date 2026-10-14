import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { C } from '../theme';
import { supabase } from '../lib/supabase';
import { toBn } from '../lib/phone';

export default function HomeScreen() {
  const [p, setP] = useState(null);
  const [state, setState] = useState('load');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('full_name,haji_code,role').single();
        if (!alive) return;
        if (error || !data) setState('err'); else { setP(data); setState('ok'); }
      } catch (e) { if (alive) setState('err'); }
    })();
    return () => { alive = false; };
  }, []);
  if (state === 'load') return <View style={s.c}><ActivityIndicator color={C.primary} size="large" /></View>;
  if (state === 'err') return <View style={s.c}><Text>তথ্য আনা যায়নি। ইন্টারনেট দেখে আবার খুলুন।</Text></View>;
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16 }}>
      <View style={s.hero}>
        <Text style={s.hi}>আস-সালামু আলাইকুম 👋</Text>
        <Text style={s.nm}>{p.full_name}</Text>
        <Text style={s.id}>হাজী আইডি: {toBn(p.haji_code)}</Text>
      </View>
      <Text style={s.note}>✅ লগইন ও ডাটাবেজ সংযোগ ঠিক আছে। এরপর দোয়া ভল্ট, মিকাত গাইড ও অন্য মডিউল যুক্ত হবে।</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  hero: { backgroundColor: C.primary, borderRadius: 16, padding: 18 },
  hi: { color: '#fff' }, nm: { color: '#fff', fontSize: 22, fontWeight: '700', marginVertical: 4 }, id: { color: C.gold, fontWeight: '700' },
  note: { marginTop: 16, color: C.text, lineHeight: 22 },
});
