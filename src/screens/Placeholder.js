import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, ScrollView, StyleSheet, Image, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PhotoCapture from './PhotoCapture';
import { signedAvatarUrl } from '../lib/avatar';
import { deleteMyAccount } from '../lib/account';
import { C, F, S } from '../theme';
import { T } from '../strings';
import { Button, Card, Notice } from '../components/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export function Account({ navigation }) {
  const { replay } = useTutorial();
  const [p, setP] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [imgFail, setImgFail] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');

  const load = useCallback(async () => {
    try {
      let r = await supabase.from('profiles').select('full_name,haji_code,phone,avatar_path').single();
      if (r.error) r = await supabase.from('profiles').select('full_name,haji_code,phone').single();   // photo step not applied yet
      if (r.data) {
        setP(r.data);
        setImgFail(false);
        setPhotoUrl(await signedAvatarUrl(r.data.avatar_path));
      }
    } catch (e) { /* the card keeps showing "…" */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const hasPhoto = !!(p && p.avatar_path);
  const photoDone = async () => { setCamOpen(false); setSaved(true); await load(); };
  const logout = () => Alert.alert('লগআউট করবেন?', 'আবার ঢুকতে মোবাইল নম্বর ও পাসওয়ার্ড লাগবে।', [
    { text: 'না, থাকুক', style: 'cancel' },
    { text: 'হ্যাঁ, লগআউট', style: 'destructive', onPress: () => { AsyncStorage.removeItem('ta.profileCache.v1').catch(() => {}); supabase.auth.signOut().catch(() => {}); } },
  ]);
  const doDelete = async () => {
    if (delBusy) return;
    setDelBusy(true); setDelErr('');
    try {
      await deleteMyAccount();   // on success the app returns to the login screen by itself
    } catch (e) {
      const m = String((e && e.message) || '').toLowerCase();
      setDelErr(m.includes('network') || m.includes('fetch') ? 'ইন্টারনেট সংযোগ নেই। সংযোগ দেখে আবার চেষ্টা করুন। আপনার অ্যাকাউন্ট মুছে ফেলা হয়নি।'
        : 'এখন অ্যাকাউন্ট মুছে ফেলা যায়নি। একটু পরে আবার চেষ্টা করুন। আপনার অ্যাকাউন্ট আগের মতোই আছে।');
      setDelBusy(false);
    }
  };
  const askDelete = () => Alert.alert('অ্যাকাউন্ট চিরতরে মুছে ফেলবেন?', 'আপনার নাম, হাজী আইডি, ছবি ও সার্ভারের সব তথ্য মুছে যাবে। এটা আর ফেরানো যাবে না।', [
    { text: 'না, রাখুন', style: 'cancel' },
    { text: 'হ্যাঁ, মুছতে চাই', style: 'destructive', onPress: () => Alert.alert('শেষবার নিশ্চিত করুন', 'সত্যিই অ্যাকাউন্ট মুছে ফেলবেন?', [
      { text: 'না, রাখুন', style: 'cancel' },
      { text: 'চিরতরে মুছুন', style: 'destructive', onPress: doDelete },
    ]) },
  ]);
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {saved ? <Notice kind="ok" title={T.photo.savedOk} /> : null}
      {p && !hasPhoto ? <Notice kind="warn" title={T.photo.accountMissingTitle} text={T.photo.accountMissingText} /> : null}
      <Card style={{ marginBottom: S.lg }}>
        <View style={st.photoWrap}>
          {photoUrl && !imgFail ? (
            <Image source={{ uri: photoUrl }} style={st.photo} onError={() => setImgFail(true)} accessibilityLabel={T.photo.a11yPhoto} />
          ) : (
            <View style={[st.photo, st.photoEmpty]} accessible accessibilityLabel="ছবি নেই"><Text style={{ fontSize: 56 }} importantForAccessibility="no">👤</Text></View>
          )}
        </View>
        {p ? <Button title={hasPhoto ? T.photo.changeBtn : T.photo.addBtn} icon="📷" kind={hasPhoto ? 'secondary' : 'primary'} onPress={() => { setSaved(false); setCamOpen(true); }} style={{ marginBottom: S.md }} /> : null}
        <Text style={st.label}>নাম</Text>
        <Text style={st.val}>{p ? p.full_name : '…'}</Text>
        <Text style={st.label}>হাজী আইডি</Text>
        <Text style={st.val}>{p ? toBn(p.haji_code) : '…'}</Text>
        <Text style={st.label}>মোবাইল নম্বর</Text>
        <Text style={st.val}>{p ? toBn(p.phone) : '…'}</Text>
      </Card>
      <Button title="টিউটোরিয়াল আবার দেখুন" icon="🎓" kind="secondary" onPress={replay} a11yHint="প্রথম দিনের পরিচিতি আবার দেখাবে" style={{ marginBottom: S.md }} />
      <Button title="গোপনীয়তা নীতি" icon="🔒" kind="secondary" onPress={() => navigation.navigate('Privacy')} a11yHint="আপনার তথ্য কীভাবে রাখা হয় তা দেখাবে" style={{ marginBottom: S.md }} />
      <Button title="লগআউট" icon="🚪" kind="danger" onPress={logout} a11yHint="নিশ্চিত করতে আবার জিজ্ঞেস করবে" />
      <View style={st.delBox}>
        <Text style={st.delH}>অ্যাকাউন্ট মুছে ফেলা</Text>
        <Text style={st.delT}>অ্যাকাউন্ট ও সার্ভারের সব তথ্য চিরতরে মুছে ফেলতে চাইলে নিচের বাটন চাপুন। দুইবার নিশ্চিত করতে বলা হবে।</Text>
        {delErr ? <Notice kind="bad" title={delErr} /> : null}
        {delBusy ? (
          <View style={st.delBusy}><ActivityIndicator color={C.bad} /><Text style={st.delT}>অ্যাকাউন্ট মুছে ফেলা হচ্ছে…</Text></View>
        ) : (
          <Button title="অ্যাকাউন্ট মুছে ফেলুন" icon="🗑️" kind="danger" onPress={askDelete} a11yHint="নিশ্চিত করতে দুইবার জিজ্ঞেস করবে" />
        )}
      </View>
      <Modal visible={camOpen} animationType="slide" onRequestClose={() => setCamOpen(false)}>
        <SafeAreaProvider>
          <PhotoCapture onDone={photoDone} onCancel={() => setCamOpen(false)} />
        </SafeAreaProvider>
      </Modal>
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
  photoWrap: { alignItems: 'center', marginBottom: S.md },
  photo: { width: 140, height: 140, borderRadius: 70, backgroundColor: C.primarySoft, borderWidth: 3, borderColor: C.gold },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  delBox: { marginTop: S.xl, paddingTop: S.md, borderTopWidth: 1, borderColor: C.line },
  delH: { fontSize: F.body, fontWeight: '700', color: C.bad },
  delT: { fontSize: F.small, color: C.muted, lineHeight: 24, marginVertical: S.xs },
  delBusy: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 60 },
});
