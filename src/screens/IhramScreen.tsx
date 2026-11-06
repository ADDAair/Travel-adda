import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, BackHandler, Alert } from 'react-native';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import type { DuaPart } from '../content/types';
import { findDua } from '../content/duas';
import { CONTENT_REVIEWED, ihramL } from '../content/ihram';
import { tr, getLang } from '../lib/lang';

const IH = ihramL;   // the guide in the chosen language
import { StepCard, QA, Illustration } from '../components/guide';
import { TileGrid } from '../components/TileGrid';
import type { ScrollRef } from '../components/KbScroll';
import type { Nav } from './navTypes';

const CHECK_KEY = 'ta.ihramChecklist.v1';
const ROUTE_KEY = 'ta.ihramRoute.v1';

// Mikat & Ihram guide: a short list of sections; each section is one simple page.
export default function IhramScreen({ navigation }: { navigation: Nav }) {
  const [open, setOpen] = useState<string | null>(null);
  const scrollRef = useRef<ScrollRef | null>(null);

  const go = useCallback((id: string) => { setOpen(id); requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false })); }, []);

  // Android back: from a section go back to the list.
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(null); return true; });
    return () => sub.remove();
  }, [open]);
  // Leaving the screen closes the open section.
  useEffect(() => navigation?.addListener?.('blur', () => setOpen(null)), [navigation]);

  const sec = IH().SECTIONS.find((x) => x.id === open);
  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {sec ? (
        <>
          <Pressable onPress={() => setOpen(null)} style={st.back} accessibilityRole="button" accessibilityLabel={tr('গাইডের সব অংশে ফিরে যান', 'Back to all parts of the guide')}>
            <Text style={st.backT}>{tr('‹ সব অংশ', '‹ All parts')}</Text>
          </Pressable>
          <Text style={st.title} accessibilityRole="header">{sec.icon} {sec.title}</Text>
          {open === 'mikat' ? <Mikat /> : null}
          {open === 'prep' ? <Checklist /> : null}
          {open === 'steps' ? <Steps onTalbiyah={() => go('talbiyah')} onRules={() => go('rules')} /> : null}
          {open === 'talbiyah' ? <Talbiyah /> : null}
          {open === 'rules' ? <Rules /> : null}
          {open === 'common' ? <Common /> : null}
          {open === 'special' ? <Special /> : null}
          {open === 'mistake' ? <Mistakes /> : null}
          <Button title={tr('গাইডের সব অংশে ফিরুন', 'Back to all parts of the guide')} icon="‹" kind="secondary" onPress={() => setOpen(null)} style={{ marginTop: S.lg }} />
        </>
      ) : (
        <>
          <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}>
            <Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text>
          </Pressable>
          <Text style={st.lead}>{tr('ইহরাম বাঁধার আগে নিচের অংশগুলো একবার করে পড়ুন। যেকোনো অংশে চাপ দিলে খুলবে।', 'Before entering ihram, read each part below once. Tap any part to open it.')}</Text>
          <TileGrid numbered items={IH().SECTIONS.map((x) => ({ ...x, key: x.id }))} onPress={(x) => go(x.id)} hint={tr('অংশটি খুলবে', 'Opens the part')} />
          <Text style={st.offline}>{tr('📶 এই গাইড ইন্টারনেট ছাড়াও খোলে।', '📶 This guide opens even without internet.')}</Text>
        </>
      )}
      {!CONTENT_REVIEWED ? <Text style={st.review}>{tr('ℹ️ তথ্যগুলো কুরআন ও সহিহ হাদিসের সূত্র থেকে নেওয়া। চূড়ান্ত প্রকাশের আগে একজন আলেম দিয়ে যাচাই করা হবে। কোনো বিষয়ে সন্দেহ হলে আপনার লিডার বা আলেমকে জিজ্ঞেস করুন।', 'ℹ️ The information is taken from the Quran and authentic hadith. Before the final release it will be checked by a scholar (alim). If in doubt about anything, ask your leader or a scholar.')}</Text> : null}
    </ScrollView>
  );
}

function Mikat() {
  const [route, setRoute] = useState('makkah');
  useEffect(() => { AsyncStorage.getItem(ROUTE_KEY).then((v) => { if (v && IH().MIKAT_ROUTES.some((x) => x.id === v)) setRoute(v); }).catch(() => {}); }, []);
  const choose = (id: string) => { setRoute(id); AsyncStorage.setItem(ROUTE_KEY, id).catch(() => {}); };
  const r = IH().MIKAT_ROUTES.find((x) => x.id === route) || IH().MIKAT_ROUTES[0];
  const [showAll, setShowAll] = useState(false);
  return (
    <>
      <Text style={st.q}>{tr('আপনার যাত্রা কোনটি? নিচে বেছে নিন।', 'Which is your journey? Choose below.')}</Text>
      <View accessibilityRole="radiogroup" style={{ marginBottom: S.md }}>
        {IH().MIKAT_ROUTES.map((x) => {
          const on = x.id === route;
          return (
            <Pressable key={x.id} onPress={() => choose(x.id)} style={[st.opt, on && st.optOn]}
              accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={x.label}>
              <View style={[st.radio, on && st.radioOn]}>{on ? <View style={st.radioDot} /> : null}</View>
              <Text style={st.optIc} importantForAccessibility="no">{x.icon}</Text>
              <Text style={[st.optT, { color: on ? C.primary : C.text }]}>{x.label}</Text>
              {on ? <Text style={st.optSel}>{tr('বাছাই করা', 'Chosen')}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={st.answer} accessibilityLiveRegion="polite">
        <Text style={st.answerH}>{r.title}</Text>
        <Text style={st.p}>{r.text}</Text>
      </View>
      <Text style={st.h3}>{tr('আপনি যা করবেন', 'What you will do')}</Text>
      {r.todo.map((t, i) => (
        <View key={i} style={st.bulletRow}>
          <View style={st.bNum}><Text style={st.bNumT}>{toBn(i + 1)}</Text></View>
          <Text style={[st.p, { flex: 1 }]}>{t}</Text>
        </View>
      ))}
      {r.source ? <Text style={st.source}>📚 {tr('সূত্র', 'Source')}: {r.source}</Text> : null}
      <Notice kind="warn" title={tr('মীকাত পার হওয়ার পরে ইহরাম বাঁধা যায় না', 'Ihram cannot be entered after passing the miqat')} text={tr('ইহরাম ছাড়া মীকাত পার হলে গুনাহ হয় এবং বদলা দিতে হয়। তাই একটু আগে বাঁধাই নিরাপদ।', 'Passing the miqat without ihram is a sin and a compensation is due. So entering it a little early is safest.')} />
      <Button title={showAll ? tr('সব মীকাতের তালিকা লুকান', 'Hide the list of all miqats') : tr('সব মীকাতের তালিকা দেখুন', 'See the list of all miqats')} icon="🗺️" kind="secondary" onPress={() => setShowAll(!showAll)} />
      {showAll ? (
        <View style={{ marginTop: S.md }}>
          {IH().MIKAT_LIST.map((m) => (
            <View key={m.name} style={st.listItem}>
              <Text style={st.liT}>📍 {m.name}</Text>
              <Text style={st.liW}>{m.who}</Text>
            </View>
          ))}
          <Text style={st.source}>📚 {tr('সূত্র', 'Source')}: {IH().MIKAT_SOURCE}</Text>
        </View>
      ) : null}
    </>
  );
}

function Checklist() {
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(CHECK_KEY).then((v) => { try { const a = JSON.parse(v || '[]'); if (Array.isArray(a)) setDone(a); } catch (e) {} }).catch(() => {});
  }, []);
  const save = (a: string[]) => { setDone(a); AsyncStorage.setItem(CHECK_KEY, JSON.stringify(a)).catch(() => {}); };
  const toggle = (id: string) => save(done.includes(id) ? done.filter((x) => x !== id) : [...done, id]);
  const reset = () => Alert.alert(tr('সব টিক মুছবেন?', 'Clear all ticks?'), tr('চেকলিস্ট আবার শুরু থেকে হবে।', 'The checklist will start again from the beginning.'), [
    { text: tr('না, থাকুক', 'No, keep them'), style: 'cancel' },
    { text: tr('হ্যাঁ, মুছুন', 'Yes, clear'), style: 'destructive', onPress: () => save([]) },
  ]);
  const count = IH().CHECKLIST.filter((c) => done.includes(c.id)).length;
  const all = count === IH().CHECKLIST.length;
  return (
    <>
      <Text style={st.p}>{tr('যে কাজটি করা হয়ে গেছে, সেটিতে চাপ দিয়ে টিক দিন। অ্যাপ বন্ধ করলেও টিক থেকে যাবে।', 'Tap each task you have done to tick it. The ticks stay even if you close the app.')}</Text>
      <Text style={st.progress} accessibilityLiveRegion="polite">{tr(`${toBn(IH().CHECKLIST.length)}টির মধ্যে ${toBn(count)}টি হয়েছে`, `${count} of ${IH().CHECKLIST.length} done`)}</Text>
      {IH().CHECKLIST.map((c) => {
        const on = done.includes(c.id);
        return (
          <Pressable key={c.id} onPress={() => toggle(c.id)} style={[st.check, on && st.checkOn]}
            accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${c.text}. ${on ? tr('হয়েছে', 'done') : tr('বাকি', 'not yet')}`}>
            <View style={[st.box, on && st.boxOn]}><Text style={st.boxT}>{on ? '✓' : ''}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.checkT}>{c.text}</Text>
              <Text style={st.checkN}>{c.note}</Text>
              <Text style={[st.state, { color: on ? C.ok : C.muted }]}>{on ? tr('✅ হয়েছে', '✅ Done') : tr('⬜ বাকি', '⬜ Not yet')}</Text>
            </View>
          </Pressable>
        );
      })}
      {all ? <Notice kind="ok" title={tr('সব প্রস্তুতি শেষ!', 'All preparation done!')} text={tr('এখন মীকাতের আগে নিয়ত করে তালবিয়াহ পড়ুন।', 'Now make the intention before the miqat and say the talbiyah.')} /> : null}
      {count > 0 ? <Button title={tr('সব টিক মুছে নতুন করে শুরু', 'Clear all ticks and start again')} icon="🔄" kind="danger" onPress={reset} a11yHint={tr('নিশ্চিত করতে আবার জিজ্ঞেস করবে', 'Will ask again to confirm')} /> : null}
    </>
  );
}

function Steps({ onTalbiyah, onRules }: { onTalbiyah: () => void; onRules: () => void }) {
  const [i, setI] = useState(0);
  const s = IH().STEPS[i];
  const last = i === IH().STEPS.length - 1;
  return (
    <>
      <Text style={st.progress} accessibilityLiveRegion="polite">{tr('ধাপ', 'Step')} {toBn(i + 1)} / {toBn(IH().STEPS.length)}</Text>
      <View style={st.dots} importantForAccessibility="no-hide-descendants">
        {IH().STEPS.map((_, k) => <View key={k} style={[st.dot, k <= i && st.dotOn]} />)}
      </View>
      <StepCard step={s} images={IH().IMAGES} />
      {i === 4 || i === 5 ? <Button title={tr('নিয়ত ও তালবিয়াহ দেখুন', 'See the intention and talbiyah')} icon="🤲" kind="gold" onPress={onTalbiyah} style={{ marginBottom: S.sm }} /> : null}
      {last ? <Button title={tr('নিষেধগুলো পড়ুন', 'Read the restrictions')} icon="🚫" kind="gold" onPress={onRules} style={{ marginBottom: S.sm }} /> : null}
      {!last ? <Button title={tr('পরের ধাপ ›', 'Next step ›')} onPress={() => setI(i + 1)} /> : <Notice kind="ok" title={tr('সব ধাপ শেষ', 'All steps done')} text={tr('আল্লাহ আপনার ইবাদত কবুল করুন।', 'May Allah accept your worship.')} />}
      {i > 0 ? <Button title={tr('‹ আগের ধাপ', '‹ Previous step')} kind="secondary" onPress={() => setI(i - 1)} style={{ marginTop: S.sm }} /> : null}
    </>
  );
}

function Talbiyah() {
  const niyyah = findDua('niyyah');      // both are part of the app's own dua list
  const talbiyah = findDua('talbiyah');
  const [speaking, setSpeaking] = useState(false);
  const [msg, setMsg] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; Speech.stop(); }; }, []);

  const speak = async () => {
    if (speaking) { Speech.stop(); setSpeaking(false); return; }
    setMsg('');
    try {
      const en = getLang() === 'en';   // in English the meaning is read in English
      const voices = await Speech.getAvailableVoicesAsync();
      const bn = (voices || []).find((v) => String(v.language || '').toLowerCase().startsWith(en ? 'en' : 'bn'));
      if (!bn && !en && (voices || []).length > 0) {
        setMsg(tr('আপনার ফোনে বাংলা পড়ে শোনানোর ভয়েস নেই। ফোনের Settings → Language → Text-to-speech থেকে বাংলা ভয়েস নামিয়ে নিন।', 'Your phone has no Bengali voice for reading aloud. Download a Bengali voice from the phone\'s Settings → Language → Text-to-speech.'));
        return;
      }
      setSpeaking(true);
      Speech.speak((talbiyah?.parts || []).map((p) => p.bn).join(' '), {
        language: bn ? bn.language : en ? 'en-US' : 'bn-BD', voice: bn ? bn.identifier : undefined, rate: 0.85,
        onDone: () => { if (alive.current) setSpeaking(false); },
        onStopped: () => { if (alive.current) setSpeaking(false); },
        onError: () => { if (alive.current) { setSpeaking(false); setMsg(tr('পড়ে শোনানো যায়নি। আবার চেষ্টা করুন।', 'Could not read it aloud. Try again.')); } },
      });
    } catch (e) { setSpeaking(false); setMsg(tr('পড়ে শোনানো যায়নি। আবার চেষ্টা করুন।', 'Could not read it aloud. Try again.')); }
  };

  const Block = ({ label, p }: { label?: string; p: DuaPart }) => (
    <View style={st.duaCard}>
      {label ? <Text style={st.partL}>{label}</Text> : null}
      <Text style={st.ar} accessibilityLanguage="ar">{p.ar}</Text>
      <Text style={st.hSmall}>{tr('উচ্চারণ', 'Pronunciation')}</Text>
      <Text style={st.pron}>{p.pron}</Text>
      <Text style={st.hSmall}>{tr('অর্থ', 'Meaning')}</Text>
      <Text style={st.p}>{p.bn}</Text>
    </View>
  );
  if (!niyyah || !talbiyah) return <Notice kind="bad" title={tr('দোয়াটি পাওয়া যায়নি', 'The dua was not found')} text={tr('অ্যাপ আপডেট করে আবার দেখুন।', 'Update the app and look again.')} />;
  return (
    <>
      <Text style={st.h3}>{tr('১. নিয়ত', '1. Intention')}</Text>
      <Text style={st.p}>{niyyah.when}</Text>
      {niyyah.parts.map((p) => <Block key={p.label} label={p.label} p={p} />)}
      <Text style={st.source}>📚 {tr('সূত্র', 'Source')}: {niyyah.source}</Text>
      <Text style={[st.h3, { marginTop: S.lg }]}>{tr('২. তালবিয়াহ', '2. Talbiyah')}</Text>
      <Text style={st.p}>{talbiyah.when}</Text>
      {talbiyah.parts.map((p, k) => <Block key={k} p={p} />)}
      <Button title={speaking ? tr('শোনা বন্ধ করুন', 'Stop listening') : tr('তালবিয়াহর বাংলা অর্থ শুনুন', 'Listen to the meaning of the talbiyah')} icon={speaking ? '⏹️' : '🔊'} kind="secondary" onPress={speak}
        a11yHint={tr('ফোন বাংলায় তালবিয়াহর অর্থ পড়ে শোনাবে', 'The phone reads the meaning of the talbiyah aloud')} />
      {msg ? <Notice kind="warn" title={msg} /> : null}
      <Text style={st.source}>📚 {tr('সূত্র', 'Source')}: {talbiyah.source}</Text>
    </>
  );
}

function Rules() {
  const [tab, setTab] = useState('no');
  const list = tab === 'no' ? IH().FORBIDDEN : IH().ALLOWED;
  return (
    <>
      <Segmented value={tab} onChange={setTab} options={[{ id: 'no', icon: '🚫', label: tr('যা নিষেধ', 'Forbidden') }, { id: 'yes', icon: '✅', label: tr('যা করা যায়', 'Allowed') }]} />
      <Text style={st.p}>{tab === 'no' ? tr('নিয়ত করার পর থেকে ইহরাম শেষ না হওয়া পর্যন্ত এগুলো করবেন না:', 'From the intention until ihram ends, do not do these:') : tr('ইহরাম অবস্থায়ও এগুলো করা যায়:', 'These may be done even in ihram:')}</Text>
      {list.map((x) => (
        <View key={x.text} style={[st.rule, { borderLeftColor: tab === 'no' ? C.bad : C.ok }]}>
          <Text style={st.ruleT}>{tab === 'no' ? tr('🚫 নিষেধ: ', '🚫 Forbidden: ') : tr('✅ করা যায়: ', '✅ Allowed: ')}{x.text}</Text>
          <Text style={st.ruleS}>📚 {x.source}</Text>
        </View>
      ))}
    </>
  );
}

function Mistakes() {
  return (
    <>
      <Notice kind="info" title={tr('ভয় পাবেন না', 'Do not be afraid')} text={tr('ভুল হলে নিজে সিদ্ধান্ত না নিয়ে আগে আপনার গ্রুপ লিডার বা কোনো আলেমকে জানান।', 'If you make a mistake, do not decide yourself; first tell your group leader or a scholar.')} />
      {IH().MISTAKES.map((m) => <QA key={m.q} q={m.q} a={m.a} source={m.source} />)}
      <Text style={st.soonNote}>{tr('📞 এক চাপে লিডারকে ফোন করার সুবিধা "ম্যাপ ও SOS" অংশে শীঘ্রই আসছে।', '📞 Calling your leader with one tap is coming soon in the "SOS" part.')}</Text>
    </>
  );
}

function Common() {
  return (
    <>
      <Text style={st.p}>{tr('নিচের ভুলগুলো অনেক হাজী না জেনে করে ফেলেন। একবার পড়ে নিন।', 'Many hajis make the mistakes below without knowing. Read them once.')}</Text>
      {IH().COMMON.map((x, i) => (
        <View key={i} style={[st.rule, { borderLeftColor: C.warn }]}>
          <Text style={st.ruleT}>⚠️ {x.text}</Text>
          {x.image ? <Illustration img={IH().IMAGES[x.image]} /> : null}
          <Text style={st.ruleS}>📚 {x.source}</Text>
        </View>
      ))}
    </>
  );
}

function Special() {
  return (
    <>
      <Notice kind="info" title={tr('ইসলাম সহজ করেছে', 'Islam has made it easy')} text={tr('অসুস্থ, বয়স্ক ও শিশুদের জন্য বেশ কিছু ছাড় আছে। কোনটি আপনার জন্য প্রযোজ্য, লিডার বা আলেমের সাথে মিলিয়ে নিন।', 'There are several allowances for the ill, the elderly and children. Check with your leader or a scholar which apply to you.')} />
      {IH().SPECIAL.map((x) => <QA key={x.q} q={x.q} a={x.a} source={x.source} icon="🧓" />)}
    </>
  );
}

const st = StyleSheet.create({
  opt: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 60, backgroundColor: C.card, borderRadius: R.md, borderWidth: 2, borderColor: C.line, paddingHorizontal: S.md, paddingVertical: S.sm, marginBottom: S.sm },
  optOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  radio: { width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.primary },
  radioDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.primary },
  optIc: { fontSize: 22 },
  optT: { flex: 1, fontSize: F.body, fontWeight: '700', lineHeight: 26 },
  optSel: { fontSize: 14, fontWeight: '700', color: C.primary },
  wrap: { padding: S.md, paddingBottom: S.xl },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 36, marginBottom: S.md },
  lead: { fontSize: F.body, color: C.text, lineHeight: 28, marginBottom: S.md },
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
