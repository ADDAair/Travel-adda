import React, { useEffect, useState, type JSX } from 'react';
import { View, Text, Pressable, BackHandler } from 'react-native';
import ScrollView from '../components/KbScroll';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { normalizePhone, normalizeDigits, isValidBdPhone } from '../lib/phone';
import { loginEmailFor, looksLikeEmail, normalizeEmail, isValidEmail, emailReady } from '../lib/login';
import { passwordStrength } from '../lib/password';
import { otp, otpText } from '../lib/otp';
import { st } from './GroupScreen';
import { T } from '../strings';

// "Forgot password": a code by SMS (to the number) or by e-mail (to a verified e-mail), then a new password.
type Msg = { kind: 'ok' | 'bad' | 'warn' | 'info'; text: string } | null;

export default function ForgotPassword({ initialPhone = '', onClose }: { initialPhone?: string; onClose: () => void }): JSX.Element {
  const ins = useSafeAreaInsets();
  const FP = T.forgot; const CM = T.common;
  const [phone, setPhone] = useState(initialPhone);
  const [step, setStep] = useState<'phone' | 'code' | 'done'>('phone');      // phone | code | done
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return undefined; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (!busy) onClose(); return true; }); return () => sub.remove(); }, [busy, onClose]);

  const mail = looksLikeEmail(phone);
  const p = mail ? normalizeEmail(phone) : normalizePhone(phone);
  const send = async () => {
    if (busy) return;
    if (mail ? !isValidEmail(p) : !isValidBdPhone(p)) { setMsg({ kind: 'bad', text: FP.badIdent }); return; }
    setBusy(true); setMsg(null);
    if (mail && !(await emailReady().catch(() => true))) { setBusy(false); setMsg({ kind: 'info', text: FP.mailSoon }); return; }
    const r = await otp('send_reset', mail ? { email: p } : { phone: p });
    setBusy(false);
    if (mail && ((r.ok && r.channel !== 'email') || r.error === 'bad_phone')) { setMsg({ kind: 'info', text: FP.mailSoon }); return; }
    if (r.ok) {
      setStep('code'); setWait(60);
      setMsg({ kind: 'info', text: mail ? FP.sentMail(p) : FP.sentSms(p) });
    }
    else { setMsg({ kind: r.error === 'not_ready' ? 'info' : 'bad', text: otpText(r) }); if (r.retry_in) setWait(r.retry_in); }
  };
  const reset = async () => {
    if (busy) return;
    const s = passwordStrength(pw, p);
    if (normalizeDigits(code).replace(/\D/g, '').length !== 6) { setMsg({ kind: 'bad', text: FP.needCode(mail) }); return; }
    if (s.level === 0) { setMsg({ kind: 'bad', text: FP.weak }); return; }
    setBusy(true); setMsg(null);
    const r = await otp('check_reset', mail ? { email: p, code, password: pw } : { phone: p, code, password: pw });
    if (!r.ok) { setBusy(false); setMsg({ kind: 'bad', text: otpText(r) }); return; }   // what was typed stays
    setStep('done');
    // Sign in with the new password right away; if that fails the person can still log in normally.
    const li: { error: unknown } = await loginEmailFor(p).then((id) => supabase.auth.signInWithPassword({ email: id, password: pw })).catch(() => ({ error: true }));
    setBusy(false);
    setMsg(li.error ? { kind: 'ok', text: FP.doneLogin } : { kind: 'ok', text: FP.done });
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={[st.wrap, { paddingTop: ins.top + S.md, paddingBottom: ins.bottom + S.xl }]} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => !busy && onClose()} style={st.back} accessibilityRole="button" accessibilityLabel={FP.backA11y}><Text style={st.backT}>{FP.back}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{FP.title}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {step === 'phone' ? (
        <>
          <Text style={[st.p, { marginBottom: S.md }]}>{FP.intro}</Text>
          <Field label={FP.identLabel} hint={FP.identHint} value={phone} onChangeText={setPhone} maxLength={254} autoCapitalize="none" autoCorrect={false} autoComplete="username" />
          <Button title={FP.send} icon="📩" onPress={send} loading={busy} disabled={wait > 0} />
          {wait > 0 ? <Text style={st.small}>{CM.waitSec(wait)}</Text> : null}
        </>
      ) : null}
      {step === 'code' ? (
        <>
          <Field label={CM.codeFrom(mail)} hint={CM.code6} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" textContentType="oneTimeCode" />
          <Field label={FP.pwLabel} hint={FP.pwHint} value={pw} onChangeText={setPw} secureTextEntry maxLength={72} autoCapitalize="none" autoCorrect={false} />
          <Button title={FP.set} icon="✅" onPress={reset} loading={busy} />
          <Button title={wait > 0 ? CM.resendWait(wait) : CM.resend} kind="secondary" onPress={send} disabled={busy || wait > 0} style={{ marginTop: S.sm }} />
          <Text style={st.small}>{CM.codeSafe}</Text>
        </>
      ) : null}
      {step === 'done' ? <Button title={FP.toLogin} onPress={onClose} disabled={busy} /> : null}
      <View style={{ height: S.lg }} />
    </ScrollView>
  );
}
