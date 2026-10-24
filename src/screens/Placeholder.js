import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, ScrollView, StyleSheet, Image, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PhotoCapture from './PhotoCapture';
import { signedAvatarUrl } from '../lib/avatar';
import { deleteMyAccount } from '../lib/account';
import { clearLocalDocs } from '../lib/docs';
import { cancelDocs } from '../lib/notify';
import { resetUnread } from '../lib/notifications';
import { pushLogout } from '../lib/push';
import { useMe, isLeaderAccount, isStaff } from '../lib/me';
import { C, F, S, R, TOUCH, TEXT_SCALE, TEXT_SCALE_KEY } from '../theme';
import * as SecureStore from 'expo-secure-store';
import { reloadAppAsync } from 'expo';
import { Platform, Pressable } from 'react-native';
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
  const { me } = useMe();
  const [p, setP] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [imgFail, setImgFail] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [showDel, setShowDel] = useState(false);        // delete stays hidden so it is never pressed by mistake near "Logout"
  useEffect(() => navigation?.addListener?.('blur', () => setShowDel(false)), [navigation]);

  const load = useCallback(async () => {
    try {
      let r = await supabase.from('profiles').select('full_name,haji_code,phone,avatar_path,phone_verified,email,email_verified').single();
      if (r.error) r = await supabase.from('profiles').select('full_name,haji_code,phone,avatar_path,phone_verified').single();   // step 016 not applied yet
      if (r.error) r = await supabase.from('profiles').select('full_name,haji_code,phone,avatar_path').single();   // step 006 not applied yet
      if (r.error) r = await supabase.from('profiles').select('full_name,haji_code,phone').single();   // photo step not applied yet
      if (r.data) {
        setP(r.data);
        setImgFail(false);
        setPhotoUrl(await signedAvatarUrl(r.data.avatar_path));
      }
    } catch (e) { /* the card keeps showing "…" */ }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const hasPhoto = !!(p && p.avatar_path);
  const photoDone = async () => { setCamOpen(false); setSaved(true); await load(); };
  const logout = () => Alert.alert('লগআউট করবেন?', 'আবার ঢুকতে মোবাইল নম্বর (বা যাচাই করা ইমেইল) ও পাসওয়ার্ড লাগবে।', [
    { text: 'না, থাকুক', style: 'cancel' },
    { text: 'হ্যাঁ, লগআউট', style: 'destructive', onPress: async () => { await pushLogout(); AsyncStorage.multiRemove(['ta.profileCache.v1', 'ta.groupLeader.v1', 'ta.announce.v1', 'ta.contractLeader.v1', 'ta.trip.v1', 'ta.helpline.v1', 'ta.tripMoney.v1', 'ta.payInfo.v1', 'ta.notifs.v1', 'ta.pendingEmail.v1']).catch(() => {}); clearLocalDocs(); cancelDocs(); resetUnread(); supabase.auth.signOut().catch(() => {}); } },
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
        {p && p.email ? <><Text style={st.label}>ইমেইল</Text><Text style={st.val}>{p.email}</Text></> : null}
        {p && (p.phone_verified === true || p.email_verified === true) ? (
          <Text style={st.label}>✔️ অ্যাকাউন্ট যাচাই করা ({[p.phone_verified ? 'মোবাইল' : null, p.email_verified ? 'ইমেইল' : null].filter(Boolean).join(' ও ')})</Text>
        ) : null}
        {p && p.phone_verified === false && p.email_verified !== true ? (
          <Button title="অ্যাকাউন্ট যাচাই করুন" icon="✅" kind="secondary" onPress={() => navigation.navigate('VerifyPhone')} a11yHint="মোবাইল বা ইমেইলে আসা কোড দিয়ে যাচাই" style={{ marginTop: S.sm }} />
        ) : null}
        {p && (p.phone_verified === true || p.email_verified === true) ? (
          <Button title={p.email_verified ? 'ইমেইল বদলান' : 'ইমেইল যোগ করুন (ইমেইলেও লগইন)'} icon="📧" kind="secondary" onPress={() => navigation.navigate('VerifyPhone', { channel: 'email' })} style={{ marginTop: S.sm }} />
        ) : null}
      </Card>
      <TextSize />
      <Button title="টিউটোরিয়াল আবার দেখুন" icon="🎓" kind="secondary" onPress={replay} a11yHint="প্রথম দিনের পরিচিতি আবার দেখাবে" style={{ marginBottom: S.md }} />
      {isLeaderAccount(me) ? (
        <Button title={me.role === 'leader' ? 'লিডার প্যানেল' : 'লিডার নিবন্ধনের অবস্থা'} icon="🧭" kind="secondary" onPress={() => navigation.navigate(me.role === 'leader' ? 'Leader' : 'LeaderApply')} style={{ marginBottom: S.md }} />
      ) : (
        <Button title="লিডার ও চুক্তি" icon="🤝" kind="secondary" onPress={() => navigation.navigate('MyLeader')} a11yHint="লিডার খুঁজুন, রেফারেল কোড, চুক্তি, দলের ঘোষণা" style={{ marginBottom: S.md }} />
      )}
      {isStaff(me) ? <Button title="অ্যাডমিন প্যানেল" icon="🛡️" kind="gold" onPress={() => navigation.navigate('Admin')} style={{ marginBottom: S.md }} /> : null}
      <Button title="শর্তাবলি" icon="📜" kind="secondary" onPress={() => navigation.navigate('Terms')} style={{ marginBottom: S.md }} />
      <Button title="গোপনীয়তা নীতি" icon="🔒" kind="secondary" onPress={() => navigation.navigate('Privacy')} a11yHint="আপনার তথ্য কীভাবে রাখা হয় তা দেখাবে" style={{ marginBottom: S.md }} />
      <Button title="লগআউট" icon="🚪" kind="danger" onPress={logout} a11yHint="নিশ্চিত করতে আবার জিজ্ঞেস করবে" />
      <Pressable onPress={() => setShowDel((v) => !v)} style={st.moreBtn} accessibilityRole="button" accessibilityState={{ expanded: showDel }}
        accessibilityLabel={showDel ? 'অ্যাকাউন্ট মুছে ফেলার অপশন লুকান' : 'আরও অপশন দেখুন: অ্যাকাউন্ট মুছে ফেলা'}>
        <Text style={st.moreT}>{showDel ? '▾ আরও অপশন লুকান' : '▸ আরও অপশন'}</Text>
      </Pressable>
      {showDel ? <View style={st.delBox}>
        <Text style={st.delH}>অ্যাকাউন্ট মুছে ফেলা</Text>
        <Text style={st.delT}>অ্যাকাউন্ট ও সার্ভারের সব তথ্য চিরতরে মুছে ফেলতে চাইলে নিচের বাটন চাপুন। দুইবার নিশ্চিত করতে বলা হবে।</Text>
        {delErr ? <Notice kind="bad" title={delErr} /> : null}
        {delBusy ? (
          <View style={st.delBusy}><ActivityIndicator color={C.bad} /><Text style={st.delT}>অ্যাকাউন্ট মুছে ফেলা হচ্ছে…</Text></View>
        ) : (
          <Button title="অ্যাকাউন্ট মুছে ফেলুন" icon="🗑️" kind="danger" onPress={askDelete} a11yHint="নিশ্চিত করতে দুইবার জিজ্ঞেস করবে" />
        )}
      </View> : null}
      <Modal visible={camOpen} animationType="slide" onRequestClose={() => setCamOpen(false)}>
        <SafeAreaProvider>
          <PhotoCapture onDone={photoDone} onCancel={() => setCamOpen(false)} />
        </SafeAreaProvider>
      </Modal>
    </ScrollView>
  );
}

const SIZES = [{ k: 1, label: 'স্বাভাবিক' }, { k: 1.15, label: 'বড়' }, { k: 1.3, label: 'আরও বড়' }];
function TextSize() {
  const [msg, setMsg] = useState('');
  const choose = async (k) => {
    if (k === TEXT_SCALE) return;
    try {
      await SecureStore.setItemAsync(TEXT_SCALE_KEY, String(k));
      setMsg('নতুন আকার চালু হচ্ছে…');
      try { await reloadAppAsync(); } catch (e) { setMsg('সংরক্ষণ হয়েছে। অ্যাপ বন্ধ করে আবার খুললে নতুন আকার দেখা যাবে।'); }
    } catch (e) { setMsg(Platform.OS === 'web' ? 'এই পরীক্ষামূলক সংস্করণে লেখার আকার বদলানো যায় না।' : 'সংরক্ষণ হয়নি। আবার চেষ্টা করুন।'); }
  };
  return (
    <View style={st.sizeBox}>
      <Text style={st.sizeH}>🔠 লেখার আকার (পুরো অ্যাপে)</Text>
      <View style={st.sizeRow} accessibilityRole="radiogroup">
        {SIZES.map((s) => {
          const on = Math.abs(s.k - TEXT_SCALE) < 0.01;
          return (
            <Pressable key={s.k} onPress={() => choose(s.k)} style={[st.sizeBtn, on && st.sizeOn]} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`লেখার আকার ${s.label}`}>
              <Text style={[st.sizeT, { fontSize: Math.round(16 * s.k) }, on && { color: C.primary }]}>{on ? '✓ ' : ''}{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {msg ? <Notice kind="info" title={msg} /> : <Text style={st.label}>বদলালে অ্যাপ একবার নতুন করে চালু হবে।</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  sizeBox: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.md, marginBottom: S.md },
  sizeH: { fontSize: F.body, fontWeight: '700', color: C.text, marginBottom: S.sm },
  sizeRow: { flexDirection: 'row', gap: S.xs, flexWrap: 'wrap' },
  sizeBtn: { flexGrow: 1, minHeight: TOUCH + 4, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: S.sm },
  sizeOn: { borderColor: C.primary, backgroundColor: C.primarySoft, borderWidth: 2 },
  sizeT: { fontWeight: '700', color: C.text },
  wrap: { padding: S.lg, paddingBottom: S.xl },
  icon: { fontSize: 72, textAlign: 'center', marginTop: S.md },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, textAlign: 'center' },
  what: { fontSize: F.body, color: C.text, textAlign: 'center', marginVertical: S.md, lineHeight: 28 },
  label: { fontSize: F.small, color: C.muted, marginTop: S.sm },
  val: { fontSize: F.large, color: C.text, fontWeight: '700' },
  photoWrap: { alignItems: 'center', marginBottom: S.md },
  photo: { width: 140, height: 140, borderRadius: 70, backgroundColor: C.primarySoft, borderWidth: 3, borderColor: C.gold },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  moreBtn: { minHeight: TOUCH, justifyContent: 'center', alignSelf: 'center', paddingHorizontal: S.md, marginTop: S.xl },
  moreT: { fontSize: F.body, color: C.muted, textDecorationLine: 'underline' },
  delBox: { marginTop: S.xl, paddingTop: S.md, borderTopWidth: 1, borderColor: C.line },
  delH: { fontSize: F.body, fontWeight: '700', color: C.bad },
  delT: { fontSize: F.small, color: C.muted, lineHeight: 24, marginVertical: S.xs },
  delBusy: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 60 },
});
