import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';
import { C } from './src/theme';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import { Soon, Account } from './src/screens/Placeholder';

const Tab = createBottomTabNavigator();
const TABS = [
  { name: 'Home', label: 'হোম', icon: '🏠' },
  { name: 'Map', label: 'ম্যাপ ও SOS', icon: '📍' },
  { name: 'Dua', label: 'দোয়া', icon: '🤲' },
  { name: 'Offers', label: 'অফার', icon: '🎁' },
  { name: 'Account', label: 'অ্যাকাউন্ট', icon: '👤' },
];

function TabBar({ state, navigation }) {
  const ins = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(ins.bottom, 6) }]}>
      {state.routes.map((r, i) => {
        const t = TABS.find((x) => x.name === r.name);
        const on = state.index === i;
        const go = () => { const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true }); if (!on && !e.defaultPrevented) navigation.navigate(r.name); };
        if (r.name === 'Dua') {
          return (
            <TouchableOpacity key={r.key} onPress={go} style={s.mid} accessibilityRole="button" accessibilityLabel="দোয়া">
              <View style={s.fab}><Text style={{ fontSize: 28 }}>{t.icon}</Text></View>
              <Text style={[s.lb, { color: on ? C.primary : C.muted }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity key={r.key} onPress={go} style={s.tab} accessibilityRole="button" accessibilityLabel={t.label}>
            <Text style={{ fontSize: 22, opacity: on ? 1 : 0.55 }}>{t.icon}</Text>
            <Text style={[s.lb, { color: on ? C.primary : C.muted, fontWeight: on ? '700' : '400' }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Main() {
  return (
    <Tab.Navigator tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerStyle: { backgroundColor: C.primary }, headerTintColor: '#fff' }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Travel Adda' }} />
      <Tab.Screen name="Map" options={{ title: 'ম্যাপ ও SOS' }}>{() => <Soon title="ম্যাপ ও SOS" />}</Tab.Screen>
      <Tab.Screen name="Dua" options={{ title: 'দোয়া ভল্ট' }}>{() => <Soon title="দোয়া ভল্ট" />}</Tab.Screen>
      <Tab.Screen name="Offers" options={{ title: 'অফার ও প্যাকেজ' }}>{() => <Soon title="অফার ও প্যাকেজ" />}</Tab.Screen>
      <Tab.Screen name="Account" component={Account} options={{ title: 'অ্যাকাউন্ট' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setSession(data.session || null); }).catch(() => { if (alive) setSession(null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess || null));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  if (session === undefined) return <View style={s.splash}><ActivityIndicator color={C.gold} size="large" /></View>;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {session ? <NavigationContainer><Main /></NavigationContainer> : <AuthScreen />}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: C.line, paddingTop: 6, alignItems: 'flex-end' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  mid: { flex: 1, alignItems: 'center' },
  fab: { width: 62, height: 62, borderRadius: 31, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', marginTop: -30, borderWidth: 4, borderColor: '#fff', elevation: 6 },
  lb: { fontSize: 11, marginTop: 2 },
});
