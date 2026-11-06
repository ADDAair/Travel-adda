import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { Text, Pressable, ActivityIndicator, View } from 'react-native';
import ScrollView from '../components/KbScroll';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, S } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { supabase } from '../lib/supabase';
import { otp, otpText } from '../lib/otp';
import { PENDING_EMAIL, normalizeEmail, isValidEmail, emailTypoFix } from '../lib/login';
import { useMe } from '../lib/me';
import { st } from './GroupScreen';
import { T } from '../strings';

// Verify the account with a code: by SMS to the mobile number OR by e-mail. Either one makes the account "verified".
// A verified e-mail can also be used to log in and to reset the password.
type Profile = { phone: string; phone_verified?: boolean; email?: string | null; email_verified?: boolean };
type Msg = { kind: 'ok' | 'bad' | 'warn' | 'info'; text: string; fix?: string | null } | null;
type Tab = 'phone' | 'email';
type Props = { navigation: { navigate: (r: string) => void; addListener?: (e: string, f: () => void) => () => void }; route?: { params?: { channel?: string } } };

export default function VerifyPhoneScreen({ navigation, route }: Props): JSX.Element {
  const { refreshMe } = useMe();
  const V = T.verify; const CM = T.common;
  const [me, setMe] = useState<Profile | null>(null);
  const [state, setState] = useState<'load' | 'ok' | 'err'>('load');            // load | ok | err
  const [tab, setTab] = useState<Tab>(route?.params?.channel === 'email' ? 'email' : 'phone');
  const [step, setStep] = useState<'ask' | 'code'>('ask');               // ask | code   (for the open tab)
  const [emailOk, setEmailOk] = useState(true);          // false = database step for e-mail not run yet
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return undefined; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const load = useCallback(async () => {
    setMsg(null);
    type R = { data: Profile | null; error: { code?: string; message?: string } | null };
    let r: R = await supabase.from('profiles').select('phone,phone_verified,email,email_verified').single();
    let ok = true;
    if (r.error && (r.error.code === '42703' || /column/i.test(r.error.message || ''))) { ok = false; r = await supabase.from('profiles').select('phone,phone_verified').single(); }
    if (r.error || !r.data) { setState('err'); return; }
    const d = r.data;
    setEmailOk(ok); setMe(d); setState('ok'); setStep('ask'); setCode('');
    const pending = await AsyncStorage.getItem(PENDING_EMAIL).catch(() => null);
    setEmail((x) => x || pending || d.email || '');
    if (pending && ok && !(d.email === pending && d.email_verified)) setTab('email');
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  useEffect(() => { if (route?.params?.channel === 'email') setTab('email'); }, [route?.params?.channel]);
  const switchTab = (t: Tab) => { if (busy) return; setTab(t); setStep('ask'); setCode(''); setMsg(null); setWait(0); };
  const e = normalizeEmail(email);

  const send = async () => {
    if (busy || wait > 0) return;
    if (tab === 'email' && !isValidEmail(e)) { setMsg({ kind: 'bad', text: V.badEmail }); return; }
    if (tab === 'email' && emailTypoFix(e)) { setMsg({ kind: 'warn', text: V.typo(emailTypoFix(e) || ''), fix: emailTypoFix(e) }); return; }
    setBusy(true); setMsg(null);
    const r = await otp('send_verify', tab === 'email' ? { channel: 'email', email: e } : {});
    setBusy(false);
    if (tab === 'email' && r.ok && r.channel !== 'email') { setEmailOk(false); return; }     // server not updated yet
    if (r.ok && r.already) { await load(); setMsg({ kind: 'ok', text: V.already(tab === 'email') }); return; }
    if (r.ok) {
      setStep('code'); setWait(60);
      setMsg({ kind: 'info', text: tab === 'email' ? V.sentMail(e) : V.sentSms(me ? me.phone : '') });
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
      setMsg({ kind: 'ok', text: tab === 'email' ? V.doneMail : V.donePhone });
      return;
    }
    setMsg({ kind: 'bad', text: otpText(r) });   // the code stays in the box
  };

  const verified = me && (me.phone_verified || me.email_verified);
  const phoneDone = me && me.phone_verified;
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Account')} style={st.back} accessibilityRole="button" accessibilityLabel={V.backA11y}><Text style={st.backT}>{V.back}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{V.title}</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'err' ? <Notice kind="bad" title={V.loadErrT} text={V.loadErr}><Button title={T.retry} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' ? (
        <>
          {me && verified ? (
            <Notice kind="ok" title={V.verifiedT}
              text={[me.phone_verified ? V.phoneOk(me.phone) : null, me.email_verified && me.email ? V.mailOk(me.email) : null].filter(Boolean).join('\n')} />
          ) : (
            <Text style={[st.p, { marginBottom: S.md }]}>{V.why}</Text>
          )}
          <Segmented value={tab} onChange={switchTab} disabled={busy} options={[{ id: 'phone', label: V.tabPhone }, { id: 'email', label: V.tabMail }]} />
          <View style={{ height: S.md }} />
          {msg ? (
            <Notice kind={msg.kind} title={msg.text}>
              {msg.fix ? <Button title={V.fixBtn(msg.fix)} icon="✏️" kind="secondary" onPress={() => { setEmail(msg.fix || ''); setMsg(null); }} style={{ marginTop: S.sm }} /> : null}
            </Notice>
          ) : null}

          {me && tab === 'phone' && phoneDone ? <Notice kind="ok" title={V.numOkT(me.phone)} text={V.numOk} /> : null}
          {me && tab === 'phone' && !phoneDone ? (
            <>
              <Text style={st.val}>{V.number(me.phone)}</Text>
              <Text style={[st.small, { marginBottom: S.sm }]}>{V.smsWill}</Text>
              {step === 'ask' ? <Button title={V.sendSms} icon="📩" onPress={send} loading={busy} disabled={wait > 0} /> : null}
            </>
          ) : null}

          {tab === 'email' && !emailOk ? <Notice kind="info" title={T.soon} text={V.mailSoon} /> : null}
          {me && tab === 'email' && emailOk ? (
            <>
              {me.email_verified && me.email ? <Text style={[st.small, { marginBottom: S.sm }]}>{V.current(me.email)}</Text> : null}
              <Field label={V.mailLabel} hint={V.mailHint} value={email} onChangeText={(v: string) => { setEmail(v); if (step === 'code') { setStep('ask'); setCode(''); } }}
                keyboardType="email-address" maxLength={254} autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!busy} />
              {step === 'ask' ? <Button title={V.sendMail} icon="📧" onPress={send} loading={busy} disabled={wait > 0} /> : null}
            </>
          ) : null}

          {step === 'code' && (tab === 'phone' ? !phoneDone : emailOk) ? (
            <>
              <Field label={CM.codeFrom(tab === 'email')} hint={CM.code6} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete={tab === 'phone' ? 'sms-otp' : 'one-time-code'} textContentType="oneTimeCode" />
              <Button title={V.check} icon="✅" onPress={check} loading={busy} />
              <Button title={wait > 0 ? CM.resendWait(wait) : CM.resend} kind="secondary" onPress={send} disabled={busy || wait > 0} style={{ marginTop: S.sm }} />
              <Text style={st.small}>{CM.codeSafe}</Text>
            </>
          ) : null}
          {wait > 0 && step === 'ask' ? <Text style={st.small}>{CM.waitSec(wait)}</Text> : null}
        </>
      ) : null}
    </ScrollView>
  );
}
