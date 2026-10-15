import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';
import { prefs } from './src/lib/prefs';
import { C, F, TOUCH } from './src/theme';
import { T } from './src/strings';
import { TutorialCtx, useTutorial } from './src/tutorial';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import Onboarding from './src/screens/Onboarding';
import DuaScreen from './src/screens/DuaScreen';
import { Soon, Account } from './src/screens/Placeholder';

const Tab = createBottomTabNavigator();
const ICON = { Home: '🏠', Map: '📍', Dua: '🤲', Offers: '🎁', Account: '👤' };

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

function TabBar({ state, navigation }) {
  const ins = useSafeAreaInsets();
  const { handsOnPending, completeHandsOn } = useTutorial();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(ins.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.map((r, i) => {
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
              {handsOnPending ? <View style={s.bubble}><Text style={s.bubbleT} numberOfLines={1}>এখানে চাপুন 👇</Text></View> : null}
              <DuaFab pending={handsOnPending} />
              <Text style={[s.lb, { color: on ? C.primary : C.muted }]}>{label}</Text>
              <View style={[s.lbBar, { backgroundColor: on ? C.primary : 'transparent' }]} />
            </Pressable>
          );
        }
        return (
          <Pressable key={r.key} {...common} style={s.tab}>
            <View style={[s.pill, on && s.pillOn]}>
              <Text style={{ fontSize: 24 }} importantForAccessibility="no">{ICON[r.name]}</Text>
            </View>
            <Text style={[s.lb, { color: on ? C.primary : C.muted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
            <View style={[s.lbBar, { backgroundColor: on ? C.primary : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const soon = (title, icon, what) => (props) => <Soon {...props} title={title} icon={icon} what={what} />;
const SoonMap = soon('ম্যাপ ও জরুরি সাহায্য', '📍', 'বিপদে এক চাপে আপনার লিডার বা হেল্পলাইনে যোগাযোগ, আর গুরুত্বপূর্ণ জায়গার ম্যাপ।');
const SoonOffers = soon('অফার ও প্যাকেজ', '🎁', 'যাচাই করা গ্রুপ লিডারদের ওমরাহ ও হজ প্যাকেজ।');

function Main() {
  return (
    <Tab.Navigator
      tabBar={(p) => <TabBar {...p} />}
      screenOptions={{ headerStyle: { backgroundColor: C.primary }, headerTintColor: C.onPrimary, headerTitleStyle: { fontSize: F.large, fontWeight: '700' } }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: T.appName }} />
      <Tab.Screen name="Map" component={SoonMap} options={{ title: T.tabs.Map }} />
      <Tab.Screen name="Dua" component={DuaScreen} options={{ title: 'দোয়া ভল্ট' }} />
      <Tab.Screen name="Offers" component={SoonOffers} options={{ title: 'অফার ও প্যাকেজ' }} />
      <Tab.Screen name="Account" component={Account} options={{ title: T.tabs.Account }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [onboarded, setOnboarded] = useState(undefined);
  const [handsOnPending, setHandsOnPending] = useState(false);

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

  let body;
  if (session === undefined || onboarded === undefined) {
    body = <View style={s.splash}><Text style={s.splashT}>🕋</Text><ActivityIndicator color={C.gold} size="large" /></View>;
  } else if (!onboarded) {
    body = <Onboarding onDone={finishOnboarding} />;
  } else if (!session) {
    body = <AuthScreen />;
  } else {
    body = <NavigationContainer><Main /></NavigationContainer>;
  }
  return (
    <SafeAreaProvider>
      <TutorialCtx.Provider value={tutorial}>
        <StatusBar style={session && onboarded ? 'light' : 'dark'} />
        {body}
      </TutorialCtx.Provider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', gap: 16 },
  splashT: { fontSize: 72 },
  bar: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderColor: C.line, paddingTop: 8, alignItems: 'flex-end' },
  tab: { flex: 1, alignItems: 'center', minHeight: 64, justifyContent: 'flex-end', paddingHorizontal: 2 },
  pill: { minWidth: TOUCH + 8, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: '#DCEFE4' },
  mid: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 64 },
  fab: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', marginTop: -34, borderWidth: 4, borderColor: C.card, elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  fabPending: { borderColor: C.primary },
  bubble: { position: 'absolute', top: -78, width: 116, alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, zIndex: 2 },
  bubbleT: { color: C.onPrimary, fontSize: F.small, fontWeight: '700' },
  lb: { fontSize: 14, marginTop: 4, fontWeight: '700', textAlign: 'center' },
  lbBar: { width: 24, height: 3, borderRadius: 2, marginTop: 2 },
});
