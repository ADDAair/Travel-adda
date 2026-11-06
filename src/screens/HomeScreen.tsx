import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { C, F, S, R, TOUCH } from '../theme';
import { T } from '../strings';
import { Button, Card, Notice } from '../components/ui';
import NoticeBar from '../components/NoticeBar';
import { toBn } from '../lib/phone';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTutorial } from '../tutorial';
import { loadSavedLocation, placeName, type Place } from '../lib/location';
import { finishStartup } from '../lib/startup';
import { dayPlan, fmtTime, fmtLeft, prayerName } from '../lib/prayer';
import { useMe, isLeaderAccount, PROFILE_CACHE as ME_CACHE, type Me } from '../lib/me';
import { processPendingReferral, processPendingTerms } from '../lib/market';
import TripSummary from '../components/TripSummary';
import PushCard from '../components/PushCard';
import { TileGrid } from '../components/TileGrid';
import { PENDING_EMAIL } from '../lib/login';
import { myKhademGroups, myKhademInvites } from '../lib/help';
import { hajiCountPublic, hajiCountText } from '../lib/counts';
import type { Nav } from './navTypes';
import type { Res } from '../lib/types';

type Hello = { full_name?: string | null; haji_code?: string | null };   // name and ID shown at the top

// Working features, shown as tiles (same design as the helpful tools). Every tile opens something that really works.
// The words are in strings.ts / stringsEn.ts (home.ready: [title, what]); `what` is read aloud by the screen reader.
const READY: { route: string; icon: string; hajiOnly?: boolean }[] = [
  { route: 'Prayer', icon: '🕌' }, { route: 'Dua', icon: '🤲' }, { route: 'MyLeader', icon: '🤝', hajiOnly: true },
  { route: 'Docs', icon: '📄' }, { route: 'Ihram', icon: '🕋' }, { route: 'Umrah', icon: '🔄' }, { route: 'Hajj', icon: '⛺' }, { route: 'Guides', icon: '📚' },
];
const ready = () => READY.map((x) => ({ ...x, key: x.route, title: T.home.ready[x.route][0], what: T.home.ready[x.route][1] }));

const PROFILE_CACHE = ME_CACHE;
const TOOLS = [{ route: 'Salah', icon: '🧎' }, { route: 'Tasbih', icon: '📿' }, { route: 'Calendar', icon: '📅' }];

const UPCOMING: [string, string, string][] = [
];

export default function HomeScreen({ navigation }: { navigation: Nav }) {
  const H = T.home;
  const { handsOnPending, skipHandsOn } = useTutorial();
  const { me, refreshMe } = useMe();
  const leaderAcc = isLeaderAccount(me);
  const [refMsg, setRefMsg] = useState<Res<typeof processPendingReferral>>(null);
  // A referral code typed at sign-up is attached once the account exists.
  useEffect(() => { processPendingReferral().then((r) => { if (r) setRefMsg(r); }); processPendingTerms(); }, [me]);
  const [p, setP] = useState<Hello | null>(null);
  const [state, setState] = useState('load');
  // An e-mail typed at sign-up waits here until it is verified with the code (then it can be used to log in).
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  // Khadem of some group? Then a card leads to the khadem page (questions waiting are counted).
  const [khadem, setKhadem] = useState<{ n: number; waiting: number; invites: number } | null>(null);
  useEffect(() => {
    const check = () => Promise.all([myKhademGroups(), myKhademInvites().catch(() => [])])
      .then(([g, iv]) => setKhadem(g.length || iv.length ? { n: g.length, waiting: g.reduce((s, x) => s + (x.waiting || 0), 0), invites: iv.length } : null)).catch(() => setKhadem(null));
    check(); return navigation?.addListener?.('focus', check);
  }, [navigation]);
  useEffect(() => {
    const check = () => AsyncStorage.getItem(PENDING_EMAIL).then((e) => setPendingEmail(e && !(me && me.email === e && me.email_verified) ? e : null)).catch(() => {});
    check(); return navigation?.addListener?.('focus', check);
  }, [me, navigation]);

  // The guides work offline (e.g. inside the Haram without data), so Home must never be blocked by a failed fetch.
  // Name and ID come from the profile the app already loaded (no second request); the phone's copy is shown meanwhile.
  const load = useCallback(async () => {
    let cached: Hello | null = null;
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
  // "১২,০০০+ হাজী 'আমি হাজী' অ্যাপ ব্যবহার করছেন" — only after the admin turned it on and the total reached his minimum (032).
  const [countLine, setCountLine] = useState<string | null>(null);
  useEffect(() => {
    const get = () => { hajiCountPublic().then((n) => setCountLine(hajiCountText(n))); };
    get(); return navigation?.addListener?.('focus', get);
  }, [navigation]);

  const [ploc, setPloc] = useState<Place | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const refresh = () => { setNow(Date.now()); loadSavedLocation().then(setPloc); };
    refresh();
    const unsub = navigation.addListener?.('focus', refresh);
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => { unsub?.(); clearInterval(t); };
  }, [navigation]);
  let next = null;
  if (ploc) { try { const pl = dayPlan(ploc, now); next = { ...pl, t: fmtTime(pl.nextAt, pl.tz, pl.next.key), nm: pl.nextAt === pl.times.dhuhr ? prayerName(pl.next, pl.today) : pl.next.name }; } catch (e) { next = null; } }

  useEffect(() => { if (state !== 'load') finishStartup('home'); }, [state]);
  if (state === 'load') {
    return <View style={st.center}><ActivityIndicator color={C.primary} size="large" /><Text style={st.loadT}>{H.loading}</Text></View>;
  }
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <View style={st.hero} accessible accessibilityLabel={p ? H.heroA11y(String(p.full_name || ''), String(p.haji_code || '')) : H.salam}>
        <Text style={st.hi}>{H.salamWave}</Text>
        {p ? <Text style={st.nm}>{p.full_name}</Text> : null}
        {p ? <View style={st.idPill}><Text style={st.idT}>{leaderAcc ? H.leaderId : H.hajiId}: {toBn(p.haji_code)}</Text></View> : null}
      </View>
      {!leaderAcc && countLine ? <Text style={st.count}>🤝 {countLine}</Text> : null}
      <NoticeBar navigation={navigation} />
      {state === 'err' ? (
        <Notice kind="warn" title={H.offlineT} text={p ? H.offlineOld : H.offline}>
          <Button title={T.retry} icon="🔄" kind="secondary" onPress={retry} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}

      {next ? (
        <Pressable onPress={() => navigation.navigate('Prayer')} style={({ pressed }) => [st.np, pressed && { opacity: 0.9 }]} accessibilityRole="button"
          accessibilityLabel={H.nextA11y(next.nm, next.t.part, next.t.time, fmtLeft(next.nextAt - now))}>
          <Text style={st.npIc} importantForAccessibility="no">🕌</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.npL}>{H.next(placeName(ploc))}</Text>
            <Text style={st.npT}>{next.nm} {next.t.time} <Text style={st.npP}>{next.t.part}</Text></Text>
            <Text style={st.npLeft}>{H.left(fmtLeft(next.nextAt - now))}</Text>
          </View>
          <Text style={st.readyGo}>{T.common.all}</Text>
        </Pressable>
      ) : null}

      {handsOnPending ? (
        <Card style={st.coach}>
          <Text style={st.coachH}>{H.tryT}</Text>
          <Text style={st.coachB}>{H.try1}<Text style={{ fontWeight: '700' }}>{H.tryGold}</Text>{H.try2}</Text>
          <Text style={st.arrow} importantForAccessibility="no">👇</Text>
          <Pressable onPress={skipHandsOn} style={st.skip} accessibilityRole="button" accessibilityLabel={H.later}>
            <Text style={st.skipT}>{H.later}</Text>
          </Pressable>
        </Card>
      ) : null}

      {!handsOnPending && pendingEmail ? (
        <Notice kind="info" title={H.mailT} text={H.mail(pendingEmail)}>
          <Button title={H.mailBtn} icon="📧" kind="secondary" onPress={() => navigation.navigate('VerifyPhone', { channel: 'email' })} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}
      {!handsOnPending && khadem ? (
        <Notice kind={khadem.waiting || khadem.invites ? 'warn' : 'info'} title={khadem.n ? H.khademT(khadem.n) : H.khademInviteT}
          text={khadem.invites ? H.khademInvites(khadem.invites) : khadem.waiting ? H.khademWaiting(khadem.waiting) : H.khademNone}>
          <Button title={H.khademBtn} icon="🤝" kind="secondary" onPress={() => navigation.navigate('KhademHome')} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}
      {!handsOnPending ? <PushCard mode="home" /> : null}
      {refMsg ? <Notice kind={refMsg.kind} title={refMsg.text}>{refMsg.kind !== 'ok' ? <Button title={H.myLeaderBtn} kind="secondary" onPress={() => navigation.navigate('MyLeader')} style={{ marginTop: S.sm }} /> : null}</Notice> : null}
      {leaderAcc ? <LeaderHomeCard me={me} navigation={navigation} /> : <TripSummary navigation={navigation} />}

      <Text style={st.h2}>{H.useNow}</Text>
      <TileGrid items={ready().filter((x) => !(leaderAcc && x.hajiOnly))}
        onPress={(x) => navigation.navigate(x.route, x.route === 'Dua' ? { tutorialDone: false } : undefined)} />

      <Text style={[st.h2, { marginTop: S.lg }]}>{H.toolsT}</Text>
      <TileGrid tone="gold" items={TOOLS.map((x) => ({ ...x, key: x.route, title: H.tools[x.route] }))} onPress={(x) => navigation.navigate(x.route, { t: Date.now() })} />

      {UPCOMING.length ? <Text style={[st.h2, { marginTop: S.lg }]}>{H.upcoming}</Text> : null}
      {UPCOMING.length ? <Text style={st.sub}>{H.upcomingSub}</Text> : null}
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
function LeaderHomeCard({ me, navigation }: { me: Me | null; navigation: Nav }) {
  const H = T.home;
  const approved = me?.role === 'leader';
  return (
    <Pressable onPress={() => navigation.navigate(approved ? 'Leader' : 'LeaderApply')} style={({ pressed }) => [st.ready, { borderWidth: 2, borderColor: C.gold }, pressed && { opacity: 0.9 }]}
      accessibilityRole="button" accessibilityLabel={approved ? H.panelA11y : H.statusA11y}>
      <Text style={st.readyIc} importantForAccessibility="no">🧭</Text>
      <View style={{ flex: 1 }}>
        <Text style={st.readyT}>{approved ? H.panel : H.pending}</Text>
        <Text style={st.readyW}>{approved ? H.panelW : H.pendingW}</Text>
      </View>
      <Text style={st.readyGo}>{T.common.open}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.lg, backgroundColor: C.bg, gap: S.md },
  loadT: { fontSize: F.body, color: C.muted },
  wrap: { padding: S.md, paddingBottom: S.xl },
  count: { color: C.muted, fontSize: F.body, textAlign: 'center', marginTop: -S.xs, marginBottom: S.md },
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
  soon: { backgroundColor: C.primarySoft, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  soonT: { fontSize: 14, color: C.muted, fontWeight: '700' },
});
