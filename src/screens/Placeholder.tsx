import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, StyleSheet, Image, Modal, ActivityIndicator } from 'react-native';
import { tr, lbl } from '../lib/lang';
import ScrollView from '../components/KbScroll';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PhotoCapture from './PhotoCapture';
import { signedAvatarUrl } from '../lib/avatar';
import { LangSwitch } from '../components/LangButton';
import { deleteMyAccount, pauseMyAccount, pauseText } from '../lib/account';
import { lockWanted, setLockWanted, canLock, unlock } from '../lib/applock';
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
import { Button, Card, Notice, Field } from '../components/ui';
import { clearUserData } from '../lib/offlineStore';
import { supabase } from '../lib/supabase';
import { toBn } from '../lib/phone';
import { useTutorial } from '../tutorial';
import type { Msg, Nav, Route } from './navTypes';
import type { TableRow } from '../lib/types';
import { errInfo } from '../lib/errors';
import { notReady } from '../lib/groups';

// The account card's profile (older database steps give fewer columns, so the newer ones may be missing).
type MyProfile = Pick<TableRow<'profiles'>, 'full_name' | 'haji_code' | 'phone'> & Partial<Pick<TableRow<'profiles'>, 'avatar_path' | 'phone_verified' | 'email' | 'email_verified'>>;

// Honest placeholder for features that are not built yet.
export function Soon({ title, icon, what, route, navigation }: { title: string; icon: string; what: string; route?: Route; navigation: Nav }) {
  const justTried = !!route?.params?.tutorialDone;
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {justTried ? <Notice kind="ok" title={tr('চমৎকার! আপনি নিজেই কাজটা করেছেন।', 'Excellent! You did it yourself.')} text={tr('এভাবেই নিচের বাটনগুলো চেপে অ্যাপের যেকোনো অংশে যাবেন।', 'This is how you reach any part of the app with the buttons at the bottom.')} /> : null}
      <Text style={st.icon} importantForAccessibility="no">{icon}</Text>
      <Text style={st.title} accessibilityRole="header">{title}</Text>
      <Text style={st.what}>{what}</Text>
      <Notice kind="info" title={T.soon} text={tr('এই অংশটি এখন তৈরি হচ্ছে। তৈরি হলে অ্যাপ আপডেট করলেই চালু হয়ে যাবে।', 'This part is being built. It will start after you update the app.')} />
      <Button title={T.goHome} icon="🏠" kind="secondary" onPress={() => navigation.navigate('Home')} />
    </ScrollView>
  );
}

export function Account({ navigation }: { navigation: Nav }) {
  const { replay } = useTutorial();
  const { me, refreshMe } = useMe();
  const [p, setP] = useState<MyProfile | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [imgFail, setImgFail] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [lockOn, setLockOn] = useState(false);
  const [lockMsg, setLockMsg] = useState<Msg>(null);
  useEffect(() => { lockWanted().then(setLockOn); }, []);
  const toggleLock = async () => {
    setLockMsg(null);
    if (!lockOn && !(await canLock())) { setLockMsg({ kind: 'warn', text: tr('আপনার ফোনে স্ক্রিন লক (আঙুলের ছাপ, পিন বা প্যাটার্ন) চালু নেই। আগে ফোনের সেটিংসে স্ক্রিন লক চালু করুন।', 'Your phone has no screen lock (fingerprint, PIN or pattern). Turn on a screen lock in the phone settings first.') }); return; }
    if (!(await unlock(lockOn ? tr('তালা বন্ধ করতে আঙুলের ছাপ বা পিন দিন', 'Give your fingerprint or PIN to turn the lock off') : tr('তালা চালু করতে আঙুলের ছাপ বা পিন দিন', 'Give your fingerprint or PIN to turn the lock on')))) { setLockMsg({ kind: 'bad', text: tr('যাচাই হয়নি, কিছু বদলানো হয়নি।', 'Not confirmed; nothing was changed.') }); return; }
    try { await setLockWanted(!lockOn); setLockOn(!lockOn); setLockMsg({ kind: 'ok', text: !lockOn ? tr('চালু হয়েছে। এখন থেকে "আমার কাগজপত্র" খুলতে আঙুলের ছাপ বা পিন লাগবে।', 'Turned on. From now on, opening "My documents" needs your fingerprint or PIN.') : tr('তালা বন্ধ করা হয়েছে।', 'The lock is off.') }); }
    catch (e) { setLockMsg({ kind: 'bad', text: tr('বদলানো যায়নি। আবার চেষ্টা করুন।', 'Could not change it. Try again.') }); }
  };
  const [delErr, setDelErr] = useState('');
  const [showDel, setShowDel] = useState(false);
  const [pauseMsg, setPauseMsg] = useState<{ kind: 'ok' | 'bad' | 'warn'; text: string } | null>(null);        // delete stays hidden so it is never pressed by mistake near "Logout"
  useEffect(() => navigation?.addListener?.('blur', () => setShowDel(false)), [navigation]);

  const load = useCallback(async () => {
    try {
      let r = await supabase.from('profiles').select('full_name,haji_code,phone,avatar_path,phone_verified,email,email_verified').single();
      if (r.error) r = await supabase.from('profiles').select('full_name,haji_code,phone,avatar_path,phone_verified').single();   // step 016 not applied yet
      if (r.error) r = await supabase.from('profiles').select('full_name,haji_code,phone,avatar_path').single();   // step 006 not applied yet
      if (r.error) r = await supabase.from('profiles').select('full_name,haji_code,phone').single();   // photo step not applied yet
      if (r.data) {
        const d: MyProfile = r.data;
        setP(d);
        setImgFail(false);
        setPhotoUrl(await signedAvatarUrl(d.avatar_path));
      }
    } catch (e) { /* the card keeps showing "…" */ }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const hasPhoto = !!(p && p.avatar_path);
  const photoDone = async () => { setCamOpen(false); setSaved(true); await load(); };
  const logout = () => Alert.alert(tr('লগআউট করবেন?', 'Log out?'), tr('আবার ঢুকতে মোবাইল নম্বর (বা যাচাই করা ইমেইল) ও পাসওয়ার্ড লাগবে।', 'To come back you will need your mobile number (or verified email) and password.'), [
    { text: tr('না, থাকুক', 'No, stay'), style: 'cancel' },
    { text: tr('হ্যাঁ, লগআউট', 'Yes, log out'), style: 'destructive', onPress: async () => { await pushLogout(); await clearUserData(); clearLocalDocs(); cancelDocs(); resetUnread(); supabase.auth.signOut().catch(() => {}); } },
  ]);
  const doDelete = async () => {
    if (delBusy) return;
    setDelBusy(true); setDelErr('');
    try {
      await deleteMyAccount(delPw);   // on success the app returns to the login screen by itself
    } catch (e) {
      const { code, message } = errInfo(e); const m = message.toLowerCase();
      setDelErr(code === 'wrong-password' ? tr('পাসওয়ার্ড মেলেনি। ঠিক পাসওয়ার্ড লিখে আবার চেষ্টা করুন। আপনার অ্যাকাউন্ট মুছে ফেলা হয়নি।', 'The password did not match. Write the right password and try again. Your account was not deleted.')
        : code === 'password-needed' ? tr('আগে আপনার পাসওয়ার্ড লিখুন।', 'First write your password.')
        : m.includes('password needed') ? tr('নিরাপত্তার জন্য পাসওয়ার্ড আবার লিখে চেষ্টা করুন। আপনার অ্যাকাউন্ট মুছে ফেলা হয়নি।', 'For safety, write your password again and try. Your account was not deleted.')
        : m.includes('network') || m.includes('fetch') ? tr('ইন্টারনেট সংযোগ নেই। সংযোগ দেখে আবার চেষ্টা করুন। আপনার অ্যাকাউন্ট মুছে ফেলা হয়নি।', 'No internet. Check the connection and try again. Your account was not deleted.')
        : tr('এখন অ্যাকাউন্ট মুছে ফেলা যায়নি। একটু পরে আবার চেষ্টা করুন। আপনার অ্যাকাউন্ট আগের মতোই আছে।', 'The account could not be deleted now. Try again a little later. Your account is as before.'));
      setDelBusy(false);
    }
  };
  // 035: pause instead of delete — reversible; the app then shows the "account paused" page
  const doPause = async () => {
    if (delBusy) return;
    setDelBusy(true); setDelErr(''); setPauseMsg(null);
    try {
      const r = await pauseMyAccount(delPw);
      setPauseMsg({ kind: r === 'ok' ? 'ok' : r === 'has_contract' ? 'warn' : 'bad', text: pauseText(r) });
      if (r === 'ok') { setDelPw(''); await refreshMe(); }
    } catch (e) {
      const { code, message } = errInfo(e); const m = message.toLowerCase();
      setPauseMsg({ kind: 'bad', text: code === 'wrong-password' ? tr('পাসওয়ার্ড মেলেনি। ঠিক পাসওয়ার্ড লিখে আবার চেষ্টা করুন।', 'The password did not match. Write the right password and try again.')
        : code === 'password-needed' ? tr('আগে আপনার পাসওয়ার্ড লিখুন।', 'First write your password.')
        : m.includes('network') || m.includes('fetch') ? tr('ইন্টারনেট সংযোগ নেই। সংযোগ দেখে আবার চেষ্টা করুন।', 'No internet. Check the connection and try again.')
        : notReady(e) ? tr('অ্যাকাউন্ট বন্ধ রাখার সুবিধা শীঘ্রই চালু হবে।', 'Pausing the account will be available soon.') : tr('এখন বন্ধ করা যায়নি। একটু পরে আবার চেষ্টা করুন।', 'Could not pause now. Try again a little later.') });
    } finally { setDelBusy(false); }
  };
  const askPause = () => !delPw.trim() ? setPauseMsg({ kind: 'bad', text: tr('আগে আপনার পাসওয়ার্ড লিখুন। নিরাপত্তার জন্য এটা লাগে।', 'First write your password. It is needed for safety.') }) : Alert.alert(tr('অ্যাকাউন্ট বন্ধ রাখবেন?', 'Pause the account?'), tr('বন্ধ থাকলে আপনার নাম ও প্যাকেজ কেউ দেখবে না, নোটিফিকেশনও আসবে না। আবার লগইন করে যেকোনো সময় চালু করতে পারবেন। কোনো তথ্য মুছবে না।', 'While paused, nobody sees your name or packages and no notifications come. Log in again to turn it on any time. Nothing is deleted.'), [
    { text: tr('না, চালু থাকুক', 'No, keep it on'), style: 'cancel' },
    { text: tr('হ্যাঁ, বন্ধ রাখুন', 'Yes, pause'), onPress: doPause },
  ]);
  const askDelete = () => !delPw.trim() ? setDelErr(tr('আগে আপনার পাসওয়ার্ড লিখুন। নিরাপত্তার জন্য এটা লাগে।', 'First write your password. It is needed for safety.')) : Alert.alert(tr('অ্যাকাউন্ট মুছে ফেলবেন?', 'Delete the account?'), tr('অ্যাকাউন্ট এখনই বন্ধ হবে, আর ৩০ দিন পরে নাম, হাজী আইডি ও সার্ভারের সব তথ্য চিরতরে মুছে যাবে। ছবি ও কাগজপত্রের ছবি এখনই মুছে যাবে। ৩০ দিনের মধ্যে লগইন করলে মোছা বাতিল করতে পারবেন।', 'The account is paused now, and after 30 days your name, haji ID and all server data are deleted for ever. Your photo and document photos are deleted now. Log in within 30 days to cancel the deletion.'), [
    { text: tr('না, রাখুন', 'No, keep it'), style: 'cancel' },
    { text: tr('হ্যাঁ, মুছতে চাই', 'Yes, I want to delete'), style: 'destructive', onPress: () => Alert.alert(tr('শেষবার নিশ্চিত করুন', 'Confirm one last time'), tr('সত্যিই অ্যাকাউন্ট মুছে ফেলবেন? শুধু বিরতি চাইলে "অ্যাকাউন্ট বন্ধ রাখুন" বেছে নিন।', 'Really delete the account? If you only want a break, choose "Pause the account".'), [
      { text: tr('না, রাখুন', 'No, keep it'), style: 'cancel' },
      { text: tr('হ্যাঁ, মুছে ফেলুন', 'Yes, delete'), style: 'destructive', onPress: doDelete },
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
            <View style={[st.photo, st.photoEmpty]} accessible accessibilityLabel={tr('ছবি নেই', 'No photo')}><Text style={{ fontSize: 56 }} importantForAccessibility="no">👤</Text></View>
          )}
        </View>
        {p ? <Button title={hasPhoto ? T.photo.changeBtn : T.photo.addBtn} icon="📷" kind={hasPhoto ? 'secondary' : 'primary'} onPress={() => { setSaved(false); setCamOpen(true); }} style={{ marginBottom: S.md }} /> : null}
        <Text style={st.label}>{tr('নাম', 'Name')}</Text>
        <Text style={st.val}>{p ? p.full_name : '…'}</Text>
        <Text style={st.label}>{tr('হাজী আইডি', 'Haji ID')}</Text>
        <Text style={st.val}>{p ? toBn(p.haji_code) : '…'}</Text>
        <Text style={st.label}>{tr('মোবাইল নম্বর', 'Mobile number')}</Text>
        <Text style={st.val}>{p ? toBn(p.phone) : '…'}</Text>
        {p && p.email ? <><Text style={st.label}>{tr('ইমেইল', 'Email')}</Text><Text style={st.val}>{p.email}</Text></> : null}
        {p && (p.phone_verified === true || p.email_verified === true) ? (
          <Text style={st.label}>✔️ {tr('অ্যাকাউন্ট যাচাই করা', 'Account verified')} ({[p.phone_verified ? tr('মোবাইল', 'mobile') : null, p.email_verified ? tr('ইমেইল', 'email') : null].filter(Boolean).join(tr(' ও ', ' and '))})</Text>
        ) : null}
        {p && p.phone_verified === false && p.email_verified !== true ? (
          <Button title={tr('অ্যাকাউন্ট যাচাই করুন', 'Verify the account')} icon="✅" kind="secondary" onPress={() => navigation.navigate('VerifyPhone')} a11yHint={tr('মোবাইল বা ইমেইলে আসা কোড দিয়ে যাচাই', 'Verify with a code sent to the mobile or email')} style={{ marginTop: S.sm }} />
        ) : null}
        {p && (p.phone_verified === true || p.email_verified === true) ? (
          <Button title={p.email_verified ? tr('ইমেইল বদলান', 'Change email') : tr('ইমেইল যোগ করুন (ইমেইলেও লগইন)', 'Add email (log in with email too)')} icon="📧" kind="secondary" onPress={() => navigation.navigate('VerifyPhone', { channel: 'email' })} style={{ marginTop: S.sm }} />
        ) : null}
      </Card>
      <View style={{ marginBottom: S.lg }}>
        <Text style={st.sizeH}>{T.langSetting.title}</Text>
        <LangSwitch />
      </View>
      <TextSize />
      <Button title={tr('টিউটোরিয়াল আবার দেখুন', 'See the tutorial again')} icon="🎓" kind="secondary" onPress={replay} a11yHint={tr('প্রথম দিনের পরিচিতি আবার দেখাবে', 'Shows the first-day introduction again')} style={{ marginBottom: S.md }} />
      {isLeaderAccount(me) ? (
        <Button title={me?.role === 'leader' ? tr('লিডার প্যানেল', 'Leader panel') : tr('লিডার নিবন্ধনের অবস্থা', 'Leader registration status')} icon="🧭" kind="secondary" onPress={() => navigation.navigate(me?.role === 'leader' ? 'Leader' : 'LeaderApply')} style={{ marginBottom: S.md }} />
      ) : (
        <Button title={tr('লিডার ও চুক্তি', 'Leader and contract')} icon="🤝" kind="secondary" onPress={() => navigation.navigate('MyLeader')} a11yHint={tr('লিডার খুঁজুন, রেফারেল কোড, চুক্তি, দলের ঘোষণা', 'Find leaders, referral code, contract, group announcements')} style={{ marginBottom: S.md }} />
      )}
      {isStaff(me) ? <Button title={tr('অ্যাডমিন প্যানেল', 'Admin panel')} icon="🛡️" kind="gold" onPress={() => navigation.navigate('Admin')} style={{ marginBottom: S.md }} /> : null}
      <Button title={lockOn ? tr('কাগজপত্রে তালা: চালু আছে (বন্ধ করুন)', 'Documents lock: on (turn off)') : tr('কাগজপত্রে তালা দিন (আঙুলের ছাপ/পিন)', 'Lock the documents (fingerprint/PIN)')} icon={lockOn ? '🔒' : '🔓'} kind="secondary" onPress={toggleLock} a11yHint={tr('আমার কাগজপত্র পাতা খুলতে ফোনের আঙুলের ছাপ বা পিন লাগবে', 'Opening My documents will need the phone\'s fingerprint or PIN')} style={{ marginBottom: S.md }} />
      {lockMsg ? <Notice kind={lockMsg.kind} title={lockMsg.text} /> : null}
      <Button title={tr('শর্তাবলি', 'Terms and conditions')} icon="📜" kind="secondary" onPress={() => navigation.navigate('Terms')} style={{ marginBottom: S.md }} />
      <Button title={tr('গোপনীয়তা নীতি', 'Privacy policy')} icon="🔒" kind="secondary" onPress={() => navigation.navigate('Privacy')} a11yHint={tr('আপনার তথ্য কীভাবে রাখা হয় তা দেখাবে', 'Shows how your data is kept')} style={{ marginBottom: S.md }} />
      <Button title={tr('লগআউট', 'Log out')} icon="🚪" kind="danger" onPress={logout} a11yHint={tr('নিশ্চিত করতে আবার জিজ্ঞেস করবে', 'Will ask again to confirm')} />
      <Pressable onPress={() => setShowDel((v) => !v)} style={st.moreBtn} accessibilityRole="button" accessibilityState={{ expanded: showDel }}
        accessibilityLabel={showDel ? tr('আরও অপশন লুকান', 'Hide more options') : tr('আরও অপশন দেখুন: অ্যাকাউন্ট বন্ধ রাখা বা মুছে ফেলা', 'See more options: pause or delete the account')}>
        <Text style={st.moreT}>{showDel ? tr('▾ আরও অপশন লুকান', '▾ Hide more options') : tr('▸ আরও অপশন', '▸ More options')}</Text>
      </Pressable>
      {showDel ? <View style={st.delBox}>
        {delBusy ? (
          <View style={st.delBusy}><ActivityIndicator color={C.primary} /><Text style={st.delT}>{tr('একটু অপেক্ষা করুন…', 'Please wait…')}</Text></View>
        ) : (
          <>
            <Field label={tr('আপনার পাসওয়ার্ড', 'Your password')} hint={tr('নিচের দুই কাজের জন্যই পাসওয়ার্ড লাগবে', 'Both actions below need the password')} value={delPw} onChangeText={(v) => { setDelPw(v); setDelErr(''); setPauseMsg(null); }} secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <Text style={[st.delH, { color: C.text }]}>{tr('⏸️ অ্যাকাউন্ট বন্ধ রাখুন', '⏸️ Pause the account')}</Text>
            <Text style={st.delT}>{tr('কিছুদিন অ্যাপ ব্যবহার না করলে বন্ধ রাখুন। কোনো তথ্য মুছবে না। আবার লগইন করে যেকোনো সময় চালু করতে পারবেন।', 'If you will not use the app for a while, pause it. Nothing is deleted. Log in again to turn it on any time.')}</Text>
            {pauseMsg ? <Notice kind={pauseMsg.kind} title={pauseMsg.text} /> : null}
            <Button title={tr('অ্যাকাউন্ট বন্ধ রাখুন', 'Pause the account')} icon="⏸️" kind="secondary" onPress={askPause} a11yHint={tr('পাসওয়ার্ড মিলিয়ে একবার নিশ্চিত করতে বলবে', 'Checks the password and asks once to confirm')} style={{ marginBottom: S.lg }} />
            <Text style={st.delH}>{tr('🗑️ অ্যাকাউন্ট মুছে ফেলা', '🗑️ Delete the account')}</Text>
            <Text style={st.delT}>{tr('অনুরোধ করলে অ্যাকাউন্ট সাথে সাথে বন্ধ হবে এবং ৩০ দিন পরে চিরতরে মুছে যাবে। ছবি ও কাগজপত্রের ছবি সাথে সাথেই মুছে যাবে। ৩০ দিনের মধ্যে লগইন করলে মোছা বাতিল করতে পারবেন। চুক্তি ও টাকা জমার রেকর্ড হিসাবের জন্য থেকে যায় (গোপনীয়তা নীতি দেখুন)।', 'When you ask, the account is paused at once and deleted for ever after 30 days. Your photo and document photos are deleted at once. Log in within 30 days to cancel the deletion. Contract and payment records are kept for the accounts (see the privacy policy).')}</Text>
            {delErr ? <Notice kind="bad" title={delErr} /> : null}
            <Button title={tr('অ্যাকাউন্ট মুছে ফেলুন', 'Delete the account')} icon="🗑️" kind="danger" onPress={askDelete} a11yHint={tr('পাসওয়ার্ড মিলিয়ে নিশ্চিত করতে দুইবার জিজ্ঞেস করবে', 'Checks the password and asks twice to confirm')} />
          </>
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

const SIZES = [{ k: 1, label: 'স্বাভাবিক', en: 'Normal' }, { k: 1.15, label: 'বড়', en: 'Large' }, { k: 1.3, label: 'আরও বড়', en: 'Larger' }];
function TextSize() {
  const [msg, setMsg] = useState('');
  const choose = async (k: number) => {
    if (k === TEXT_SCALE) return;
    try {
      await SecureStore.setItemAsync(TEXT_SCALE_KEY, String(k));
      setMsg(tr('নতুন আকার চালু হচ্ছে…', 'Starting the new size…'));
      try { await reloadAppAsync(); } catch (e) { setMsg(tr('সংরক্ষণ হয়েছে। অ্যাপ বন্ধ করে আবার খুললে নতুন আকার দেখা যাবে।', 'Saved. Close and open the app again to see the new size.')); }
    } catch (e) { setMsg(Platform.OS === 'web' ? tr('এই পরীক্ষামূলক সংস্করণে লেখার আকার বদলানো যায় না।', 'Text size cannot be changed in this test version.') : tr('সংরক্ষণ হয়নি। আবার চেষ্টা করুন।', 'Not saved. Try again.')); }
  };
  return (
    <View style={st.sizeBox}>
      <Text style={st.sizeH}>{tr('🔠 লেখার আকার (পুরো অ্যাপে)', '🔠 Text size (whole app)')}</Text>
      <View style={st.sizeRow} accessibilityRole="radiogroup">
        {SIZES.map((s) => {
          const on = Math.abs(s.k - TEXT_SCALE) < 0.01;
          return (
            <Pressable key={s.k} onPress={() => choose(s.k)} style={[st.sizeBtn, on && st.sizeOn]} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={tr(`লেখার আকার ${lbl(s)}`, `Text size ${lbl(s)}`)}>
              <Text style={[st.sizeT, { fontSize: Math.round(16 * s.k) }, on && { color: C.primary }]}>{on ? '✓ ' : ''}{lbl(s)}</Text>
            </Pressable>
          );
        })}
      </View>
      {msg ? <Notice kind="info" title={msg} /> : <Text style={st.label}>{tr('বদলালে অ্যাপ একবার নতুন করে চালু হবে।', 'After a change the app restarts once.')}</Text>}
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
