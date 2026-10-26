import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Modal, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { toBn, normalizeDigits } from '../lib/phone';
import { telBd } from '../lib/groups';
import { myContracts, cachedContractLeader } from '../lib/market';
import { getHelpline } from '../lib/offers';
import * as Location from 'expo-location';
import { logSos, sosLocationWanted, setSosLocationWanted } from '../lib/sos';

const KEY = 'ta.emergency.v1';
import { EMERGENCY_FIELDS, LOST_CARD_ROWS, EMERGENCY_MAIN, EMERGENCY_MORE } from '../content/emergency';

const PROFILE_CACHE = 'ta.profileCache.v1';

// Numbers checked against published pilgrim guidance (2026). 911 is the unified number in Makkah, Madinah,
// Riyadh and the Eastern Province; elsewhere 997 (ambulance) and 999 (police) work.
const MAIN = EMERGENCY_MAIN;
const MORE = EMERGENCY_MORE;
const FIELDS = EMERGENCY_FIELDS;
const LOST_TIPS = [
  'ভয় পাবেন না, যেখানে আছেন সেখানেই থাকুন। ঘোরাঘুরি করলে খুঁজে পাওয়া কঠিন হয়।',
  'কাছের গেট নম্বর বা বড় চিহ্ন দেখে লিডারকে ফোন করে জানান।',
  'নিচের "পথ হারিয়েছি কার্ড" খুলে পুলিশ, স্বেচ্ছাসেবক বা ট্যাক্সিচালককে দেখান।',
  'আপনার হজ কার্ডে (নুসুক কার্ড) আপনার তথ্য আছে। সেটাও দেখাতে পারেন।',
  'দলের সাথে আগে থেকেই একটা দেখা করার জায়গা ঠিক করে রাখুন।',
];

const call = (n) => Linking.openURL(`tel:${String(n).replace(/[^\d+]/g, '')}`).catch(() => {});
// Emergency numbers: open the dialer FIRST, then quietly tell Travel Adda (never delays the call).
const callSos = (x) => { call(x.n); logSos(x); };
const cleanPhone = (v) => normalizeDigits(v).replace(/[^\d+ ]/g, '');
const phoneOk = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 6 && d.length <= 15; };

export default function EmergencyScreen({ navigation }) {
  const [info, setInfo] = useState({});
  const [draft, setDraft] = useState({});
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [lost, setLost] = useState(false);
  const [me, setMe] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [grp, setGrp] = useState(null);   // leader of my active contract (used when none is typed below)
  const [help, setHelp] = useState(null); // Travel Adda helpline, when there is no contracted leader

  useEffect(() => {
    const load = async () => {
      try { setInfo(JSON.parse((await AsyncStorage.getItem(KEY)) || '{}') || {}); } catch (e) { setInfo({}); }
      try { setMe(JSON.parse((await AsyncStorage.getItem(PROFILE_CACHE)) || 'null')); } catch (e) { setMe(null); }
      setGrp(await cachedContractLeader());
      myContracts().then(cachedContractLeader).then(setGrp).catch(() => {});   // refresh quietly when online
      getHelpline().then(setHelp).catch(() => {});
    };
    load();
    return navigation?.addListener?.('focus', load);
  }, [navigation]);

  const startEdit = () => { setDraft({ ...info }); setErr(''); setMsg(''); setEditing(true); };
  const save = async () => {
    if (draft.leaderPhone && !phoneOk(draft.leaderPhone)) { setErr('লিডারের মোবাইল নম্বর ঠিক নেই। দেশের কোডসহ পুরো নম্বর লিখুন।'); return; }
    const clean = {};
    FIELDS.forEach((f) => { const v = String(draft[f.k] || '').trim(); if (v) clean[f.k] = v.slice(0, 120); });
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(clean));
      setInfo(clean); setEditing(false); setErr(''); setMsg('তথ্য এই ফোনে সংরক্ষণ হয়েছে।');
    } catch (e) {
      setErr('সংরক্ষণ হয়নি। আবার চেষ্টা করুন। আপনার লেখা মুছে যায়নি।');   // draft stays on screen
    }
  };

  const has = Object.keys(info).length > 0;
  // SOS order (from the design): the leader of my active contract, otherwise a leader typed here, otherwise the helpline.
  const lead = grp ? { name: grp.name, phone: telBd(grp.phone) } : info.leaderPhone ? { name: info.leaderName, phone: info.leaderPhone } : {};
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <View style={st.sos}>
        <Text style={st.sosH} accessibilityRole="header">🆘 বিপদে পড়লে ফোন করুন</Text>
        <Text style={st.sosSub}>বাটনে চাপলে ফোনের ডায়ালে নম্বর বসে যাবে, তারপর কল বাটন চাপুন। এই নম্বরগুলো শুধু সৌদি আরবের ভেতরে কাজ করে।</Text>
        {MAIN.map((x) => (
          <Pressable key={x.n} onPress={() => callSos(x)} style={({ pressed }) => [st.callBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button" accessibilityLabel={`${x.n} নম্বরে ফোন করুন। ${x.t}। ${x.w}`}>
            <Text style={st.callN}>📞 {x.n}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.callT}>{x.t}</Text>
              <Text style={st.callW}>{x.w}</Text>
            </View>
          </Pressable>
        ))}
        <Pressable onPress={() => setShowMore(!showMore)} style={st.moreBtn} accessibilityRole="button" accessibilityState={{ expanded: showMore }}
          accessibilityLabel={showMore ? 'অন্য নম্বর লুকান' : 'আরও জরুরি নম্বর দেখুন'}>
          <Text style={st.moreT}>{showMore ? 'অন্য নম্বর লুকান ▲' : 'আরও নম্বর ▼'}</Text>
        </Pressable>
        {showMore ? MORE.map((x) => (
          <Pressable key={x.n} onPress={() => callSos(x)} style={st.smallCall} accessibilityRole="button" accessibilityLabel={`${x.n} নম্বরে ফোন করুন। ${x.t}`}>
            <Text style={st.smallCallT}>📞 {x.n} · {x.t}</Text>
          </Pressable>
        )) : null}
        {showMore ? <Text style={st.sosSub}>বাংলাদেশে থাকলে: জাতীয় জরুরি সেবা ৯৯৯।</Text> : null}
      </View>
      <SosLocationToggle />

      {lead.phone ? (
        <Button title={`লিডারকে ফোন করুন${lead.name ? ` (${lead.name})` : ''}`} icon="📞" onPress={() => call(lead.phone)} style={{ marginBottom: S.sm }} />
      ) : help && help.phone ? (
        <Button title="Travel Adda হেল্পলাইনে ফোন করুন" icon="📞" onPress={() => call(help.phone)} a11yHint="চুক্তি করা লিডার না থাকায় হেল্পলাইনে কল যাবে" style={{ marginBottom: S.sm }} />
      ) : null}
      <Button title="পথ হারিয়েছি কার্ড দেখান" icon="🪪" kind="gold" onPress={() => setLost(true)} a11yHint="পুলিশ বা ট্যাক্সিচালককে দেখানোর জন্য আরবি ও ইংরেজি কার্ড খুলবে" />

      <Text style={st.h}>আমার জরুরি তথ্য</Text>
      <Text style={st.small}>🔒 এই তথ্য শুধু আপনার ফোনে থাকে, কোথাও পাঠানো হয় না। "পথ হারিয়েছি কার্ড"-এ এগুলো দেখানো হবে।</Text>
      {msg ? <Notice kind="ok" title={msg} /> : null}
      {editing ? (
        <View style={st.card}>
          {FIELDS.map((f) => (
            <Field key={f.k} label={f.label} hint={f.hint} value={draft[f.k] || ''} maxLength={120}
              keyboardType={f.phone ? 'phone-pad' : 'default'}
              onChangeText={(v) => setDraft({ ...draft, [f.k]: f.phone ? cleanPhone(v) : v })} />
          ))}
          {err ? <Notice kind="bad" title={err} /> : null}
          <Button title="সংরক্ষণ করুন" icon="💾" onPress={save} />
          <Button title="বাতিল" kind="secondary" onPress={() => { setEditing(false); setErr(''); }} style={{ marginTop: S.sm }} />
        </View>
      ) : (
        <View style={st.card}>
          {has ? FIELDS.filter((f) => info[f.k]).map((f) => (
            <View key={f.k} style={{ marginBottom: S.sm }}>
              <Text style={st.lbl}>{f.label}</Text>
              <Text style={st.val}>{f.phone ? toBn(info[f.k]) : info[f.k]}</Text>
            </View>
          )) : <Text style={st.p}>এখনো কিছু লেখা হয়নি। হারিয়ে গেলে কাজে লাগবে, তাই সফরের আগেই লিখে রাখুন।</Text>}
          <Button title={has ? 'তথ্য বদলান' : 'তথ্য লিখুন'} icon="✏️" kind={has ? 'secondary' : 'primary'} onPress={startEdit} />
        </View>
      )}

      <Text style={st.h}>পথ হারালে কী করবেন</Text>
      {LOST_TIPS.map((t, i) => (
        <View key={i} style={st.tipRow}>
          <View style={st.tipNum}><Text style={st.tipNumT}>{toBn(i + 1)}</Text></View>
          <Text style={[st.p, { flex: 1 }]}>{t}</Text>
        </View>
      ))}
      <Notice kind="info" title="ম্যাপ ও লাইভ লোকেশন শেয়ার শীঘ্রই আসছে" text="লিডারের সাথে নিজের অবস্থান শেয়ার করার সুবিধা এখনো তৈরি হচ্ছে।" />

      <Modal visible={lost} animationType="slide" onRequestClose={() => setLost(false)}>
        <SafeAreaProvider><LostCard info={{ ...info, leaderName: lead.name, leaderPhone: lead.phone }} me={me} onClose={() => setLost(false)} /></SafeAreaProvider>
      </Modal>
    </ScrollView>
  );
}

const AR = 'أنا من حجاج بنغلاديش، وقد ضللت الطريق. أرجو مساعدتي في الوصول إلى فندقي أو الاتصال بقائد مجموعتي.';
const EN = 'I am a pilgrim from Bangladesh and I am lost. Please help me reach my hotel or call my group leader.';

function LostCard({ info, me, onClose }) {
  const ins = useSafeAreaInsets();
  const [speaking, setSpeaking] = useState(false);
  const [ttsErr, setTtsErr] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; Speech.stop(); }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);
  const speak = () => {
    if (speaking) { Speech.stop(); setSpeaking(false); return; }
    setTtsErr(''); setSpeaking(true);
    Speech.speak(AR, {
      language: 'ar-SA', rate: 0.85,
      onDone: () => alive.current && setSpeaking(false), onStopped: () => alive.current && setSpeaking(false),
      onError: () => { if (alive.current) { setSpeaking(false); setTtsErr('আরবিতে শোনানো যায়নি। কার্ডটি দেখান।'); } },
    });
  };
  const Row = ({ ar, en, v }) => (v ? (
    <View style={lc.row}>
      <Text style={lc.rowL}>{ar} / {en}</Text>
      <Text style={lc.rowV} selectable>{v}</Text>
    </View>
  ) : null);
  return (
    <ScrollView style={{ backgroundColor: '#FFFFFF' }} contentContainerStyle={[lc.wrap, { paddingTop: ins.top + S.md, paddingBottom: ins.bottom + S.lg }]}>
      <Text style={lc.ar} accessibilityLanguage="ar">{AR}</Text>
      <Text style={lc.en} accessibilityLanguage="en">{EN}</Text>
      <Text style={lc.bn}>আমি বাংলাদেশের হাজী, পথ হারিয়েছি। আমাকে হোটেলে পৌঁছাতে বা লিডারকে ফোন করতে সাহায্য করুন।</Text>
      <Row ar="الاسم" en="Name" v={me && me.full_name} />
      <Row ar="رقم الحاج" en="Pilgrim ID" v={me && me.haji_code} />
      <Row ar="قائد المجموعة" en="Group leader" v={[info.leaderName, info.leaderPhone].filter(Boolean).join(' – ')} />
      {LOST_CARD_ROWS.map((r) => <Row key={r.k} ar={r.ar} en={r.en} v={info[r.k]} />)}
      {!info.hotelName && !info.madHotel && !info.leaderPhone ? <Notice kind="warn" title="হোটেল ও লিডারের তথ্য লেখা নেই" text='কার্ড বন্ধ করে "তথ্য লিখুন" চেপে লিখে রাখুন।' /> : null}
      <Button title={speaking ? 'থামান' : 'আরবিতে বলে শোনান'} icon={speaking ? '⏹️' : '🔊'} kind="secondary" onPress={speak} style={{ marginTop: S.md }} />
      {ttsErr ? <Notice kind="warn" title={ttsErr} /> : null}
      {info.leaderPhone ? <Button title="লিডারকে ফোন করুন" icon="📞" onPress={() => call(info.leaderPhone)} style={{ marginTop: S.sm }} /> : null}
      <Button title="কার্ড বন্ধ করুন" icon="✖️" kind="secondary" onPress={onClose} style={{ marginTop: S.sm }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  sos: { backgroundColor: C.badSoft, borderWidth: 2, borderColor: C.bad, borderRadius: R.lg, padding: S.md, marginBottom: S.md },
  sosH: { fontSize: F.title, fontWeight: '700', color: C.bad, lineHeight: 34 },
  sosSub: { fontSize: F.small, color: C.text, lineHeight: 24, marginVertical: S.xs },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.md, borderWidth: 2, borderColor: C.bad, minHeight: 72, paddingHorizontal: S.md, paddingVertical: S.sm, marginTop: S.sm, ...shadow },
  callN: { fontSize: F.title, fontWeight: '700', color: C.bad, minWidth: 96 },
  callT: { fontSize: F.body, fontWeight: '700', color: C.text, lineHeight: 26 },
  callW: { fontSize: 14, color: C.muted, lineHeight: 20 },
  moreBtn: { minHeight: TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
  moreT: { fontSize: F.small, fontWeight: '700', color: C.primary, textDecorationLine: 'underline' },
  smallCall: { minHeight: TOUCH, justifyContent: 'center', backgroundColor: C.card, borderRadius: R.sm, paddingHorizontal: S.md, marginTop: 6, borderWidth: 1, borderColor: C.line },
  smallCallT: { fontSize: F.body, color: C.text, fontWeight: '600' },
  h: { fontSize: F.large, fontWeight: '700', color: C.text, marginTop: S.lg, marginBottom: S.xs, lineHeight: 30 },
  small: { fontSize: F.small, color: C.muted, lineHeight: 24, marginBottom: S.sm },
  p: { fontSize: F.body, color: C.text, lineHeight: 28, marginBottom: S.sm },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: S.md, ...shadow },
  lbl: { fontSize: F.small, color: C.muted },
  val: { fontSize: F.large, fontWeight: '700', color: C.text, lineHeight: 30 },
  tipRow: { flexDirection: 'row', gap: S.sm, alignItems: 'flex-start', marginBottom: S.xs },
  tipNum: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  tipNumT: { fontSize: F.small, fontWeight: '700', color: C.primary },
});
const lc = StyleSheet.create({
  wrap: { paddingHorizontal: S.lg },
  ar: { fontSize: 30, lineHeight: 54, color: '#000', textAlign: 'right', writingDirection: 'rtl', fontWeight: '700' },
  en: { fontSize: 22, lineHeight: 32, color: '#000', marginTop: S.md, fontWeight: '600' },
  bn: { fontSize: F.body, lineHeight: 28, color: C.text, marginTop: S.sm, marginBottom: S.md },
  row: { borderTopWidth: 1, borderColor: C.line, paddingVertical: S.sm },
  rowL: { fontSize: F.small, color: C.muted },
  rowV: { fontSize: 24, fontWeight: '700', color: '#000', lineHeight: 34 },
});

// The haji decides whether an emergency call also sends their location to Travel Adda (off until turned on).
function SosLocationToggle() {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { sosLocationWanted().then(setOn); }, []);
  const toggle = async () => {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      if (!on) {
        const p = await Location.requestForegroundPermissionsAsync();
        if (!p || p.status !== 'granted') { setMsg('ফোন অবস্থান দেওয়ার অনুমতি দেয়নি। ফোনের সেটিংসে Travel Adda-কে অবস্থানের অনুমতি দিয়ে আবার চেষ্টা করুন।'); return; }
      }
      await setSosLocationWanted(!on); setOn(!on);
    } catch (e) { setMsg('কাজটি হয়নি। আবার চেষ্টা করুন।'); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ marginBottom: S.md }}>
      <Notice kind={on ? 'ok' : 'info'} title={on ? '📍 জরুরি ফোনের সময় অবস্থান পাঠানো চালু' : '📍 জরুরি ফোনের সময় অবস্থান পাঠানো বন্ধ'}
        text="জরুরি নম্বরে ফোন করলে Travel Adda জানতে পারে, যেন দ্রুত সাহায্য করতে পারে। চালু করলে আপনার অবস্থানও পাঠানো হবে। ফোন করতে কোনো দেরি হবে না।" />
      {msg ? <Text style={{ color: C.bad, fontSize: F.body, marginBottom: S.sm }} accessibilityLiveRegion="polite">⚠️ {msg}</Text> : null}
      <Button title={on ? 'অবস্থান পাঠানো বন্ধ করুন' : 'অবস্থান পাঠানো চালু করুন'} icon="📍" kind="secondary" onPress={toggle} loading={busy} />
    </View>
  );
}
