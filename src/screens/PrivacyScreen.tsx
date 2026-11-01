import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { C, F, S, R, TOUCH } from '../theme';
import { PRIVACY, PRIVACY_UPDATED, PRIVACY_CONTACT } from '../content/privacy';

export default function PrivacyScreen({ navigation }) {
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.navigate('Account')} style={st.back} accessibilityRole="button" accessibilityLabel="আমার তথ্য পাতায় ফিরে যান">
        <Text style={st.backT}>‹ আমার তথ্য</Text>
      </Pressable>
      <Text style={st.title} accessibilityRole="header">🔒 গোপনীয়তা নীতি</Text>
      <Text style={st.date}>সর্বশেষ হালনাগাদ: {PRIVACY_UPDATED}</Text>
      {PRIVACY.map((sec) => (
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
        <Text style={st.h}>যোগাযোগ</Text>
        <Text style={st.p}>{PRIVACY_CONTACT ? `প্রশ্ন বা অভিযোগ থাকলে লিখুন: ${PRIVACY_CONTACT}` : 'যোগাযোগের ইমেইল শীঘ্রই এখানে যুক্ত হবে।'}</Text>
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
