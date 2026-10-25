import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Animated, AccessibilityInfo, AppState, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { pushSupported, syncPush, isPushTap } from './src/lib/push';
import { refreshUnread } from './src/lib/notifications';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';
import { Button } from './src/components/ui';
import { prefs } from './src/lib/prefs';
import { C, F, S, TOUCH } from './src/theme';
import { T } from './src/strings';
import { TutorialCtx, useTutorial } from './src/tutorial';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import Onboarding from './src/screens/Onboarding';
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
import MyLeaderScreen from './src/screens/MyLeaderScreen';
import LeadersScreen from './src/screens/LeadersScreen';
import LeaderContractsScreen from './src/screens/LeaderContractsScreen';
import LeaderMeScreen from './src/screens/LeaderMeScreen';
import HelpChatScreen from './src/screens/HelpChatScreen';
import HelpInboxScreen from './src/screens/HelpInboxScreen';
import GroupStaffScreen from './src/screens/GroupStaffScreen';
import KhademHomeScreen from './src/screens/KhademHomeScreen';
import TermsScreen from './src/screens/TermsScreen';
import { MeCtx, loadMe } from './src/lib/me';
import { useKeyboardHeight, keyboardPad } from './src/lib/keyboard';
import { photoGateState } from './src/lib/avatar';
import { refreshReminders, snoozeAlarm } from './src/lib/reminders';
import VideoBar from './src/components/VideoBar';
import { loadVideoLinks } from './src/lib/videoLinks';
import { updateGate, APP_VERSION } from './src/lib/appVersion';

const Tab = createBottomTabNavigator();
const ICON = { Home: '🏠', Map: '🆘', Dua: '🤲', Offers: '🎁', Account: '👤' };

function DuaFab({ pending }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop;
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
function UpdateNeeded({ storeUrl, onSkip }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: S.lg, paddingTop: 64, justifyContent: 'center' }}>
      <Text style={{ fontSize: 56, textAlign: 'center' }} importantForAccessibility="no">⬆️</Text>
      <Text style={{ fontSize: F.title, fontWeight: '700', color: C.primary, textAlign: 'center', marginVertical: S.md }} accessibilityRole="header">নতুন সংস্করণ নিন</Text>
      <Text style={{ fontSize: F.body, color: C.text, textAlign: 'center', lineHeight: F.body * 1.5, marginBottom: S.lg }}>
        আপনার নিরাপত্তার জন্য Travel Adda-র নতুন সংস্করণ দরকার। আপনার তথ্য নিরাপদ আছে; নতুন সংস্করণ নিলে আগের মতোই সব পাবেন। (এই ফোনে আছে: {APP_VERSION})
      </Text>
      {storeUrl ? <Button title="নতুন সংস্করণ নিন" icon="⬇️" onPress={() => Linking.openURL(storeUrl).catch(() => {})} />
        : <Text style={{ fontSize: F.body, color: C.muted, textAlign: 'center' }}>নতুন সংস্করণের জন্য Travel Adda হেল্পলাইনে যোগাযোগ করুন।</Text>}
      {onSkip ? <Button title="অ্যাডমিন হিসেবে চালিয়ে যান" kind="secondary" onPress={onSkip} style={{ marginTop: S.md }} /> : null}
    </View>
  );
}

function KeyboardRoom({ children }) {
  const kb = keyboardPad(useKeyboardHeight());
  const [h, setH] = useState({ full: 0, now: 0 });
  const onLayout = (e) => { const v = e.nativeEvent.layout.height; setH((x) => ({ full: Math.max(x.full, v), now: v })); };   // portrait-only app: the tallest size is the full screen
  const pad = kb && !(h.full && h.now < h.full - kb / 2) ? kb : 0;   // 0 when the phone itself already made room
  return <KbCtx.Provider value={kb > 0}><View style={{ flex: 1, paddingBottom: pad }} onLayout={onLayout}>{children}</View></KbCtx.Provider>;
}
const KbCtx = React.createContext(false);

function TabBar({ state, navigation }) {
  const ins = useSafeAreaInsets();
  const { handsOnPending, completeHandsOn } = useTutorial();
  const kbOpen = React.useContext(KbCtx);
  if (kbOpen) return null;                   // no tab bar while typing: more room for the form
  return (
    <View style={[s.bar, { paddingBottom: Math.max(ins.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.map((r, i) => {
        if (!ICON[r.name]) return null;          // screens opened from inside the app (e.g. Ihram guide) have no tab button
        const on = state.index === i;
        const label = T.tabs[r.name];
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

const soon = (title, icon, what) => (props) => <Soon {...props} title={title} icon={icon} what={what} />;

function Main() {
  return (
    <Tab.Navigator
      tabBar={(p) => <TabBar {...p} />}
      screenLayout={({ children, route }) => <View style={{ flex: 1 }}><VideoBar route={route.name} />{children}</View>}
      screenOptions={({ navigation, route }) => ({
        headerStyle: { backgroundColor: C.primary }, headerTintColor: C.onPrimary, headerTitleStyle: { fontSize: F.large, fontWeight: '700' },
        headerRight: route.name === 'Notifications' ? undefined : () => <Bell onPress={() => navigation.navigate('Notifications')} />,
      })}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: T.appName }} />
      <Tab.Screen name="Map" component={EmergencyScreen} options={{ title: 'জরুরি সাহায্য' }} />
      <Tab.Screen name="Dua" component={DuaScreen} options={{ title: 'দোয়া ভল্ট' }} />
      <Tab.Screen name="Offers" component={OffersScreen} options={{ title: 'অফার ও প্যাকেজ' }} />
      <Tab.Screen name="Account" component={Account} options={{ title: T.tabs.Account }} />
      <Tab.Screen name="Ihram" component={IhramScreen} options={{ title: 'মীকাত ও ইহরাম গাইড' }} />
      <Tab.Screen name="Umrah" component={UmrahScreen} options={{ title: 'ওমরাহ ধাপে ধাপে' }} />
      <Tab.Screen name="Hajj" component={HajjScreen} options={{ title: 'হজের দিনগুলো' }} />
      <Tab.Screen name="Prayer" component={PrayerScreen} options={{ title: 'নামাজের সময় ও কিবলা' }} />
      <Tab.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'গোপনীয়তা নীতি' }} />
      <Tab.Screen name="Guides" component={GuidesScreen} options={{ title: 'আরও গাইড ও তথ্য' }} />
      <Tab.Screen name="Docs" component={DocsScreen} options={{ title: 'আমার কাগজপত্র' }} />
      <Tab.Screen name="Salah" component={SalahScreen} options={{ title: 'নামাজের রাকাত ও নিয়ম' }} />
      <Tab.Screen name="Tasbih" component={TasbihScreen} options={{ title: 'তাসবিহ গণনা' }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: 'ইসলামি দিনপঞ্জি' }} />
      <Tab.Screen name="Group" component={GroupScreen} options={{ title: 'আমার দল ও লিডার' }} />
      <Tab.Screen name="LeaderApply" component={LeaderApplyScreen} options={{ title: 'লিডার আবেদন' }} />
      <Tab.Screen name="Leader" component={LeaderScreen} options={{ title: 'লিডার প্যানেল' }} />
      <Tab.Screen name="Admin" component={AdminScreen} options={{ title: 'অ্যাডমিন' }} />
      <Tab.Screen name="LeaderOffers" component={LeaderOffersScreen} options={{ title: 'আমার প্যাকেজ' }} />
      <Tab.Screen name="VerifyPhone" component={VerifyPhoneScreen} options={{ title: 'অ্যাকাউন্ট যাচাই' }} />
      <Tab.Screen name="MyLeader" component={MyLeaderScreen} options={{ title: 'লিডার ও চুক্তি' }} />
      <Tab.Screen name="Leaders" component={LeadersScreen} options={{ title: 'যাচাই করা লিডার' }} />
      <Tab.Screen name="LeaderContracts" component={LeaderContractsScreen} options={{ title: 'চুক্তি ও হাজী' }} />
      <Tab.Screen name="LeaderMe" component={LeaderMeScreen} options={{ title: 'আমার লিডার প্রোফাইল' }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'নোটিফিকেশন' }} />
      <Tab.Screen name="Terms" component={TermsScreen} options={{ title: 'শর্তাবলি' }} />
      <Tab.Screen name="HelpChat" component={HelpChatScreen} options={{ title: 'লিডারকে প্রশ্ন' }} />
      <Tab.Screen name="HelpInbox" component={HelpInboxScreen} options={{ title: 'হাজীদের প্রশ্ন' }} />
      <Tab.Screen name="GroupStaff" component={GroupStaffScreen} options={{ title: 'খাদেম ও তৈরি উত্তর' }} />
      <Tab.Screen name="KhademHome" component={KhademHomeScreen} options={{ title: 'খাদেমের পাতা' }} />
    </Tab.Navigator>
  );
}

const navRef = createNavigationContainerRef();

export default function App() {
  const [session, setSession] = useState(undefined);
  const [onboarded, setOnboarded] = useState(undefined);
  const [handsOnPending, setHandsOnPending] = useState(false);
  const [photoGate, setPhotoGate] = useState(undefined);   // undefined = checking | 'missing' | 'ok' | 'skipped'
  const [me, setMe] = useState(null);                      // profile: account type, role, status (offline copy if no internet)
  const userId = session ? session.user.id : null;

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (alive) setSession(data.session || null); })
      .catch(() => { if (alive) setSession(null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess || null));
    prefs.isOnboarded().then((v) => { if (alive) setOnboarded(v); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  // After login, offer the hands-on practice once.
  useEffect(() => {
    if (!session) { setHandsOnPending(false); return; }
    let alive = true;
    prefs.isHandsOnDone().then((done) => { if (alive) setHandsOnPending(!done); });
    return () => { alive = false; };
  }, [session]);

  // After login: video links set by the admin, and the forced-update check (supabase/022).
  const [gate, setGate] = useState(null);
  const [skipUpdate, setSkipUpdate] = useState(false);
  useEffect(() => {
    if (!session) { setGate(null); return; }
    loadVideoLinks();
    supabase.from('app_settings').select('key,value').then((r) => { if (!r.error) setGate(r.data || []); }).catch(() => {});
  }, [session]);

  // Prayer reminders cover the next 7 days; re-make them whenever the app is opened.
  useEffect(() => {
    refreshReminders();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') refreshReminders(); });
    return () => sub.remove();
  }, []);

  // Push: refresh this phone's registration after login; a tap on a Travel Adda alert opens the 🔔 page.
  const [pendingOpen, setPendingOpen] = useState(false);
  const [navReady, setNavReady] = useState(0);            // counts each time the app's pages become ready
  useEffect(() => {
    if (pendingOpen && navReady && navRef.isReady()) {
      setPendingOpen(false);
      try { Notifications.clearLastNotificationResponseAsync?.()?.catch?.(() => {}); } catch (e) { /* older versions */ }
      navRef.navigate('Notifications');
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
    photoGateState().then((v) => { if (alive) setPhotoGate(v); });
    return () => { alive = false; };
  }, [userId]);

  // Who is signed in (haji / leader / admin, active / suspended). Re-checked when the app comes back to the front.
  const refreshMe = useCallback(async () => { const m = await loadMe(); setMe(m); return m; }, []);
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

  const splash = <View style={s.splash}><Logo size={96} /><Text style={s.splashName}>Travel Adda</Text><ActivityIndicator color={C.gold} size="large" /></View>;
  const checkingPhoto = !!session && onboarded === true && photoGate === undefined;
  let body;
  if (session === undefined || onboarded === undefined || checkingPhoto) {
    body = splash;
  } else if (!onboarded) {
    body = <Onboarding onDone={finishOnboarding} />;
  } else if (!session) {
    body = <AuthScreen />;
  } else if (gate && !skipUpdate && updateGate(gate, me && me.role).block) {
    const u = updateGate(gate, me && me.role);
    body = <UpdateNeeded storeUrl={u.storeUrl} onSkip={u.canSkip ? () => setSkipUpdate(true) : null} />;
  } else if (me && me.status === 'suspended') {
    body = <Suspended />;
  } else if (photoGate === 'missing') {
    body = <PhotoCapture onDone={() => setPhotoGate('ok')} onSkip={() => setPhotoGate('skipped')} />;
  } else {
    body = <KeyboardRoom><NavigationContainer ref={navRef} onReady={() => setNavReady((x) => x + 1)}><Main /></NavigationContainer></KeyboardRoom>;
  }
  return (
    <SafeAreaProvider>
      <MeCtx.Provider value={meCtx}>
      <TutorialCtx.Provider value={tutorial}>
        <StatusBar style={(session && onboarded && photoGate !== 'missing' && photoGate !== undefined) || session === undefined || onboarded === undefined || checkingPhoto ? 'light' : 'dark'} />
        {body}
      </TutorialCtx.Provider>
      </MeCtx.Provider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', gap: 16 },
  splashName: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
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
