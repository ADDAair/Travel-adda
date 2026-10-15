import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, BackHandler, Alert } from 'react-native';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import { findDua } from '../content/duas';
import {
  CONTENT_REVIEWED, SECTIONS, MIKAT_ROUTES, MIKAT_LIST, MIKAT_SOURCE, CHECKLIST, STEPS, FORBIDDEN, ALLOWED, MISTAKES,
} from '../content/ihram';

const CHECK_KEY = 'ta.ihramChecklist.v1';
const ROUTE_KEY = 'ta.ihramRoute.v1';

// Mikat & Ihram guide: a short list of sections; each section is one simple page.
export default function IhramScreen({ navigation }) {
  const [open, setOpen] = useState(null);
  const scrollRef = useRef(null);

  const go = useCallback((id) => { setOpen(id); requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false })); }, []);

  // Android back: from a section go back to the list.
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(null); return true; });
    return () => sub.remove();
  }, [open]);
  // Leaving the screen closes the open section.
  useEffect(() => navigation?.addListener?.('blur', () => setOpen(null)), [navigation]);

  const sec = SECTIONS.find((x) => x.id === open);
  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {sec ? (
        <>
          <Pressable onPress={() => setOpen(null)} style={st.back} accessibilityRole="button" accessibilityLabel="গাইডের সব অংশে ফিরে যান">
            <Text style={st.backT}>‹ সব অংশ</Text>
          </Pressable>
          <Text style={st.title} accessibilityRole="header">{sec.icon} {sec.title}</Text>
          {open === 'mikat' ? <Mikat /> : null}
          {open === 'prep' ? <Checklist /> : null}
          {open === 'steps' ? <Steps onTalbiyah={() => go('talbiyah')} onRules={() => go('rules')} /> : null}
          {open === 'talbiyah' ? <Talbiyah /> : null}
          {open === 'rules' ? <Rules /> : null}
          {open === 'mistake' ? <Mistakes /> : null}
          <Button title="গাইডের সব অংশে ফিরুন" icon="‹" kind="secondary" onPress={() => setOpen(null)} style={{ marginTop: S.lg }} />
        </>
      ) : (
        <>
          <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান">
            <Text style={st.backT}>‹ হোম</Text>
          </Pressable>
          <Text style={st.lead}>ইহরাম বাঁধার আগে নিচের অংশগুলো একবার করে পড়ুন। যেকোনো অংশে চাপ দিলে খুলবে।</Text>
          {SECTIONS.map((x, i) => (
            <Pressable key={x.id} onPress={() => go(x.id)} style={({ pressed }) => [st.row, pressed && { opacity: 0.85 }]}
              accessibilityRole="button" accessibilityLabel={`${i + 1}। ${x.title}। ${x.what}`} accessibilityHint="অংশটি খুলবে">
              <View style={st.num}><Text style={st.numT}>{toBn(i + 1)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={st.rowT}>{x.icon} {x.title}</Text>
                <Text style={st.rowW}>{x.what}</Text>
              </View>
              <Text style={st.open}>খুলুন ›</Text>
            </Pressable>
          ))}
          <Text style={st.offline}>📶 এই গাইড ইন্টারনেট ছাড়াও খোলে।</Text>
        </>
      )}
      {!CONTENT_REVIEWED ? <Text style={st.review}>ℹ️ তথ্যগুলো কুরআন ও সহিহ হাদিসের সূত্র থেকে নেওয়া। চূড়ান্ত প্রকাশের আগে একজন আলেম দিয়ে যাচাই করা হবে। কোনো বিষয়ে সন্দেহ হলে আপনার লিডার বা আলেমকে জিজ্ঞেস করুন।</Text> : null}
    </ScrollView>
  );
}

function Mikat() {
  const [route, setRoute] = useState('makkah');
  useEffect(() => { AsyncStorage.getItem(ROUTE_KEY).then((v) => { if (v === 'makkah' || v === 'madinah') setRoute(v); }).catch(() => {}); }, []);
  const choose = (id) => { setRoute(id); AsyncStorage.setItem(ROUTE_KEY, id).catch(() => {}); };
  const r = MIKAT_ROUTES.find((x) => x.id === route);
  const [showAll, setShowAll] = useState(false);
  return (
    <>
      <Text style={st.q}>বাংলাদেশ থেকে প্রথমে কোথায় যাচ্ছেন?</Text>
      <Segmented value={route} onChange={choose} options={MIKAT_ROUTES.map((x) => ({ id: x.id, label: x.label, icon: x.icon }))} />
      <View style={st.answer} accessibilityLiveRegion="polite">
        <Text style={st.answerH}>{r.title}</Text>
        <Text style={st.p}>{r.text}</Text>
      </View>
      <Text style={st.h3}>আপনি যা করবেন</Text>
      {r.todo.map((t, i) => (
        <View key={i} style={st.bulletRow}>
          <View style={st.bNum}><Text style={st.bNumT}>{toBn(i + 1)}</Text></View>
          <Text style={[st.p, { flex: 1 }]}>{t}</Text>
        </View>
      ))}
      <Notice kind="warn" title="মীকাত পার হওয়ার পরে ইহরাম বাঁধা যায় না" text="ইহরাম ছাড়া মীকাত পার হলে গুনাহ হয় এবং বদলা দিতে হয়। তাই একটু আগে বাঁধাই নিরাপদ।" />
      <Button title={showAll ? 'সব মীকাতের তালিকা লুকান' : 'সব মীকাতের তালিকা দেখুন'} icon="🗺️" kind="secondary" onPress={() => setShowAll(!showAll)} />
      {showAll ? (
        <View style={{ marginTop: S.md }}>
          {MIKAT_LIST.map((m) => (
            <View key={m.name} style={st.listItem}>
              <Text style={st.liT}>📍 {m.name}</Text>
              <Text style={st.liW}>{m.who}</Text>
            </View>
          ))}
          <Text style={st.source}>📚 সূত্র: {MIKAT_SOURCE}</Text>
        </View>
      ) : null}
    </>
  );
}

function Checklist() {
  const [done, setDone] = useState([]);
  useEffect(() => {
    AsyncStorage.getItem(CHECK_KEY).then((v) => { try { const a = JSON.parse(v || '[]'); if (Array.isArray(a)) setDone(a); } catch (e) {} }).catch(() => {});
  }, []);
  const save = (a) => { setDone(a); AsyncStorage.setItem(CHECK_KEY, JSON.stringify(a)).catch(() => {}); };
  const toggle = (id) => save(done.includes(id) ? done.filter((x) => x !== id) : [...done, id]);
  const reset = () => Alert.alert('সব টিক মুছবেন?', 'চেকলিস্ট আবার শুরু থেকে হবে।', [
    { text: 'না, থাকুক', style: 'cancel' },
    { text: 'হ্যাঁ, মুছুন', style: 'destructive', onPress: () => save([]) },
  ]);
  const count = CHECKLIST.filter((c) => done.includes(c.id)).length;
  const all = count === CHECKLIST.length;
  return (
    <>
      <Text style={st.p}>যে কাজটি করা হয়ে গেছে, সেটিতে চাপ দিয়ে টিক দিন। অ্যাপ বন্ধ করলেও টিক থেকে যাবে।</Text>
      <Text style={st.progress} accessibilityLiveRegion="polite">{toBn(CHECKLIST.length)}টির মধ্যে {toBn(count)}টি হয়েছে</Text>
      {CHECKLIST.map((c) => {
        const on = done.includes(c.id);
        return (
          <Pressable key={c.id} onPress={() => toggle(c.id)} style={[st.check, on && st.checkOn]}
            accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${c.text}। ${on ? 'হয়েছে' : 'বাকি'}`}>
            <View style={[st.box, on && st.boxOn]}><Text style={st.boxT}>{on ? '✓' : ''}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.checkT}>{c.text}</Text>
              <Text style={st.checkN}>{c.note}</Text>
              <Text style={[st.state, { color: on ? C.ok : C.muted }]}>{on ? '✅ হয়েছে' : '⬜ বাকি'}</Text>
            </View>
          </Pressable>
        );
      })}
      {all ? <Notice kind="ok" title="সব প্রস্তুতি শেষ!" text="এখন মীকাতের আগে নিয়ত করে তালবিয়াহ পড়ুন।" /> : null}
      {count > 0 ? <Button title="সব টিক মুছে নতুন করে শুরু" icon="🔄" kind="danger" onPress={reset} a11yHint="নিশ্চিত করতে আবার জিজ্ঞেস করবে" /> : null}
    </>
  );
}

function Steps({ onTalbiyah, onRules }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <>
      <Text style={st.progress} accessibilityLiveRegion="polite">ধাপ {toBn(i + 1)} / {toBn(STEPS.length)}</Text>
      <View style={st.dots} importantForAccessibility="no-hide-descendants">
        {STEPS.map((_, k) => <View key={k} style={[st.dot, k <= i && st.dotOn]} />)}
      </View>
      <View style={st.stepCard}>
        <Text style={st.stepH} accessibilityRole="header">{s.title}</Text>
        <Text style={st.p}>{s.text}</Text>
        {s.tip ? <View style={st.tip}><Text style={st.p}>💡 {s.tip}</Text></View> : null}
        <Text style={st.source}>📚 সূত্র: {s.source}</Text>
      </View>
      {i === 4 || i === 5 ? <Button title="নিয়ত ও তালবিয়াহ দেখুন" icon="🤲" kind="gold" onPress={onTalbiyah} style={{ marginBottom: S.sm }} /> : null}
      {last ? <Button title="নিষেধগুলো পড়ুন" icon="🚫" kind="gold" onPress={onRules} style={{ marginBottom: S.sm }} /> : null}
      {!last ? <Button title="পরের ধাপ ›" onPress={() => setI(i + 1)} /> : <Notice kind="ok" title="সব ধাপ শেষ" text="আল্লাহ আপনার ইবাদত কবুল করুন।" />}
      {i > 0 ? <Button title="‹ আগের ধাপ" kind="secondary" onPress={() => setI(i - 1)} style={{ marginTop: S.sm }} /> : null}
    </>
  );
}

function Talbiyah() {
  const niyyah = findDua('niyyah');
  const talbiyah = findDua('talbiyah');
  const [speaking, setSpeaking] = useState(false);
  const [msg, setMsg] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; Speech.stop(); }; }, []);

  const speak = async () => {
    if (speaking) { Speech.stop(); setSpeaking(false); return; }
    setMsg('');
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const bn = (voices || []).find((v) => String(v.language || '').toLowerCase().startsWith('bn'));
      if (!bn && (voices || []).length > 0) {
        setMsg('আপনার ফোনে বাংলা পড়ে শোনানোর ভয়েস নেই। ফোনের Settings → Language → Text-to-speech থেকে বাংলা ভয়েস নামিয়ে নিন।');
        return;
      }
      setSpeaking(true);
      Speech.speak(talbiyah.parts.map((p) => p.bn).join(' '), {
        language: bn ? bn.language : 'bn-BD', voice: bn ? bn.identifier : undefined, rate: 0.85,
        onDone: () => alive.current && setSpeaking(false),
        onStopped: () => alive.current && setSpeaking(false),
        onError: () => { if (alive.current) { setSpeaking(false); setMsg('পড়ে শোনানো যায়নি। আবার চেষ্টা করুন।'); } },
      });
    } catch (e) { setSpeaking(false); setMsg('পড়ে শোনানো যায়নি। আবার চেষ্টা করুন।'); }
  };

  const Block = ({ label, p }) => (
    <View style={st.duaCard}>
      {label ? <Text style={st.partL}>{label}</Text> : null}
      <Text style={st.ar} accessibilityLanguage="ar">{p.ar}</Text>
      <Text style={st.hSmall}>উচ্চারণ</Text>
      <Text style={st.pron}>{p.pron}</Text>
      <Text style={st.hSmall}>অর্থ</Text>
      <Text style={st.p}>{p.bn}</Text>
    </View>
  );
  if (!niyyah || !talbiyah) return <Notice kind="bad" title="দোয়াটি পাওয়া যায়নি" text="অ্যাপ আপডেট করে আবার দেখুন।" />;
  return (
    <>
      <Text style={st.h3}>১. নিয়ত</Text>
      <Text style={st.p}>{niyyah.when}</Text>
      {niyyah.parts.map((p) => <Block key={p.label} label={p.label} p={p} />)}
      <Text style={st.source}>📚 সূত্র: {niyyah.source}</Text>
      <Text style={[st.h3, { marginTop: S.lg }]}>২. তালবিয়াহ</Text>
      <Text style={st.p}>{talbiyah.when}</Text>
      {talbiyah.parts.map((p, k) => <Block key={k} p={p} />)}
      <Button title={speaking ? 'শোনা বন্ধ করুন' : 'তালবিয়াহর বাংলা অর্থ শুনুন'} icon={speaking ? '⏹️' : '🔊'} kind="secondary" onPress={speak}
        a11yHint="ফোন বাংলায় তালবিয়াহর অর্থ পড়ে শোনাবে" />
      {msg ? <Notice kind="warn" title={msg} /> : null}
      <Text style={st.source}>📚 সূত্র: {talbiyah.source}</Text>
    </>
  );
}

function Rules() {
  const [tab, setTab] = useState('no');
  const list = tab === 'no' ? FORBIDDEN : ALLOWED;
  return (
    <>
      <Segmented value={tab} onChange={setTab} options={[{ id: 'no', icon: '🚫', label: 'যা নিষেধ' }, { id: 'yes', icon: '✅', label: 'যা করা যায়' }]} />
      <Text style={st.p}>{tab === 'no' ? 'নিয়ত করার পর থেকে ইহরাম শেষ না হওয়া পর্যন্ত এগুলো করবেন না:' : 'ইহরাম অবস্থায়ও এগুলো করা যায়:'}</Text>
      {list.map((x) => (
        <View key={x.text} style={[st.rule, { borderLeftColor: tab === 'no' ? C.bad : C.ok }]}>
          <Text style={st.ruleT}>{tab === 'no' ? '🚫 নিষেধ: ' : '✅ করা যায়: '}{x.text}</Text>
          <Text style={st.ruleS}>📚 {x.source}</Text>
        </View>
      ))}
    </>
  );
}

function Mistakes() {
  return (
    <>
      <Notice kind="info" title="ভয় পাবেন না" text="ভুল হলে নিজে সিদ্ধান্ত না নিয়ে আগে আপনার গ্রুপ লিডার বা কোনো আলেমকে জানান।" />
      {MISTAKES.map((m) => (
        <View key={m.q} style={st.listItem}>
          <Text style={st.liT}>❓ {m.q}</Text>
          <Text style={[st.p, { marginTop: 4 }]}>{m.a}</Text>
          {m.source ? <Text style={st.ruleS}>📚 {m.source}</Text> : null}
        </View>
      ))}
      <Text style={st.soonNote}>📞 এক চাপে লিডারকে ফোন করার সুবিধা "ম্যাপ ও SOS" অংশে শীঘ্রই আসছে।</Text>
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
  num: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.goldSoft, borderWidth: 1.5, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  numT: { fontSize: F.body, fontWeight: '700', color: C.text },
  rowT: { fontSize: F.large, fontWeight: '700', color: C.text, lineHeight: 30 },
  rowW: { fontSize: F.small, color: C.muted, lineHeight: 22, marginTop: 2 },
  open: { fontSize: F.small, color: C.primary, fontWeight: '700' },
  offline: { fontSize: F.small, color: C.muted, textAlign: 'center', marginTop: S.sm },
  review: { fontSize: 14, color: C.muted, marginTop: S.lg, lineHeight: 22, textAlign: 'center' },
  q: { fontSize: F.large, fontWeight: '700', color: C.text, marginBottom: S.sm, lineHeight: 30 },
  answer: { backgroundColor: C.primarySoft, borderRadius: R.md, borderWidth: 2, borderColor: C.primary, padding: S.md, marginBottom: S.md },
  answerH: { fontSize: F.large, fontWeight: '700', color: C.primary, marginBottom: 6, lineHeight: 30 },
  p: { fontSize: F.body, color: C.text, lineHeight: 28 },
  h3: { fontSize: F.large, fontWeight: '700', color: C.text, marginBottom: S.sm, lineHeight: 30 },
  bulletRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.sm, alignItems: 'flex-start' },
  bNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  bNumT: { fontSize: F.small, fontWeight: '700', color: C.primary },
  listItem: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.md, marginBottom: S.sm },
  liT: { fontSize: F.body, fontWeight: '700', color: C.text, lineHeight: 28 },
  liW: { fontSize: F.body, color: C.text, lineHeight: 28, marginTop: 2 },
  source: { fontSize: F.small, color: C.muted, lineHeight: 24, marginTop: S.sm },
  progress: { fontSize: F.body, fontWeight: '700', color: C.primary, marginVertical: S.sm },
  check: { flexDirection: 'row', gap: S.md, backgroundColor: C.card, borderRadius: R.md, borderWidth: 2, borderColor: C.line, padding: S.md, marginBottom: S.sm, minHeight: 64 },
  checkOn: { borderColor: C.ok, backgroundColor: C.okSoft },
  box: { width: 36, height: 36, borderRadius: 8, borderWidth: 3, borderColor: C.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, marginTop: 2 },
  boxOn: { backgroundColor: C.ok, borderColor: C.ok },
  boxT: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  checkT: { fontSize: F.body, fontWeight: '700', color: C.text, lineHeight: 28 },
  checkN: { fontSize: F.small, color: C.muted, lineHeight: 24, marginTop: 2 },
  state: { fontSize: F.small, fontWeight: '700', marginTop: 4 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: S.md },
  dot: { flex: 1, height: 8, borderRadius: 4, backgroundColor: C.line },
  dotOn: { backgroundColor: C.accent },
  stepCard: { backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, ...shadow },
  stepH: { fontSize: F.title, fontWeight: '700', color: C.primary, marginBottom: S.sm, lineHeight: 34 },
  tip: { backgroundColor: C.goldSoft, borderRadius: R.md, borderWidth: 1.5, borderColor: C.gold, padding: S.md, marginTop: S.md },
  duaCard: { backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, marginVertical: S.sm, ...shadow },
  partL: { alignSelf: 'flex-start', fontSize: F.small, fontWeight: '700', color: C.onPrimary, backgroundColor: C.primary, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 4, marginBottom: S.sm, overflow: 'hidden' },
  ar: { fontSize: 28, lineHeight: 54, color: C.text, textAlign: 'right', writingDirection: 'rtl', marginBottom: S.sm },
  hSmall: { fontSize: F.small, fontWeight: '700', color: C.primary, marginTop: S.xs },
  pron: { fontSize: F.body, color: C.text, lineHeight: 28, marginBottom: S.sm },
  rule: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, borderLeftWidth: 6, padding: S.md, marginBottom: S.sm },
  ruleT: { fontSize: F.body, color: C.text, lineHeight: 28 },
  ruleS: { fontSize: F.small, color: C.muted, marginTop: 4, lineHeight: 22 },
  soonNote: { fontSize: F.small, color: C.muted, lineHeight: 24, marginTop: S.sm, textAlign: 'center' },
});
