import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { T } from '../strings';
import { C, F, S, R, TOUCH } from '../theme';
import { KIND_ICON, listNotifications, useUnread } from '../lib/notifications';
import type { Nav } from '../screens/navTypes';
import type { NotificationRow } from '../lib/types';

// Bar on Home with the newest unread notice (an important one from Travel Adda first). Tapping opens the box.
export default function NoticeBar({ navigation }: { navigation: Nav }) {
  const { unread, ready } = useUnread();
  const [top, setTop] = useState<NotificationRow | null>(null);
  const load = useCallback(async () => {
    try {
      const { rows } = await listNotifications();
      const fresh = rows.filter((r) => !r.is_read);
      setTop(fresh.find((r) => r.important) || fresh[0] || null);
    } catch (e) { setTop(null); }
  }, []);
  useEffect(() => { if (ready) load(); }, [ready, unread, load]);
  useEffect(() => navigation?.addListener?.('focus', () => { if (ready) load(); }), [navigation, ready, load]);
  if (!ready || !top || unread === 0) return null;
  const more = unread - 1;
  return (
    <Pressable onPress={() => navigation.navigate('Notifications')} style={({ pressed }) => [b.bar, top.important && b.imp, pressed && { opacity: 0.9 }]}
      accessibilityRole="button" accessibilityLabel={T.noticeBar.a11y(!!top.important, String(top.title), more)}>
      <View style={b.ic}><Text style={{ fontSize: 22 }} importantForAccessibility="no">{top.important ? '⚠️' : KIND_ICON[top.kind] || '🔔'}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={b.lbl}>{top.important ? T.noticeBar.urgent : T.noticeBar.fresh}{more > 0 ? T.noticeBar.more(more) : ''}</Text>
        <Text style={b.t} numberOfLines={2}>{top.title}</Text>
        {top.body ? <Text style={b.body} numberOfLines={2}>{top.body}</Text> : null}
      </View>
      <Text style={b.go}>›</Text>
    </Pressable>
  );
}

const b = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: TOUCH + 16, backgroundColor: C.goldSoft, borderRadius: R.lg, borderWidth: 2, borderColor: C.gold, padding: S.sm, paddingLeft: S.sm, marginBottom: S.md },
  imp: { backgroundColor: C.accentSoft, borderColor: C.accent },
  ic: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  lbl: { fontSize: F.small, color: C.muted, fontWeight: '700' },
  t: { fontSize: F.body, color: C.text, fontWeight: '700', lineHeight: 26 },
  body: { fontSize: F.small, color: C.text, lineHeight: 22 },
  go: { fontSize: 30, color: C.primary, fontWeight: '700', paddingHorizontal: S.xs },
});
