import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { C, F, S, R, TOUCH } from '../theme';
import { T } from '../strings';
import { Button, Card, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { toBn } from '../lib/phone';
import { useTutorial } from '../tutorial';

const UPCOMING = [
  ['🕋', 'মিকাত ও ইহরাম গাইড', 'ধাপে ধাপে নিয়ম'],
  ['🕌', 'নামাজের সময় ও কিবলা', 'আপনার অবস্থান অনুযায়ী'],
  ['📄', 'আমার কাগজপত্র', 'পাসপোর্ট, ভিসা, টিকেট নিরাপদে'],
  ['👨‍✈️', 'বিশ্বস্ত গ্রুপ লিডার', 'যাচাই করা লিডার খুঁজুন'],
];

export default function HomeScreen({ navigation }) {
  const { handsOnPending, skipHandsOn } = useTutorial();
  const [p, setP] = useState(null);
  const [state, setState] = useState('load');

  const load = useCallback(async () => {
    setState('load');
    try {
      const { data, error } = await supabase.from('profiles').select('full_name,haji_code').single();
      if (error || !data) setState('err'); else { setP(data); setState('ok'); }
    } catch (e) { setState('err'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (state === 'load') {
    return <View style={st.center}><ActivityIndicator color={C.primary} size="large" /><Text style={st.loadT}>আপনার তথ্য আনা হচ্ছে…</Text></View>;
  }
  if (state === 'err') {
    return (
      <View style={st.center}>
        <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।" />
        <Button title={T.retry} icon="🔄" onPress={load} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <View style={st.hero} accessible accessibilityLabel={`আস-সালামু আলাইকুম, ${p.full_name}। আপনার হাজী আইডি ${p.haji_code}`}>
        <Text style={st.hi}>আস-সালামু আলাইকুম 👋</Text>
        <Text style={st.nm}>{p.full_name}</Text>
        <View style={st.idPill}><Text style={st.idT}>হাজী আইডি: {toBn(p.haji_code)}</Text></View>
      </View>

      {handsOnPending ? (
        <Card style={st.coach}>
          <Text style={st.coachH}>✋ একবার চেষ্টা করুন</Text>
          <Text style={st.coachB}>নিচের মাঝখানের <Text style={{ fontWeight: '700' }}>সোনালি "দোয়া"</Text> বাটনে একবার চাপুন।</Text>
          <Text style={st.arrow} importantForAccessibility="no">👇</Text>
          <Pressable onPress={skipHandsOn} style={st.skip} accessibilityRole="button" accessibilityLabel="এখন না, পরে করব">
            <Text style={st.skipT}>এখন না, পরে করব</Text>
          </Pressable>
        </Card>
      ) : null}

      <Text style={st.h2}>এখন ব্যবহার করুন</Text>
      <Pressable onPress={() => navigation.navigate('Dua', { tutorialDone: false })} style={({ pressed }) => [st.ready, pressed && { opacity: 0.9 }]}
        accessibilityRole="button" accessibilityLabel="দোয়া ভল্ট খুলুন। নামাজ, ওমরাহ ও হজের দোয়া">
        <Text style={st.readyIc} importantForAccessibility="no">🤲</Text>
        <View style={{ flex: 1 }}>
          <Text style={st.readyT}>দোয়া ভল্ট</Text>
          <Text style={st.readyW}>নামাজ, ওমরাহ ও হজের দোয়া। ইন্টারনেট ছাড়াও চলে।</Text>
        </View>
        <Text style={st.readyGo}>খুলুন ›</Text>
      </Pressable>

      <Text style={[st.h2, { marginTop: S.lg }]}>যা আসছে</Text>
      <Text style={st.sub}>এই সুবিধাগুলো তৈরি হচ্ছে। তৈরি হলেই এখানে চালু হবে।</Text>
      {UPCOMING.map(([ic, title, what]) => (
        <View key={title} style={st.row} accessible accessibilityLabel={`${title}, ${what}, ${T.soon}`}>
          <Text style={st.rowIc} importantForAccessibility="no">{ic}</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.rowT}>{title}</Text>
            <Text style={st.rowW}>{what}</Text>
          </View>
          <View style={st.soon}><Text style={st.soonT}>{T.soon}</Text></View>
        </View>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.lg, backgroundColor: C.bg, gap: S.md },
  loadT: { fontSize: F.body, color: C.muted },
  wrap: { padding: S.md, paddingBottom: S.xl },
  hero: { backgroundColor: C.primary, borderRadius: R.lg, padding: S.lg, marginBottom: S.md },
  hi: { color: '#E3F1E9', fontSize: F.body },
  nm: { color: C.onPrimary, fontSize: F.hero, fontWeight: '700', marginVertical: 4, lineHeight: 38 },
  idPill: { alignSelf: 'flex-start', backgroundColor: C.gold, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: 6, marginTop: 4 },
  idT: { color: C.text, fontWeight: '700', fontSize: F.body },
  coach: { borderWidth: 2, borderColor: C.gold, marginBottom: S.md, backgroundColor: C.goldSoft },
  coachH: { fontSize: F.large, fontWeight: '700', color: C.text },
  coachB: { fontSize: F.body, color: C.text, marginTop: 6, lineHeight: 28 },
  arrow: { fontSize: 36, textAlign: 'center', marginTop: 4 },
  skip: { minHeight: TOUCH, justifyContent: 'center', alignSelf: 'center', paddingHorizontal: S.md },
  skipT: { fontSize: F.small, color: C.primary, fontWeight: '700', textDecorationLine: 'underline' },
  h2: { fontSize: F.title, fontWeight: '700', color: C.text, marginTop: S.sm },
  sub: { fontSize: F.small, color: C.muted, marginBottom: S.sm, lineHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.line },
  rowIc: { fontSize: 30 },
  rowT: { fontSize: F.large, fontWeight: '700', color: C.text },
  rowW: { fontSize: F.small, color: C.muted, lineHeight: 22 },
  ready: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.lg, padding: S.md, marginTop: S.sm, borderWidth: 2, borderColor: C.primary, minHeight: 84 },
  readyIc: { fontSize: 36 },
  readyT: { fontSize: F.large, fontWeight: '700', color: C.primary },
  readyW: { fontSize: F.small, color: C.text, lineHeight: 22 },
  readyGo: { fontSize: F.body, color: C.primary, fontWeight: '700' },
  soon: { backgroundColor: '#ECEFED', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  soonT: { fontSize: 14, color: C.muted, fontWeight: '700' },
});
