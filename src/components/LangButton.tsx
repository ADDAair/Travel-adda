import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { C, F, S, R, TOUCH } from '../theme';
import { getLang, setLang, LANG_NAMES, LANGS, type Lang } from '../lib/lang';

// The language switch in the green bar, next to the bell: shows the OTHER language ("EN" or "বাং"); one tap changes.
export function LangButton() {
  const other: Lang = getLang() === 'en' ? 'bn' : 'en';
  return (
    <Pressable onPress={() => { setLang(other); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={LANG_NAMES[other].a11y}
      style={({ pressed }) => ({ minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: 2, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ borderWidth: 1.5, borderColor: C.onPrimary, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
        <Text style={{ color: C.onPrimary, fontSize: F.small, fontWeight: '800' }}>{LANG_NAMES[other].short}</Text>
      </View>
    </Pressable>
  );
}

// On the account page: both languages as two big buttons, the chosen one ticked.
export function LangSwitch() {
  const cur = getLang();
  return (
    <View style={{ flexDirection: 'row', gap: S.sm }}>
      {LANGS.map((l) => {
        const on = l === cur;
        return (
          <Pressable key={l} onPress={() => { if (!on) setLang(l); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={LANG_NAMES[l].a11y}
            style={{ flex: 1, minHeight: TOUCH + 8, alignItems: 'center', justifyContent: 'center', borderRadius: R.md, borderWidth: 2, borderColor: C.primary, backgroundColor: on ? C.primary : C.card }}>
            <Text style={{ fontSize: F.body, fontWeight: '700', color: on ? C.onPrimary : C.primary }}>{on ? '✓ ' : ''}{LANG_NAMES[l].name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
