// The second lock for admin & staff (2FA). Shown before the admin menu until this session typed a valid
// 6-digit code from an authenticator app. The database refuses all admin work without it (023_admin_mfa.sql).
import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { tr } from '../lib/lang';
import { View, Text, Linking, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { st } from './GroupScreen';
import { mfaStep, startEnroll, verifyCode, mfaErrorText, secretGroups, type Enrollment } from '../lib/mfa';

const PLAY = 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2';

export default function AdminMfa({ onDone, again = false }: { onDone: () => void; again?: boolean }): JSX.Element {
  const [step, setStep] = useState<'load' | 'enroll' | 'verify' | 'err'>('load');
  const [factor, setFactor] = useState<string | null>(null);
  const [setup, setSetup] = useState<Enrollment | null>(null); // { factorId, secret, uri } while setting up
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [appMissing, setAppMissing] = useState(false);

  const load = useCallback(async () => {
    setStep('load'); setMsg('');
    try {
      const r = await mfaStep({ again });
      if (r.step === 'ok') { onDone(); return; }
      setFactor(r.step === 'verify' ? r.factorId : null); setStep(r.step);
    } catch (e) { setMsg(mfaErrorText(e as { code?: string })); setStep('err'); }
  }, [onDone, again]);
  useEffect(() => { load(); }, [load]);

  const begin = async () => {
    if (busy) return;
    setBusy(true); setMsg('');
    try { setSetup(await startEnroll()); } catch (e) { setMsg(mfaErrorText(e as { code?: string })); }
    setBusy(false);
  };
  const openApp = async () => {
    if (!setup) return;
    try { await Linking.openURL(setup.uri); setAppMissing(false); } catch { setAppMissing(true); }
  };
  const submit = async () => {
    if (busy) return;
    const id = setup ? setup.factorId : factor;
    if (!id) return;
    setBusy(true); setMsg('');
    try { await verifyCode(id, code); setCode(''); onDone(); } catch (e) { setMsg(mfaErrorText(e as { code?: string })); }
    setBusy(false);
  };

  if (step === 'load') return <ActivityIndicator color={C.primary} accessibilityLabel={tr("যাচাই হচ্ছে", 'Checking')} />;
  if (step === 'err') return (
    <View>
      <Notice kind="bad" title={tr("যাচাই করা যায়নি", 'Could not check')} text={msg} />
      <Button title={tr("আবার চেষ্টা করুন", 'Try again')} icon="🔄" onPress={load} />
    </View>
  );

  const codeBox = (
    <View>
      <Field label={tr("৬ সংখ্যার কোড", '6-digit code')} hint={tr("যেমন: ১২৩৪৫৬", 'e.g. 123456')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={7}
        autoComplete="one-time-code" textContentType="oneTimeCode" error={msg || undefined} />
      <Button title={tr("কোড যাচাই করে অ্যাডমিন প্যানেল খুলুন", 'Check the code and open the admin panel')} icon="🔓" onPress={submit} loading={busy} disabled={!code.trim()} />
    </View>
  );

  if (step === 'verify') return (
    <View>
      <Notice kind="info" title={tr("🔐 দ্বিতীয় তালা (2FA)", '🔐 Second lock (2FA)')} text={tr("নিরাপত্তার জন্য অথেনটিকেটর অ্যাপে (Google Authenticator) Travel Adda-র পাশে যে ৬ সংখ্যার কোড দেখাচ্ছে, সেটি লিখুন। কোড প্রতি ৩০ সেকেন্ডে বদলায়।", 'For safety, write the 6-digit code shown next to Travel Adda in the authenticator app (Google Authenticator). The code changes every 30 seconds.')} />
      {codeBox}
    </View>
  );

  // enroll
  if (!setup) return (
    <View>
      <Notice kind="warn" title={tr("🔐 দ্বিতীয় তালা চালু করুন (একবারই)", '🔐 Turn on the second lock (only once)')}
        text={tr("অ্যাডমিন ও স্টাফের কাজ এখন শুধু পাসওয়ার্ড দিয়ে হবে না — ফোনের অথেনটিকেটর অ্যাপের কোডও লাগবে। পাসওয়ার্ড চুরি হলেও কেউ অ্যাডমিন কাজ করতে পারবে না।", 'Admin and staff work now needs more than the password — the code from the phone\'s authenticator app is also needed. Even if the password is stolen, nobody can do admin work.')} />
      <Text style={st.p}>{tr('১. Play Store থেকে "Google Authenticator" অ্যাপ নামান (আগে থাকলে দরকার নেই)।', '1. Install the "Google Authenticator" app from the Play Store (not needed if you already have it).')}</Text>
      <Button title={tr("Google Authenticator নামান", 'Install Google Authenticator')} icon="⬇️" kind="secondary" onPress={() => Linking.openURL(PLAY).catch(() => {})} style={{ marginBottom: S.md }} />
      <Text style={st.p}>{tr('২. নিচের বোতাম চাপুন — একটি গোপন চাবি তৈরি হবে।', '2. Press the button below — a secret key will be made.')}</Text>
      {msg ? <Notice kind="bad" title={tr("কাজটি হয়নি", 'It did not work')} text={msg} /> : null}
      <Button title={tr("গোপন চাবি তৈরি করুন", 'Make the secret key')} icon="🔑" onPress={begin} loading={busy} />
    </View>
  );
  return (
    <View>
      <Notice kind="info" title={tr("অথেনটিকেটর অ্যাপে যোগ করুন", 'Add to the authenticator app')} text={tr("নিচের বোতাম চাপলে অ্যাপটি খুলে যাবে, সেখানে যোগ করুন। না খুললে অ্যাপে “Enter a setup key” বেছে নিচের চাবিটি হুবহু লিখুন।", 'Pressing the button below opens the app; add it there. If it does not open, choose “Enter a setup key” in the app and type the key below exactly.')} />
      <Button title={tr("অথেনটিকেটর অ্যাপে যোগ করুন", 'Add to the authenticator app')} icon="📲" kind="secondary" onPress={openApp} style={{ marginBottom: S.md }} />
      {appMissing ? <Notice kind="warn" title={tr("অথেনটিকেটর অ্যাপ পাওয়া যায়নি", 'Authenticator app not found')} text={tr("আগে Google Authenticator নামান, অথবা নিচের চাবি নিজে লিখে দিন।", 'First install Google Authenticator, or type the key below yourself.')} /> : null}
      <View style={[st.card, { alignItems: 'center' }]}>
        <Text style={st.p}>{tr('গোপন চাবি (কাউকে দেখাবেন না):', 'Secret key (do not show anyone):')}</Text>
        <Text selectable style={{ fontSize: 22, fontWeight: '700', letterSpacing: 1, color: C.text, textAlign: 'center' }}
          accessibilityLabel={tr(`গোপন চাবি: ${setup.secret.split('').join(' ')}`, `Secret key: ${setup.secret.split('').join(' ')}`)}>{secretGroups(setup.secret)}</Text>
      </View>
      <Notice kind="warn" title={tr("ফোন হারালে যেন আটকে না যান", 'So you are not locked out if the phone is lost')} text={tr("একই চাবি দ্বিতীয় একটি ফোনেও (বিশ্বস্ত) যোগ করে রাখুন। দুটোই হারালে Supabase ড্যাশবোর্ড থেকে 2FA মুছে আবার চালু করতে হবে।", 'Add the same key to a second (trusted) phone too. If both are lost, 2FA must be removed from the Supabase dashboard and turned on again.')} />
      <Text style={st.p}>{tr('৩. অ্যাপে দেখানো ৬ সংখ্যার কোডটি লিখুন:', '3. Write the 6-digit code shown in the app:')}</Text>
      {codeBox}
    </View>
  );
}
