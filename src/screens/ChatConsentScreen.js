import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Notice } from '../components/ui';
import { myChatConsents, respondConsent, revokeConsent } from '../lib/chatConsent';
import { st, fmtDay, confirm } from './GroupScreen';

// Haji: Travel Adda asks to read the questions & answers with a leader, to settle a dispute.
// Nobody reads anything unless the haji agrees here; the permission ends after 7 days or when taken back.
export default function ChatConsentScreen({ navigation }) {
  const [rows, setRows] = useState(undefined);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    setErr(false);
    try { setRows(await myChatConsents()); } catch (e) { setRows([]); setErr(true); }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const act = async (k, fn, okText) => {
    if (busy) return;
    setBusy(k.id); setMsg(null);
    try { await fn(); setMsg({ kind: 'ok', text: okText }); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: e.code === 'not_found' ? 'এই অনুরোধটি আর নেই।' : 'কাজটি হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।' }); }
    setBusy(null);
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.navigate('MyLeader')} style={st.back} accessibilityRole="button" accessibilityLabel="লিডার ও চুক্তি পাতায় ফিরে যান">
        <Text style={st.backT}>‹ লিডার ও চুক্তি</Text>
      </Pressable>
      <Text style={st.title} accessibilityRole="header">🔐 প্রশ্ন-উত্তর দেখার অনুমতি</Text>
      <Text style={st.p}>লিডারের সাথে কোনো বিরোধ হলে, তা মেটাতে Travel Adda আপনার আর লিডারের প্রশ্ন-উত্তর দেখতে চাইতে পারে। আপনি রাজি না হলে কেউ তা দেখবে না।</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === undefined ? <ActivityIndicator color={C.primary} /> : null}
      {err ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে পাতাটি আবার খুলুন।" /> : null}
      {rows && !rows.length && !err ? <Notice kind="ok" title="এখন কোনো অনুরোধ নেই" /> : null}
      {(rows || []).map((k) => (
        <View key={k.id} style={st.card}>
          <Text style={st.val}>চুক্তি {k.contract_no} · লিডার {k.leader_name}</Text>
          <Text style={st.p}>কারণ: {k.reason}</Text>
          {k.status === 'asked' ? (
            <View>
              <Text style={st.p}>রাজি হলে Travel Adda ৭ দিন পর্যন্ত শুধু এই লিডারের সাথে আপনার প্রশ্ন-উত্তর পড়তে পারবে। যেকোনো সময় অনুমতি ফিরিয়ে নিতে পারবেন।</Text>
              <Button title="রাজি, দেখতে দিন" icon="✅" loading={busy === k.id} onPress={() => act(k, () => respondConsent(k.id, true), 'অনুমতি দেওয়া হয়েছে। ৭ দিন পর নিজে থেকেই বন্ধ হবে।')} style={{ marginBottom: S.sm }} />
              <Button title="রাজি নই" icon="✖️" kind="secondary" disabled={busy === k.id} onPress={() => act(k, () => respondConsent(k.id, false), 'আপনি রাজি হননি। কেউ আপনার প্রশ্ন-উত্তর দেখবে না।')} />
            </View>
          ) : (
            <View>
              <Text style={[st.p, { color: C.ok, fontWeight: '700' }]}>✅ আপনি অনুমতি দিয়েছেন — {fmtDay(k.expires_at)} পর্যন্ত</Text>
              <Button title="অনুমতি ফিরিয়ে নিন" icon="↩️" kind="danger" loading={busy === k.id}
                onPress={() => confirm('অনুমতি ফিরিয়ে নেবেন?', 'এরপর Travel Adda আর আপনার প্রশ্ন-উত্তর দেখতে পারবে না।', 'ফিরিয়ে নিন',
                  () => act(k, () => revokeConsent(k.id), 'অনুমতি ফিরিয়ে নেওয়া হয়েছে।'))} />
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
