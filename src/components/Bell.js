import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { C } from '../theme';
import { toBn } from '../lib/phone';
import { useUnread } from '../lib/notifications';

// Bell in the top bar of every page, with the number of unread notices (a number AND a word for screen readers).
export default function Bell({ onPress }) {
  const { unread, ready } = useUnread();
  if (!ready) return null;          // database step not run yet: no bell rather than a bell that does nothing
  const label = unread > 0 ? `নোটিফিকেশন, ${toBn(unread)}টি নতুন` : 'নোটিফিকেশন, নতুন কিছু নেই';
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ minWidth: 52, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginRight: 6, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ fontSize: 26 }} importantForAccessibility="no">🔔</Text>
      {unread > 0 ? (
        <View style={{ position: 'absolute', top: 2, right: 2, minWidth: 24, height: 24, borderRadius: 12, backgroundColor: C.accent, borderWidth: 2, borderColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }} importantForAccessibility="no">{unread > 99 ? '৯৯+' : toBn(unread)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
