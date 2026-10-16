import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Notice } from '../components/ui';
import { toBn } from '../lib/phone';
import { hijri, fmtDate } from '../lib/prayer';

// Islamic dates with an authentic basis. Dates come from the tabular Hijri calendar; the real day depends on the
// moon sighting and can differ by a day (and between Saudi Arabia and Bangladesh).
const EVENTS = [
  { m: 1, d: 1, icon: '🌙', t: 'ইসলামি নববর্ষ (১ মুহাররম)' },
  { m: 1, d: 9, icon: '🍽️', t: 'আশুরার রোজা (৯ ও ১০ মুহাররম)', note: 'আশুরার রোজা আগের বছরের গুনাহের কাফফারা। সাথে ৯ তারিখেও রাখা সুন্নত।', src: 'মুসলিম ১১৬২, ১১৩৪' },
  { m: 9, d: 1, icon: '🌙', t: 'রমজান শুরু', src: 'সূরা বাকারা ২:১৮৫' },
  { m: 9, d: 21, icon: '✨', t: 'রমজানের শেষ দশক: লাইলাতুল কদর খুঁজুন', note: 'শেষ দশকের বিজোড় রাতগুলোতে বেশি ইবাদত করুন।', src: 'বুখারি ২০১৭' },
  { m: 10, d: 1, icon: '🎉', t: 'ঈদুল ফিতর', note: 'ঈদের দিন রোজা রাখা নিষেধ। নামাজের আগে সদকাতুল ফিতর দিন।', src: 'বুখারি ১৫০৯' },
  { m: 10, d: 2, icon: '🍽️', t: 'শাওয়ালের ছয় রোজা রাখা যায়', note: 'রমজানের পর শাওয়ালে ছয় রোজা রাখলে সারা বছর রোজার সওয়াব।', src: 'মুসলিম ১১৬৪' },
  { m: 12, d: 1, icon: '⭐', t: 'জিলহজের প্রথম দশক', note: 'বছরের সবচেয়ে ফজিলতের দিনগুলো। বেশি বেশি জিকির ও নেক আমল করুন।', src: 'বুখারি ৯৬৯' },
  { m: 12, d: 8, icon: '⛺', t: 'হজ শুরু (৮ জিলহজ, মিনায় যাত্রা)' },
  { m: 12, d: 9, icon: '🏔️', t: 'আরাফার দিন', note: 'যারা হজে নেই, তাদের জন্য এই দিনের রোজা আগের ও পরের বছরের গুনাহের কাফফারা।', src: 'মুসলিম ১১৬২' },
  { m: 12, d: 10, icon: '🐑', t: 'ঈদুল আজহা' },
  { m: 12, d: 11, icon: '⛔', t: 'আইয়ামে তাশরিক (১১-১৩ জিলহজ)', note: 'এই দিনগুলোতে রোজা রাখা নিষেধ। প্রতি ফরজের পর তাকবিরে তাশরিক।', src: 'মুসলিম ১১৪১' },
];
const HM = ['মুহাররম', 'সফর', 'রবিউল আউয়াল', 'রবিউস সানি', 'জমাদিউল আউয়াল', 'জমাদিউস সানি', 'রজব', 'শাবান', 'রমজান', 'শাওয়াল', 'জিলকদ', 'জিলহজ'];
const DAY = 86400000;

export default function CalendarScreen({ navigation }) {
  const data = useMemo(() => {
    const now = new Date();
    const base = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const g = (k) => { const t = new Date(base + k * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
    const todayG = g(0);
    const todayH = hijri(todayG.y, todayG.m, todayG.d);
    const found = []; let bid = null; let monthEnd = null;
    for (let k = 0; k <= 400; k++) {
      const gd = g(k); const h = hijri(gd.y, gd.m, gd.d);
      const ev = EVENTS.find((e) => e.m === h.m && e.d === h.d);
      if (ev && !found.some((f) => f.ev === ev)) found.push({ ev, k, gd, h });
      if (!bid && h.d === 13) bid = { k, gd };
      if (!monthEnd && k > 0 && h.d === 1) monthEnd = { k, gd, h };
    }
    return { todayG, todayH, found, bid, monthEnd };
  }, []);
  const { todayG, todayH, found, bid, monthEnd } = data;
  const left = (k) => (k === 0 ? 'আজ' : k === 1 ? 'আগামীকাল' : `আর ${toBn(k)} দিন`);
  const hajj = found.find((f) => f.ev.m === 12 && f.ev.d === 8);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.goBack()} style={st.back} accessibilityRole="button" accessibilityLabel="ফিরে যান">
        <Text style={st.backT}>‹ ফিরে যান</Text>
      </Pressable>
      <Text style={st.title} accessibilityRole="header">📅 ইসলামি দিনপঞ্জি</Text>
      <View style={st.today}>
        <Text style={st.todayL}>আজ</Text>
        <Text style={st.todayH}>{toBn(todayH.d)} {HM[todayH.m - 1]} {toBn(todayH.y)} হিজরি</Text>
        <Text style={st.todayG}>{fmtDate(todayG.y, todayG.m, todayG.d).greg}</Text>
        {monthEnd ? <Text style={st.todayG}>পরের মাস ({HM[monthEnd.h.m - 1]}) শুরু: {left(monthEnd.k)}</Text> : null}
      </View>
      {hajj ? <Notice kind="info" title={`⛺ হজ শুরু হতে ${left(hajj.k)}`} text={`৮ জিলহজ, আনুমানিক ${fmtDate(hajj.gd.y, hajj.gd.m, hajj.gd.d).greg}`} /> : null}
      <Text style={st.h}>সামনের গুরুত্বপূর্ণ দিন</Text>
      {found.map(({ ev, k, gd, h }) => (
        <View key={ev.t} style={st.card}>
          <View style={st.cardTop}>
            <Text style={st.ic} importantForAccessibility="no">{ev.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.evT}>{ev.t}</Text>
              <Text style={st.evD}>{toBn(h.d)} {HM[h.m - 1]} · {fmtDate(gd.y, gd.m, gd.d).greg}</Text>
            </View>
            <View style={st.pill}><Text style={st.pillT}>{left(k)}</Text></View>
          </View>
          {ev.note ? <Text style={st.note}>{ev.note}</Text> : null}
          {ev.src ? <Text style={st.src}>📚 {ev.src}</Text> : null}
        </View>
      ))}
      <View style={st.card}>
        <Text style={st.evT}>🍽️ প্রতি মাসের নফল রোজা</Text>
        <Text style={st.note}>আইয়ামে বিজ: প্রতি হিজরি মাসের ১৩, ১৪ ও ১৫ তারিখ।{bid ? ` পরেরটি ${left(bid.k)} (${fmtDate(bid.gd.y, bid.gd.m, bid.gd.d).greg})।` : ''} এছাড়া প্রতি সোমবার ও বৃহস্পতিবার।</Text>
        <Text style={st.src}>📚 তিরমিযি ৭৬১, ৭৪৫</Text>
      </View>
      <Notice kind="warn" title="তারিখ আনুমানিক" text="হিজরি তারিখ হিসাব করে দেখানো হয়েছে। আসল দিন চাঁদ দেখার ওপর নির্ভর করে, এক দিন আগে-পরে হতে পারে। বাংলাদেশ ও সৌদি আরবে আলাদা দিনে হতে পারে। ঘোষণা অনুযায়ী চলুন।" />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 36, marginBottom: S.md },
  today: { backgroundColor: C.primary, borderRadius: R.lg, padding: S.lg, alignItems: 'center', marginBottom: S.md },
  todayL: { color: C.onPrimarySoft, fontSize: F.body },
  todayH: { color: C.onPrimary, fontSize: F.hero, fontWeight: '700', textAlign: 'center', lineHeight: 40 },
  todayG: { color: C.onPrimarySoft, fontSize: F.body, textAlign: 'center', marginTop: 2 },
  h: { fontSize: F.large, fontWeight: '700', color: C.text, marginTop: S.sm, marginBottom: S.sm },
  card: { backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, ...shadow },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  ic: { fontSize: 28 },
  evT: { fontSize: F.body, fontWeight: '700', color: C.text, lineHeight: 26 },
  evD: { fontSize: F.small, color: C.muted, lineHeight: 22 },
  pill: { backgroundColor: C.accentSoft, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.accent },
  pillT: { fontSize: 14, fontWeight: '700', color: C.text },
  note: { fontSize: F.small, color: C.text, lineHeight: 24, marginTop: S.xs },
  src: { fontSize: 14, color: C.muted, marginTop: 4 },
});
