import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R, TOUCH } from '../theme';
import { Button } from '../components/ui';
import { toBn } from '../lib/phone';

// Keep this in step with what really works in the app (no promises for features that are not built yet).
const SLIDES = [
  { icon: '🕋', title: 'আস-সালামু আলাইকুম!', body: 'Travel Adda-তে আপনাকে স্বাগতম। হজ ও ওমরাহর সফরে এই অ্যাপ আপনার পাশে থাকবে।' },
  {
    icon: '✅', title: 'এখনই যা ব্যবহার করতে পারবেন', list: [
      ['🕌', 'নামাজের সময় ও কিবলা', 'আপনার জায়গা অনুযায়ী সময়, কম্পাসে কিবলা'],
      ['🤲', 'দোয়া ও আল-কুরআন', '৪৫টি দোয়া, ১১৪ সূরা, বাংলা উচ্চারণ ও অর্থ'],
      ['👥', 'আমার দল ও লিডার', 'যাচাই করা লিডার, ফোন, প্যাকেজের শর্তে সম্মতি'],
      ['📄', 'আমার কাগজপত্র', 'পাসপোর্ট, ভিসা, টিকেটের ছবি নিরাপদে রাখা'],
      ['🕋', 'মীকাত ও ইহরাম গাইড', 'কোথায়, কীভাবে ইহরাম বাঁধবেন'],
      ['🔄', 'ওমরাহ ধাপে ধাপে', 'তাওয়াফ ও সাঈর চক্কর গোনার বাটনসহ'],
      ['⛺', 'হজের দিনগুলো', '৮ থেকে ১৩ জিলহজ, দিন অনুযায়ী করণীয়'],
      ['📚', 'আরও গাইড', 'স্বাস্থ্য, আরবি কথা, প্রস্তুতি, জানাজা, কসর, যিয়ারত'],
      ['🧎', 'নামাজের রাকাত ও নিয়ম', 'অজু, নামাজ, জুমা, বিতর, ঈদ; তাসবিহ ও দিনপঞ্জি'],
    ],
  },
  { icon: '👇', title: 'নিচের ৫টি বাটন', body: null, tabs: true },
  {
    icon: '💡', title: 'সহজে ব্যবহারের কয়েকটি কথা', list: [
      ['🏠', 'সব কিছু হোম থেকে', 'হোমের বড় কার্ডে চাপ দিলেই খুলবে। ওপরে পরের নামাজের সময় থাকবে।'],
      ['📶', 'ইন্টারনেট ছাড়াও চলে', 'দোয়া, কুরআন, গাইড ও নামাজের সময় হারামের ভেতরেও খুলবে।'],
      ['‹', 'পেছনে যেতে', 'ওপরের "‹" লেখায় বা ফোনের পেছনের বাটনে চাপুন।'],
      ['🔠', 'লেখা বড় করতে', '"আমার তথ্য" পাতায় লেখার আকার বদলানো যায়।'],
      ['🔁', 'ভুলে গেলে আবার দেখুন', '"আমার তথ্য" পাতা থেকে এই পরিচিতি যেকোনো সময় আবার দেখা যাবে।'],
    ],
  },
];
const TABS = [
  ['🏠', 'হোম', 'সব গাইড, পরের নামাজের সময়'],
  ['🆘', 'জরুরি', 'জরুরি নম্বর, লিডারকে ফোন, পথ হারালে আরবি কার্ড'],
  ['🤲', 'দোয়া', 'মাঝের সোনালি বড় বাটন: দোয়া ও আল-কুরআন'],
  ['🎁', 'অফার', 'প্যাকেজ ও অফার (শীঘ্রই আসছে)'],
  ['👤', 'আমার তথ্য', 'আপনার ছবি, হাজী আইডি, পরিচিতি আবার দেখা, লগআউট'],
];

export default function Onboarding({ onDone }) {
  const [i, setI] = useState(0);
  const ins = useSafeAreaInsets();
  const sl = SLIDES[i];
  const last = i === SLIDES.length - 1;
  return (
    <View style={[st.wrap, { paddingTop: ins.top + S.sm, paddingBottom: Math.max(ins.bottom, S.md) }]}>
      <View style={st.top}>
        <Text style={st.step} accessibilityLabel={`${SLIDES.length}টির মধ্যে ${i + 1} নম্বর পাতা`}>{toBn(i + 1)} / {toBn(SLIDES.length)}</Text>
        {!last ? (
          <Pressable onPress={onDone} style={st.skip} accessibilityRole="button" accessibilityLabel="এড়িয়ে যান" accessibilityHint="পরিচিতি বাদ দিয়ে সরাসরি শুরু করুন">
            <Text style={st.skipT}>এড়িয়ে যান</Text>
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
        {i > 0 ? <Button title="পেছনে" kind="secondary" onPress={() => setI(i - 1)} style={{ flex: 1 }} /> : null}
        <Button title={last ? 'শুরু করুন' : 'পরবর্তী'} kind={last ? 'accent' : 'primary'} onPress={() => (last ? onDone() : setI(i + 1))} style={{ flex: 2 }} />
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
