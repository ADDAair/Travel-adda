import React, { useEffect, useState } from 'react';
import { Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { C } from '../theme';
import { Notice } from '../components/ui';
import { getTerms } from '../lib/market';
import { st, fmtDay } from './GroupScreen';

// Terms & conditions written by the admin (can change any time without a new app version).
export default function TermsScreen({ navigation }) {
  const [t, setT] = useState(undefined);
  useEffect(() => { getTerms().then(setT).catch(() => setT(null)); }, []);
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.navigate('Account')} style={st.back} accessibilityRole="button" accessibilityLabel="আমার তথ্য পাতায় ফিরে যান"><Text style={st.backT}>‹ আমার তথ্য</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">📜 শর্তাবলি</Text>
      {t === undefined ? <ActivityIndicator color={C.primary} /> : null}
      {t === null ? <Notice kind="info" title="শর্তাবলি শীঘ্রই যুক্ত হবে" /> : null}
      {t ? <><Text style={st.small}>সর্বশেষ হালনাগাদ: {fmtDay(t.updated_at)}</Text><Text style={[st.p, { marginTop: 8 }]} selectable>{t.body}</Text></> : null}
    </ScrollView>
  );
}
