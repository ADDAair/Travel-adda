import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, S, R, TOUCH } from '../theme';
import { Button, Notice } from '../components/ui';
import { StepCard, RoundCounter } from '../components/guide';
import { toBn } from '../lib/phone';
import { umrahL } from '../content/umrah';
import { ihramL, CONTENT_REVIEWED } from '../content/ihram';
import { tr } from '../lib/lang';

const UM = umrahL; const IH = ihramL;   // in the chosen language
import type { ScrollRef } from '../components/KbScroll';
import type { Nav } from './navTypes';

const STEP_KEY = 'ta.umrahStep.v1';

// Umrah, one step per page, so it can be followed live inside the Haram. The current step is remembered.
export default function UmrahScreen({ navigation }: { navigation: Nav }) {
  const [i, setI] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<ScrollRef | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(STEP_KEY).then((v) => { const n = Number(v); if (n >= 0 && n < UM().UMRAH_STEPS.length) setI(n); }).catch(() => {});
  }, []);
  const go = (n: number) => {
    setI(n); setShowAll(false);
    AsyncStorage.setItem(STEP_KEY, String(n)).catch(() => {});
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };
  const s = UM().UMRAH_STEPS[i];
  const last = i === UM().UMRAH_STEPS.length - 1;
  const counter = s.counter ? (UM().COUNTERS as Record<string, (typeof UM().COUNTERS)[keyof typeof UM().COUNTERS]>)[s.counter] : null;

  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}>
        <Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text>
      </Pressable>
      <View style={st.topRow}>
        <Text style={st.progress} accessibilityLiveRegion="polite">{tr('ধাপ', 'Step')} {toBn(i + 1)} / {toBn(UM().UMRAH_STEPS.length)}</Text>
        <Pressable onPress={() => setShowAll(!showAll)} style={st.allBtn} accessibilityRole="button" accessibilityState={{ expanded: showAll }}
          accessibilityLabel={showAll ? tr('ধাপের তালিকা লুকান', 'Hide the list of steps') : tr('সব ধাপের তালিকা দেখুন', 'See the list of all steps')}>
          <Text style={st.allBtnT}>{showAll ? tr('তালিকা লুকান ▲', 'Hide list ▲') : tr('সব ধাপ ▼', 'All steps ▼')}</Text>
        </Pressable>
      </View>
      <View style={st.dots} importantForAccessibility="no-hide-descendants">
        {UM().UMRAH_STEPS.map((_, k) => <View key={k} style={[st.dot, k <= i && st.dotOn]} />)}
      </View>

      {showAll ? (
        <View style={{ marginBottom: S.md }}>
          {UM().UMRAH_STEPS.map((x, k) => (
            <Pressable key={k} onPress={() => go(k)} style={[st.item, k === i && st.itemOn]} accessibilityRole="button"
              accessibilityLabel={tr(`ধাপ ${k + 1}: ${x.title}${k === i ? '। এখন এই ধাপে আছেন' : ''}`, `Step ${k + 1}: ${x.title}${k === i ? '. You are on this step now' : ''}`)}>
              <View style={[st.num, k < i && st.numDone]}><Text style={st.numT}>{k < i ? '✓' : toBn(k + 1)}</Text></View>
              <Text style={st.itemT}>{x.title}</Text>
              {k === i ? <Text style={st.here}>{tr('এখানে', 'Here')}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <StepCard step={s} images={IH().IMAGES}>
        {counter ? <RoundCounter storageKey={counter.key} title={counter.title} labelFor={(counter as { labelFor?: (i: number) => string }).labelFor} /> : null}
        {s.link ? <Button title={tr('মীকাত ও ইহরাম গাইড খুলুন', 'Open the Miqat and Ihram guide')} icon="🕋" kind="secondary" onPress={() => navigation.navigate(s.link)} style={{ marginTop: S.md }} /> : null}
      </StepCard>

      {last ? <Notice kind="ok" title={tr('আপনার ওমরাহ সম্পূর্ণ হলো', 'Your Umrah is complete')} text={tr('আল্লাহ আপনার ওমরাহ কবুল করুন। পরের ওমরাহর আগে চক্কর গণনা শূন্য করে নেবেন।', 'May Allah accept your Umrah. Reset the round counts before your next Umrah.')} /> : null}
      {!last ? <Button title={tr('পরের ধাপ ›', 'Next step ›')} onPress={() => go(i + 1)} /> : <Button title={tr('প্রথম ধাপে ফিরে যান', 'Back to the first step')} icon="↺" kind="secondary" onPress={() => go(0)} />}
      {i > 0 ? <Button title={tr('‹ আগের ধাপ', '‹ Previous step')} kind="secondary" onPress={() => go(i - 1)} style={{ marginTop: S.sm }} /> : null}

      <Text style={st.saved}>{tr('📌 অ্যাপ বন্ধ করলেও আপনি কোন ধাপে ছিলেন তা মনে থাকবে।', '📌 The app remembers which step you were on, even if you close it.')}</Text>
      {!CONTENT_REVIEWED ? <Text style={st.review}>{tr('ℹ️ তথ্যগুলো কুরআন ও সহিহ হাদিসের সূত্র থেকে নেওয়া, হানাফি নিয়ম অনুযায়ী। চূড়ান্ত প্রকাশের আগে একজন আলেম দিয়ে যাচাই করা হবে। সন্দেহ হলে লিডার বা আলেমকে জিজ্ঞেস করুন।', 'ℹ️ The information is taken from the Quran and authentic hadith, following the Hanafi method. Before the final release it will be checked by a scholar (alim). If in doubt, ask your leader or a scholar.')}</Text> : null}
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
