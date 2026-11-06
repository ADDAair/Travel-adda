import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R, TOUCH } from '../theme';
import { Button } from '../components/ui';
import { toBn } from '../lib/phone';
import { T } from '../strings';

// Keep this in step with what really works in the app (no promises for features that are not built yet).
// The texts are in strings.ts / stringsEn.ts (onboard), so they follow the chosen language.
type Slide = { icon: string; title: string; body?: string | null; list?: [string, string, string][]; tabs?: boolean };
const slides = (): Slide[] => {
  const O = T.onboard;
  return [
    { icon: '🕋', title: O.welcomeT, body: O.welcome },
    { icon: '✅', title: O.nowT, list: O.now },
    { icon: '👇', title: O.tabsT, body: null, tabs: true },
    { icon: '💡', title: O.tipsT, list: O.tips },
  ];
};

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const ins = useSafeAreaInsets();
  const O = T.onboard; const SLIDES = slides(); const TABS = O.tabs;
  const sl = SLIDES[i];
  const last = i === SLIDES.length - 1;
  return (
    <View style={[st.wrap, { paddingTop: ins.top + S.sm, paddingBottom: Math.max(ins.bottom, S.md) }]}>
      <View style={st.top}>
        <Text style={st.step} accessibilityLabel={O.pageA11y(i + 1, SLIDES.length)}>{toBn(i + 1)} / {toBn(SLIDES.length)}</Text>
        {!last ? (
          <Pressable onPress={onDone} style={st.skip} accessibilityRole="button" accessibilityLabel={O.skip} accessibilityHint={O.skipHint}>
            <Text style={st.skipT}>{O.skip}</Text>
          </Pressable>
        ) : <View style={{ height: TOUCH }} />}
      </View>
      <ScrollView contentContainerStyle={st.body}>
        <Text style={st.icon} importantForAccessibility="no">{sl.icon}</Text>
        <Text style={st.title} accessibilityRole="header">{sl.title}</Text>
        {sl.body ? <Text style={st.text}>{sl.body}</Text> : null}
        {sl.list ? (
          <View style={st.tabList}>
            {sl.list.map(([ic, name, what]) => (
              <View key={name} style={st.tabRow} accessible accessibilityLabel={`${name}। ${what}`}>
                <Text style={st.tabIc} importantForAccessibility="no">{ic}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.tabName}>{name}</Text>
                  <Text style={st.tabWhat}>{what}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
        {sl.tabs ? (
          <View style={st.tabList}>
            {TABS.map(([ic, name, what]) => (
              <View key={name} style={st.tabRow} accessible accessibilityLabel={`${name}। ${what}`}>
                <Text style={st.tabIc} importantForAccessibility="no">{ic}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.tabName}>{name}</Text>
                  <Text style={st.tabWhat}>{what}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
        <View style={st.dots} importantForAccessibility="no-hide-descendants">
          {SLIDES.map((_, k) => <View key={k} style={[st.dot, k === i && st.dotOn]} />)}
        </View>
      </ScrollView>
      <View style={st.nav}>
        {i > 0 ? <Button title={O.back} kind="secondary" onPress={() => setI(i - 1)} style={{ flex: 1 }} /> : null}
        <Button title={last ? O.start : O.next} kind={last ? 'accent' : 'primary'} onPress={() => (last ? onDone() : setI(i + 1))} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, paddingHorizontal: S.lg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  step: { fontSize: F.body, color: C.muted, fontWeight: '700' },
  skip: { minHeight: TOUCH, minWidth: TOUCH, paddingHorizontal: S.md, justifyContent: 'center', borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line },
  skipT: { fontSize: F.body, color: C.primary, fontWeight: '700' },
  body: { flexGrow: 1, justifyContent: 'center', paddingVertical: S.lg },
  icon: { fontSize: 84, textAlign: 'center', marginBottom: S.md },
  title: { fontSize: F.hero, fontWeight: '700', color: C.primary, textAlign: 'center', marginBottom: S.md, lineHeight: 40 },
  text: { fontSize: F.large, color: C.text, textAlign: 'center', lineHeight: 32 },
  tabList: { gap: S.sm, marginTop: S.sm },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.line },
  tabIc: { fontSize: 30 },
  tabName: { fontSize: F.large, fontWeight: '700', color: C.text },
  tabWhat: { fontSize: F.body, color: C.muted, lineHeight: 26 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: S.lg },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.line },
  dotOn: { width: 28, backgroundColor: C.primary },
  nav: { flexDirection: 'row', gap: S.md },
});
