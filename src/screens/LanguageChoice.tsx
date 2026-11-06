import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R } from '../theme';
import Logo from '../components/Logo';
import { LANG_NAMES, CHOOSE_TITLE, CHOOSE_NOTE, deviceLang, type Lang } from '../lib/lang';

// First start, before anything else: two big buttons, Bengali and English (both written in their own language).
// The phone's language is suggested (shown first and marked), but nothing is chosen until the person taps.
export default function LanguageChoice({ onPick }: { onPick: (l: Lang) => void }) {
  const ins = useSafeAreaInsets();
  const sug = deviceLang();
  const order: Lang[] = sug === 'en' ? ['en', 'bn'] : ['bn', 'en'];
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: S.lg, paddingTop: ins.top + S.xl, paddingBottom: ins.bottom + S.xl }}>
      <View style={{ alignItems: 'center', marginBottom: S.lg }}><Logo size={84} /></View>
      <Text style={{ fontSize: F.title, fontWeight: '700', color: C.primary, textAlign: 'center', lineHeight: 36, marginBottom: S.lg }} accessibilityRole="header">{CHOOSE_TITLE}</Text>
      {order.map((l) => (
        <Pressable key={l} onPress={() => onPick(l)} accessibilityRole="button" accessibilityLabel={LANG_NAMES[l].name}
          style={({ pressed }) => ({ minHeight: 72, borderRadius: R.lg, borderWidth: 2, borderColor: C.primary, backgroundColor: l === sug ? C.primary : C.card,
            alignItems: 'center', justifyContent: 'center', marginBottom: S.md, opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ fontSize: F.hero, fontWeight: '700', color: l === sug ? C.onPrimary : C.primary }}>{LANG_NAMES[l].name}</Text>
        </Pressable>
      ))}
      <Text style={{ fontSize: F.small, color: C.muted, textAlign: 'center', lineHeight: 24, marginTop: S.sm }}>{CHOOSE_NOTE}</Text>
    </ScrollView>
  );
}
