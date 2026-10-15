import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, S, R, TOUCH } from '../theme';
import { Button, Notice } from '../components/ui';
import { StepCard, RoundCounter } from '../components/guide';
import { toBn } from '../lib/phone';
import { UMRAH_STEPS, COUNTERS } from '../content/umrah';
import { IMAGES, CONTENT_REVIEWED } from '../content/ihram';

const STEP_KEY = 'ta.umrahStep.v1';

// Umrah, one step per page, so it can be followed live inside the Haram. The current step is remembered.
export default function UmrahScreen({ navigation }) {
  const [i, setI] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef(null);
  useEffect(() => {
    AsyncStorage.getItem(STEP_KEY).then((v) => { const n = Number(v); if (n >= 0 && n < UMRAH_STEPS.length) setI(n); }).catch(() => {});
  }, []);
  const go = (n) => {
    setI(n); setShowAll(false);
    AsyncStorage.setItem(STEP_KEY, String(n)).catch(() => {});
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };
  const s = UMRAH_STEPS[i];
  const last = i === UMRAH_STEPS.length - 1;
  const counter = s.counter ? COUNTERS[s.counter] : null;

  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান">
        <Text style={st.backT}>‹ হোম</Text>
      </Pressable>
      <View style={st.topRow}>
        <Text style={st.progress} accessibilityLiveRegion="polite">ধাপ {toBn(i + 1)} / {toBn(UMRAH_STEPS.length)}</Text>
        <Pressable onPress={() => setShowAll(!showAll)} style={st.allBtn} accessibilityRole="button" accessibilityState={{ expanded: showAll }}
          accessibilityLabel={showAll ? 'ধাপের তালিকা লুকান' : 'সব ধাপের তালিকা দেখুন'}>
          <Text style={st.allBtnT}>{showAll ? 'তালিকা লুকান ▲' : 'সব ধাপ ▼'}</Text>
        </Pressable>
      </View>
      <View style={st.dots} importantForAccessibility="no-hide-descendants">
        {UMRAH_STEPS.map((_, k) => <View key={k} style={[st.dot, k <= i && st.dotOn]} />)}
      </View>

      {showAll ? (
        <View style={{ marginBottom: S.md }}>
          {UMRAH_STEPS.map((x, k) => (
            <Pressable key={k} onPress={() => go(k)} style={[st.item, k === i && st.itemOn]} accessibilityRole="button"
              accessibilityLabel={`ধাপ ${k + 1}: ${x.title}${k === i ? '। এখন এই ধাপে আছেন' : ''}`}>
              <View style={[st.num, k < i && st.numDone]}><Text style={st.numT}>{k < i ? '✓' : toBn(k + 1)}</Text></View>
              <Text style={st.itemT}>{x.title}</Text>
              {k === i ? <Text style={st.here}>এখানে</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <StepCard step={s} images={IMAGES}>
        {counter ? <RoundCounter storageKey={counter.key} title={counter.title} labelFor={counter.labelFor} /> : null}
        {s.link ? <Button title="মীকাত ও ইহরাম গাইড খুলুন" icon="🕋" kind="secondary" onPress={() => navigation.navigate(s.link)} style={{ marginTop: S.md }} /> : null}
      </StepCard>

      {last ? <Notice kind="ok" title="আপনার ওমরাহ সম্পূর্ণ হলো" text="আল্লাহ আপনার ওমরাহ কবুল করুন। পরের ওমরাহর আগে চক্কর গণনা শূন্য করে নেবেন।" /> : null}
      {!last ? <Button title="পরের ধাপ ›" onPress={() => go(i + 1)} /> : <Button title="প্রথম ধাপে ফিরে যান" icon="↺" kind="secondary" onPress={() => go(0)} />}
      {i > 0 ? <Button title="‹ আগের ধাপ" kind="secondary" onPress={() => go(i - 1)} style={{ marginTop: S.sm }} /> : null}

      <Text style={st.saved}>📌 অ্যাপ বন্ধ করলেও আপনি কোন ধাপে ছিলেন তা মনে থাকবে।</Text>
      {!CONTENT_REVIEWED ? <Text style={st.review}>ℹ️ তথ্যগুলো কুরআন ও সহিহ হাদিসের সূত্র থেকে নেওয়া, হানাফি নিয়ম অনুযায়ী। চূড়ান্ত প্রকাশের আগে একজন আলেম দিয়ে যাচাই করা হবে। সন্দেহ হলে লিডার বা আলেমকে জিজ্ঞেস করুন।</Text> : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  progress: { fontSize: F.body, fontWeight: '700', color: C.primary, marginVertical: S.sm },
  allBtn: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.sm },
  allBtnT: { fontSize: F.small, fontWeight: '700', color: C.primary, textDecorationLine: 'underline' },
  dots: { flexDirection: 'row', gap: 4, marginBottom: S.md },
  dot: { flex: 1, height: 8, borderRadius: 4, backgroundColor: C.line },
  dotOn: { backgroundColor: C.accent },
  item: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 56, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: S.md, marginBottom: 6 },
  itemOn: { borderColor: C.primary, backgroundColor: C.primarySoft, borderWidth: 2 },
  num: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.goldSoft, borderWidth: 1.5, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  numDone: { backgroundColor: C.okSoft, borderColor: C.ok },
  numT: { fontSize: F.small, fontWeight: '700', color: C.text },
  itemT: { flex: 1, fontSize: F.body, color: C.text, fontWeight: '600', lineHeight: 26 },
  here: { fontSize: 14, fontWeight: '700', color: C.primary },
  saved: { fontSize: F.small, color: C.muted, textAlign: 'center', marginTop: S.md, lineHeight: 22 },
  review: { fontSize: 14, color: C.muted, marginTop: S.md, lineHeight: 22, textAlign: 'center' },
});
