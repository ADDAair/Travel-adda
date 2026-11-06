import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { tr } from '../lib/lang';
import ScrollView from '../components/KbScroll';
import TripCard from '../components/TripCard';
import { C, F, S, TOUCH } from '../theme';
import type { Nav } from './navTypes';

// "আমার সফর": the full trip card (days left, contract, money, papers, own travel date), opened from the Home summary.
export default function TripScreen({ navigation }: { navigation: Nav }) {
  return (
    <ScrollView style={st.wrap} contentContainerStyle={st.in} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}>
        <Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text>
      </Pressable>
      <TripCard navigation={navigation} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  in: { padding: S.md, paddingBottom: 120 },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
});
