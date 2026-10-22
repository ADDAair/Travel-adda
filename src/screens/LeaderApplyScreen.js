import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import WorkAreaFields, { areaText } from '../components/WorkAreaFields';
import { applyLeader, myApplication, notReady } from '../lib/groups';
import { useMe } from '../lib/me';
import { getTerms, agreeTerms } from '../lib/market';
import { DocCamera } from './DocsScreen';
import { st, errText, fmtDay } from './GroupScreen';

// Last step of a LEADER account: office details (agency, Umrah and Hajj licence numbers, licence picture)
// and the WORK AREA (district > upazila from lists, union typed) -- not the office address.
// The admin checks them by hand; until then the leader panel stays locked. (Haji accounts never see this.)
export default function LeaderApplyScreen({ navigation }) {
  const { me, refreshMe } = useMe();
  const [app, setApp] = useState(undefined);      // undefined = loading, null = none yet
  const [state, setState] = useState('load');
  const [f, setF] = useState({ agency: '', umrah: '', hajj: '' });
  const [area, setArea] = useState({ district: '', upazila: '', union: '' });
  const [file, setFile] = useState(null);
  const [cam, setCam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState(null);
  const [terms, setTerms] = useState(null);          // leader terms text (null = none written)
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  useEffect(() => { getTerms('leader').then(setTerms).catch(() => {}); }, []);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const load = useCallback(async () => {
    try { setApp(await myApplication()); setState('ok'); if (refreshMe) refreshMe(); }
    catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, [refreshMe]);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

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
    if (f.agency.trim().length < 2) e.agency = 'এজেন্সির নাম লিখুন।';
    if (!f.umrah.trim() && !f.hajj.trim()) e.umrah = 'ওমরাহ বা হজ, অন্তত একটি লাইসেন্স নম্বর লিখুন।';
    if (!area.district) e.district = 'যে জেলায় কাজ করেন, সেটি বাছুন।';
    if (!area.upazila.trim()) e.upazila = 'উপজেলা বাছুন।';
    if (area.union.trim().length < 2) e.union = 'ইউনিয়নের নাম লিখুন।';
    if (!file) e.file = 'লাইসেন্সের ছবি বা PDF দিন।';
    if (terms && !agree) e.agree = 'লিডারদের শর্তাবলি পড়ে টিক দিন।';
    setErr(e); setMsg(null);
    if (Object.keys(e).length) { setMsg({ kind: 'bad', text: 'লাল চিহ্ন দেওয়া ঘরগুলো ঠিক করুন।' }); return; }
    setBusy(true);
    try {
      if (terms) await agreeTerms('leader');           // recorded first: the database refuses an application without it
      await applyLeader({ agency: f.agency, umrah: f.umrah, hajj: f.hajj, district: area.district, upazila: area.upazila, union: area.union, file }); await load(); }
    catch (x) {
      const m = String((x && x.message) || '');
      if (notReady(x)) setMsg({ kind: 'info', text: 'লিডার নিবন্ধন শীঘ্রই চালু হবে।' });
      else if (x && x.code === 'too-big') setMsg({ kind: 'bad', text: 'ছবি বা ফাইলটি ৫ এমবির বেশি বড়।' });
      else if (x && x.code === '23505') { setMsg({ kind: 'info', text: 'আপনার একটি আবেদন আগে থেকেই যাচাই হচ্ছে।' }); load(); }
      else if ((x && x.code === '42501') || /row-level security|not allowed/i.test(m)) setMsg({ kind: 'warn', text: 'এখন জমা দেওয়া যাচ্ছে না। মোবাইল নম্বর যাচাই বাধ্যতামূলক থাকলে আগে "আমার তথ্য" থেকে নম্বর যাচাই করুন।' });
      else setMsg({ kind: 'bad', text: errText(x) });   // what was typed stays in the form
    } finally { setBusy(false); }
  };

  if (cam) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setCam(false)}>
        <SafeAreaProvider><DocCamera onCancel={() => setCam(false)} onUse={(uri) => { setCam(false); setFile({ uri, kind: 'image', name: 'ক্যামেরার ছবি' }); }} /></SafeAreaProvider>
      </Modal>
    );
  }

  const approved = me && me.role === 'leader';
  const pending = app && app.status === 'pending';
  const showForm = state === 'ok' && !approved && !pending && me && me.account_type === 'leader';

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান"><Text style={st.backT}>‹ হোম</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">🧭 লিডার নিবন্ধন</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" text="লিডার নিবন্ধনের শেষ ধাপ চালু হওয়া বাকি আছে।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && me && me.account_type !== 'leader' && !approved ? <Notice kind="info" title="এটি হাজী অ্যাকাউন্ট" text="লিডার হিসেবে কাজ করতে আলাদা লিডার অ্যাকাউন্ট খুলতে হয় (নতুন অ্যাকাউন্ট খোলার সময় 'আমি গ্রুপ লিডার' বাছুন)।" /> : null}
      {approved ? (
        <>
          <Notice kind="ok" title="আপনি অনুমোদিত লিডার" />
          <Button title="লিডার প্যানেল খুলুন" icon="🧭" onPress={() => navigation.navigate('Leader')} />
        </>
      ) : null}
      {pending ? (
        <>
          <Notice kind="info" title="আপনার আবেদন যাচাই হচ্ছে" text={`জমা দিয়েছেন: ${fmtDay(app.created_at)}। অ্যাডমিন লাইসেন্স মিলিয়ে দেখবেন, দরকার হলে ফোন করবেন। অনুমোদন হলে হোমে "লিডার প্যানেল" চালু হবে।`} />
          <View style={st.card}>
            <Text style={st.lbl}>এজেন্সি</Text><Text style={st.p}>{app.agency_name}</Text>
            {app.umrah_license ? <><Text style={st.lbl}>ওমরাহ লাইসেন্স</Text><Text style={st.p}>{app.umrah_license}</Text></> : null}
            {app.hajj_license ? <><Text style={st.lbl}>হজ লাইসেন্স</Text><Text style={st.p}>{app.hajj_license}</Text></> : null}
            {app.district ? <><Text style={st.lbl}>কাজের এলাকা</Text><Text style={st.p}>{areaText(app)}</Text></> : null}
          </View>
          <Button title="আবার দেখুন" icon="🔄" kind="secondary" onPress={load} />
        </>
      ) : null}
      {showForm ? (
        <>
          {app && app.status === 'rejected' ? <Notice kind="warn" title="আগের আবেদন অনুমোদন হয়নি" text={app.admin_note || 'সঠিক তথ্য দিয়ে আবার জমা দিন।'} /> : null}
          <Text style={[st.p, { marginBottom: S.md }]}>হাজীরা লিডারের তালিকায় আপনার এজেন্সি ও লাইসেন্স দেখে ভরসা করবেন, তাই সঠিক তথ্য দিন। আপনার ফোন নম্বর তালিকায় দেখানো হবে না।</Text>
          <Text style={[st.h, { marginBottom: S.sm }]} accessibilityRole="header">🏢 অফিসের তথ্য</Text>
          <Field label="এজেন্সির নাম" value={f.agency} onChangeText={set('agency')} maxLength={120} error={err.agency} />
          <Field label="ওমরাহ লাইসেন্স নম্বর" hint="ধর্ম মন্ত্রণালয়ের ওমরাহ লাইসেন্স" value={f.umrah} onChangeText={set('umrah')} maxLength={40} error={err.umrah} autoCapitalize="characters" />
          <Field label="হজ লাইসেন্স নম্বর" hint="হজ লাইসেন্স থাকলে" value={f.hajj} onChangeText={set('hajj')} maxLength={40} autoCapitalize="characters" />
          <View style={[st.card, err.file ? { borderWidth: 2, borderColor: C.bad } : null]}>
            <Text style={st.h}>লাইসেন্সের ছবি বা PDF</Text>
            <Text style={st.small}>শুধু অ্যাডমিন দেখতে পারবেন।</Text>
            {err.file ? <Text style={[st.small, { color: C.bad }]}>⚠️ {err.file}</Text> : null}
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
          <WorkAreaFields value={area} onChange={setArea} errors={err} />
          {terms ? (
            <View style={[st.card, err.agree && { borderColor: C.bad, borderWidth: 2 }]}>
              <Pressable onPress={() => setAgree(!agree)} style={{ minHeight: 48, justifyContent: 'center' }} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} accessibilityLabel="আমি লিডারদের শর্তাবলি পড়েছি ও মেনে নিচ্ছি">
                <Text style={st.p}>{agree ? '☑️' : '⬜'} আমি লিডারদের শর্তাবলি পড়েছি ও মেনে নিচ্ছি</Text>
              </Pressable>
              <Pressable onPress={() => setShowTerms(true)} style={{ minHeight: 48, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="লিডারদের শর্তাবলি পড়ুন">
                <Text style={[st.p, { color: C.primary, fontWeight: '700', textDecorationLine: 'underline' }]}>📜 লিডারদের শর্তাবলি পড়ুন</Text>
              </Pressable>
              <Text style={st.small}>বিশেষ করে: অ্যাপের হাজীদের কাছ থেকে সরাসরি টাকা নেওয়া যাবে না, সব টাকা Travel Adda-র মাধ্যমে আসবে।</Text>
              {err.agree ? <Text style={[st.p, { color: C.bad, fontWeight: '700' }]}>⚠️ {err.agree}</Text> : null}
            </View>
          ) : null}
          <Button title="নিবন্ধন জমা দিন" icon="📨" onPress={submit} loading={busy} />
          <Modal visible={showTerms} animationType="slide" onRequestClose={() => setShowTerms(false)}>
            <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={[st.wrap, { paddingTop: 48 }]}>
              <Text style={st.title}>📜 লিডারদের শর্তাবলি</Text>
              <Text style={[st.p, { lineHeight: 30 }]} selectable>{terms ? terms.body : ''}</Text>
              <Button title="পড়েছি, মেনে নিচ্ছি" icon="✅" onPress={() => { setShowTerms(false); setAgree(true); }} style={{ marginTop: S.lg }} />
              <Button title="বন্ধ করুন (টিক দেব না)" kind="secondary" onPress={() => setShowTerms(false)} style={{ marginTop: S.sm, marginBottom: S.xl }} />
            </ScrollView>
          </Modal>
        </>
      ) : null}
    </ScrollView>
  );
}
