import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, BackHandler } from 'react-native';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice } from '../components/ui';
import { CATEGORIES, DUAS, CONTENT_REVIEWED, findDua } from '../content/duas';
import { toBn } from '../lib/phone';

const SIZE_KEY = 'ta.duaTextScale.v1';
const SIZES = [1, 1.2, 1.4, 1.6];

export default function DuaScreen({ route, navigation }) {
  const [cat, setCat] = useState('namaz');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const justTried = !!route?.params?.tutorialDone && !dismissed;
  useEffect(() => { setDismissed(false); }, [route?.params?.tutorialDone]);

  // Android back button: from a dua go back to the list instead of leaving the tab.
  useEffect(() => {
    if (!openId) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpenId(null); return true; });
    return () => sub.remove();
  }, [openId]);

  // Leaving the tab closes any open dua.
  useEffect(() => navigation?.addListener?.('blur', () => setOpenId(null)), [navigation]);

  const list = useMemo(() => {
    const t = q.trim();
    if (t) return DUAS.filter((d) => (d.title + ' ' + d.when).includes(t));
    return DUAS.filter((d) => d.cat === cat);
  }, [cat, q]);

  if (openId) return <DuaDetail dua={findDua(openId)} onBack={() => setOpenId(null)} />;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      {justTried ? <Notice kind="ok" title="চমৎকার! আপনি নিজেই দোয়া বিভাগ খুলেছেন।" text="এভাবেই নিচের বাটনগুলো চেপে অ্যাপের যেকোনো অংশে যাবেন। এখন যেকোনো দোয়ায় চাপ দিয়ে পড়ে দেখুন।" /> : null}

      <Text style={st.lead}>কোন সময়ের দোয়া খুঁজছেন? নিচে বেছে নিন।</Text>
      <View style={st.cats} accessibilityRole="tablist">
        {CATEGORIES.map((c) => {
          const on = !q.trim() && cat === c.id;
          return (
            <Pressable key={c.id} onPress={() => { setQ(''); setCat(c.id); setDismissed(true); }} style={[st.cat, on && st.catOn]}
              accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={c.a11y}>
              <Text style={st.catIc} importantForAccessibility="no">{c.icon}</Text>
              <Text style={[st.catT, on && st.catTOn]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={st.search}>
        <Text style={{ fontSize: 20 }} importantForAccessibility="no">🔍</Text>
        <TextInput value={q} onChangeText={(v) => { setQ(v); setDismissed(true); }} placeholder="দোয়ার নাম লিখে খুঁজুন" placeholderTextColor="#7A857F"
          style={st.searchIn} accessibilityLabel="দোয়া খুঁজুন" returnKeyType="search" />
        {q ? (
          <Pressable onPress={() => setQ('')} style={st.clear} accessibilityRole="button" accessibilityLabel="খোঁজা মুছুন">
            <Text style={st.clearT}>✕ মুছুন</Text>
          </Pressable>
        ) : null}
      </View>

      {q.trim() ? <Text style={st.count}>{toBn(list.length)}টি দোয়া পাওয়া গেছে</Text> : null}
      {q.trim() && list.length === 0 ? <Notice kind="info" title="কোনো দোয়া পাওয়া যায়নি" text="অন্য শব্দ লিখে দেখুন, অথবা ওপরের নামাজ / ওমরাহ / হজ বাটন চাপুন।" /> : null}

      {list.map((d, i) => (
        <Pressable key={d.id} onPress={() => { setDismissed(true); setOpenId(d.id); }} style={({ pressed }) => [st.row, pressed && { opacity: 0.85 }]}
          accessibilityRole="button" accessibilityLabel={`${d.title}। ${d.when}`} accessibilityHint="দোয়াটি খুলবে">
          <View style={st.num}><Text style={st.numT}>{toBn(i + 1)}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={st.rowT}>{d.title}</Text>
            <Text style={st.rowW} numberOfLines={2}>{d.when}</Text>
          </View>
          <Text style={st.open}>খুলুন ›</Text>
        </Pressable>
      ))}

      {!CONTENT_REVIEWED ? <Text style={st.review}>ℹ️ দোয়াগুলো সহিহ সূত্র থেকে নেওয়া। চূড়ান্ত প্রকাশের আগে একজন আলেম দিয়ে যাচাই করা হবে।</Text> : null}
    </ScrollView>
  );
}

function DuaDetail({ dua, onBack }) {
  const [scaleIx, setScaleIx] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [ttsMsg, setTtsMsg] = useState('');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    AsyncStorage.getItem(SIZE_KEY).then((v) => { const n = Number(v); if (alive.current && SIZES[n]) setScaleIx(n); }).catch(() => {});
    return () => { alive.current = false; Speech.stop(); };
  }, []);

  const changeSize = (d) => {
    const n = Math.min(SIZES.length - 1, Math.max(0, scaleIx + d));
    setScaleIx(n);
    AsyncStorage.setItem(SIZE_KEY, String(n)).catch(() => {});
  };

  const speak = useCallback(async () => {
    if (speaking) { Speech.stop(); setSpeaking(false); return; }
    setTtsMsg('');
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const bn = (voices || []).find((v) => String(v.language || '').toLowerCase().startsWith('bn'));
      if (!bn && (voices || []).length > 0) {
        setTtsMsg('আপনার ফোনে বাংলা পড়ে শোনানোর ভয়েস নেই। ফোনের Settings → Language → Text-to-speech থেকে বাংলা ভয়েস নামিয়ে নিন।');
        return;
      }
      const text = dua.parts.map((p) => (p.label ? p.label + '। ' : '') + p.bn).join(' ');
      setSpeaking(true);
      Speech.speak(text, {
        language: bn ? bn.language : 'bn-BD', voice: bn ? bn.identifier : undefined, rate: 0.85,
        onDone: () => alive.current && setSpeaking(false),
        onStopped: () => alive.current && setSpeaking(false),
        onError: () => { if (alive.current) { setSpeaking(false); setTtsMsg('পড়ে শোনানো যায়নি। আবার চেষ্টা করুন।'); } },
      });
    } catch (e) {
      setSpeaking(false);
      setTtsMsg('পড়ে শোনানো যায়নি। আবার চেষ্টা করুন।');
    }
  }, [dua, speaking]);

  if (!dua) return null;
  const k = SIZES[scaleIx];
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={onBack} style={st.back} accessibilityRole="button" accessibilityLabel="সব দোয়ার তালিকায় ফিরে যান">
        <Text style={st.backT}>‹ সব দোয়া</Text>
      </Pressable>

      <Text style={st.title} accessibilityRole="header">{dua.title}</Text>
      <View style={st.when}>
        <Text style={st.whenH}>🕰️ কখন পড়বেন</Text>
        <Text style={st.whenT}>{dua.when}</Text>
      </View>

      <View style={st.sizeRow}>
        <Text style={st.sizeL}>লেখার আকার</Text>
        <Pressable onPress={() => changeSize(-1)} disabled={scaleIx === 0} style={[st.sizeBtn, scaleIx === 0 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="লেখা ছোট করুন">
          <Text style={st.sizeBtnT}>অ−</Text>
        </Pressable>
        <Pressable onPress={() => changeSize(1)} disabled={scaleIx === SIZES.length - 1} style={[st.sizeBtn, scaleIx === SIZES.length - 1 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="লেখা বড় করুন">
          <Text style={[st.sizeBtnT, { fontSize: 24 }]}>অ+</Text>
        </Pressable>
      </View>

      {dua.parts.map((p, i) => (
        <View key={i} style={st.card}>
          {p.label ? <Text style={st.partL}>{p.label}</Text> : null}
          <Text style={[st.ar, { fontSize: 28 * k, lineHeight: 28 * k * 1.9 }]} accessibilityLanguage="ar">{p.ar}</Text>
          <Text style={st.h}>উচ্চারণ</Text>
          <Text style={[st.pron, { fontSize: F.body * k, lineHeight: F.body * k * 1.6 }]}>{p.pron}</Text>
          <Text style={st.h}>অর্থ</Text>
          <Text style={[st.bn, { fontSize: F.body * k, lineHeight: F.body * k * 1.6 }]}>{p.bn}</Text>
        </View>
      ))}

      {dua.note ? <Notice kind="info" title="জেনে রাখুন" text={dua.note} /> : null}

      <Button title={speaking ? 'শোনা বন্ধ করুন' : 'বাংলা অর্থ শুনুন'} icon={speaking ? '⏹️' : '🔊'} kind="secondary" onPress={speak}
        a11yHint="ফোন বাংলায় দোয়ার অর্থ পড়ে শোনাবে" style={{ marginBottom: S.sm }} />
      {ttsMsg ? <Notice kind="warn" title={ttsMsg} /> : null}
      <Text style={st.audioSoon}>🎧 আরবি তিলাওয়াতের অডিও শীঘ্রই আসছে।</Text>

      <Text style={st.source}>📚 সূত্র: {dua.source}</Text>

      <Button title="সব দোয়ার তালিকায় ফিরুন" icon="‹" kind="primary" onPress={onBack} style={{ marginTop: S.md }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  lead: { fontSize: F.body, color: C.text, marginBottom: S.sm, lineHeight: 28 },
  cats: { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
  cat: { flex: 1, minHeight: 72, borderRadius: R.md, borderWidth: 2, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  catOn: { borderColor: C.primary, backgroundColor: '#E3F1E9' },
  catIc: { fontSize: 26 },
  catT: { fontSize: F.body, color: C.muted, fontWeight: '600', marginTop: 2 },
  catTOn: { color: C.primary, fontWeight: '700', textDecorationLine: 'underline' },
  search: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, paddingLeft: S.md, minHeight: 56, marginBottom: S.md },
  searchIn: { flex: 1, minWidth: 0, fontSize: F.body, color: C.text, minHeight: TOUCH },
  clear: { minHeight: TOUCH, paddingHorizontal: S.md, justifyContent: 'center' },
  clearT: { fontSize: F.small, color: C.primary, fontWeight: '700' },
  count: { fontSize: F.small, color: C.muted, marginBottom: S.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.line, minHeight: 76, ...shadow },
  num: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.goldSoft, borderWidth: 1.5, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  numT: { fontSize: F.body, fontWeight: '700', color: C.text },
  rowT: { fontSize: F.large, fontWeight: '700', color: C.text },
  rowW: { fontSize: F.small, color: C.muted, lineHeight: 22, marginTop: 2 },
  open: { fontSize: F.small, color: C.primary, fontWeight: '700' },
  review: { fontSize: 14, color: C.muted, marginTop: S.md, lineHeight: 22, textAlign: 'center' },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.hero, fontWeight: '700', color: C.primary, lineHeight: 40, marginBottom: S.sm },
  when: { backgroundColor: C.goldSoft, borderRadius: R.md, borderWidth: 1.5, borderColor: C.gold, padding: S.md, marginBottom: S.md },
  whenH: { fontSize: F.body, fontWeight: '700', color: C.text },
  whenT: { fontSize: F.body, color: C.text, lineHeight: 28, marginTop: 4 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: S.sm, marginBottom: S.sm },
  sizeL: { fontSize: F.small, color: C.muted, marginRight: 'auto' },
  sizeBtn: { minWidth: 64, minHeight: TOUCH, borderRadius: R.sm, borderWidth: 2, borderColor: C.primary, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  sizeBtnT: { fontSize: 18, fontWeight: '700', color: C.primary },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, ...shadow },
  partL: { alignSelf: 'flex-start', fontSize: F.small, fontWeight: '700', color: C.onPrimary, backgroundColor: C.primary, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 4, marginBottom: S.sm, overflow: 'hidden' },
  ar: { color: C.text, textAlign: 'right', writingDirection: 'rtl', marginBottom: S.md },
  h: { fontSize: F.small, fontWeight: '700', color: C.primary, marginTop: S.xs },
  pron: { color: C.text, marginTop: 2, marginBottom: S.sm },
  bn: { color: C.text, marginTop: 2 },
  audioSoon: { fontSize: F.small, color: C.muted, textAlign: 'center', marginVertical: S.sm },
  source: { fontSize: F.small, color: C.muted, lineHeight: 24, marginTop: S.sm },
});
