import React, { useEffect, useState } from 'react';
import { View, Text, Alert, ScrollView, StyleSheet } from 'react-native';
import { C, F, S } from '../theme';
import { T } from '../strings';
import { Button, Card, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { toBn } from '../lib/phone';
import { useTutorial } from '../tutorial';

// Honest placeholder for features that are not built yet.
export function Soon({ title, icon, what, route, navigation }) {
  const justTried = !!route?.params?.tutorialDone;
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {justTried ? <Notice kind="ok" title="চমৎকার! আপনি নিজেই কাজটা করেছেন।" text="এভাবেই নিচের বাটনগুলো চেপে অ্যাপের যেকোনো অংশে যাবেন।" /> : null}
      <Text style={st.icon} importantForAccessibility="no">{icon}</Text>
      <Text style={st.title} accessibilityRole="header">{title}</Text>
      <Text style={st.what}>{what}</Text>
      <Notice kind="info" title={T.soon} text="এই অংশটি এখন তৈরি হচ্ছে। তৈরি হলে অ্যাপ আপডেট করলেই চালু হয়ে যাবে।" />
      <Button title={T.goHome} icon="🏠" kind="secondary" onPress={() => navigation.navigate('Home')} />
    </ScrollView>
  );
}

export function Account() {
  const { replay } = useTutorial();
  const [p, setP] = useState(null);
  useEffect(() => {
    let alive = true;
    supabase.from('profiles').select('full_name,haji_code,phone').single()
      .then(({ data }) => { if (alive && data) setP(data); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const logout = () => Alert.alert('লগআউট করবেন?', 'আবার ঢুকতে মোবাইল নম্বর ও পাসওয়ার্ড লাগবে।', [
    { text: 'না, থাকুক', style: 'cancel' },
    { text: 'হ্যাঁ, লগআউট', style: 'destructive', onPress: () => { supabase.auth.signOut().catch(() => {}); } },
  ]);
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Card style={{ marginBottom: S.lg }}>
        <Text style={st.label}>নাম</Text>
        <Text style={st.val}>{p ? p.full_name : '…'}</Text>
        <Text style={st.label}>হাজী আইডি</Text>
        <Text style={st.val}>{p ? toBn(p.haji_code) : '…'}</Text>
        <Text style={st.label}>মোবাইল নম্বর</Text>
        <Text style={st.val}>{p ? toBn(p.phone) : '…'}</Text>
      </Card>
      <Button title="টিউটোরিয়াল আবার দেখুন" icon="🎓" kind="secondary" onPress={replay} a11yHint="প্রথম দিনের পরিচিতি আবার দেখাবে" style={{ marginBottom: S.md }} />
      <Button title="লগআউট" icon="🚪" kind="danger" onPress={logout} a11yHint="নিশ্চিত করতে আবার জিজ্ঞেস করবে" />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.lg, paddingBottom: S.xl },
  icon: { fontSize: 72, textAlign: 'center', marginTop: S.md },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, textAlign: 'center' },
  what: { fontSize: F.body, color: C.text, textAlign: 'center', marginVertical: S.md, lineHeight: 28 },
  label: { fontSize: F.small, color: C.muted, marginTop: S.sm },
  val: { fontSize: F.large, color: C.text, fontWeight: '700' },
});
