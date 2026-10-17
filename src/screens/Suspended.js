import React, { useEffect, useState } from 'react';
import { Text, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S } from '../theme';
import { Button, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { getHelpline } from '../lib/offers';
import { st } from './GroupScreen';

// Shown instead of the app when the admin has suspended this account.
export default function Suspended() {
  const ins = useSafeAreaInsets();
  const [help, setHelp] = useState(null);
  useEffect(() => { getHelpline().then(setHelp).catch(() => {}); }, []);
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={[st.wrap, { paddingTop: ins.top + S.xl }]}>
      <Text style={st.title} accessibilityRole="header">⛔ অ্যাকাউন্ট বন্ধ আছে</Text>
      <Notice kind="warn" title="Travel Adda অ্যাডমিন আপনার অ্যাকাউন্টটি বন্ধ রেখেছেন" text="কারণ জানতে বা আবার চালু করতে হেল্পলাইনে যোগাযোগ করুন। আপনার তথ্য মুছে ফেলা হয়নি।" />
      {help && help.phone ? <Button title="হেল্পলাইনে ফোন করুন" icon="📞" onPress={() => Linking.openURL(`tel:${help.phone}`).catch(() => {})} style={{ marginBottom: S.md }} /> : null}
      <Button title="লগআউট" icon="🚪" kind="danger" onPress={() => supabase.auth.signOut().catch(() => {})} />
    </ScrollView>
  );
}
