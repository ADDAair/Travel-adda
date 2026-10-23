import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R, TOUCH } from '../theme';
import { T } from '../strings';
import { Button, Field, Notice, Segmented } from '../components/ui';
import Logo from '../components/Logo';
import { supabase } from '../lib/supabase';
import { normalizePhone, isValidBdPhone, toBn } from '../lib/phone';
import { loginEmailFor, newLoginEmail, looksLikeEmail, normalizeEmail, isValidEmail, PENDING_EMAIL } from '../lib/login';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeyboardHeight } from '../lib/keyboard';
import { passwordStrength, STRENGTH_LABEL } from '../lib/password';
import ForgotPassword from './ForgotPassword';
import { rememberReferral, getTerms, rememberTermsAgreement } from '../lib/market';
import { Modal } from 'react-native';

const A = T.auth;

export default function AuthScreen() {
  const ins = useSafeAreaInsets();
  const [reg, setReg] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');          // login: phone OR e-mail; sign-up: phone
  const [email, setEmail] = useState('');          // sign-up only, optional
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState('');
  const [forgot, setForgot] = useState(false);
  const [accType, setAccType] = useState(null);      // 'haji' | 'leader' (only when opening a new account)
  const [refCode, setRefCode] = useState('');
  const [allTerms, setAllTerms] = useState({});      // { haji, leader }: each { body } when written
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);     // after "server busy": the button waits a minute (protects the server when many log in at once)
  const [, tick] = useState(0);
  useEffect(() => { if (waitUntil <= Date.now()) return undefined; const t = setInterval(() => { tick((x) => x + 1); if (Date.now() >= waitUntil) clearInterval(t); }, 1000); return () => clearInterval(t); }, [waitUntil]);
  const waitLeft = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));
  useEffect(() => {
    getTerms('haji').then((t) => setAllTerms((x) => ({ ...x, haji: t }))).catch(() => {});
    getTerms('leader').then((t) => setAllTerms((x) => ({ ...x, leader: t }))).catch(() => {});
  }, []);
  const terms = accType === 'leader' ? allTerms.leader : allTerms.haji;      // the terms for the account type being opened
  const termsName = accType === 'leader' ? 'লিডারদের শর্তাবলি' : 'হাজীদের শর্তাবলি';
  useEffect(() => { setAgree(false); }, [accType]);                       // a different type means different terms: tick again
  const phoneRef = useRef(null);
  const pwRef = useRef(null);
  const scrollRef = useRef(null);
  const kb = useKeyboardHeight();
  const strength = passwordStrength(pw, normalizePhone(phone));

  // When the keyboard opens, move the form up so the fields and the main button stay visible.
  useEffect(() => {
    if (kb > 0) { const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60); return () => clearTimeout(t); }
  }, [kb]);
  const keepVisible = () => { if (kb > 0) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60); };

  function switchMode(r) { if (busy) return; setReg(r); setErrs({}); setFormErr(''); if (!r) setAccType(null); }

  function validate() {
    const e = {};
    if (reg && name.trim().length < 2) e.name = A.errName;
    if (!reg && looksLikeEmail(phone)) { if (!isValidEmail(normalizeEmail(phone))) e.phone = A.errEmail; }
    else if (!isValidBdPhone(normalizePhone(phone))) e.phone = reg ? A.errPhone : A.errIdent;
    if (reg && email.trim() && !isValidEmail(normalizeEmail(email))) e.email = A.errEmail;
    if (pw.length < 8) e.pw = A.errPw;
    else if (reg && strength.level === 0) e.pw = A.errPwEasy;
    if (reg && refCode.trim() && !/^TL-?\d{1,8}$/i.test(refCode.trim().replace(/\s/g, ''))) e.ref = 'রেফারেল কোড এমন হয়: TL-00012। না থাকলে ঘরটি খালি রাখুন।';
    if (reg && terms && !agree) e.agree = 'শর্তাবলি পড়ে টিক দিন।';
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (busy) return;                 // blocks double submit
    if (waitUntil > Date.now()) { setFormErr(A.errBusy); return; }   // asked to wait: no new request yet
    setFormErr('');
    if (!validate()) return;
    setBusy(true);
    try {
      let loginId;
      try { loginId = reg ? await newLoginEmail(normalizePhone(phone)) : await loginEmailFor(phone); }
      catch (x) {
        if (x && x.code === 'email-soon') { setFormErr(A.errEmailSoon); return; }
        if (x && x.code === 'bad-ident') { setErrs({ phone: A.errIdent }); return; }
        throw x;
      }
      const res = reg
        ? await (async () => {
          if (accType === 'haji' && refCode.trim()) await rememberReferral(refCode.trim().toUpperCase().replace(/\s/g, '').replace(/^TL(\d)/, 'TL-$1'));
          if (terms) await rememberTermsAgreement(accType === 'leader' ? 'leader' : 'haji');   // recorded on the server after the first login
          if (email.trim()) await AsyncStorage.setItem(PENDING_EMAIL, normalizeEmail(email)).catch(() => {});   // verified after the first login
          return supabase.auth.signUp({ email: loginId, password: pw, options: { data: { full_name: name.trim(), phone: normalizePhone(phone), account_type: accType === 'leader' ? 'leader' : 'haji' } } });
        })()
        : await supabase.auth.signInWithPassword({ email: loginId, password: pw });
      if (res.error) {
        const m = (res.error.message || '').toLowerCase();
        const code = Number(res.error.status) || 0;
        if (reg && m.includes('database error saving new user')) setFormErr(A.errExists);   // this mobile number already has an account
        else if (code === 429 || code >= 500 || m.includes('rate limit') || m.includes('too many')) { setFormErr(A.errBusy); setWaitUntil(Date.now() + 60000); }   // server busy: pause, don't hammer it
        else if (m.includes('already')) setFormErr(A.errExists);
        else if (m.includes('invalid') || m.includes('credentials')) setFormErr(A.errInvalid);
        else if (m.includes('network') || m.includes('fetch')) setFormErr(A.errNet);
        else setFormErr(A.errGeneric);
      } else if (reg && !res.data?.session) {
        setFormErr(A.errGeneric);     // never pretend success without a real session
      }
      // On success the app switches to the home screen automatically.
    } catch (e) {
      setFormErr(A.errNet);
    } finally {
      setBusy(false);
    }
  }

  if (forgot) return <ForgotPassword initialPhone={phone} onClose={() => setForgot(false)} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView ref={scrollRef} contentContainerStyle={[st.wrap, { paddingTop: ins.top + S.lg, paddingBottom: (kb > 0 ? kb : ins.bottom) + S.xl }]} keyboardShouldPersistTaps="handled">
        <View style={st.brand}>
          <Logo size={72} />
          <Text style={st.appName} accessibilityRole="header">{T.appName}</Text>
          <Text style={st.tag}>{T.tagline}</Text>
        </View>

        <Segmented
          value={reg ? 'reg' : 'login'}
          onChange={(id) => switchMode(id === 'reg')}
          disabled={busy}
          options={[{ id: 'login', label: A.loginTab }, { id: 'reg', label: A.registerTab }]}
        />

        <Text style={st.title}>{reg ? A.registerTitle : A.loginTitle}</Text>

        {reg && !accType ? (
          <>
            <Text style={[st.tag, { textAlign: 'left', marginBottom: S.sm }]}>আপনি কে? একটি বাছুন:</Text>
            <Pressable onPress={() => setAccType('haji')} style={st.choice} accessibilityRole="button" accessibilityLabel="আমি হাজী, হজ বা ওমরাহ যাত্রী">
              <Text style={st.choiceIc} importantForAccessibility="no">🕋</Text>
              <View style={{ flex: 1 }}><Text style={st.choiceT}>আমি হাজী</Text><Text style={st.choiceW}>হজ বা ওমরাহ যাত্রী</Text></View>
            </Pressable>
            <Pressable onPress={() => setAccType('leader')} style={st.choice} accessibilityRole="button" accessibilityLabel="আমি গ্রুপ লিডার বা এজেন্সি">
              <Text style={st.choiceIc} importantForAccessibility="no">🧭</Text>
              <View style={{ flex: 1 }}><Text style={st.choiceT}>আমি গ্রুপ লিডার</Text><Text style={st.choiceW}>হজ/ওমরাহ এজেন্সি। লাইসেন্স ও কাগজ দিয়ে নিবন্ধন, অ্যাডমিন যাচাই করবেন।</Text></View>
            </Pressable>
          </>
        ) : null}
        {reg && accType ? (
          <Pressable onPress={() => !busy && setAccType(null)} style={st.chosen} accessibilityRole="button" accessibilityLabel={`অ্যাকাউন্টের ধরন: ${accType === 'leader' ? 'গ্রুপ লিডার' : 'হাজী'}। বদলাতে চাপুন`}>
            <Text style={st.chosenT}>{accType === 'leader' ? '🧭 গ্রুপ লিডার অ্যাকাউন্ট' : '🕋 হাজী অ্যাকাউন্ট'} · <Text style={{ textDecorationLine: 'underline' }}>বদলান</Text></Text>
          </Pressable>
        ) : null}

        {reg && !accType ? null : (<>
        {reg ? (
          <Field label={A.nameLabel} hint={A.nameHint} value={name} onChangeText={setName} error={errs.name}
            maxLength={80} autoComplete="name" returnKeyType="next" onFocus={keepVisible} onSubmitEditing={() => phoneRef.current?.focus()} />
        ) : null}
        {reg ? (
          <Field inputRef={phoneRef} label={A.phoneLabel} hint={A.phoneHint} value={phone} onChangeText={setPhone} error={errs.phone}
            keyboardType="phone-pad" maxLength={16} autoComplete="tel" returnKeyType="next" onFocus={keepVisible} onSubmitEditing={() => pwRef.current?.focus()} />
        ) : (
          <Field inputRef={phoneRef} label={A.identLabel} hint={A.identHint} value={phone} onChangeText={setPhone} error={errs.phone}
            maxLength={254} autoCapitalize="none" autoCorrect={false} autoComplete="username" returnKeyType="next" onFocus={keepVisible} onSubmitEditing={() => pwRef.current?.focus()} />
        )}
        {reg ? (
          <Field label={A.emailLabel} hint={A.emailHint} value={email} onChangeText={setEmail} error={errs.email}
            keyboardType="email-address" maxLength={254} autoCapitalize="none" autoCorrect={false} autoComplete="email" onFocus={keepVisible} />
        ) : null}
        <Field inputRef={pwRef} label={A.pwLabel} hint={A.pwHint} value={pw} onChangeText={setPw} error={errs.pw}
          secureTextEntry={!showPw} maxLength={72} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onFocus={keepVisible} onSubmitEditing={submit}
          right={
            <Pressable onPress={() => setShowPw(!showPw)} style={st.eye} accessibilityRole="button" accessibilityLabel={showPw ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 16 }} importantForAccessibility="no">{showPw ? '🙈' : '👁️'}</Text>
                <Text key={showPw ? 'pw-hide' : 'pw-show'} style={st.eyeT}>{showPw ? A.hide : A.show}</Text>
              </View>
            </Pressable>
          } />

        {reg && pw.length > 0 ? <StrengthMeter s={strength} /> : null}

        {reg && accType === 'haji' ? (
          <Field label="লিডারের রেফারেল কোড (থাকলে)" hint="যেমন: TL-00012" value={refCode} onChangeText={(v) => setRefCode(v.toUpperCase())} error={errs.ref}
            maxLength={12} autoCapitalize="characters" autoCorrect={false} onFocus={keepVisible} />
        ) : null}
        {reg && accType === 'leader' ? <Notice kind="info" title="অ্যাকাউন্ট খোলার পর শেষ ধাপ" text="এজেন্সির নাম, ওমরাহ ও হজ লাইসেন্স নম্বর এবং লাইসেন্সের ছবি দিতে হবে। অ্যাডমিন যাচাই করে অনুমোদন দিলে লিডার প্যানেল চালু হবে।" /> : null}
        {reg && terms ? (
          <View style={{ marginBottom: S.md }}>
            <Pressable onPress={() => setAgree(!agree)} style={st.agree} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} accessibilityLabel={`আমি ${termsName} পড়েছি ও মেনে নিচ্ছি`}>
              <Text style={st.agreeT}>{agree ? '☑️' : '⬜'} আমি {termsName} পড়েছি ও মেনে নিচ্ছি</Text>
            </Pressable>
            <Pressable onPress={() => setShowTerms(true)} style={st.forgotBtn} accessibilityRole="button"><Text style={st.forgotT}>📜 {termsName} পড়ুন</Text></Pressable>
            {errs.agree ? <Text style={st.agreeErr}>⚠️ {errs.agree}</Text> : null}
          </View>
        ) : null}

        {formErr ? <Notice kind="bad" title={formErr} /> : null}

        <Button title={busy ? A.working : waitLeft > 0 ? `${toBn(waitLeft)} সেকেন্ড পরে আবার চাপুন` : (reg ? A.registerBtn : A.loginBtn)} onPress={submit} loading={busy} disabled={waitLeft > 0} />

        {!reg ? (
          <Pressable onPress={() => !busy && setForgot(true)} style={st.forgotBtn} accessibilityRole="button" accessibilityLabel={A.forgot}>
            <Text style={st.forgotT}>🔑 {A.forgot}</Text>
          </Pressable>
        ) : null}
        </>)}
        <Modal visible={showTerms} animationType="slide" onRequestClose={() => setShowTerms(false)}>
          <ScrollView contentContainerStyle={[st.wrap, { paddingTop: ins.top + S.lg }]}>
            <Text style={st.title}>📜 {termsName}</Text>
            <Text style={st.termsT} selectable>{terms ? terms.body : ''}</Text>
            <Button title="পড়েছি, মেনে নিচ্ছি" icon="✅" onPress={() => { setShowTerms(false); setAgree(true); }} style={{ marginTop: S.lg }} />
            <Button title="বন্ধ করুন (টিক দেব না)" kind="secondary" onPress={() => setShowTerms(false)} style={{ marginTop: S.sm, marginBottom: S.xl }} />
          </ScrollView>
        </Modal>
      </ScrollView>
    </View>
  );
}

function StrengthMeter({ s }) {
  const col = [C.bad, C.warn, C.ok][s.level];
  const tip = s.tooEasy ? 'এটা সহজে অনুমান করা যায় (যেমন 12345678 বা নিজের মোবাইল নম্বর)।'
    : s.level === 0 ? 'আরও অক্ষর লিখুন।'
    : s.level === 1 ? 'চলবে। আরও নিরাপদ করতে ১২ অক্ষর বা কোনো চিহ্ন (! @ #) যোগ করুন।'
    : 'খুব ভালো পাসওয়ার্ড।';
  const Row = ({ ok, text }) => <Text style={st.chk}>{ok ? '✅' : '⬜'} {text}</Text>;
  return (
    <View style={st.meter} accessible accessibilityLiveRegion="polite" accessibilityLabel={`পাসওয়ার্ডের শক্তি: ${STRENGTH_LABEL[s.level]}। ${tip}`}>
      <View style={st.meterTop}>
        <Text style={st.meterH}>পাসওয়ার্ডের শক্তি:</Text>
        <Text style={[st.meterL, { color: col }]}>{STRENGTH_LABEL[s.level]}</Text>
      </View>
      <View style={st.bars}>
        {[0, 1, 2].map((i) => <View key={i} style={[st.bar, { backgroundColor: i <= s.level ? col : C.line }]} />)}
      </View>
      <Row ok={s.checks.length} text="কমপক্ষে ৮ অক্ষর" />
      <Row ok={s.checks.mixed} text="অক্ষর ও সংখ্যা মিশিয়ে" />
      <Row ok={s.checks.long} text="১২ অক্ষর বা কোনো চিহ্ন (! @ #)" />
      <Text style={st.tip}>{tip}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  meter: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.md, marginTop: -S.sm, marginBottom: S.md },
  meterTop: { flexDirection: 'row', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' },
  meterH: { fontSize: F.body, color: C.text, fontWeight: '600' },
  meterL: { fontSize: F.large, fontWeight: '700' },
  bars: { flexDirection: 'row', gap: 6, marginVertical: S.sm },
  bar: { flex: 1, height: 10, borderRadius: 5 },
  chk: { fontSize: F.small, color: C.text, lineHeight: 26 },
  tip: { fontSize: F.small, color: C.muted, marginTop: 4, lineHeight: 24 },
  wrap: { flexGrow: 1, paddingHorizontal: S.lg },
  brand: { alignItems: 'center', marginBottom: S.lg, gap: 6 },
  logo: { fontSize: 56 },
  appName: { fontSize: F.hero, fontWeight: '700', color: C.primary },
  tag: { fontSize: F.body, color: C.muted, marginTop: 2 },
  title: { fontSize: F.title, fontWeight: '700', color: C.text, marginBottom: S.md },
  eye: { minHeight: TOUCH, minWidth: 84, paddingLeft: S.sm, paddingRight: S.md, justifyContent: 'center', alignItems: 'flex-end', flexShrink: 0 },
  eyeT: { fontSize: F.small, color: C.primary, fontWeight: '700' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.lg, borderWidth: 2, borderColor: C.primary, padding: S.md, marginBottom: S.md, minHeight: 88 },
  choiceIc: { fontSize: 40 },
  choiceT: { fontSize: F.large, fontWeight: '700', color: C.primary },
  choiceW: { fontSize: F.small, color: C.muted, lineHeight: 22 },
  chosen: { minHeight: TOUCH, justifyContent: 'center', marginBottom: S.sm },
  chosenT: { fontSize: F.body, color: C.primary, fontWeight: '700' },
  agree: { minHeight: TOUCH, justifyContent: 'center' },
  agreeT: { fontSize: F.body, color: C.text },
  agreeErr: { fontSize: F.small, color: C.bad },
  termsT: { fontSize: F.body, color: C.text, lineHeight: 30 },
  forgotBtn: { minHeight: TOUCH, justifyContent: 'center', alignItems: 'center', marginTop: S.md },
  forgotT: { fontSize: F.body, color: C.primary, fontWeight: '700', textDecorationLine: 'underline' },
});
