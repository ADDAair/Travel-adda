import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { toBn } from '../lib/phone';
import { myProfile, adminApplications, reviewApplication, leaderDocUrl, notReady, telBd } from '../lib/groups';
import { st, errText, confirm, fmtDay } from './GroupScreen';

const STATUS = { pending: '⏳ যাচাই বাকি', approved: '✅ অনুমোদিত', rejected: '✖️ বাতিল' };

// Admin only (the database refuses everyone else): check leader applications by hand and approve or reject.
export default function AdminScreen({ navigation }) {
  const [state, setState] = useState('load');
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    try {
      const p = await myProfile();
      if (p.role !== 'admin') { setState('denied'); return; }
      setRows(await adminApplications()); setState('ok');
    } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const pending = rows.filter((r) => r.status === 'pending');
  const done = rows.filter((r) => r.status !== 'pending');
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Group')} style={st.back} accessibilityRole="button" accessibilityLabel="আমার দল পাতায় ফিরে যান"><Text style={st.backT}>‹ আমার দল</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">🛡️ লিডার আবেদন যাচাই</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" /> : null}
      {state === 'denied' ? <Notice kind="warn" title="এই পাতা শুধু অ্যাডমিনের জন্য" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'ok' ? (
        <>
          <Notice kind="info" title="অনুমোদনের আগে যাচাই করুন" text="ধর্ম মন্ত্রণালয়ের হজ এজেন্সির তালিকায় লাইসেন্স নম্বর মিলিয়ে দেখুন, আর আবেদনকারীকে ফোন করে নিশ্চিত হোন।" />
          {pending.length === 0 ? <Notice kind="ok" title="কোনো আবেদন বাকি নেই" /> : null}
          {pending.map((r) => <AppCard key={r.id} r={r} onDone={(t) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t) => setMsg({ kind: 'bad', text: t })} />)}
          {done.length ? <Text style={[st.h, { marginTop: S.md }]}>আগের সিদ্ধান্ত</Text> : null}
          {done.map((r) => (
            <View key={r.id} style={st.card}>
              <Text style={st.val}>{r.full_name} · {r.agency_name}</Text>
              <Text style={st.small}>{STATUS[r.status]} · {fmtDay(r.created_at)}{r.admin_note ? ` · নোট: ${r.admin_note}` : ''}</Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function AppCard({ r, onDone, onFail }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = (approve) => confirm(approve ? `${r.full_name}-কে লিডার হিসেবে অনুমোদন দেবেন?` : 'আবেদনটি বাতিল করবেন?',
    approve ? 'অনুমোদনের পর তিনি দল বানাতে ও হাজীদের নাম, ফোন ও ছবি দেখতে পারবেন।' : 'আবেদনকারী আপনার নোট দেখতে পাবেন।',
    approve ? 'হ্যাঁ, অনুমোদন দিন' : 'হ্যাঁ, বাতিল করুন', async () => {
      setBusy(true);
      try {
        const res = await reviewApplication(r.id, approve, note.trim());
        if (res === 'ok') onDone(approve ? 'অনুমোদন দেওয়া হয়েছে।' : 'আবেদন বাতিল করা হয়েছে।');
        else onDone('এই আবেদনের সিদ্ধান্ত আগেই নেওয়া হয়েছে।');
      } catch (e) { onFail(errText(e)); setBusy(false); }
    });
  const openDoc = async () => {
    try { await Linking.openURL(await leaderDocUrl(r.doc_path)); } catch (e) { onFail('কাগজটি খোলা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।'); }
  };
  return (
    <View style={[st.card, st.invite]}>
      <Text style={st.gName}>{r.full_name}</Text>
      <Text style={st.small}>আইডি: {r.haji_code} · ফোন: {toBn(r.phone)} · {fmtDay(r.created_at)}</Text>
      <View style={st.cRow}><Text style={st.lbl}>এজেন্সি</Text><Text style={st.p}>{r.agency_name}</Text></View>
      <View style={st.cRow}><Text style={st.lbl}>লাইসেন্স নম্বর</Text><Text style={st.p} selectable>{r.license_no}</Text></View>
      <Button title={`ফোন করুন (${toBn(r.phone)})`} icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(r.phone)}`).catch(() => {})} style={{ marginTop: S.sm }} />
      {r.doc_path ? <Button title="জমা দেওয়া কাগজ দেখুন" icon="📄" kind="secondary" onPress={openDoc} style={{ marginTop: S.sm }} /> : <Text style={st.small}>কোনো কাগজ দেননি।</Text>}
      <View style={{ marginTop: S.md }}>
        <Field label="নোট (ইচ্ছা করলে)" hint="যেমন: লাইসেন্স নম্বর মেলেনি" value={note} onChangeText={setNote} maxLength={500} />
      </View>
      <Button title="অনুমোদন দিন" icon="✅" onPress={() => decide(true)} loading={busy} />
      <Button title="বাতিল করুন" kind="danger" onPress={() => decide(false)} disabled={busy} style={{ marginTop: S.sm }} />
    </View>
  );
}
