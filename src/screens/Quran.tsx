import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Notice } from '../components/ui';
import { toBn, normalizeDigits } from '../lib/phone';
import META from '../content/quran/meta.json';
import { SURAH } from '../content/quran/loaders';
import { SURAH_BN, QURAN_CREDIT, TRANSLATION_PERMISSION_OK } from '../content/quranNames';

const LAST_KEY = 'ta.quranLast.v1';
const SIZE_KEY = 'ta.duaTextScale.v1';   // same text size as the dua vault
const TRANS_KEY = 'ta.quranShowTrans.v1';
const PRON_KEY = 'ta.quranShowPron.v1';
const SIZES = [1, 1.2, 1.4, 1.6];
// Tanzil puts "Bismillah" at the start of verse 1 of every surah except 1 and 9; we show it as a header instead.
const MARKS = /[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const BISM_BARE = 'بسم ٱلله ٱلرحمن ٱلرحيم';
export function stripBismillah(text) {
  const words = text.split(' ');
  if (words.length > 4 && words.slice(0, 4).join(' ').replace(MARKS, '') === BISM_BARE) return words.slice(4).join(' ');
  return text;
}
const typeBn = (t) => (t === 'Meccan' ? 'মাক্কী' : 'মাদানী');

export function QuranList({ onOpen }) {
  const [q, setQ] = useState('');
  const [last, setLast] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(LAST_KEY).then((v) => { try { const o = JSON.parse(v); if (o && o.n) setLast(o); } catch (e) {} }).catch(() => {});
  }, []);
  const list = useMemo(() => {
    const t = normalizeDigits(q.trim());
    if (!t) return META;
    return META.filter((s) => String(s.n) === t || SURAH_BN[s.n - 1].includes(t) || s.tr.toLowerCase().includes(t.toLowerCase()) || s.ar.includes(t));
  }, [q]);

  const header = (
    <View>
      {last ? (
        <Pressable onPress={() => onOpen(last.n, last.a)} style={st.resume} accessibilityRole="button"
          accessibilityLabel={`যেখানে থেমেছিলেন সেখান থেকে পড়ুন: সূরা ${SURAH_BN[last.n - 1]}, আয়াত ${last.a}`}>
          <Text style={st.resumeIc} importantForAccessibility="no">📖</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.resumeH}>যেখানে থেমেছিলেন</Text>
            <Text style={st.resumeT}>সূরা {SURAH_BN[last.n - 1]}, আয়াত {toBn(last.a)}</Text>
          </View>
          <Text style={st.go}>পড়ুন ›</Text>
        </Pressable>
      ) : null}
      <View style={st.search}>
        <Text style={{ fontSize: 20 }} importantForAccessibility="no">🔍</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="সূরার নাম বা নম্বর লিখুন" placeholderTextColor="#7A857F"
          style={st.searchIn} accessibilityLabel="সূরা খুঁজুন" returnKeyType="search" />
        {q ? <Pressable onPress={() => setQ('')} style={st.clear} accessibilityRole="button" accessibilityLabel="খোঁজা মুছুন"><Text style={st.clearT}>✕ মুছুন</Text></Pressable> : null}
      </View>
      {q.trim() && list.length === 0 ? <Notice kind="info" title="কোনো সূরা পাওয়া যায়নি" text="সূরার নম্বর (১–১১৪) বা নামের অংশ লিখে দেখুন।" /> : null}
    </View>
  );

  return (
    <FlatList
      data={list}
      keyExtractor={(s) => String(s.n)}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={st.wrap}
      style={{ backgroundColor: C.bg }}
      initialNumToRender={12}
      renderItem={({ item: s }) => (
        <Pressable onPress={() => onOpen(s.n, 1)} style={({ pressed }) => [st.row, pressed && { opacity: 0.85 }]}
          accessibilityRole="button" accessibilityLabel={`সূরা ${s.n}, ${SURAH_BN[s.n - 1]}, ${s.ayas} আয়াত, ${typeBn(s.type)}`}>
          <View style={st.num}><Text style={st.numT}>{toBn(s.n)}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={st.rowT}>{SURAH_BN[s.n - 1]}</Text>
            <Text style={st.rowW}>{toBn(s.ayas)} আয়াত · {typeBn(s.type)}</Text>
          </View>
          <Text style={st.arName}>{s.ar}</Text>
        </Pressable>
      )}
      ListFooterComponent={
        <Text style={st.credit}>
          {QURAN_CREDIT}{!TRANSLATION_PERMISSION_OK ? '\n(পরীক্ষামূলক সংস্করণ: অনুবাদ ব্যবহারের অনুমতি নেওয়া হচ্ছে।)' : ''}
        </Text>
      }
    />
  );
}

export function QuranReader({ n, startAyah = 1, onBack }) {
  const meta = META[n - 1];
  const [verses, setVerses] = useState(null);
  const [err, setErr] = useState(false);
  const [scaleIx, setScaleIx] = useState(1);
  const [showTr, setShowTr] = useState(true);
  const [showPr, setShowPr] = useState(true);
  const listRef = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    setVerses(null); setErr(false);
    // Load on the next tick so the screen appears immediately even for long surahs.
    const t = setTimeout(() => {
      try {
        const raw = SURAH[n]();
        const data = raw.map(([ar, bn, pr], i) => ({ a: i + 1, ar: i === 0 && n !== 1 && n !== 9 ? stripBismillah(ar) : ar, bn, pr: pr || '' }));
        if (alive) setVerses(data);
      } catch (e) { if (alive) setErr(true); }
    }, 30);
    AsyncStorage.multiGet([SIZE_KEY, TRANS_KEY, PRON_KEY]).then((r) => {
      if (!alive) return;
      const sz = Number(r[0][1]); if (SIZES[sz]) setScaleIx(sz);
      if (r[1][1] === '0') setShowTr(false);
      if (r[2][1] === '0') setShowPr(false);
    }).catch(() => {});
    return () => { alive = false; clearTimeout(t); clearTimeout(saveTimer.current); };
  }, [n]);

  useEffect(() => {
    if (verses && startAyah > 1) {
      const t = setTimeout(() => listRef.current?.scrollToIndex({ index: Math.min(startAyah - 1, verses.length - 1), animated: false }), 80);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [verses, startAyah]);

  const onViewable = useRef(({ viewableItems }) => {
    const first = viewableItems && viewableItems[0];
    if (!first || !first.item) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => AsyncStorage.setItem(LAST_KEY, JSON.stringify({ n, a: first.item.a })).catch(() => {}), 600);
  }).current;

  const changeSize = (d) => {
    const v = Math.min(SIZES.length - 1, Math.max(0, scaleIx + d));
    setScaleIx(v); AsyncStorage.setItem(SIZE_KEY, String(v)).catch(() => {});
  };
  const togglePr = () => { const v = !showPr; setShowPr(v); AsyncStorage.setItem(PRON_KEY, v ? '1' : '0').catch(() => {}); };
  const toggleTr = () => { const v = !showTr; setShowTr(v); AsyncStorage.setItem(TRANS_KEY, v ? '1' : '0').catch(() => {}); };
  const k = SIZES[scaleIx];

  const header = (
    <View>
      <Pressable onPress={onBack} style={st.back} accessibilityRole="button" accessibilityLabel="সব সূরার তালিকায় ফিরে যান">
        <Text style={st.backT}>‹ সব সূরা</Text>
      </Pressable>
      <View style={st.titleBox}>
        <Text style={st.title} accessibilityRole="header">সূরা {SURAH_BN[n - 1]}</Text>
        <Text style={st.titleAr}>{meta.ar}</Text>
        <Text style={st.titleSub}>{toBn(meta.ayas)} আয়াত · {typeBn(meta.type)} · সূরা নম্বর {toBn(n)}</Text>
      </View>
      <View style={st.tools}>
        <Toggle on={showPr} onPress={togglePr} label="উচ্চারণ" />
        <Toggle on={showTr} onPress={toggleTr} label="অনুবাদ" />
      </View>
      <View style={st.tools}>
        <Text style={st.sizeL}>লেখার আকার</Text>
        <Pressable onPress={() => changeSize(-1)} disabled={scaleIx === 0} style={[st.toolBtn, scaleIx === 0 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="লেখা ছোট করুন"><Text style={st.toolT}>অ−</Text></Pressable>
        <Pressable onPress={() => changeSize(1)} disabled={scaleIx === SIZES.length - 1} style={[st.toolBtn, scaleIx === SIZES.length - 1 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="লেখা বড় করুন"><Text style={[st.toolT, { fontSize: 22 }]}>অ+</Text></Pressable>
      </View>
      {showPr ? <Text style={st.prNote}>ℹ️ বাংলা উচ্চারণ শুধু সহায়তার জন্য। সঠিক তিলাওয়াতের জন্য আরবি দেখে পড়া ও শিক্ষকের কাছে শেখা উত্তম।</Text> : null}
      {n !== 1 && n !== 9 ? <Text style={[st.bism, { fontSize: 26 * k, lineHeight: 26 * k * 1.8 }]} accessibilityLanguage="ar">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</Text> : null}
    </View>
  );

  if (err) return <View style={st.center}><Notice kind="bad" title="সূরাটি খোলা যায়নি" text="অ্যাপ বন্ধ করে আবার খুলুন।" /></View>;
  if (!verses) return <View style={st.center}><ActivityIndicator size="large" color={C.primary} /><Text style={st.loadT}>সূরা খোলা হচ্ছে…</Text></View>;

  return (
    <FlatList
      ref={listRef}
      data={verses}
      keyExtractor={(v) => String(v.a)}
      ListHeaderComponent={header}
      contentContainerStyle={st.wrap}
      style={{ backgroundColor: C.bg }}
      initialNumToRender={Math.max(10, startAyah + 2)}
      windowSize={11}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
      onScrollToIndexFailed={(info) => setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: false }), 250)}
      renderItem={({ item: v }) => (
        <View style={st.verse}>
          <View style={st.vTop}>
            <View style={st.vNum}><Text style={st.vNumT}>{toBn(v.a)}</Text></View>
          </View>
          <Text style={[st.ar, { fontSize: 26 * k, lineHeight: 26 * k * 1.95 }]} accessibilityLanguage="ar">{v.ar}</Text>
          {showPr && v.pr ? <Text style={[st.pr, { fontSize: F.body * k, lineHeight: F.body * k * 1.6 }]}>{v.pr}</Text> : null}
          {showTr ? <Text style={[st.bn, { fontSize: F.body * k, lineHeight: F.body * k * 1.6 }]}>{v.bn}</Text> : null}
        </View>
      )}
      ListFooterComponent={
        <View>
          <Text style={st.end}>— সূরা {SURAH_BN[n - 1]} শেষ —</Text>
          <Pressable onPress={onBack} style={st.backBig} accessibilityRole="button"><Text style={st.backBigT}>‹ সব সূরার তালিকায় ফিরুন</Text></Pressable>
          <Text style={st.credit}>{QURAN_CREDIT}</Text>
        </View>
      }
    />
  );
}

function Toggle({ on, onPress, label }) {
  return (
    <Pressable onPress={onPress} style={[st.toolBtn, { flex: 1 }, on && st.toolOn]} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label + ' দেখান'}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 18 }} importantForAccessibility="no">{on ? '✅' : '⬜'}</Text>
        <Text key={label + (on ? '-on' : '-off')} style={st.toolT}>{label}</Text>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  toolOn: { backgroundColor: C.goldSoft },
  sizeL: { fontSize: F.small, color: C.muted, flex: 1, alignSelf: 'center' },
  prNote: { fontSize: 14, color: C.muted, lineHeight: 22, marginBottom: S.sm },
  pr: { color: C.primary, fontStyle: 'italic', marginBottom: S.sm },
  wrap: { padding: S.md, paddingBottom: S.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.lg, backgroundColor: C.bg, gap: S.md },
  loadT: { fontSize: F.body, color: C.muted },
  resume: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.accentSoft, borderWidth: 2, borderColor: C.accent, borderRadius: R.lg, padding: S.md, marginBottom: S.md, minHeight: 76 },
  resumeIc: { fontSize: 32 },
  resumeH: { fontSize: F.small, color: C.muted, fontWeight: '700' },
  resumeT: { fontSize: F.large, color: C.text, fontWeight: '700' },
  go: { fontSize: F.body, color: C.primary, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, paddingLeft: S.md, minHeight: 56, marginBottom: S.md },
  searchIn: { flex: 1, minWidth: 0, fontSize: F.body, color: C.text, minHeight: TOUCH },
  clear: { minHeight: TOUCH, paddingHorizontal: S.md, justifyContent: 'center' },
  clearT: { fontSize: F.small, color: C.primary, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.line, minHeight: 72 },
  num: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.goldSoft, borderWidth: 1.5, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  numT: { fontSize: F.body, fontWeight: '700', color: C.text },
  rowT: { fontSize: F.large, fontWeight: '700', color: C.text },
  rowW: { fontSize: F.small, color: C.muted },
  arName: { fontSize: 24, color: C.primary },
  credit: { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: S.lg, lineHeight: 20 },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  titleBox: { backgroundColor: C.primary, borderRadius: R.lg, padding: S.lg, alignItems: 'center', marginBottom: S.md },
  title: { fontSize: F.title, color: C.onPrimary, fontWeight: '700', textAlign: 'center' },
  titleAr: { fontSize: 30, color: C.gold, marginTop: 4 },
  titleSub: { fontSize: F.small, color: C.onPrimarySoft, marginTop: 4, textAlign: 'center' },
  tools: { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
  toolBtn: { minHeight: TOUCH, minWidth: 64, borderRadius: R.sm, borderWidth: 2, borderColor: C.primary, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.sm },
  toolT: { fontSize: F.small, fontWeight: '700', color: C.primary },
  bism: { textAlign: 'center', color: C.text, marginVertical: S.md },
  verse: { backgroundColor: C.card, borderRadius: R.lg, padding: S.md, marginBottom: S.sm, ...shadow },
  vTop: { flexDirection: 'row', justifyContent: 'flex-start' },
  vNum: { minWidth: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: C.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  vNumT: { fontSize: F.small, fontWeight: '700', color: C.text },
  ar: { color: C.text, textAlign: 'right', writingDirection: 'rtl', marginTop: S.xs, marginBottom: S.sm },
  bn: { color: C.text, borderTopWidth: 1, borderColor: C.line, paddingTop: S.sm },
  end: { textAlign: 'center', fontSize: F.body, color: C.muted, marginTop: S.md },
  backBig: { minHeight: 60, borderRadius: R.md, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: S.md },
  backBigT: { color: C.onPrimary, fontSize: F.large, fontWeight: '700' },
});
