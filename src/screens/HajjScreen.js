import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, BackHandler } from 'react-native';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button } from '../components/ui';
import { StepCard } from '../components/guide';
import { toBn } from '../lib/phone';
import { HAJJ_DAYS } from '../content/hajj';
import { IMAGES, CONTENT_REVIEWED } from '../content/ihram';

// Hajj guide: one page per day, opened from a short list.
export default function HajjScreen({ navigation }) {
  const [open, setOpen] = useState(null);
  const scrollRef = useRef(null);
  const go = (id) => { setOpen(id); requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false })); };

  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(null); return true; });
    return () => sub.remove();
  }, [open]);
  useEffect(() => navigation?.addListener?.('blur', () => setOpen(null)), [navigation]);

  const ix = HAJJ_DAYS.findIndex((d) => d.id === open);
  const day = ix >= 0 ? HAJJ_DAYS[ix] : null;
  const nextDay = ix >= 0 && ix < HAJJ_DAYS.length - 1 ? HAJJ_DAYS[ix + 1] : null;

  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {day ? (
        <>
          <Pressable onPress={() => setOpen(null)} style={st.back} accessibilityRole="button" accessibilityLabel="হজের সব দিনের তালিকায় ফিরে যান">
            <Text style={st.backT}>‹ সব দিন</Text>
          </Pressable>
          <Text style={st.title} accessibilityRole="header">{day.icon} {day.title}</Text>
          {day.steps.map((s, k) => (
            <StepCard key={k} step={{ ...s, title: `${toBn(k + 1)}. ${s.title}` }} images={IMAGES} />
          ))}
          {nextDay ? <Button title={`পরের অংশ: ${nextDay.title}`} icon="›" onPress={() => go(nextDay.id)} /> : null}
          <Button title="হজের সব দিনের তালিকায় ফিরুন" icon="‹" kind="secondary" onPress={() => setOpen(null)} style={{ marginTop: S.sm }} />
        </>
      ) : (
        <>
          <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান">
            <Text style={st.backT}>‹ হোম</Text>
          </Pressable>
          <Text style={st.lead}>হজের দিনগুলো ক্রম অনুযায়ী সাজানো। যে দিনের কাজ জানতে চান, সেটিতে চাপ দিন।</Text>
          {HAJJ_DAYS.map((d, i) => (
            <Pressable key={d.id} onPress={() => go(d.id)} style={({ pressed }) => [st.row, pressed && { opacity: 0.85 }]}
              accessibilityRole="button" accessibilityLabel={`${d.title}। ${d.what}`} accessibilityHint="অংশটি খুলবে">
              <View style={st.num}><Text style={st.numT}>{toBn(i + 1)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={st.rowT}>{d.icon} {d.title}</Text>
                <Text style={st.rowW}>{d.what}</Text>
              </View>
              <Text style={st.openT}>খুলুন ›</Text>
            </Pressable>
          ))}
          <Text style={st.offline}>📶 এই গাইড ইন্টারনেট ছাড়াও খোলে।</Text>
        </>
      )}
      {!CONTENT_REVIEWED ? <Text style={st.review}>ℹ️ তথ্যগুলো কুরআন ও সহিহ হাদিসের সূত্র থেকে নেওয়া, তামাত্তু হজ ও হানাফি নিয়ম অনুযায়ী। চূড়ান্ত প্রকাশের আগে একজন আলেম দিয়ে যাচাই করা হবে। সন্দেহ হলে লিডার বা আলেমকে জিজ্ঞেস করুন।</Text> : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 36, marginBottom: S.md },
  lead: { fontSize: F.body, color: C.text, lineHeight: 28, marginBottom: S.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.line, minHeight: 80, ...shadow },
  num: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.goldSoft, borderWidth: 1.5, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  numT: { fontSize: F.body, fontWeight: '700', color: C.text },
  rowT: { fontSize: F.large, fontWeight: '700', color: C.text, lineHeight: 30 },
  rowW: { fontSize: F.small, color: C.muted, lineHeight: 22, marginTop: 2 },
  openT: { fontSize: F.small, color: C.primary, fontWeight: '700' },
  offline: { fontSize: F.small, color: C.muted, textAlign: 'center', marginTop: S.sm },
  review: { fontSize: 14, color: C.muted, marginTop: S.lg, lineHeight: 22, textAlign: 'center' },
});
