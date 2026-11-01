import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '../theme';
// Temporary brand mark (navy tile, gold band, "T" with plane) until the official Travel Adda logo file is added.
export default function Logo({ size = 72 }) {
  const r = size * 0.22;
  return (
    <View style={[st.tile, { width: size, height: size, borderRadius: r }]} accessible accessibilityLabel="Travel Adda লোগো">
      <Text style={[st.t, { fontSize: size * 0.56, lineHeight: size * 0.7 }]}>T</Text>
      <Text style={[st.plane, { fontSize: size * 0.26, top: size * 0.1, right: size * 0.1 }]} importantForAccessibility="no">✈</Text>
      <View style={[st.band, { height: size * 0.16, borderBottomLeftRadius: r, borderBottomRightRadius: r }]} />
    </View>
  );
}
const st = StyleSheet.create({
  tile: { backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: C.gold },
  t: { color: '#FFFFFF', fontWeight: '800', marginTop: -6 },
  plane: { position: 'absolute', color: C.accent },
  band: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.gold },
});
