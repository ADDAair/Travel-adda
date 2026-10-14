import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { C } from '../theme';
import { supabase } from '../lib/supabase';
import { normalizePhone, isValidBdPhone, phoneToLoginId } from '../lib/phone';

const MSG = {
  invalid: 'মোবাইল নম্বর বা পাসওয়ার্ড সঠিক নয়।',
  exists: 'এই নম্বরে আগে থেকেই অ্যাকাউন্ট আছে। লগইন করুন।',
  net: 'ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।',
  generic: 'কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।',
};

export default function AuthScreen() {
  const [reg, setReg] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (busy) return;
    setErr('');
    const p = normalizePhone(phone);
    if (!isValidBdPhone(p)) return setErr('সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন 017XXXXXXXX)।');
    if (pw.length < 8) return setErr('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।');
    if (reg && name.trim().length < 2) return setErr('আপনার নাম লিখুন।');
    setBusy(true);
    try {
      const email = phoneToLoginId(p);
      const res = reg
        ? await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name.trim() } } })
        : await supabase.auth.signInWithPassword({ email, password: pw });
      if (res.error) {
        const m = (res.error.message || '').toLowerCase();
        if (m.includes('already')) setErr(MSG.exists);
        else if (m.includes('invalid') || m.includes('credentials')) setErr(MSG.invalid);
        else if (m.includes('network') || m.includes('fetch')) setErr(MSG.net);
        else setErr(MSG.generic);
      }
    } catch (e) {
      setErr(MSG.net);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.primary }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>🕋</Text>
        <Text style={s.brand}>Travel Adda</Text>
        <Text style={s.sub}>হজ ও ওমরাহ অ্যাসিস্ট্যান্ট</Text>
        <View style={s.card}>
          <Text style={s.title}>{reg ? 'নতুন অ্যাকাউন্ট (হাজী)' : 'হাজী লগইন'}</Text>
          {reg && <TextInput style={s.in} placeholder="আপনার নাম" value={name} onChangeText={setName} maxLength={80} />}
          <TextInput style={s.in} placeholder="মোবাইল নম্বর" keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={16} autoCapitalize="none" />
          <TextInput style={s.in} placeholder="পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)" secureTextEntry value={pw} onChangeText={setPw} maxLength={72} autoCapitalize="none" />
          {!!err && <Text style={s.err} accessibilityRole="alert">{err}</Text>}
          <TouchableOpacity style={[s.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>{reg ? 'অ্যাকাউন্ট খুলুন' : 'লগইন করুন'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setReg(!reg); setErr(''); }} style={{ marginTop: 14 }}>
            <Text style={s.link}>{reg ? 'আগে থেকেই অ্যাকাউন্ট আছে? লগইন' : 'নতুন? অ্যাকাউন্ট খুলুন'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  logo: { fontSize: 64, textAlign: 'center' },
  brand: { color: C.gold, fontSize: 30, fontWeight: '700', textAlign: 'center' },
  sub: { color: '#fff', textAlign: 'center', marginBottom: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  title: { fontSize: 20, fontWeight: '700', color: C.primary, marginBottom: 12 },
  in: { borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 10, backgroundColor: C.bg, color: C.text },
  err: { color: C.bad, marginBottom: 8 },
  btn: { backgroundColor: C.primary, borderRadius: 10, padding: 14, alignItems: 'center' },
  btnT: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { color: C.primary, textAlign: 'center', fontWeight: '600' },
});
