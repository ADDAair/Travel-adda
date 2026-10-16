import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, BackHandler, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice } from '../components/ui';
import { StepCard, DuaInline } from '../components/guide';
import { toBn } from '../lib/phone';
import { GUIDES } from '../content/guides';
import { CONTENT_REVIEWED } from '../content/ihram';

// "More guides": a short list; each guide is one page built from simple blocks.
export default function GuidesScreen({ navigation }) {
  const [open, setOpen] = useState(null);
  const scrollRef = useRef(null);
  const go = (id) => { setOpen(id); requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false })); };
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(null); return true; });
    return () => sub.remove();
  }, [open]);
  useEffect(() => navigation?.addListener?.('blur', () => { setOpen(null); Speech.stop(); }), [navigation]);

  const g = GUIDES.find((x) => x.id === open);
  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {g ? (
        <>
          <Pressable onPress={() => setOpen(null)} style={st.back} accessibilityRole="button" accessibilityLabel="সব গাইডের তালিকায় ফিরে যান">
            <Text style={st.backT}>‹ সব গাইড</Text>
          </Pressable>
          <Text style={st.title} accessibilityRole="header">{g.icon} {g.title}</Text>
          {g.blocks.map((b, i) => <Block key={i} b={b} />)}
          <Button title="সব গাইডের তালিকায় ফিরুন" icon="‹" kind="secondary" onPress={() => setOpen(null)} style={{ marginTop: S.md }} />
        </>
      ) : (
        <>
          <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান">
            <Text style={st.backT}>‹ হোম</Text>
          </Pressable>
          <Text style={st.lead}>যে বিষয়ে জানতে চান, সেটিতে চাপ দিন। সব গাইড ইন্টারনেট ছাড়াও খোলে।</Text>
          {GUIDES.map((x, i) => (
            <Pressable key={x.id} onPress={() => go(x.id)} style={({ pressed }) => [st.row, pressed && { opacity: 0.85 }]}
              accessibilityRole="button" accessibilityLabel={`${x.title}। ${x.what}`} accessibilityHint="গাইডটি খুলবে">
              <Text style={st.rowIc} importantForAccessibility="no">{x.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.rowT}>{x.title}</Text>
                <Text style={st.rowW}>{x.what}</Text>
              </View>
              <Text style={st.openT}>খুলুন ›</Text>
            </Pressable>
          ))}
        </>
      )}
      {!CONTENT_REVIEWED ? <Text style={st.review}>ℹ️ ধর্মীয় অংশ প্রকাশের আগে একজন আলেম এবং স্বাস্থ্যের অংশ একজন ডাক্তার দিয়ে যাচাই করা হবে। সন্দেহ হলে লিডার, আলেম বা ডাক্তারকে জিজ্ঞেস করুন।</Text> : null}
    </ScrollView>
  );
}

export function Block({ b }) {
  if (b.type === 'notice') return <Notice kind={b.kind} title={b.title} text={b.text} />;
  if (b.type === 'source') return <Text style={st.src}>📚 সূত্র: {b.text}</Text>;
  if (b.type === 'steps') return b.steps.map((s, k) => <StepCard key={k} step={{ ...s, title: `${toBn(k + 1)}. ${s.title}` }} />);
  if (b.type === 'phrases') return <Phrases items={b.items} />;
  if (b.type === 'checklist') return <Checklist storageKey={b.key} items={b.items} />;
  if (b.type === 'places') {
    return b.groups.map((grp) => (
      <View key={grp.title}>
        <Text style={st.group}>{grp.title}</Text>
        {grp.items.map((p) => (
          <View key={p.name} style={st.card}>
            <Text style={st.placeN}>📍 {p.name}</Text>
            <Text style={st.p}>{p.what}</Text>
            {p.tip ? <Text style={st.tip}>💡 {p.tip}</Text> : null}
            {(p.duas || []).map((id) => <DuaInline key={id} id={id} />)}
            {p.source ? <Text style={st.src}>📚 {p.source}</Text> : null}
          </View>
        ))}
      </View>
    ));
  }
  return null;
}

function Phrases({ items }) {
  const [playing, setPlaying] = useState(null);
  const [msg, setMsg] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; Speech.stop(); }, []);
  const speak = async (i, text) => {
    if (playing === i) { Speech.stop(); setPlaying(null); return; }
    setMsg('');
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      if ((voices || []).length > 0 && !voices.some((v) => String(v.language || '').toLowerCase().startsWith('ar'))) {
        setMsg('আপনার ফোনে আরবি বলার ভয়েস নেই। ফোনের Settings → Language → Text-to-speech থেকে আরবি ভয়েস নামিয়ে নিন। ততক্ষণ লেখাটা দেখান।');
        return;
      }
      Speech.stop();
      setPlaying(i);
      Speech.speak(text, {
        language: 'ar-SA', rate: 0.8,
        onDone: () => alive.current && setPlaying(null), onStopped: () => alive.current && setPlaying(null),
        onError: () => { if (alive.current) { setPlaying(null); setMsg('শোনানো যায়নি। লেখাটা দেখান।'); } },
      });
    } catch (e) { setPlaying(null); setMsg('শোনানো যায়নি। লেখাটা দেখান।'); }
  };
  return (
    <>
      {msg ? <Notice kind="warn" title={msg} /> : null}
      {items.map((x, i) => (
        <View key={x.bn} style={st.card}>
          <Text style={st.phBn}>{x.bn}</Text>
          <Text style={st.phAr} accessibilityLanguage="ar" selectable>{x.ar}</Text>
          <Text style={st.phPron}>উচ্চারণ: {x.pron}</Text>
          {x.note ? <Text style={st.tip}>ℹ️ {x.note}</Text> : null}
          <Pressable onPress={() => speak(i, x.ar)} style={st.say} accessibilityRole="button" accessibilityLabel={playing === i ? 'থামান' : `${x.bn}, আরবিতে শোনান`}>
            <Text style={st.sayT}>{playing === i ? '⏹️ থামান' : '🔊 আরবিতে শোনান'}</Text>
          </Pressable>
        </View>
      ))}
    </>
  );
}

function Checklist({ storageKey, items }) {
  const [done, setDone] = useState([]);
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((v) => { try { const a = JSON.parse(v || '[]'); if (Array.isArray(a)) setDone(a); } catch (e) { /* start empty */ } }).catch(() => {});
  }, [storageKey]);
  const save = (a) => { setDone(a); AsyncStorage.setItem(storageKey, JSON.stringify(a)).catch(() => {}); };
  const toggle = (id) => save(done.includes(id) ? done.filter((x) => x !== id) : [...done, id]);
  const reset = () => Alert.alert('সব টিক মুছবেন?', 'চেকলিস্ট আবার শুরু থেকে হবে।', [
    { text: 'না, থাকুক', style: 'cancel' },
    { text: 'হ্যাঁ, মুছুন', style: 'destructive', onPress: () => save([]) },
  ]);
  const count = items.filter((c) => done.includes(c.id)).length;
  const groups = [...new Set(items.map((x) => x.group))];
  return (
    <>
      <Text style={st.p}>যা গুছিয়ে নিয়েছেন, তাতে চাপ দিয়ে টিক দিন। অ্যাপ বন্ধ করলেও টিক থেকে যাবে।</Text>
      <Text style={st.progress} accessibilityLiveRegion="polite">{toBn(items.length)}টির মধ্যে {toBn(count)}টি হয়েছে</Text>
      {groups.map((grp) => (
        <View key={grp}>
          <Text style={st.group}>{grp}</Text>
          {items.filter((x) => x.group === grp).map((c) => {
            const on = done.includes(c.id);
            return (
              <Pressable key={c.id} onPress={() => toggle(c.id)} style={[st.check, on && st.checkOn]}
                accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${c.text}। ${on ? 'হয়েছে' : 'বাকি'}`}>
                <View style={[st.box, on && st.boxOn]}><Text style={st.boxT}>{on ? '✓' : ''}</Text></View>
                <Text style={[st.checkT, { flex: 1 }]}>{c.text}</Text>
                <Text style={[st.state, { color: on ? C.ok : C.muted }]}>{on ? 'হয়েছে' : 'বাকি'}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      {count === items.length ? <Notice kind="ok" title="সব গোছানো হয়েছে!" text="আল্লাহ আপনার সফর সহজ করুন।" /> : null}
      {count > 0 ? <Button title="সব টিক মুছে নতুন করে শুরু" icon="🔄" kind="danger" onPress={reset} a11yHint="নিশ্চিত করতে আবার জিজ্ঞেস করবে" style={{ marginTop: S.sm }} /> : null}
    </>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 36, marginBottom: S.md },
  lead: { fontSize: F.body, color: C.text, lineHeight: 28, marginBottom: S.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.line, minHeight: 80, ...shadow },
  rowIc: { fontSize: 32 },
  rowT: { fontSize: F.large, fontWeight: '700', color: C.text, lineHeight: 30 },
  rowW: { fontSize: F.small, color: C.muted, lineHeight: 22, marginTop: 2 },
  openT: { fontSize: F.small, color: C.primary, fontWeight: '700' },
  review: { fontSize: 14, color: C.muted, marginTop: S.lg, lineHeight: 22, textAlign: 'center' },
  p: { fontSize: F.body, color: C.text, lineHeight: 28 },
  src: { fontSize: F.small, color: C.muted, lineHeight: 24, marginTop: S.sm },
  tip: { fontSize: F.small, color: C.text, lineHeight: 24, marginTop: S.xs },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: S.md, marginBottom: S.sm, ...shadow },
  group: { fontSize: F.large, fontWeight: '700', color: C.primary, marginTop: S.md, marginBottom: S.xs },
  placeN: { fontSize: F.large, fontWeight: '700', color: C.text, marginBottom: 4, lineHeight: 30 },
  phBn: { fontSize: F.large, fontWeight: '700', color: C.text, lineHeight: 30 },
  phAr: { fontSize: 30, lineHeight: 54, color: C.text, textAlign: 'right', writingDirection: 'rtl', marginVertical: S.xs },
  phPron: { fontSize: F.body, color: C.primary, lineHeight: 28 },
  say: { minHeight: TOUCH, justifyContent: 'center', alignSelf: 'flex-start', marginTop: S.xs, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.primary },
  sayT: { fontSize: F.body, fontWeight: '700', color: C.primary },
  progress: { fontSize: F.body, fontWeight: '700', color: C.primary, marginVertical: S.sm },
  check: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.md, borderWidth: 2, borderColor: C.line, padding: S.md, marginBottom: S.xs, minHeight: 60 },
  checkOn: { borderColor: C.ok, backgroundColor: C.okSoft },
  box: { width: 34, height: 34, borderRadius: 8, borderWidth: 3, borderColor: C.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card },
  boxOn: { backgroundColor: C.ok, borderColor: C.ok },
  boxT: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  checkT: { fontSize: F.body, color: C.text, lineHeight: 26 },
  state: { fontSize: 14, fontWeight: '700' },
});
