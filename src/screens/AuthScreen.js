import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R, TOUCH } from '../theme';
import { T } from '../strings';
import { Button, Field, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { normalizePhone, isValidBdPhone, phoneToLoginId } from '../lib/phone';

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
  const phoneRef = useRef(null);
  const pwRef = useRef(null);

  function switchMode(r) { if (busy) return; setReg(r); setErrs({}); setFormErr(''); }

  function validate() {
    const e = {};
    if (reg && name.trim().length < 2) e.name = A.errName;
    if (!isValidBdPhone(normalizePhone(phone))) e.phone = A.errPhone;
    if (pw.length < 8) e.pw = A.errPw;
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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[st.wrap, { paddingTop: ins.top + S.lg, paddingBottom: ins.bottom + S.xl }]} keyboardShouldPersistTaps="handled">
        <View style={st.brand}>
          <Text style={st.logo} importantForAccessibility="no">🕋</Text>
          <Text style={st.appName} accessibilityRole="header">{T.appName}</Text>
          <Text style={st.tag}>{T.tagline}</Text>
        </View>

        <View style={st.seg} accessibilityRole="tablist">
          {[[false, A.loginTab], [true, A.registerTab]].map(([r, label]) => (
            <Pressable key={label} onPress={() => switchMode(r)} style={[st.segBtn, reg === r && st.segOn]}
              accessibilityRole="tab" accessibilityState={{ selected: reg === r }} accessibilityLabel={label}>
              <Text style={[st.segT, reg === r && st.segTOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={st.title}>{reg ? A.registerTitle : A.loginTitle}</Text>

        {reg ? (
          <Field label={A.nameLabel} hint={A.nameHint} value={name} onChangeText={setName} error={errs.name}
            maxLength={80} autoComplete="name" returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} />
        ) : null}
        <Field inputRef={phoneRef} label={A.phoneLabel} hint={A.phoneHint} value={phone} onChangeText={setPhone} error={errs.phone}
          keyboardType="phone-pad" maxLength={16} autoComplete="tel" returnKeyType="next" onSubmitEditing={() => pwRef.current?.focus()} />
        <Field inputRef={pwRef} label={A.pwLabel} hint={A.pwHint} value={pw} onChangeText={setPw} error={errs.pw}
          secureTextEntry={!showPw} maxLength={72} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={submit}
          right={
            <Pressable onPress={() => setShowPw(!showPw)} style={st.eye} accessibilityRole="button" accessibilityLabel={showPw ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}>
              <Text style={st.eyeT}>{showPw ? '🙈 ' + A.hide : '👁️ ' + A.show}</Text>
            </Pressable>
          } />

        {formErr ? <Notice kind="bad" title={formErr} /> : null}

        <Button title={busy ? A.working : (reg ? A.registerBtn : A.loginBtn)} onPress={submit} loading={busy} />

        {!reg ? <Text style={st.forgot}>{A.forgot}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: S.lg },
  brand: { alignItems: 'center', marginBottom: S.lg },
  logo: { fontSize: 56 },
  appName: { fontSize: F.hero, fontWeight: '700', color: C.primary },
  tag: { fontSize: F.body, color: C.muted, marginTop: 2 },
  seg: { flexDirection: 'row', backgroundColor: '#E6EAE7', borderRadius: R.md, padding: 4, marginBottom: S.lg },
  segBtn: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  segOn: { backgroundColor: C.card, borderWidth: 2, borderColor: C.primary },
  segT: { fontSize: F.body, color: C.muted, fontWeight: '600' },
  segTOn: { color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.text, marginBottom: S.md },
  eye: { minHeight: TOUCH, paddingHorizontal: S.md, justifyContent: 'center' },
  eyeT: { fontSize: F.small, color: C.primary, fontWeight: '700' },
  forgot: { fontSize: F.small, color: C.muted, textAlign: 'center', marginTop: S.md, lineHeight: 24 },
});
