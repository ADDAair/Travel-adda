import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { C, F, S, R, TOUCH } from '../theme';
import { T } from '../strings';
import { Button, Card, Notice } from '../components/ui';
import NoticeBar from '../components/NoticeBar';
import { toBn } from '../lib/phone';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTutorial } from '../tutorial';
import { loadSavedLocation } from '../lib/location';
import { dayPlan, fmtTime, fmtLeft, prayerName } from '../lib/prayer';
import { useMe, isLeaderAccount, PROFILE_CACHE as ME_CACHE } from '../lib/me';
import { processPendingReferral, processPendingTerms } from '../lib/market';
import TripCard from '../components/TripCard';
import PushCard from '../components/PushCard';
import { PENDING_EMAIL } from '../lib/login';
import { myKhademGroups } from '../lib/help';

// Working features. Every card opens something that really works (no fake buttons).
const READY = [
  { route: 'Prayer', icon: '🕌', title: 'নামাজের সময় ও কিবলা', what: 'আপনার জায়গা অনুযায়ী সময় ও কিবলার দিক। ইন্টারনেট ছাড়াও চলে।' },
  { route: 'Dua', icon: '🤲', title: 'দোয়া ভল্ট', what: 'দোয়া ও সম্পূর্ণ আল-কুরআন (১১৪ সূরা)। ইন্টারনেট ছাড়াও চলে।' },
  { route: 'MyLeader', icon: '🤝', title: 'লিডার ও চুক্তি', what: 'যাচাই করা লিডার খুঁজুন, রেফারেল কোড, চুক্তি পড়ে সম্মতি, দলের ঘোষণা।', hajiOnly: true },
  { route: 'Docs', icon: '📄', title: 'আমার কাগজপত্র', what: 'পাসপোর্ট, ভিসা, টিকেটের ছবি নিরাপদে। একবার খুললে ইন্টারনেট ছাড়াও দেখা যায়।' },
  { route: 'Ihram', icon: '🕋', title: 'মীকাত ও ইহরাম গাইড', what: 'কোথায়, কীভাবে ইহরাম বাঁধবেন। নিয়ত, তালবিয়াহ ও নিষেধ।' },
  { route: 'Umrah', icon: '🔄', title: 'ওমরাহ ধাপে ধাপে', what: 'তাওয়াফ, সাঈ, চুল কাটা। চক্কর গোনার বাটনসহ।' },
  { route: 'Hajj', icon: '⛺', title: 'হজের দিনগুলো', what: '৮ থেকে ১৩ জিলহজ, দিন অনুযায়ী করণীয়। মদিনা যিয়ারত।' },
  { route: 'Guides', icon: '📚', title: 'আরও গাইড ও তথ্য', what: 'ওমরাহ ভিসার ফিঙ্গারপ্রিন্ট, হারাম ও নববীর গেট, Nusuk ও রওজা বুকিং, পথ হারালে, হোটেল এলাকা, যাতায়াত, জমজম ও সিম, স্বাস্থ্য, আরবি কথা, প্রস্তুতি, হুইলচেয়ার আরও অনেক।' },
];

const PROFILE_CACHE = ME_CACHE;
const TOOLS = [
  { route: 'Salah', icon: '🧎', title: 'নামাজের রাকাত ও নিয়ম' },
  { route: 'Tasbih', icon: '📿', title: 'তাসবিহ গণনা' },
  { route: 'Calendar', icon: '📅', title: 'ইসলামি দিনপঞ্জি' },
];

const UPCOMING = [
];

export default function HomeScreen({ navigation }) {
  const { handsOnPending, skipHandsOn } = useTutorial();
  const { me, refreshMe } = useMe();
  const leaderAcc = isLeaderAccount(me);
  const [refMsg, setRefMsg] = useState(null);
  // A referral code typed at sign-up is attached once the account exists.
  useEffect(() => { processPendingReferral().then((r) => { if (r) setRefMsg(r); }); processPendingTerms(); }, [me]);
  const [p, setP] = useState(null);
  const [state, setState] = useState('load');
  // An e-mail typed at sign-up waits here until it is verified with the code (then it can be used to log in).
  const [pendingEmail, setPendingEmail] = useState(null);
  // Khadem of some group? Then a card leads to the khadem page (questions waiting are counted).
  const [khadem, setKhadem] = useState(null);
  useEffect(() => {
    const check = () => myKhademGroups().then((g) => setKhadem(g.length ? { n: g.length, waiting: g.reduce((s, x) => s + (x.waiting || 0), 0) } : null)).catch(() => setKhadem(null));
    check(); return navigation?.addListener?.('focus', check);
  }, [navigation]);
  useEffect(() => {
    const check = () => AsyncStorage.getItem(PENDING_EMAIL).then((e) => setPendingEmail(e && !(me && me.email === e && me.email_verified) ? e : null)).catch(() => {});
    check(); return navigation?.addListener?.('focus', check);
  }, [me, navigation]);

  // The guides work offline (e.g. inside the Haram without data), so Home must never be blocked by a failed fetch.
  // Name and ID come from the profile the app already loaded (no second request); the phone's copy is shown meanwhile.
  const load = useCallback(async () => {
    let cached = null;
    try { cached = JSON.parse((await AsyncStorage.getItem(PROFILE_CACHE)) || 'null'); } catch (e) { cached = null; }
    if (cached) { setP(cached); setState('ok'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (me) { setP({ full_name: me.full_name, haji_code: me.haji_code }); setState(me.offline ? 'err' : 'ok'); return undefined; }
    const t = setTimeout(() => setState((x) => (x === 'load' ? 'err' : x)), 9000);    // nothing after 9 s: show the offline note
    return () => clearTimeout(t);
  }, [me]);
  const retry = useCallback(async () => { setState((x) => (x === 'err' && !p ? 'load' : x)); const m = await refreshMe(); if (!m) setState('err'); }, [refreshMe, p]);

  // Next prayer at the top of Home, only when a place was already chosen (Home never asks for location itself).
  const [ploc, setPloc] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const refresh = () => { setNow(Date.now()); loadSavedLocation().then(setPloc); };
    refresh();
    const unsub = navigation.addListener('focus', refresh);
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => { unsub(); clearInterval(t); };
  }, [navigation]);
  let next = null;
  if (ploc) { try { const pl = dayPlan(ploc, now); next = { ...pl, t: fmtTime(pl.nextAt, pl.tz, pl.next.key), nm: pl.nextAt === pl.times.dhuhr ? prayerName(pl.next, pl.today) : pl.next.name }; } catch (e) { next = null; } }

  if (state === 'load') {
    return <View style={st.center}><ActivityIndicator color={C.primary} size="large" /><Text style={st.loadT}>আপনার তথ্য আনা হচ্ছে…</Text></View>;
  }
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <View style={st.hero} accessible accessibilityLabel={p ? `আস-সালামু আলাইকুম, ${p.full_name}। আপনার হাজী আইডি ${p.haji_code}` : 'আস-সালামু আলাইকুম'}>
        <Text style={st.hi}>আস-সালামু আলাইকুম 👋</Text>
        {p ? <Text style={st.nm}>{p.full_name}</Text> : null}
        {p ? <View style={st.idPill}><Text style={st.idT}>{leaderAcc ? 'লিডার আইডি' : 'হাজী আইডি'}: {toBn(p.haji_code)}</Text></View> : null}
      </View>
      <NoticeBar navigation={navigation} />
      {state === 'err' ? (
        <Notice kind="warn" title="ইন্টারনেট সংযোগ নেই" text={p ? 'আপনার আগের তথ্য দেখানো হচ্ছে। নিচের গাইড, দোয়া ও নামাজের সময় ইন্টারনেট ছাড়াও চলবে।' : 'নিচের গাইড, দোয়া ও নামাজের সময় ইন্টারনেট ছাড়াও চলবে।'}>
          <Button title={T.retry} icon="🔄" kind="secondary" onPress={retry} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}

      {next ? (
        <Pressable onPress={() => navigation.navigate('Prayer')} style={({ pressed }) => [st.np, pressed && { opacity: 0.9 }]} accessibilityRole="button"
          accessibilityLabel={`পরের নামাজ ${next.nm}, ${next.t.part} ${next.t.time}। আর ${fmtLeft(next.nextAt - now)} বাকি। নামাজের সময় ও কিবলা খুলুন`}>
          <Text style={st.npIc} importantForAccessibility="no">🕌</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.npL}>পরের নামাজ · {ploc.label}</Text>
            <Text style={st.npT}>{next.nm} {next.t.time} <Text style={st.npP}>{next.t.part}</Text></Text>
            <Text style={st.npLeft}>⏳ আর {fmtLeft(next.nextAt - now)} বাকি</Text>
          </View>
          <Text style={st.readyGo}>সব ›</Text>
        </Pressable>
      ) : null}

      {handsOnPending ? (
        <Card style={st.coach}>
          <Text style={st.coachH}>✋ একবার চেষ্টা করুন</Text>
          <Text style={st.coachB}>নিচের মাঝখানের <Text style={{ fontWeight: '700' }}>সোনালি "দোয়া"</Text> বাটনে একবার চাপুন।</Text>
          <Text style={st.arrow} importantForAccessibility="no">👇</Text>
          <Pressable onPress={skipHandsOn} style={st.skip} accessibilityRole="button" accessibilityLabel="এখন না, পরে করব">
            <Text style={st.skipT}>এখন না, পরে করব</Text>
          </Pressable>
        </Card>
      ) : null}

      {!handsOnPending && pendingEmail ? (
        <Notice kind="info" title="📧 ইমেইল যাচাই বাকি" text={`${pendingEmail} যাচাই করলে এই ইমেইল দিয়েও লগইন করতে পারবেন।`}>
          <Button title="ইমেইল যাচাই করুন" icon="📧" kind="secondary" onPress={() => navigation.navigate('VerifyPhone', { channel: 'email' })} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}
      {!handsOnPending && khadem ? (
        <Notice kind={khadem.waiting ? 'warn' : 'info'} title={`🤝 আপনি ${toBn(khadem.n)}টি দলের খাদেম`} text={khadem.waiting ? `${toBn(khadem.waiting)}টি প্রশ্নের উত্তর বাকি।` : 'দলের হাজী আর তাঁদের প্রশ্ন দেখুন।'}>
          <Button title="খাদেমের পাতা খুলুন" icon="🤝" kind="secondary" onPress={() => navigation.navigate('KhademHome')} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}
      {!handsOnPending ? <PushCard mode="home" /> : null}
      {refMsg ? <Notice kind={refMsg.kind} title={refMsg.text}>{refMsg.kind !== 'ok' ? <Button title="আমার লিডার পাতা খুলুন" kind="secondary" onPress={() => navigation.navigate('MyLeader')} style={{ marginTop: S.sm }} /> : null}</Notice> : null}
      {leaderAcc ? <LeaderHomeCard me={me} navigation={navigation} /> : <TripCard navigation={navigation} />}

      <Text style={st.h2}>এখন ব্যবহার করুন</Text>
      {READY.filter((x) => !(leaderAcc && x.hajiOnly)).map((x) => (
        <Pressable key={x.route} onPress={() => navigation.navigate(x.route, x.route === 'Dua' ? { tutorialDone: false } : undefined)}
          style={({ pressed }) => [st.ready, pressed && { opacity: 0.9 }]} accessibilityRole="button" accessibilityLabel={`${x.title} খুলুন। ${x.what}`}>
          <Text style={st.readyIc} importantForAccessibility="no">{x.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.readyT}>{x.title}</Text>
            <Text style={st.readyW}>{x.what}</Text>
          </View>
          <Text style={st.readyGo}>খুলুন ›</Text>
        </Pressable>
      ))}

      <Text style={[st.h2, { marginTop: S.lg }]}>সহায়ক টুল</Text>
      <View style={st.tools}>
        {TOOLS.map((x) => (
          <Pressable key={x.route} onPress={() => navigation.navigate(x.route, { t: Date.now() })} style={({ pressed }) => [st.toolTile, pressed && { opacity: 0.85 }]}
            accessibilityRole="button" accessibilityLabel={`${x.title} খুলুন`}>
            <Text style={st.toolIc} importantForAccessibility="no">{x.icon}</Text>
            <Text style={st.toolT}>{x.title}</Text>
          </Pressable>
        ))}
      </View>

      {UPCOMING.length ? <Text style={[st.h2, { marginTop: S.lg }]}>যা আসছে</Text> : null}
      {UPCOMING.length ? <Text style={st.sub}>এই সুবিধাগুলো তৈরি হচ্ছে। তৈরি হলেই এখানে চালু হবে।</Text> : null}
      {UPCOMING.map(([ic, title, what]) => (
        <View key={title} style={st.row} accessible accessibilityLabel={`${title}, ${what}, ${T.soon}`}>
          <Text style={st.rowIc} importantForAccessibility="no">{ic}</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.rowT}>{title}</Text>
            <Text style={st.rowW}>{what}</Text>
          </View>
          <View style={st.soon}><Text style={st.soonT}>{T.soon}</Text></View>
        </View>
      ))}
    </ScrollView>
  );
}

// Leader accounts: the panel when approved, otherwise where the application stands.
function LeaderHomeCard({ me, navigation }) {
  const approved = me.role === 'leader';
  return (
    <Pressable onPress={() => navigation.navigate(approved ? 'Leader' : 'LeaderApply')} style={({ pressed }) => [st.ready, { borderWidth: 2, borderColor: C.gold }, pressed && { opacity: 0.9 }]}
      accessibilityRole="button" accessibilityLabel={approved ? 'লিডার প্যানেল খুলুন' : 'লিডার আবেদনের অবস্থা দেখুন'}>
      <Text style={st.readyIc} importantForAccessibility="no">🧭</Text>
      <View style={{ flex: 1 }}>
        <Text style={st.readyT}>{approved ? 'লিডার প্যানেল' : 'লিডার অ্যাকাউন্ট: অনুমোদন বাকি'}</Text>
        <Text style={st.readyW}>{approved ? 'হাজী, চুক্তি, দল, প্যাকেজ ও ঘোষণা এক জায়গায়।' : 'এজেন্সির তথ্য ও কাগজ জমা দিন, অ্যাডমিন যাচাই করে অনুমোদন দেবেন।'}</Text>
      </View>
      <Text style={st.readyGo}>খুলুন ›</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.lg, backgroundColor: C.bg, gap: S.md },
  loadT: { fontSize: F.body, color: C.muted },
  wrap: { padding: S.md, paddingBottom: S.xl },
  hero: { backgroundColor: C.primary, borderRadius: R.lg, padding: S.lg, marginBottom: S.md },
  hi: { color: C.onPrimarySoft, fontSize: F.body },
  nm: { color: C.onPrimary, fontSize: F.hero, fontWeight: '700', marginVertical: 4, lineHeight: 38 },
  idPill: { alignSelf: 'flex-start', backgroundColor: C.accent, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: 6, marginTop: 4 },
  idT: { color: C.text, fontWeight: '700', fontSize: F.body },
  coach: { borderWidth: 2, borderColor: C.accent, marginBottom: S.md, backgroundColor: C.accentSoft },
  coachH: { fontSize: F.large, fontWeight: '700', color: C.text },
  coachB: { fontSize: F.body, color: C.text, marginTop: 6, lineHeight: 28 },
  arrow: { fontSize: 36, textAlign: 'center', marginTop: 4 },
  skip: { minHeight: TOUCH, justifyContent: 'center', alignSelf: 'center', paddingHorizontal: S.md },
  skipT: { fontSize: F.small, color: C.primary, fontWeight: '700', textDecorationLine: 'underline' },
  h2: { fontSize: F.title, fontWeight: '700', color: C.text, marginTop: S.sm },
  sub: { fontSize: F.small, color: C.muted, marginBottom: S.sm, lineHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.line },
  rowIc: { fontSize: 30 },
  rowT: { fontSize: F.large, fontWeight: '700', color: C.text },
  rowW: { fontSize: F.small, color: C.muted, lineHeight: 22 },
  ready: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.lg, padding: S.md, marginTop: S.sm, borderWidth: 2, borderColor: C.primary, minHeight: 84 },
  readyIc: { fontSize: 36 },
  readyT: { fontSize: F.large, fontWeight: '700', color: C.primary },
  readyW: { fontSize: F.small, color: C.text, lineHeight: 22 },
  readyGo: { fontSize: F.body, color: C.primary, fontWeight: '700' },
  np: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.accentSoft, borderRadius: R.lg, borderWidth: 2, borderColor: C.accent, padding: S.md, marginBottom: S.md },
  npIc: { fontSize: 32 },
  npL: { fontSize: F.small, color: C.muted },
  npT: { fontSize: F.title, fontWeight: '700', color: C.text, lineHeight: 34 },
  npP: { fontSize: F.body, fontWeight: '400', color: C.muted },
  npLeft: { fontSize: F.small, fontWeight: '700', color: C.primary },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.sm },
  toolTile: { flexBasis: '30%', flexGrow: 1, minHeight: 96, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1.5, borderColor: C.gold, alignItems: 'center', justifyContent: 'center', padding: S.sm },
  toolIc: { fontSize: 30 },
  toolT: { fontSize: F.small, fontWeight: '700', color: C.text, textAlign: 'center', marginTop: 4, lineHeight: 22 },
  soon: { backgroundColor: C.primarySoft, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  soonT: { fontSize: 14, color: C.muted, fontWeight: '700' },
});
