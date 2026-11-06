import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, ScrollView, Pressable, BackHandler } from 'react-native';
import { C, F, S, TOUCH } from '../theme';
import { Button } from '../components/ui';
import { StepCard } from '../components/guide';
import { toBn } from '../lib/phone';
import { hajjL } from '../content/hajj';
import { ihramL, CONTENT_REVIEWED } from '../content/ihram';
import { tr } from '../lib/lang';

const NUMBERED = /^[০-৯0-9]/;   // i18n-ok: a title that already starts with a number (Bengali or English digits)
const HJ = hajjL; const IH = ihramL;   // in the chosen language
import { TileGrid } from '../components/TileGrid';
import type { ScrollRef } from '../components/KbScroll';
import type { Nav } from './navTypes';

// Hajj guide: one page per day, opened from a short list.
export default function HajjScreen({ navigation }: { navigation: Nav }) {
  const [open, setOpen] = useState<string | null>(null);
  const scrollRef = useRef<ScrollRef | null>(null);
  const go = (id: string) => { setOpen(id); requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false })); };

  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(null); return true; });
    return () => sub.remove();
  }, [open]);
  useEffect(() => navigation?.addListener?.('blur', () => setOpen(null)), [navigation]);

  const ix = HJ().HAJJ_DAYS.findIndex((d) => d.id === open);
  const day = ix >= 0 ? HJ().HAJJ_DAYS[ix] : null;
  const nextDay = ix >= 0 && ix < HJ().HAJJ_DAYS.length - 1 ? HJ().HAJJ_DAYS[ix + 1] : null;

  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {day ? (
        <>
          <Pressable onPress={() => setOpen(null)} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হজের সব দিনের তালিকায় ফিরে যান', 'Back to the list of all days of Hajj')}>
            <Text style={st.backT}>{tr('‹ সব দিন', '‹ All days')}</Text>
          </Pressable>
          <Text style={st.title} accessibilityRole="header">{day.icon} {day.title}</Text>
          {day.steps.map((s, k) => (
            <StepCard key={k} step={day.steps.some((x) => NUMBERED.test(x.title)) ? s : { ...s, title: `${toBn(k + 1)}. ${s.title}` }} images={IH().IMAGES} />
          ))}
          {nextDay ? <Button title={tr(`পরের অংশ: ${nextDay.title}`, `Next: ${nextDay.title}`)} icon="›" onPress={() => go(nextDay.id)} /> : null}
          <Button title={tr('হজের সব দিনের তালিকায় ফিরুন', 'Back to the list of all days of Hajj')} icon="‹" kind="secondary" onPress={() => setOpen(null)} style={{ marginTop: S.sm }} />
        </>
      ) : (
        <>
          <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}>
            <Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text>
          </Pressable>
          <Text style={st.lead}>{tr('হজের দিনগুলো ক্রম অনুযায়ী সাজানো। যে দিনের কাজ জানতে চান, সেটিতে চাপ দিন।', 'The days of Hajj are in order. Tap the day whose acts you want to know.')}</Text>
          <TileGrid numbered items={HJ().HAJJ_DAYS.map((d) => ({ ...d, key: d.id }))} onPress={(d) => go(d.id)} hint={tr('অংশটি খুলবে', 'Opens the part')} />
          <Text style={st.offline}>{tr('📶 এই গাইড ইন্টারনেট ছাড়াও খোলে।', '📶 This guide opens even without internet.')}</Text>
        </>
      )}
      {!CONTENT_REVIEWED ? <Text style={st.review}>{tr('ℹ️ তথ্যগুলো কুরআন ও সহিহ হাদিসের সূত্র থেকে নেওয়া, তামাত্তু হজ ও হানাফি নিয়ম অনুযায়ী। চূড়ান্ত প্রকাশের আগে একজন আলেম দিয়ে যাচাই করা হবে। সন্দেহ হলে লিডার বা আলেমকে জিজ্ঞেস করুন।', 'ℹ️ The information is taken from the Quran and authentic hadith, following Hajj Tamattu and the Hanafi method. Before the final release it will be checked by a scholar (alim). If in doubt, ask your leader or a scholar.')}</Text> : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 36, marginBottom: S.md },
  lead: { fontSize: F.body, color: C.text, lineHeight: 28, marginBottom: S.md },
  offline: { fontSize: F.small, color: C.muted, textAlign: 'center', marginTop: S.sm },
  review: { fontSize: 14, color: C.muted, marginTop: S.lg, lineHeight: 22, textAlign: 'center' },
});
