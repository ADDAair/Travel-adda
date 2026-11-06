import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { T } from '../strings';
import { C, F, S, R } from '../theme';
import { toBn } from '../lib/phone';

// The "সহায়ক টুল" tile design, shared by Home and the guide lists: icon + Bengali label in a frame, 3 per row.
// Frame colour (owner, Nov 2026): green (the app's main colour) for main features and guide lists; gold only for সহায়ক টুল.
// The short description is not printed (keeps tiles calm) but is read aloud by the screen reader.
export type Tile = { key: string; icon: string; title: string; what?: string };

export function TileGrid<X extends Tile>({ items, onPress, numbered = false, hint, tone = 'green' }:
  { items: X[]; onPress: (x: X) => void; numbered?: boolean; hint?: string; tone?: 'green' | 'gold' }) {
  return (
    <View style={st.grid}>
      {items.map((x, i) => (
        <View key={x.key} style={st.cell}>
        <Pressable onPress={() => onPress(x)} style={({ pressed }) => [st.tile, { borderColor: tone === 'gold' ? C.gold : C.primary }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button" accessibilityLabel={T.tile.a11y(numbered ? toBn(i + 1) : '', x.title, x.what || '')} accessibilityHint={hint || T.common.opens}>
          {numbered ? <View style={st.num} importantForAccessibility="no"><Text style={st.numT}>{toBn(i + 1)}</Text></View> : null}
          <Text style={st.ic} importantForAccessibility="no">{x.icon}</Text>
          <Text style={st.t}>{x.title}</Text>
        </Pressable>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  // exact thirds: each cell is a third wide with 5 on each side (10 between tiles); the grid pulls back the outer 5
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: S.sm, marginHorizontal: -S.sm / 2 },
  cell: { width: '33.333%', padding: S.sm / 2 },
  tile: { flex: 1, minHeight: 110, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', padding: S.sm, paddingTop: S.md },
  ic: { fontSize: 30 },
  t: { fontSize: F.small, fontWeight: '700', color: C.text, textAlign: 'center', marginTop: 4, lineHeight: 22 },
  num: { position: 'absolute', top: 6, left: 6, minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 4, backgroundColor: C.goldSoft, borderWidth: 1, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  numT: { fontSize: 14, fontWeight: '700', color: C.text },
});
