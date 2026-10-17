import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R, TOUCH } from '../theme';
import { T } from '../strings';
import { Button, Field, Notice, Segmented } from '../components/ui';
import Logo from '../components/Logo';
import { supabase } from '../lib/supabase';
import { normalizePhone, isValidBdPhone, phoneToLoginId } from '../lib/phone';
import { useKeyboardHeight } from '../lib/keyboard';
import { passwordStrength, STRENGTH_LABEL } from '../lib/password';
import ForgotPassword from './ForgotPassword';

const A = T.auth;

export default function AuthScreen() {
  const ins = useSafeAreaInsets();
  const [reg, setReg] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState('');
  const [forgot, setForgot] = useState(false);
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

  function switchMode(r) { if (busy) return; setReg(r); setErrs({}); setFormErr(''); }

  function validate() {
    const e = {};
    if (reg && name.trim().length < 2) e.name = A.errName;
    if (!isValidBdPhone(normalizePhone(phone))) e.phone = A.errPhone;
    if (pw.length < 8) e.pw = A.errPw;
    else if (reg && strength.level === 0) e.pw = A.errPwEasy;
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (busy) return;                 // blocks double submit
    setFormErr('');
    if (!validate()) return;
    setBusy(true);
    try {
      const email = phoneToLoginId(normalizePhone(phone));
      const res = reg
        ? await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name.trim() } } })
        : await supabase.auth.signInWithPassword({ email, password: pw });
      if (res.error) {
        const m = (res.error.message || '').toLowerCase();
        if (m.includes('already')) setFormErr(A.errExists);
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

        {reg ? (
          <Field label={A.nameLabel} hint={A.nameHint} value={name} onChangeText={setName} error={errs.name}
            maxLength={80} autoComplete="name" returnKeyType="next" onFocus={keepVisible} onSubmitEditing={() => phoneRef.current?.focus()} />
        ) : null}
        <Field inputRef={phoneRef} label={A.phoneLabel} hint={A.phoneHint} value={phone} onChangeText={setPhone} error={errs.phone}
          keyboardType="phone-pad" maxLength={16} autoComplete="tel" returnKeyType="next" onFocus={keepVisible} onSubmitEditing={() => pwRef.current?.focus()} />
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

        {formErr ? <Notice kind="bad" title={formErr} /> : null}

        <Button title={busy ? A.working : (reg ? A.registerBtn : A.loginBtn)} onPress={submit} loading={busy} />

        {!reg ? (
          <Pressable onPress={() => !busy && setForgot(true)} style={st.forgotBtn} accessibilityRole="button" accessibilityLabel={A.forgot}>
            <Text style={st.forgotT}>🔑 {A.forgot}</Text>
          </Pressable>
        ) : null}
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
  forgotBtn: { minHeight: TOUCH, justifyContent: 'center', alignItems: 'center', marginTop: S.md },
  forgotT: { fontSize: F.body, color: C.primary, fontWeight: '700', textDecorationLine: 'underline' },
});
