import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { C, F, S, R, TOUCH } from '../theme';
import { Button, Notice } from './ui';
import { pushSupported, pushState, enablePush, disablePush, notNow, openPhoneSettings } from '../lib/push';

// Turning on phone alerts (push). mode 'home': asks once, disappears after a choice.
// mode 'settings' (🔔 page): always shows the current state and the one action that fits it.
export default function PushCard({ mode = 'settings' }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => setSt(await pushState()), []);
  useEffect(() => { if (pushSupported) load(); }, [load]);

  if (!pushSupported || st === null || st === 'soon') return null;
  if (mode === 'home' && st !== 'unset') return null;

  const on = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const r = await enablePush();
    setBusy(false);
    if (r === 'on') { setSt('on'); setMsg({ kind: 'ok', text: 'চালু হয়েছে। এখন অ্যাপ বন্ধ থাকলেও জরুরি খবর ফোনে আসবে।' }); }
    else if (r === 'denied') { setSt('denied'); }
    else if (r === 'unavailable') { setSt('off'); setMsg({ kind: 'warn', text: 'এই ফোনে বা অ্যাপের এই সংস্করণে ফোনে নোটিফিকেশন আসা সম্ভব নয়। 🔔 ঘণ্টায় সব খবর আগের মতোই দেখবেন।' }); }
    else if (r === 'soon') { setSt('soon'); }
    else setMsg({ kind: 'bad', text: 'চালু করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।' });
  };
  const off = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const r = await disablePush();
    setBusy(false);
    if (r === 'off') { setSt('off'); setMsg({ kind: 'ok', text: 'বন্ধ হয়েছে। খবর শুধু অ্যাপের 🔔 ঘণ্টায় দেখবেন।' }); }
    else setMsg({ kind: 'bad', text: 'বন্ধ করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।' });
  };
  const later = async () => { await notNow(); setSt('off'); };

  if (mode === 'home') {
    return (
      <View style={p.card}>
        <Text style={p.h}>🔔 জরুরি খবর ফোনে পান</Text>
        <Text style={p.t}>চুক্তি, টাকা জমার খবর আর Travel Adda-র জরুরি নোটিশ অ্যাপ বন্ধ থাকলেও ফোনে আসবে।</Text>
        {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
        <Button title="চালু করুন" icon="🔔" onPress={on} loading={busy} />
        <Pressable onPress={later} style={p.skip} accessibilityRole="button" accessibilityLabel="এখন না। পরে 🔔 পাতা থেকে চালু করা যাবে">
          <Text style={p.skipT}>এখন না</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[p.card, p.flat]}>
      <View style={p.row}>
        <Text style={p.ic} importantForAccessibility="no">{st === 'on' ? '📲' : '🔕'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={p.lbl}>ফোনে নোটিফিকেশন</Text>
          <Text style={p.state}>{st === 'on' ? '✅ চালু আছে' : st === 'denied' ? '⛔ ফোনের সেটিংসে বন্ধ' : st === 'unavailable' ? 'এই ফোনে সম্ভব নয়' : '⭕ বন্ধ আছে'}</Text>
        </View>
        {busy ? <ActivityIndicator color={C.primary} /> : null}
      </View>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {st === 'on' ? <Button title="ফোনে নোটিফিকেশন বন্ধ করুন" kind="secondary" onPress={off} disabled={busy} /> : null}
      {st === 'off' || st === 'unset' ? <Button title="ফোনে নোটিফিকেশন চালু করুন" icon="🔔" onPress={on} loading={busy} /> : null}
      {st === 'denied' ? (
        <>
          <Text style={p.t}>ফোনের সেটিংসে Travel Adda-র নোটিফিকেশন বন্ধ করা আছে। সেটিংস খুলে "Notifications" বা "বিজ্ঞপ্তি" চালু করুন, তারপর এখানে ফিরে আসুন।</Text>
          <Button title="ফোনের সেটিংস খুলুন" icon="⚙️" kind="secondary" onPress={openPhoneSettings} />
          <Button title="আবার দেখুন" icon="🔄" kind="secondary" onPress={on} loading={busy} style={{ marginTop: S.sm }} />
        </>
      ) : null}
    </View>
  );
}

const p = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: R.lg, borderWidth: 2, borderColor: C.gold, padding: S.md, marginBottom: S.md },
  flat: { borderColor: C.line, borderWidth: 1 },
  h: { fontSize: F.large, fontWeight: '700', color: C.primary, marginBottom: S.xs },
  t: { fontSize: F.body, color: C.text, lineHeight: F.body * 1.5, marginBottom: S.sm },
  skip: { minHeight: TOUCH, alignItems: 'center', justifyContent: 'center', marginTop: S.xs },
  skipT: { fontSize: F.body, color: C.primary, fontWeight: '700', textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.sm },
  ic: { fontSize: 28 },
  lbl: { fontSize: F.small, color: C.muted, fontWeight: '700' },
  state: { fontSize: F.body, color: C.text, fontWeight: '700' },
});
