import React, { useCallback, useEffect, useState } from 'react';
import { Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { toBn } from '../lib/phone';
import { supabase } from '../lib/supabase';
import { otp, otpText } from '../lib/otp';
import { st } from './GroupScreen';

// Prove the account's number is really yours with an SMS code. Then leaders can safely invite you by number.
export default function VerifyPhoneScreen({ navigation }) {
  const [me, setMe] = useState(null);
  const [state, setState] = useState('load');   // load | todo | code | done | soon | err
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return undefined; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const load = useCallback(async () => {
    setMsg(null);
    const r = await supabase.from('profiles').select('phone,phone_verified').single();
    if (r.error) { setState(r.error.code === '42703' ? 'soon' : 'err'); return; }
    setMe(r.data); setState(r.data.phone_verified ? 'done' : 'todo'); setCode('');
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const send = async () => {
    if (busy || wait > 0) return;
    setBusy(true); setMsg(null);
    const r = await otp('send_verify');
    setBusy(false);
    if (r.ok && r.already) { setState('done'); return; }
    if (r.ok) { setState('code'); setWait(60); setMsg({ kind: 'info', text: `${toBn(me.phone)} নম্বরে ৬ সংখ্যার কোড পাঠানো হয়েছে। কোড ৫ মিনিট কাজ করবে।` }); return; }
    if (r.error === 'not_ready') setState('soon');
    setMsg({ kind: r.error === 'not_ready' ? 'info' : 'bad', text: otpText(r) });
    if (r.retry_in) setWait(r.retry_in);
  };
  const check = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const r = await otp('check_verify', { code });
    setBusy(false);
    if (r.ok) { setState('done'); setMsg({ kind: 'ok', text: 'আপনার মোবাইল নম্বর যাচাই হয়েছে।' }); return; }
    setMsg({ kind: 'bad', text: otpText(r) });   // the code stays in the box
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Account')} style={st.back} accessibilityRole="button" accessibilityLabel="আমার তথ্য পাতায় ফিরে যান"><Text style={st.backT}>‹ আমার তথ্য</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">📱 মোবাইল নম্বর যাচাই</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'soon' && !msg ? <Notice kind="info" title="শীঘ্রই আসছে" text="এসএমএস কোড দিয়ে নম্বর যাচাইয়ের সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে।" /> : null}
      {state === 'done' ? <Notice kind="ok" title={`✔️ ${me ? toBn(me.phone) : ''} নম্বরটি যাচাই করা`} text="লিডার এই নম্বরে আমন্ত্রণ পাঠালে আপনিই পাবেন।" /> : null}
      {state === 'todo' || state === 'code' ? (
        <>
          <Text style={[st.p, { marginBottom: S.sm }]}>আপনার নম্বরে এসএমএসে ৬ সংখ্যার একটি কোড যাবে। কোডটি লিখলে নিশ্চিত হবে নম্বরটি আপনার। এতে গ্রুপ লিডার ঠিক মানুষকে দলে আমন্ত্রণ জানাতে পারবেন, আর পাসওয়ার্ড ভুলে গেলে এই নম্বর দিয়েই নতুন পাসওয়ার্ড দিতে পারবেন।</Text>
          <Text style={st.val}>নম্বর: {me ? toBn(me.phone) : ''}</Text>
        </>
      ) : null}
      {state === 'todo' ? <Button title="কোড পাঠান" icon="📩" onPress={send} loading={busy} disabled={wait > 0} style={{ marginTop: S.md }} /> : null}
      {state === 'code' ? (
        <>
          <Field label="এসএমএসে আসা কোড" hint="৬ সংখ্যা" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" textContentType="oneTimeCode" />
          <Button title="যাচাই করুন" icon="✅" onPress={check} loading={busy} />
          <Button title={wait > 0 ? `আবার কোড চান (${toBn(wait)} সেকেন্ড)` : 'আবার কোড চান'} kind="secondary" onPress={send} disabled={busy || wait > 0} style={{ marginTop: S.sm }} />
          <Text style={st.small}>কোড কাউকে বলবেন না। Travel Adda কখনো ফোন করে কোড চায় না।</Text>
        </>
      ) : null}
    </ScrollView>
  );
}
