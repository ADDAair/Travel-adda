import React, { useCallback, useEffect, useState } from 'react';
import { Text, ScrollView, Pressable, ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, S } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import { supabase } from '../lib/supabase';
import { otp, otpText } from '../lib/otp';
import { PENDING_EMAIL, normalizeEmail, isValidEmail } from '../lib/login';
import { useMe } from '../lib/me';
import { st } from './GroupScreen';

// Verify the account with a code: by SMS to the mobile number OR by e-mail. Either one makes the account "verified".
// A verified e-mail can also be used to log in and to reset the password.
export default function VerifyPhoneScreen({ navigation, route }) {
  const { refreshMe } = useMe();
  const [me, setMe] = useState(null);
  const [state, setState] = useState('load');            // load | ok | err
  const [tab, setTab] = useState(route?.params?.channel === 'email' ? 'email' : 'phone');
  const [step, setStep] = useState('ask');               // ask | code   (for the open tab)
  const [emailOk, setEmailOk] = useState(true);          // false = database step for e-mail not run yet
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return undefined; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const load = useCallback(async () => {
    setMsg(null);
    let r = await supabase.from('profiles').select('phone,phone_verified,email,email_verified').single();
    let ok = true;
    if (r.error && (r.error.code === '42703' || /column/i.test(r.error.message || ''))) { ok = false; r = await supabase.from('profiles').select('phone,phone_verified').single(); }
    if (r.error) { setState('err'); return; }
    setEmailOk(ok); setMe(r.data); setState('ok'); setStep('ask'); setCode('');
    const pending = await AsyncStorage.getItem(PENDING_EMAIL).catch(() => null);
    setEmail((x) => x || pending || r.data.email || '');
    if (pending && ok && !(r.data.email === pending && r.data.email_verified)) setTab('email');
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  useEffect(() => { if (route?.params?.channel === 'email') setTab('email'); }, [route?.params?.channel]);
  const switchTab = (t) => { if (busy) return; setTab(t); setStep('ask'); setCode(''); setMsg(null); setWait(0); };
  const e = normalizeEmail(email);

  const send = async () => {
    if (busy || wait > 0) return;
    if (tab === 'email' && !isValidEmail(e)) { setMsg({ kind: 'bad', text: 'ইমেইল ঠিকমতো লিখুন, যেমন: name@gmail.com' }); return; }
    setBusy(true); setMsg(null);
    const r = await otp('send_verify', tab === 'email' ? { channel: 'email', email: e } : {});
    setBusy(false);
    if (tab === 'email' && r.ok && r.channel !== 'email') { setEmailOk(false); return; }     // server not updated yet
    if (r.ok && r.already) { await load(); setMsg({ kind: 'ok', text: tab === 'email' ? 'এই ইমেইল আগেই যাচাই করা।' : 'আপনার নম্বর আগেই যাচাই করা।' }); return; }
    if (r.ok) {
      setStep('code'); setWait(60);
      setMsg({ kind: 'info', text: tab === 'email'
        ? `${e} ঠিকানায় ৬ সংখ্যার কোড পাঠানো হয়েছে, ৫ মিনিট কাজ করবে। ইনবক্সে না পেলে Spam ফোল্ডার দেখুন।`
        : `${toBn(me.phone)} নম্বরে ৬ সংখ্যার কোড পাঠানো হয়েছে। কোড ৫ মিনিট কাজ করবে।` });
      return;
    }
    setMsg({ kind: r.error === 'not_ready' ? 'info' : 'bad', text: otpText(r) });
    if (r.retry_in) setWait(r.retry_in);
  };
  const check = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const r = await otp('check_verify', tab === 'email' ? { channel: 'email', email: e, code } : { code });
    setBusy(false);
    if (r.ok) {
      if (tab === 'email') await AsyncStorage.removeItem(PENDING_EMAIL).catch(() => {});
      await load(); if (refreshMe) refreshMe();
      setMsg({ kind: 'ok', text: tab === 'email' ? 'ইমেইল যাচাই হয়েছে। এখন এই ইমেইল দিয়েও লগইন করতে পারবেন।' : 'আপনার মোবাইল নম্বর যাচাই হয়েছে।' });
      return;
    }
    setMsg({ kind: 'bad', text: otpText(r) });   // the code stays in the box
  };

  const verified = me && (me.phone_verified || me.email_verified);
  const phoneDone = me && me.phone_verified;
  const where = tab === 'email' ? 'ইমেইলে' : 'এসএমএসে';
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Account')} style={st.back} accessibilityRole="button" accessibilityLabel="আমার তথ্য পাতায় ফিরে যান"><Text style={st.backT}>‹ আমার তথ্য</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">✅ অ্যাকাউন্ট যাচাই</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' ? (
        <>
          {verified ? (
            <Notice kind="ok" title="✔️ আপনার অ্যাকাউন্ট যাচাই করা"
              text={[me.phone_verified ? `মোবাইল নম্বর ${toBn(me.phone)} যাচাই করা।` : null, me.email_verified && me.email ? `ইমেইল ${me.email} যাচাই করা, এটি দিয়েও লগইন করা যায়।` : null].filter(Boolean).join('\n')} />
          ) : (
            <Text style={[st.p, { marginBottom: S.md }]}>মোবাইল নম্বর অথবা ইমেইল, যেকোনো একটি কোড দিয়ে যাচাই করলেই অ্যাকাউন্ট যাচাই হবে। এতে গ্রুপ লিডার ঠিক মানুষকে দলে আমন্ত্রণ জানাতে পারবেন, আর পাসওয়ার্ড ভুলে গেলে নতুন পাসওয়ার্ড দিতে পারবেন।</Text>
          )}
          <Segmented value={tab} onChange={switchTab} disabled={busy} options={[{ id: 'phone', label: '📱 মোবাইল নম্বর' }, { id: 'email', label: '📧 ইমেইল' }]} />
          <View style={{ height: S.md }} />
          {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}

          {tab === 'phone' && phoneDone ? <Notice kind="ok" title={`✔️ ${toBn(me.phone)} নম্বরটি যাচাই করা`} text="লিডার এই নম্বরে আমন্ত্রণ পাঠালে আপনিই পাবেন।" /> : null}
          {tab === 'phone' && !phoneDone ? (
            <>
              <Text style={st.val}>নম্বর: {toBn(me.phone)}</Text>
              <Text style={[st.small, { marginBottom: S.sm }]}>এই নম্বরে এসএমএসে ৬ সংখ্যার কোড যাবে।</Text>
              {step === 'ask' ? <Button title="এসএমএসে কোড পাঠান" icon="📩" onPress={send} loading={busy} disabled={wait > 0} /> : null}
            </>
          ) : null}

          {tab === 'email' && !emailOk ? <Notice kind="info" title="শীঘ্রই আসছে" text="ইমেইল দিয়ে যাচাই ও লগইনের সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে। এখন মোবাইল নম্বর দিয়ে যাচাই করুন।" /> : null}
          {tab === 'email' && emailOk ? (
            <>
              {me.email_verified && me.email ? <Text style={[st.small, { marginBottom: S.sm }]}>বর্তমান যাচাই করা ইমেইল: {me.email}। অন্য ইমেইল দিতে চাইলে নিচে লিখে কোড চান।</Text> : null}
              <Field label="ইমেইল" hint="যেমন: name@gmail.com" value={email} onChangeText={(v) => { setEmail(v); if (step === 'code') { setStep('ask'); setCode(''); } }}
                keyboardType="email-address" maxLength={254} autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!busy} />
              {step === 'ask' ? <Button title="ইমেইলে কোড পাঠান" icon="📧" onPress={send} loading={busy} disabled={wait > 0} /> : null}
            </>
          ) : null}

          {step === 'code' && (tab === 'phone' ? !phoneDone : emailOk) ? (
            <>
              <Field label={`${where} আসা কোড`} hint="৬ সংখ্যা" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete={tab === 'phone' ? 'sms-otp' : 'one-time-code'} textContentType="oneTimeCode" />
              <Button title="যাচাই করুন" icon="✅" onPress={check} loading={busy} />
              <Button title={wait > 0 ? `আবার কোড চান (${toBn(wait)} সেকেন্ড)` : 'আবার কোড চান'} kind="secondary" onPress={send} disabled={busy || wait > 0} style={{ marginTop: S.sm }} />
              <Text style={st.small}>কোড কাউকে বলবেন না। Travel Adda কখনো ফোন করে কোড চায় না।</Text>
            </>
          ) : null}
          {wait > 0 && step === 'ask' ? <Text style={st.small}>{toBn(wait)} সেকেন্ড পরে আবার চাইতে পারবেন।</Text> : null}
        </>
      ) : null}
    </ScrollView>
  );
}
