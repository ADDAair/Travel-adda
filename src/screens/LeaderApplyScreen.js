import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { applyLeader, notReady } from '../lib/groups';
import { DocCamera } from './DocsScreen';
import { st, errText } from './GroupScreen';

// A haji asks to become a verified group leader. The admin checks the agency and licence by hand before approving.
export default function LeaderApplyScreen({ navigation }) {
  const [agency, setAgency] = useState('');
  const [license, setLicense] = useState('');
  const [file, setFile] = useState(null);        // { uri, kind, name }
  const [cam, setCam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);

  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets || !r.assets[0]) return;
      const a = r.assets[0];
      const pdf = a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.name || '');
      if (pdf && a.size && a.size > 5 * 1024 * 1024) { setMsg({ kind: 'bad', text: 'ফাইলটি ৫ এমবির বেশি বড়। ছোট ফাইল দিন বা ক্যামেরায় ছবি তুলুন।' }); return; }
      setFile({ uri: a.uri, kind: pdf ? 'pdf' : 'image', name: a.name || 'ফাইল' });
    } catch (e) { setMsg({ kind: 'bad', text: 'ফাইল খোলা যায়নি। আবার চেষ্টা করুন।' }); }
  };

  const submit = async () => {
    if (busy) return;
    const e = {};
    if (agency.trim().length < 2) e.agency = 'এজেন্সির নাম লিখুন।';
    if (license.trim().length < 1) e.license = 'লাইসেন্স নম্বর লিখুন।';
    setErr(e); setMsg(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await applyLeader({ agency, license, file }); setDone(true); }
    catch (x) {
      const m = String((x && x.message) || '');
      if (notReady(x)) setMsg({ kind: 'info', text: 'লিডার আবেদন শীঘ্রই চালু হবে।' });
      else if (x && x.code === 'too-big') setMsg({ kind: 'bad', text: 'ছবি বা ফাইলটি ৫ এমবির বেশি বড়।' });
      else if (x && x.code === '23505') setMsg({ kind: 'info', text: 'আপনার একটি আবেদন আগে থেকেই যাচাই হচ্ছে।' });
      else if ((x && x.code === '42501') || /row-level security|not allowed/i.test(m)) setMsg({ kind: 'info', text: 'আপনি এখন আবেদন করতে পারবেন না (হয়তো আগেই লিডার হয়েছেন)।' });
      else setMsg({ kind: 'bad', text: errText(x) });   // typed text stays in the form
    } finally { setBusy(false); }
  };

  if (cam) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setCam(false)}>
        <SafeAreaProvider><DocCamera onCancel={() => setCam(false)} onUse={(uri) => { setCam(false); setFile({ uri, kind: 'image', name: 'ক্যামেরার ছবি' }); }} /></SafeAreaProvider>
      </Modal>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Group')} style={st.back} accessibilityRole="button" accessibilityLabel="আমার দল পাতায় ফিরে যান"><Text style={st.backT}>‹ আমার দল</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">📝 লিডার হতে আবেদন</Text>
      {done ? (
        <>
          <Notice kind="ok" title="আবেদন জমা হয়েছে" text="অ্যাডমিন আপনার এজেন্সি ও লাইসেন্স যাচাই করবেন। অনুমোদন হলে 'আমার দল' পাতায় 'লিডার প্যানেল' বাটন দেখবেন।" />
          <Button title="আমার দল পাতায় যান" icon="👥" onPress={() => navigation.navigate('Group')} />
        </>
      ) : (
        <>
          <Text style={[st.p, { marginBottom: S.md }]}>শুধু হজ বা ওমরাহ এজেন্সির লিডাররা আবেদন করুন। হাজীরা লিডারের নাম দেখে ভরসা করবেন, তাই সঠিক তথ্য দিন।</Text>
          {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
          <Field label="এজেন্সির নাম" value={agency} onChangeText={setAgency} maxLength={120} error={err.agency} />
          <Field label="এজেন্সির লাইসেন্স নম্বর" hint="ধর্ম মন্ত্রণালয়ের হজ লাইসেন্স নম্বর" value={license} onChangeText={setLicense} maxLength={40} error={err.license} autoCapitalize="characters" />
          <View style={st.card}>
            <Text style={st.h}>লাইসেন্সের কাগজ (ইচ্ছা করলে)</Text>
            <Text style={st.small}>কাগজ দিলে যাচাই দ্রুত হয়। শুধু অ্যাডমিন দেখতে পারবেন।</Text>
            {file ? (
              <>
                <Notice kind="ok" title={`যুক্ত হয়েছে: ${file.kind === 'pdf' ? '📕 ' : '🖼️ '}${file.name}`} />
                <Button title="কাগজটি সরিয়ে দিন" kind="danger" onPress={() => setFile(null)} disabled={busy} />
              </>
            ) : (
              <>
                <Button title="ক্যামেরায় ছবি তুলুন" icon="📷" kind="secondary" onPress={() => setCam(true)} disabled={busy} />
                <Button title="ফোন থেকে ফাইল বাছুন" icon="📁" kind="secondary" onPress={pick} disabled={busy} style={{ marginTop: S.sm }} />
              </>
            )}
          </View>
          <Button title="আবেদন জমা দিন" icon="📨" onPress={submit} loading={busy} />
        </>
      )}
    </ScrollView>
  );
}
