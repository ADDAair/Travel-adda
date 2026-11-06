import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { C, F, S, R, TOUCH } from '../theme';
import { privacyL, PRIVACY_CONTACT } from '../content/privacy';
import { tr } from '../lib/lang';

const PV = privacyL;   // in the chosen language
import type { Nav } from './navTypes';

export default function PrivacyScreen({ navigation }: { navigation: Nav }) {
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.navigate('Account')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('আমার তথ্য পাতায় ফিরে যান', 'Back to the My info page')}>
        <Text style={st.backT}>{tr('‹ আমার তথ্য', '‹ My info')}</Text>
      </Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('🔒 গোপনীয়তা নীতি', '🔒 Privacy policy')}</Text>
      <Text style={st.date}>{tr('সর্বশেষ হালনাগাদ', 'Last updated')}: {PV().PRIVACY_UPDATED}</Text>
      {PV().PRIVACY.map((sec) => (
        <View key={sec.title} style={st.card}>
          <Text style={st.h}>{sec.title}</Text>
          {sec.text ? <Text style={st.p}>{sec.text}</Text> : null}
          {(sec.items || []).map((it) => (
            <View key={it} style={st.item}>
              <Text style={st.dot} importantForAccessibility="no">•</Text>
              <Text style={[st.p, { flex: 1 }]}>{it}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={st.card}>
        <Text style={st.h}>{tr('যোগাযোগ', 'Contact')}</Text>
        <Text style={st.p}>{PRIVACY_CONTACT ? tr(`প্রশ্ন বা অভিযোগ থাকলে লিখুন: ${PRIVACY_CONTACT}`, `For questions or complaints, write to: ${PRIVACY_CONTACT}`) : tr('যোগাযোগের ইমেইল শীঘ্রই এখানে যুক্ত হবে।', 'A contact email will be added here soon.')}</Text>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 36 },
  date: { fontSize: F.small, color: C.muted, marginBottom: S.md },
  card: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.md, marginBottom: S.sm },
  h: { fontSize: F.large, fontWeight: '700', color: C.text, marginBottom: S.xs, lineHeight: 30 },
  p: { fontSize: F.body, color: C.text, lineHeight: 28 },
  item: { flexDirection: 'row', gap: S.sm, marginTop: 4 },
  dot: { fontSize: F.body, color: C.primary, lineHeight: 28 },
});
