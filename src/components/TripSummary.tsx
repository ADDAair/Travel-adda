import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { tripSummary } from '../lib/trip';
import { useTrip } from './TripCard';
import type { Nav } from '../screens/navTypes';

// Home: the trip in one short card; the full details are on the "আমার সফর" page (owner choice, Nov 2026).
export default function TripSummary({ navigation }: { navigation: Nav }) {
  const { c, docs, left } = useTrip(navigation);
  const line = tripSummary({ hasContract: !!c, left, passport: !!docs?.hasPassport, visa: !!docs?.hasVisa, passLeft: docs?.passLeft });
  return (
    <Pressable onPress={() => navigation.navigate('Trip')} style={({ pressed }) => [t.card, pressed && { opacity: 0.85 }]}
      accessibilityRole="button" accessibilityLabel={`আমার সফর: ${line}। বিস্তারিত দেখতে খুলুন`}>
      <View style={{ flex: 1 }}>
        <Text style={t.h}>🧳 আমার সফর</Text>
        <Text style={t.line}>{line}</Text>
      </View>
      <Text style={t.open}>খুলুন ›</Text>
    </Pressable>
  );
}

const t = StyleSheet.create({
  card: { minHeight: TOUCH + 16, backgroundColor: C.card, borderRadius: R.lg, paddingVertical: S.sm, paddingHorizontal: S.md, marginBottom: S.md,
    borderWidth: 2, borderColor: C.primary, flexDirection: 'row', alignItems: 'center', gap: S.sm, ...shadow },
  h: { fontSize: F.body, fontWeight: '700', color: C.primary },
  line: { fontSize: F.body, color: C.text, lineHeight: 26 },
  open: { fontSize: F.body, fontWeight: '700', color: C.primary },
});
