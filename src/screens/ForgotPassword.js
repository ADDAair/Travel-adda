import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { normalizePhone, normalizeDigits, isValidBdPhone, phoneToLoginId, toBn } from '../lib/phone';
import { passwordStrength } from '../lib/password';
import { otp, otpText } from '../lib/otp';
import { st } from './GroupScreen';

// "Forgot password": an SMS code to the account's number, then a new password. Shown from the login screen.
export default function ForgotPassword({ initialPhone = '', onClose }) {
  const ins = useSafeAreaInsets();
  const [phone, setPhone] = useState(initialPhone);
  const [step, setStep] = useState('phone');      // phone | code | done
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return undefined; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (!busy) onClose(); return true; }); return () => sub.remove(); }, [busy, onClose]);

  const p = normalizePhone(phone);
  const send = async () => {
    if (busy) return;
    if (!isValidBdPhone(p)) { setMsg({ kind: 'bad', text: 'সঠিক ১১ সংখ্যার মোবাইল নম্বর লিখুন (০১ দিয়ে শুরু)।' }); return; }
    setBusy(true); setMsg(null);
    const r = await otp('send_reset', { phone: p });
    setBusy(false);
    if (r.ok) { setStep('code'); setWait(60); setMsg({ kind: 'info', text: `এই নম্বরে Travel Adda অ্যাকাউন্ট থাকলে ${toBn(p)} নম্বরে ৬ সংখ্যার কোড পাঠানো হয়েছে, ৫ মিনিট কাজ করবে। ২ মিনিটের মধ্যে এসএমএস না এলে আবার কোড চান, অথবা হেল্পলাইনে যোগাযোগ করুন।` }); }
    else { setMsg({ kind: r.error === 'not_ready' ? 'info' : 'bad', text: otpText(r) }); if (r.retry_in) setWait(r.retry_in); }
  };
  const reset = async () => {
    if (busy) return;
    const s = passwordStrength(pw, p);
    if (normalizeDigits(code).replace(/\D/g, '').length !== 6) { setMsg({ kind: 'bad', text: 'এসএমএসে আসা ৬ সংখ্যার কোড লিখুন।' }); return; }
    if (s.level === 0) { setMsg({ kind: 'bad', text: 'নতুন পাসওয়ার্ড অন্তত ৮ অক্ষরের দিন, অক্ষর ও সংখ্যা মিশিয়ে। নিজের মোবাইল নম্বর বা 12345678 দেবেন না।' }); return; }
    setBusy(true); setMsg(null);
    const r = await otp('check_reset', { phone: p, code, password: pw });
    if (!r.ok) { setBusy(false); setMsg({ kind: 'bad', text: otpText(r) }); return; }   // what was typed stays
    setStep('done');
    // Sign in with the new password right away; if that fails the person can still log in normally.
    const li = await supabase.auth.signInWithPassword({ email: phoneToLoginId(p), password: pw }).catch(() => ({ error: true }));
    setBusy(false);
    setMsg(li.error ? { kind: 'ok', text: 'নতুন পাসওয়ার্ড সেট হয়েছে। এখন লগইন করুন।' } : { kind: 'ok', text: 'নতুন পাসওয়ার্ড সেট হয়েছে।' });
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={[st.wrap, { paddingTop: ins.top + S.md, paddingBottom: ins.bottom + S.xl }]} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => !busy && onClose()} style={st.back} accessibilityRole="button" accessibilityLabel="লগইন পাতায় ফিরে যান"><Text style={st.backT}>‹ লগইন</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">🔑 পাসওয়ার্ড ভুলে গেছেন?</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {step === 'phone' ? (
        <>
          <Text style={[st.p, { marginBottom: S.md }]}>অ্যাকাউন্টের মোবাইল নম্বর লিখুন। ওই নম্বরে এসএমএসে একটি কোড যাবে।</Text>
          <Field label="মোবাইল নম্বর" hint="যেমন: 01712345678" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={16} autoComplete="tel" />
          <Button title="কোড পাঠান" icon="📩" onPress={send} loading={busy} disabled={wait > 0} />
          {wait > 0 ? <Text style={st.small}>{toBn(wait)} সেকেন্ড পরে আবার চাইতে পারবেন।</Text> : null}
        </>
      ) : null}
      {step === 'code' ? (
        <>
          <Field label="এসএমএসে আসা কোড" hint="৬ সংখ্যা" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" textContentType="oneTimeCode" />
          <Field label="নতুন পাসওয়ার্ড" hint="কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা মিশিয়ে" value={pw} onChangeText={setPw} secureTextEntry maxLength={72} autoCapitalize="none" autoCorrect={false} />
          <Button title="নতুন পাসওয়ার্ড সেট করুন" icon="✅" onPress={reset} loading={busy} />
          <Button title={wait > 0 ? `আবার কোড চান (${toBn(wait)} সেকেন্ড)` : 'আবার কোড চান'} kind="secondary" onPress={send} disabled={busy || wait > 0} style={{ marginTop: S.sm }} />
          <Text style={st.small}>কোড কাউকে বলবেন না। Travel Adda কখনো ফোন করে কোড চায় না।</Text>
        </>
      ) : null}
      {step === 'done' ? <Button title="লগইন পাতায় যান" onPress={onClose} disabled={busy} /> : null}
      <View style={{ height: S.lg }} />
    </ScrollView>
  );
}
