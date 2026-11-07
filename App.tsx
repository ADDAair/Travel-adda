import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Animated, AccessibilityInfo, AppState, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef, type NavigationState } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { pushSupported, syncPush, isPushTap } from './src/lib/push';
import { refreshUnread } from './src/lib/notifications';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { Session } from '@supabase/supabase-js';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NetStrip } from './src/components/NetStrip';
import { supabase } from './src/lib/supabase';
import { Button } from './src/components/ui';
import { prefs } from './src/lib/prefs';
import { C, F, S, TOUCH } from './src/theme';
import { T } from './src/strings';
import { TutorialCtx, useTutorial } from './src/tutorial';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import Onboarding from './src/screens/Onboarding';
import LanguageChoice from './src/screens/LanguageChoice';
import { LangButton } from './src/components/LangButton';
import { loadLang, setLang, onLang, type Lang } from './src/lib/lang';
import { startLangSync } from './src/lib/langSync';
import Logo from './src/components/Logo';
import DuaScreen from './src/screens/DuaScreen';
import { Soon, Account } from './src/screens/Placeholder';
import PhotoCapture from './src/screens/PhotoCapture';
import IhramScreen from './src/screens/IhramScreen';
import UmrahScreen from './src/screens/UmrahScreen';
import HajjScreen from './src/screens/HajjScreen';
import PrayerScreen from './src/screens/PrayerScreen';
import PrivacyScreen from './src/screens/PrivacyScreen';
import EmergencyScreen from './src/screens/EmergencyScreen';
import GuidesScreen from './src/screens/GuidesScreen';
import DocsScreen from './src/screens/DocsScreen';
import TripScreen from './src/screens/TripScreen';
import SalahScreen from './src/screens/SalahScreen';
import TasbihScreen from './src/screens/TasbihScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import GroupScreen from './src/screens/GroupScreen';
import LeaderApplyScreen from './src/screens/LeaderApplyScreen';
import LeaderScreen from './src/screens/LeaderScreen';
import AdminScreen from './src/screens/AdminScreen';
import OffersScreen from './src/screens/OffersScreen';
import LeaderOffersScreen from './src/screens/LeaderOffersScreen';
import VerifyPhoneScreen from './src/screens/VerifyPhoneScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import Bell from './src/components/Bell';
import Suspended from './src/screens/Suspended';
import Paused from './src/screens/Paused';
import MyLeaderScreen from './src/screens/MyLeaderScreen';
import LeadersScreen from './src/screens/LeadersScreen';
import LeaderContractsScreen from './src/screens/LeaderContractsScreen';
import LeaderMeScreen from './src/screens/LeaderMeScreen';
import HelpChatScreen from './src/screens/HelpChatScreen';
import HelpInboxScreen from './src/screens/HelpInboxScreen';
import GroupStaffScreen from './src/screens/GroupStaffScreen';
import KhademHomeScreen from './src/screens/KhademHomeScreen';
import TermsScreen from './src/screens/TermsScreen';
import { MeCtx, loadMe, type Me } from './src/lib/me';
import { useKeyboardHeight, keyboardPad } from './src/lib/keyboard';
import { photoGateState } from './src/lib/avatar';
import { markStart, mark } from './src/lib/startup';

markStart();   // how long the app takes to open (shown on the admin speed page)
import { refreshReminders, snoozeAlarm } from './src/lib/reminders';
import VideoBar from './src/components/VideoBar';
import { loadVideoLinks } from './src/lib/videoLinks';
import { loadContentOverrides } from './src/lib/contentEdit';
import { GUIDES } from './src/content/guides';
import { DUAS } from './src/content/duas';
import ChatConsentScreen from './src/screens/ChatConsentScreen';
import FundScreen from './src/screens/FundScreen';
import { updateGate, APP_VERSION } from './src/lib/appVersion';
import type { Nav, Route } from './src/screens/navTypes';

const Tab = createBottomTabNavigator();
const ICON: Record<string, string> = { Home: '🏠', Map: '🆘', Dua: '🤲', Offers: '🎁', Account: '👤' };

function DuaFab({ pending }: { pending: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || !pending || reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(scale, { toValue: 1.1, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]));
      loop.start();
    }).catch(() => {});
    return () => { cancelled = true; if (loop) loop.stop(); scale.setValue(1); };
  }, [pending, scale]);
  return (
    <Animated.View style={[s.fab, pending && s.fabPending, { transform: [{ scale }] }]}>
      <Text style={{ fontSize: 30 }} importantForAccessibility="no">{ICON.Dua}</Text>
    </Animated.View>
  );
}

// While the keyboard is open the app gets smaller by the keyboard's height, so the field being typed in and the
// buttons below it can be scrolled into view (Android 15+ otherwise draws the keyboard on top of the app).
// Shown when the admin set a minimum version newer than this app (security fixes etc.).
function UpdateNeeded({ storeUrl, onSkip }: { storeUrl: string | null; onSkip?: (() => void) | null }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: S.lg, paddingTop: 64, justifyContent: 'center' }}>
      <Text style={{ fontSize: 56, textAlign: 'center' }} importantForAccessibility="no">⬆️</Text>
      <Text style={{ fontSize: F.title, fontWeight: '700', color: C.primary, textAlign: 'center', marginVertical: S.md }} accessibilityRole="header">{T.update.title}</Text>
      <Text style={{ fontSize: F.body, color: C.text, textAlign: 'center', lineHeight: F.body * 1.5, marginBottom: S.lg }}>{T.update.text(APP_VERSION)}</Text>
      {storeUrl ? <Button title={T.update.get} icon="⬇️" onPress={() => Linking.openURL(storeUrl).catch(() => {})} />
        : <Text style={{ fontSize: F.body, color: C.muted, textAlign: 'center' }}>{T.update.helpline}</Text>}
      {onSkip ? <Button title={T.update.skip} kind="secondary" onPress={onSkip} style={{ marginTop: S.md }} /> : null}
    </View>
  );
}

function KeyboardRoom({ children }: { children: React.ReactNode }) {
  const kb = keyboardPad(useKeyboardHeight());
  const [h, setH] = useState({ full: 0, now: 0 });
  const onLayout = (e: { nativeEvent: { layout: { height: number } } }) => { const v = e.nativeEvent.layout.height; setH((x) => ({ full: Math.max(x.full, v), now: v })); };   // portrait-only app: the tallest size is the full screen
  const pad = kb && !(h.full && h.now < h.full - kb / 2) ? kb : 0;   // 0 when the phone itself already made room
  return <KbCtx.Provider value={kb > 0}><View style={{ flex: 1, paddingBottom: pad }} onLayout={onLayout}>{children}</View></KbCtx.Provider>;
}
const KbCtx = React.createContext(false);

function TabBar({ state, navigation }: BottomTabBarProps) {
  const ins = useSafeAreaInsets();
  const { handsOnPending, completeHandsOn } = useTutorial();
  const kbOpen = React.useContext(KbCtx);
  if (kbOpen) return null;                   // no tab bar while typing: more room for the form
  return (
    <View style={[s.bar, { paddingBottom: Math.max(ins.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.map((r, i) => {
        if (!ICON[r.name]) return null;          // screens opened from inside the app (e.g. Ihram guide) have no tab button
        const on = state.index === i;
        const label = (T.tabs as Record<string, string>)[r.name];
        const go = () => {
          const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
          if (e.defaultPrevented) return;
          if (r.name === 'Dua' && handsOnPending) {
            completeHandsOn();
            navigation.navigate('Dua', { tutorialDone: true });
          } else if (!on) {
            navigation.navigate(r.name, { tutorialDone: false });
          }
        };
        const common = { onPress: go, accessibilityRole: 'tab', accessibilityState: { selected: on }, accessibilityLabel: label };
        if (r.name === 'Dua') {
          return (
            <Pressable key={r.key} {...common} style={s.mid}>
              <DuaFab pending={handsOnPending} />
              <Text style={[s.lb, { color: on ? C.primary : C.muted }]}>{label}</Text>
              <View style={[s.lbBar, { backgroundColor: on ? C.accent : 'transparent' }]} />
            </Pressable>
          );
        }
        return (
          <Pressable key={r.key} {...common} style={s.tab}>
            <View style={[s.pill, on && s.pillOn]}>
              <Text style={{ fontSize: 24 }} importantForAccessibility="no">{ICON[r.name]}</Text>
            </View>
            <Text style={[s.lb, { color: on ? C.primary : C.muted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
            <View style={[s.lbBar, { backgroundColor: on ? C.accent : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const soon = (title: string, icon: string, what: string) => (props: { navigation: Nav; route?: Route }) => <Soon {...props} title={title} icon={icon} what={what} />;

// Home's green bar: the logo, then "আমি হাজী" (owner request, Nov 2026). The name is read aloud once.
function HeaderBrand() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible accessibilityRole="header" accessibilityLabel={T.appName}>
      <Logo size={30} decorative />
      <Text style={{ color: C.onPrimary, fontSize: F.large, fontWeight: '700' }} numberOfLines={1}>{T.appName}</Text>
    </View>
  );
}

function Main() {
  return (
    <Tab.Navigator
      tabBar={(p) => <TabBar {...p} />}
      screenLayout={({ children, route }) => <View style={{ flex: 1 }}><NetStrip /><VideoBar route={route.name} />{children}</View>}
      screenOptions={({ navigation, route }) => ({
        headerStyle: { backgroundColor: C.primary }, headerTintColor: C.onPrimary, headerTitleStyle: { fontSize: F.large, fontWeight: '700' },
        // language switch (EN / বাং) next to the bell on every page (owner request, Nov 2026)
        headerRight: () => <View style={{ flexDirection: 'row', alignItems: 'center' }}><LangButton />{route.name === 'Notifications' ? null : <Bell onPress={() => navigation.navigate('Notifications')} />}</View>,
      })}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: T.appName, headerTitle: () => <HeaderBrand /> }} />
      <Tab.Screen name="Map" component={EmergencyScreen} options={{ title: T.titles.Map }} />
      <Tab.Screen name="Dua" component={DuaScreen} options={{ title: T.titles.Dua }} />
      <Tab.Screen name="Offers" component={OffersScreen} options={{ title: T.titles.Offers }} />
      <Tab.Screen name="Account" component={Account} options={{ title: T.tabs.Account }} />
      <Tab.Screen name="Ihram" component={IhramScreen} options={{ title: T.titles.Ihram }} />
      <Tab.Screen name="Umrah" component={UmrahScreen} options={{ title: T.titles.Umrah }} />
      <Tab.Screen name="Hajj" component={HajjScreen} options={{ title: T.titles.Hajj }} />
      <Tab.Screen name="Prayer" component={PrayerScreen} options={{ title: T.titles.Prayer }} />
      <Tab.Screen name="Privacy" component={PrivacyScreen} options={{ title: T.titles.Privacy }} />
      <Tab.Screen name="Guides" component={GuidesScreen} options={{ title: T.titles.Guides }} />
      <Tab.Screen name="Docs" component={DocsScreen} options={{ title: T.titles.Docs }} />
      <Tab.Screen name="Trip" component={TripScreen} options={{ title: T.titles.Trip }} />
      <Tab.Screen name="Salah" component={SalahScreen} options={{ title: T.titles.Salah }} />
      <Tab.Screen name="Tasbih" component={TasbihScreen} options={{ title: T.titles.Tasbih }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: T.titles.Calendar }} />
      <Tab.Screen name="Group" component={GroupScreen} options={{ title: T.titles.Group }} />
      <Tab.Screen name="LeaderApply" component={LeaderApplyScreen} options={{ title: T.titles.LeaderApply }} />
      <Tab.Screen name="Leader" component={LeaderScreen} options={{ title: T.titles.Leader }} />
      <Tab.Screen name="Admin" component={AdminScreen} options={{ title: T.titles.Admin }} />
      <Tab.Screen name="LeaderOffers" component={LeaderOffersScreen} options={{ title: T.titles.LeaderOffers }} />
      <Tab.Screen name="VerifyPhone" component={VerifyPhoneScreen} options={{ title: T.titles.VerifyPhone }} />
      <Tab.Screen name="MyLeader" component={MyLeaderScreen} options={{ title: T.titles.MyLeader }} />
      <Tab.Screen name="Leaders" component={LeadersScreen} options={{ title: T.titles.Leaders }} />
      <Tab.Screen name="LeaderContracts" component={LeaderContractsScreen} options={{ title: T.titles.LeaderContracts }} />
      <Tab.Screen name="LeaderMe" component={LeaderMeScreen} options={{ title: T.titles.LeaderMe }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ title: T.titles.Notifications }} />
      <Tab.Screen name="Terms" component={TermsScreen} options={{ title: T.titles.Terms }} />
      <Tab.Screen name="HelpChat" component={HelpChatScreen} options={{ title: T.titles.HelpChat }} />
      <Tab.Screen name="HelpInbox" component={HelpInboxScreen} options={{ title: T.titles.HelpInbox }} />
      <Tab.Screen name="GroupStaff" component={GroupStaffScreen} options={{ title: T.titles.GroupStaff }} />
      <Tab.Screen name="KhademHome" component={KhademHomeScreen} options={{ title: T.titles.KhademHome }} />
      <Tab.Screen name="ChatConsent" component={ChatConsentScreen} options={{ title: T.titles.ChatConsent }} />
      <Tab.Screen name="Fund" component={FundScreen} options={{ title: T.titles.Fund }} />
    </Tab.Navigator>
  );
}

const navRef = createNavigationContainerRef();

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [onboarded, setOnboarded] = useState<boolean | undefined>(undefined);
  const [handsOnPending, setHandsOnPending] = useState(false);
  const [photoGate, setPhotoGate] = useState<'missing' | 'ok' | 'skipped' | undefined>(undefined);   // undefined = checking | 'missing' | 'ok' | 'skipped'
  const [me, setMe] = useState<Me | null>(null);                      // profile: account type, role, status (offline copy if no internet)
  const [lang, setLangState] = useState<Lang | null | undefined>(undefined);   // undefined = loading, null = not chosen yet (ask first)
  const navState = useRef<NavigationState | undefined>(undefined);   // the open page, kept across a language change
  useEffect(() => { loadLang().then((l) => setLangState(l)); return onLang((l) => setLangState(l)); }, []);
  const userId = session ? session.user.id : null;

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => { mark('session'); if (alive) setSession(data.session || null); })
      .catch(() => { if (alive) setSession(null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess || null));
    prefs.isOnboarded().then((v) => { if (alive) setOnboarded(v); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  // After login: tell the server the chosen language (phone alerts from the server come in it; supabase/036).
  useEffect(() => (userId ? startLangSync() : undefined), [userId]);

  // After login, offer the hands-on practice once.
  useEffect(() => {
    if (!session) { setHandsOnPending(false); return; }
    let alive = true;
    prefs.isHandsOnDone().then((done) => { if (alive) setHandsOnPending(!done); });
    return () => { alive = false; };
  }, [session]);

  // After login: video links set by the admin, and the forced-update check (supabase/022).
  const [gate, setGate] = useState<{ key: string; value: string | null }[] | null>(null);
  const [skipUpdate, setSkipUpdate] = useState(false);
  useEffect(() => {
    if (!session) { setGate(null); return; }
    loadVideoLinks();
    loadContentOverrides({ guide: GUIDES, dua: DUAS });
    Promise.resolve(supabase.from('app_settings').select('key,value')).then((r) => { if (!r.error) setGate(r.data || []); }).catch(() => {});
  }, [session]);

  // Prayer reminders cover the next 7 days; re-make them whenever the app is opened.
  useEffect(() => {
    refreshReminders();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') refreshReminders(); });
    const offLang = onLang(() => { refreshReminders(); });   // reminders say the prayer in the new language
    return () => { sub.remove(); offLang(); };
  }, []);

  // Push: refresh this phone's registration after login; a tap on a Travel Adda alert opens the 🔔 page.
  const [pendingOpen, setPendingOpen] = useState(false);
  const [navReady, setNavReady] = useState(0);            // counts each time the app's pages become ready
  useEffect(() => {
    if (pendingOpen && navReady && navRef.isReady()) {
      setPendingOpen(false);
      try { Notifications.clearLastNotificationResponseAsync?.()?.catch?.(() => {}); } catch (e) { /* older versions */ }
      (navRef.navigate as (name: string) => void)('Notifications');
    }
  }, [pendingOpen, navReady]);
  useEffect(() => {
    if (!userId || !pushSupported) return undefined;
    syncPush();
    let subA = null; let subB = null;
    try {
      subA = Notifications.addNotificationResponseReceivedListener((r) => { snoozeAlarm(r); if (isPushTap(r)) setPendingOpen(true); });
      subB = Notifications.addNotificationReceivedListener((n) => { if (n?.request?.content?.data?.route === 'Notifications') refreshUnread(); });
      Notifications.getLastNotificationResponseAsync().then((r) => { if (isPushTap(r)) setPendingOpen(true); }).catch(() => {});
    } catch (e) { /* push not available in this build */ }
    return () => { subA?.remove?.(); subB?.remove?.(); };
  }, [userId]);

  // After sign-in, check once whether this person already has a profile photo.
  useEffect(() => {
    if (!userId) { setPhotoGate(undefined); return; }
    let alive = true;
    photoGateState().then((v) => { mark('photo'); if (alive) setPhotoGate(v); });
    return () => { alive = false; };
  }, [userId]);

  // Who is signed in (haji / leader / admin, active / suspended). Re-checked when the app comes back to the front.
  const refreshMe = useCallback(async () => { const m = await loadMe(); mark('me'); setMe(m); return m; }, []);
  useEffect(() => {
    if (!userId) { setMe(null); return undefined; }
    refreshMe(); let lastMe = Date.now();
    // back to the front: check again (e.g. suspended) at most every 5 minutes, so many phones don't ask all the time
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active' && Date.now() - lastMe > 300000) { lastMe = Date.now(); refreshMe(); } });
    return () => sub.remove();
  }, [userId, refreshMe]);
  const meCtx = useMemo(() => ({ me, refreshMe }), [me, refreshMe]);

  const finishOnboarding = useCallback(() => { prefs.setOnboarded(true); setOnboarded(true); }, []);
  const tutorial = useMemo(() => ({
    handsOnPending,
    completeHandsOn: () => { prefs.setHandsOnDone(true); setHandsOnPending(false); },
    skipHandsOn: () => { prefs.setHandsOnDone(true); setHandsOnPending(false); },
    replay: () => {
      prefs.setOnboarded(false); prefs.setHandsOnDone(false);
      setOnboarded(false); setHandsOnPending(true);
    },
  }), [handsOnPending]);

  const splash = <View style={s.splash}><Logo size={96} /><Text style={s.splashName}>{T.appName}</Text><Text style={s.splashBy}>{T.byline}</Text><ActivityIndicator color={C.gold} size="large" /></View>;
  const checkingPhoto = !!session && onboarded === true && photoGate === undefined;
  let body;
  if (session === undefined || onboarded === undefined || lang === undefined || checkingPhoto) {
    body = splash;
  } else if (lang === null) {
    body = <LanguageChoice onPick={(l) => { setLang(l); }} />;     // first start: the language before anything else
  } else if (!onboarded) {
    body = <Onboarding onDone={finishOnboarding} />;
  } else if (!session) {
    body = <AuthScreen />;
  } else if (gate && !skipUpdate && updateGate(gate, me && me.role).block) {
    const u = updateGate(gate, me && me.role);
    body = <UpdateNeeded storeUrl={u.storeUrl} onSkip={u.canSkip ? () => setSkipUpdate(true) : null} />;
  } else if (me && me.status === 'suspended') {
    body = <Suspended me={me} onChanged={refreshMe} />;
  } else if (me && me.status === 'paused') {
    body = <Paused me={me} onChanged={refreshMe} />;
  } else if (photoGate === 'missing') {
    body = <PhotoCapture onDone={() => setPhotoGate('ok')} onSkip={() => setPhotoGate('skipped')} />;
  } else {
    body = <KeyboardRoom><NavigationContainer ref={navRef} initialState={navState.current} onStateChange={(x) => { navState.current = x; }} onReady={() => setNavReady((x) => x + 1)}><Main /></NavigationContainer></KeyboardRoom>;
  }
  return (
    <SafeAreaProvider>
      <MeCtx.Provider value={meCtx}>
      <TutorialCtx.Provider value={tutorial}>
        <StatusBar style={(session && onboarded && photoGate !== 'missing' && photoGate !== undefined) || session === undefined || onboarded === undefined || checkingPhoto ? 'light' : 'dark'} />
        <React.Fragment key={lang || 'none'}>{body}</React.Fragment>
      </TutorialCtx.Provider>
      </MeCtx.Provider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#0B5D4B', alignItems: 'center', justifyContent: 'center', gap: 16 },
  splashName: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  splashBy: { color: '#FFFFFF', fontSize: 16, marginBottom: 8, opacity: 0.9 },
  bar: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderColor: C.line, paddingTop: 8, alignItems: 'flex-end' },
  tab: { flex: 1, alignItems: 'center', minHeight: 64, justifyContent: 'flex-end', paddingHorizontal: 2 },
  pill: { minWidth: TOUCH + 8, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: C.primarySoft },
  mid: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 64 },
  fab: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', marginTop: -34, borderWidth: 4, borderColor: C.card, elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  fabPending: { borderColor: C.accent },
  lb: { fontSize: 14, marginTop: 4, fontWeight: '700', textAlign: 'center' },
  lbBar: { width: 24, height: 3, borderRadius: 2, marginTop: 2 },
});
