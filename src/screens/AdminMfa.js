// The second lock for admin & staff (2FA). Shown before the admin menu until this session typed a valid
// 6-digit code from an authenticator app. The database refuses all admin work without it (023_admin_mfa.sql).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Linking, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { st } from './GroupScreen';
import { mfaStep, startEnroll, verifyCode, mfaErrorText, secretGroups } from '../lib/mfa';

const PLAY = 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2';

export default function AdminMfa({ onDone }) {
  const [step, setStep] = useState('load'); // load | enroll | verify | err
  const [factor, setFactor] = useState(null);
  const [setup, setSetup] = useState(null); // { factorId, secret, uri } while setting up
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [appMissing, setAppMissing] = useState(false);

  const load = useCallback(async () => {
    setStep('load'); setMsg('');
    try {
      const r = await mfaStep();
      if (r.step === 'ok') { onDone(); return; }
      setFactor(r.factorId || null); setStep(r.step);
    } catch (e) { setMsg(mfaErrorText(e)); setStep('err'); }
  }, [onDone]);
  useEffect(() => { load(); }, [load]);

  const begin = async () => {
    if (busy) return;
    setBusy(true); setMsg('');
    try { setSetup(await startEnroll()); } catch (e) { setMsg(mfaErrorText(e)); }
    setBusy(false);
  };
  const openApp = async () => {
    try { await Linking.openURL(setup.uri); setAppMissing(false); } catch { setAppMissing(true); }
  };
  const submit = async () => {
    if (busy) return;
    const id = setup ? setup.factorId : factor;
    setBusy(true); setMsg('');
    try { await verifyCode(id, code); setCode(''); onDone(); } catch (e) { setMsg(mfaErrorText(e)); }
    setBusy(false);
  };

  if (step === 'load') return <ActivityIndicator color={C.primary} accessibilityLabel="যাচাই হচ্ছে" />;
  if (step === 'err') return (
    <View>
      <Notice kind="bad" title="যাচাই করা যায়নি" text={msg} />
      <Button title="আবার চেষ্টা করুন" icon="🔄" onPress={load} />
    </View>
  );

  const codeBox = (
    <View>
      <Field label="৬ সংখ্যার কোড" hint="যেমন: ১২৩৪৫৬" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={7}
        autoComplete="one-time-code" textContentType="oneTimeCode" error={msg || undefined} />
      <Button title="কোড যাচাই করে অ্যাডমিন প্যানেল খুলুন" icon="🔓" onPress={submit} loading={busy} disabled={!code.trim()} />
    </View>
  );

  if (step === 'verify') return (
    <View>
      <Notice kind="info" title="🔐 দ্বিতীয় তালা (2FA)" text="নিরাপত্তার জন্য অথেনটিকেটর অ্যাপে (Google Authenticator) Travel Adda-র পাশে যে ৬ সংখ্যার কোড দেখাচ্ছে, সেটি লিখুন। কোড প্রতি ৩০ সেকেন্ডে বদলায়।" />
      {codeBox}
    </View>
  );

  // enroll
  if (!setup) return (
    <View>
      <Notice kind="warn" title="🔐 দ্বিতীয় তালা চালু করুন (একবারই)"
        text="অ্যাডমিন ও স্টাফের কাজ এখন শুধু পাসওয়ার্ড দিয়ে হবে না — ফোনের অথেনটিকেটর অ্যাপের কোডও লাগবে। পাসওয়ার্ড চুরি হলেও কেউ অ্যাডমিন কাজ করতে পারবে না।" />
      <Text style={st.p}>১. Play Store থেকে "Google Authenticator" অ্যাপ নামান (আগে থাকলে দরকার নেই)।</Text>
      <Button title="Google Authenticator নামান" icon="⬇️" kind="secondary" onPress={() => Linking.openURL(PLAY).catch(() => {})} style={{ marginBottom: S.md }} />
      <Text style={st.p}>২. নিচের বোতাম চাপুন — একটি গোপন চাবি তৈরি হবে।</Text>
      {msg ? <Notice kind="bad" title="কাজটি হয়নি" text={msg} /> : null}
      <Button title="গোপন চাবি তৈরি করুন" icon="🔑" onPress={begin} loading={busy} />
    </View>
  );
  return (
    <View>
      <Notice kind="info" title="অথেনটিকেটর অ্যাপে যোগ করুন" text="নিচের বোতাম চাপলে অ্যাপটি খুলে যাবে, সেখানে যোগ করুন। না খুললে অ্যাপে “Enter a setup key” বেছে নিচের চাবিটি হুবহু লিখুন।" />
      <Button title="অথেনটিকেটর অ্যাপে যোগ করুন" icon="📲" kind="secondary" onPress={openApp} style={{ marginBottom: S.md }} />
      {appMissing ? <Notice kind="warn" title="অথেনটিকেটর অ্যাপ পাওয়া যায়নি" text="আগে Google Authenticator নামান, অথবা নিচের চাবি নিজে লিখে দিন।" /> : null}
      <View style={[st.card, { alignItems: 'center' }]}>
        <Text style={st.p}>গোপন চাবি (কাউকে দেখাবেন না):</Text>
        <Text selectable style={{ fontSize: 22, fontWeight: '700', letterSpacing: 1, color: C.text, textAlign: 'center' }}
          accessibilityLabel={`গোপন চাবি: ${setup.secret.split('').join(' ')}`}>{secretGroups(setup.secret)}</Text>
      </View>
      <Notice kind="warn" title="ফোন হারালে যেন আটকে না যান" text="একই চাবি দ্বিতীয় একটি ফোনেও (বিশ্বস্ত) যোগ করে রাখুন। দুটোই হারালে Supabase ড্যাশবোর্ড থেকে 2FA মুছে আবার চালু করতে হবে।" />
      <Text style={st.p}>৩. অ্যাপে দেখানো ৬ সংখ্যার কোডটি লিখুন:</Text>
      {codeBox}
    </View>
  );
}
