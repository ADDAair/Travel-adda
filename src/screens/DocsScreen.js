import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Modal, ActivityIndicator, Alert, Linking, BackHandler, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice } from '../components/ui';
import { toBn } from '../lib/phone';
import { DOC_TYPES, typeOf, uploadDoc, listDocs, openDoc, deleteDoc, docIsPdf } from '../lib/docs';

const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const fmtDay = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${toBn(d.getDate())} ${MONTHS[d.getMonth()]} ${toBn(d.getFullYear())}`; };
const errText = (e) => {
  const m = String((e && e.message) || '').toLowerCase();
  if (e && e.code === 'too-big') return 'ফাইলটি ৫ MB-এর বেশি বড়। ছোট ফাইল বাছুন বা ক্যামেরায় ছবি তুলুন।';
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) return 'ইন্টারনেট সংযোগ নেই বা দুর্বল। সংযোগ দেখে আবার চেষ্টা করুন।';
  return 'কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।';
};

export default function DocsScreen({ navigation }) {
  const [rows, setRows] = useState(null);          // null = loading
  const [offline, setOffline] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [step, setStep] = useState('list');        // list | type | source
  const [type, setType] = useState(null);
  const [cam, setCam] = useState(false);
  const [pending, setPending] = useState(null);    // picked file kept for retry
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);            // { kind, text }
  const [viewing, setViewing] = useState(null);    // row
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    setLoadErr('');
    try { const r = await listDocs(); setRows(r.rows); setOffline(r.offline); }
    catch (e) { setRows((x) => x || []); setLoadErr(errText(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => navigation?.addListener?.('blur', () => { if (!busy) { setStep('list'); setMsg(null); } }), [navigation, busy]);
  useEffect(() => {
    if (step === 'list') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (!busy) setStep(step === 'source' ? 'type' : 'list'); return true; });
    return () => sub.remove();
  }, [step, busy]);

  const top = () => requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));

  const upload = async (file) => {
    if (busy || !type) return;
    setPending(file); setBusy(true); setMsg(null);
    try {
      await uploadDoc(type, file);
      setPending(null); setStep('list');
      setMsg({ kind: 'ok', text: `${typeOf(type).label} সংরক্ষণ হয়েছে।` });
      await load();
    } catch (e) {
      setMsg({ kind: 'bad', text: errText(e) });   // the picked file stays, so "আবার চেষ্টা করুন" works without picking again
    } finally {
      setBusy(false); top();
    }
  };

  const pickFile = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets || !r.assets[0]) return;
      const a = r.assets[0];
      const pdf = a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.name || '');
      if (a.size && a.size > 5 * 1024 * 1024 && pdf) { setMsg({ kind: 'bad', text: errText({ code: 'too-big' }) }); return; }
      upload({ uri: a.uri, kind: pdf ? 'pdf' : 'image' });
    } catch (e) { setMsg({ kind: 'bad', text: 'ফাইল খোলা যায়নি। আবার চেষ্টা করুন।' }); }
  };

  const doDelete = async (row) => {
    setBusy(true); setMsg(null);
    try { await deleteDoc(row); setViewing(null); setMsg({ kind: 'ok', text: 'মুছে ফেলা হয়েছে।' }); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: `মুছে ফেলা যায়নি। ${errText(e)}` }); }
    finally { setBusy(false); top(); }
  };
  const askDelete = (row) => {
    const title = `${typeOf(row.doc_type).label} মুছে ফেলবেন?`;
    if (Platform.OS === 'web') { if (global.confirm && global.confirm(title)) doDelete(row); return; }   // web preview (tests) only
    Alert.alert(title, 'এটা আর ফেরানো যাবে না।', [
      { text: 'না, রাখুন', style: 'cancel' },
      { text: 'হ্যাঁ, মুছুন', style: 'destructive', onPress: () => doDelete(row) },
    ]);
  };

  const grouped = DOC_TYPES.map((t) => ({ t, items: (rows || []).filter((r) => r.doc_type === t.id) })).filter((g) => g.items.length);

  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {step === 'list' ? (
        <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান">
          <Text style={st.backT}>‹ হোম</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => !busy && setStep(step === 'source' ? 'type' : 'list')} style={st.back} accessibilityRole="button" accessibilityLabel="পেছনে যান">
          <Text style={st.backT}>‹ পেছনে</Text>
        </Pressable>
      )}
      {msg ? <Notice kind={msg.kind} title={msg.text}>
        {msg.kind === 'bad' && pending && !busy ? <Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={() => upload(pending)} style={{ marginTop: S.sm }} /> : null}
      </Notice> : null}
      {busy ? <View style={st.busy}><ActivityIndicator color={C.primary} size="large" /><Text style={st.p}>অপেক্ষা করুন, কাজ চলছে…</Text></View> : null}

      {step === 'type' && !busy ? (
        <>
          <Text style={st.title} accessibilityRole="header">কোন কাগজ যোগ করবেন?</Text>
          {DOC_TYPES.map((t) => (
            <Pressable key={t.id} onPress={() => { setType(t.id); setMsg(null); setPending(null); setStep('source'); }} style={({ pressed }) => [st.opt, pressed && { opacity: 0.85 }]}
              accessibilityRole="button" accessibilityLabel={t.label}>
              <Text style={st.optIc} importantForAccessibility="no">{t.icon}</Text>
              <Text style={st.optT}>{t.label}</Text>
              <Text style={st.go}>›</Text>
            </Pressable>
          ))}
        </>
      ) : null}

      {step === 'source' && !busy ? (
        <>
          <Text style={st.title} accessibilityRole="header">{typeOf(type).icon} {typeOf(type).label}: কীভাবে যোগ করবেন?</Text>
          <Button title="ক্যামেরায় ছবি তুলুন" icon="📷" onPress={() => { setMsg(null); setCam(true); }} a11yHint="কাগজটি টেবিলে রেখে ওপর থেকে ছবি তুলুন" />
          <Text style={st.small}>কাগজটি সমান জায়গায় রেখে, ভালো আলোতে ওপর থেকে ছবি তুলুন। পুরো কাগজ যেন ফ্রেমে থাকে।</Text>
          <Button title="ফোন থেকে ছবি বা PDF বেছে নিন" icon="📁" kind="secondary" onPress={pickFile} style={{ marginTop: S.md }} />
          <Text style={st.small}>এজেন্সি যে ছবি বা PDF পাঠিয়েছে, সেটাও রাখতে পারেন। সর্বোচ্চ ৫ MB।</Text>
        </>
      ) : null}

      {step === 'list' ? (
        <>
          <Text style={st.title} accessibilityRole="header">📄 আমার কাগজপত্র</Text>
          <Text style={st.p}>পাসপোর্ট, ভিসা, টিকেটের ছবি বা PDF এখানে রাখুন। শুধু আপনি দেখতে পারবেন।</Text>
          <Text style={st.small}>📶 যে ছবি একবার খুলেছেন, সেটা ইন্টারনেট ছাড়াও খুলবে। তবু আসল কাগজ সবসময় সাথে রাখুন।</Text>
          {!busy ? <Button title="নতুন কাগজ যোগ করুন" icon="➕" onPress={() => { setMsg(null); setStep('type'); }} style={{ marginVertical: S.md }} /> : null}
          {offline ? <Notice kind="warn" title="ইন্টারনেট নেই" text="আগের তালিকা দেখানো হচ্ছে। যে ছবি আগে খুলেছেন, সেগুলো খুলবে।" /> : null}
          {loadErr && !offline ? <Notice kind="bad" title={loadErr}><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
          {rows === null ? <ActivityIndicator color={C.primary} style={{ marginTop: S.lg }} /> : null}
          {rows && rows.length === 0 && !loadErr ? <Notice kind="info" title="এখনো কোনো কাগজ রাখা হয়নি" text="ওপরের বাটন চেপে প্রথমে পাসপোর্টের ছবি যোগ করুন।" /> : null}
          {grouped.map((g) => (
            <View key={g.t.id}>
              <Text style={st.group}>{g.t.icon} {g.t.label}</Text>
              {g.items.map((r, i) => (
                <View key={r.id} style={st.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.rowT}>{g.t.label}{g.items.length > 1 ? ` ${toBn(g.items.length - i)}` : ''}</Text>
                    <Text style={st.rowW}>{docIsPdf(r) ? 'PDF' : 'ছবি'} · যোগ করা: {fmtDay(r.created_at)}</Text>
                  </View>
                  <Pressable onPress={() => setViewing(r)} style={st.rowBtn} accessibilityRole="button" accessibilityLabel={`${g.t.label} দেখুন`}>
                    <Text style={st.rowBtnT}>দেখুন</Text>
                  </Pressable>
                  <Pressable onPress={() => askDelete(r)} disabled={busy} style={[st.rowBtn, st.rowDel]} accessibilityRole="button" accessibilityLabel={`${g.t.label} মুছুন`}>
                    <Text style={[st.rowBtnT, { color: C.bad }]}>মুছুন</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
          <Text style={st.small}>🔒 কাগজগুলো প্রাইভেট জায়গায় থাকে। লগআউট করলে এই ফোনে রাখা কপিগুলো মুছে যায়।</Text>
        </>
      ) : null}

      <Modal visible={cam} animationType="slide" onRequestClose={() => setCam(false)}>
        <SafeAreaProvider><DocCamera onCancel={() => setCam(false)} onUse={(uri) => { setCam(false); upload({ uri, kind: 'image' }); }} /></SafeAreaProvider>
      </Modal>
      <Modal visible={!!viewing} animationType="fade" onRequestClose={() => setViewing(null)}>
        <SafeAreaProvider>{viewing ? <Viewer row={viewing} onClose={() => setViewing(null)} onDelete={() => askDelete(viewing)} /> : null}</SafeAreaProvider>
      </Modal>
    </ScrollView>
  );
}

export function DocCamera({ onCancel, onUse }) {
  const ins = useSafeAreaInsets();
  const [perm, requestPerm] = useCameraPermissions();
  const camRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [uri, setUri] = useState(null);
  const [err, setErr] = useState('');
  const snap = async () => {
    if (!ready || taking || !camRef.current) return;
    setTaking(true); setErr('');
    try { const p = await camRef.current.takePictureAsync({ quality: 0.8 }); if (!p || !p.uri) throw new Error('no'); setUri(p.uri); }
    catch (e) { setErr('ছবি তোলা যায়নি। আবার চেষ্টা করুন।'); }
    finally { setTaking(false); }
  };
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, paddingTop: ins.top + S.md, paddingBottom: ins.bottom + S.lg }}>
      {!perm ? <ActivityIndicator color={C.primary} /> : !perm.granted ? (
        <>
          <Text style={st.title}>ক্যামেরার অনুমতি দরকার</Text>
          {perm.canAskAgain === false ? (
            <>
              <Notice kind="warn" title="ক্যামেরার অনুমতি বন্ধ করা আছে" text="ফোনের সেটিংসে গিয়ে এই অ্যাপের ক্যামেরা চালু করুন।" />
              <Button title="ফোনের সেটিংস খুলুন" icon="⚙️" onPress={() => Linking.openSettings().catch(() => {})} />
            </>
          ) : <Button title="ক্যামেরা চালু করুন" icon="📷" onPress={requestPerm} />}
        </>
      ) : !uri ? (
        <>
          <Text style={st.title}>কাগজটি ফ্রেমের ভেতরে রাখুন</Text>
          <View style={st.camBox}>
            <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} onMountError={() => setErr('ক্যামেরা চালু হয়নি।')} />
            <View style={st.frame} pointerEvents="none" />
          </View>
          {err ? <Notice kind="bad" title={err} /> : null}
          <Button title={taking ? 'ছবি তোলা হচ্ছে…' : ready ? 'ছবি তুলুন' : 'ক্যামেরা তৈরি হচ্ছে…'} icon="📸" onPress={snap} loading={taking} disabled={!ready} />
        </>
      ) : (
        <>
          <Text style={st.title}>লেখা পরিষ্কার পড়া যাচ্ছে?</Text>
          <View style={st.camBox}><Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel="তোলা ছবি" /></View>
          <Button title="এই ছবি রাখুন" icon="✅" onPress={() => onUse(uri)} />
          <Button title="আবার তুলুন" icon="🔄" kind="secondary" onPress={() => setUri(null)} style={{ marginTop: S.sm }} />
        </>
      )}
      <Button title="বাতিল" icon="✖️" kind="secondary" onPress={onCancel} style={{ marginTop: S.md }} />
    </ScrollView>
  );
}

function Viewer({ row, onClose, onDelete }) {
  const ins = useSafeAreaInsets();
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState('');
  const pdf = docIsPdf(row);
  useEffect(() => {
    let alive = true;
    openDoc(row).then((r) => { if (alive) setSrc(r); }).catch((e) => {
      if (alive) setErr(e && e.code === 'offline' ? 'ইন্টারনেট নেই, আর এই কাগজটি আগে খোলা হয়নি বলে ফোনে কপি নেই। ইন্টারনেট পেলে একবার খুলে রাখুন।' : 'খোলা যায়নি। আবার চেষ্টা করুন।');
    });
    return () => { alive = false; };
  }, [row]);
  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: ins.top, paddingBottom: ins.bottom }}>
      <View style={st.vTop}>
        <Text style={st.vTitle}>{typeOf(row.doc_type).icon} {typeOf(row.doc_type).label}</Text>
        <Pressable onPress={onClose} style={st.vClose} accessibilityRole="button" accessibilityLabel="বন্ধ করুন"><Text style={st.vCloseT}>✖ বন্ধ</Text></Pressable>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', padding: S.sm }}>
        {err ? <Notice kind="warn" title={err} /> : !src ? <ActivityIndicator color="#fff" size="large" /> : pdf ? (
          <View style={{ padding: S.lg }}>
            <Text style={[st.p, { color: '#fff', textAlign: 'center' }]}>এটি একটি PDF ফাইল। ফোনের PDF দেখার অ্যাপে খুলবে (ইন্টারনেট লাগবে)।</Text>
            <Button title="PDF খুলুন" icon="📄" kind="gold" onPress={() => Linking.openURL(src.uri).catch(() => setErr('PDF খোলা যায়নি।'))} style={{ marginTop: S.md }} />
          </View>
        ) : <Image source={{ uri: src.uri }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel={`${typeOf(row.doc_type).label}-এর ছবি`} />}
      </View>
      {src && src.local ? <Text style={st.vNote}>📶 এই কপি ফোনে রাখা আছে, ইন্টারনেট ছাড়াও খুলবে।</Text> : null}
      <View style={{ padding: S.md }}>
        <Button title="মুছে ফেলুন" icon="🗑️" kind="danger" onPress={onDelete} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 36, marginBottom: S.sm },
  p: { fontSize: F.body, color: C.text, lineHeight: 28 },
  small: { fontSize: F.small, color: C.muted, lineHeight: 24, marginTop: S.xs },
  busy: { alignItems: 'center', gap: S.sm, marginVertical: S.lg },
  opt: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 64, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: S.md, marginBottom: S.sm, ...shadow },
  optIc: { fontSize: 28 },
  optT: { flex: 1, fontSize: F.large, fontWeight: '700', color: C.text, lineHeight: 28 },
  go: { fontSize: F.title, color: C.primary },
  group: { fontSize: F.large, fontWeight: '700', color: C.primary, marginTop: S.md, marginBottom: S.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.sm, paddingLeft: S.md, marginBottom: S.xs, minHeight: 64 },
  rowT: { fontSize: F.body, fontWeight: '700', color: C.text },
  rowW: { fontSize: 14, color: C.muted },
  rowBtn: { minHeight: TOUCH, minWidth: 64, justifyContent: 'center', alignItems: 'center', borderRadius: R.sm, borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: S.sm },
  rowDel: { borderColor: C.bad },
  rowBtnT: { fontSize: F.small, fontWeight: '700', color: C.primary },
  camBox: { width: '100%', aspectRatio: 3 / 4, maxHeight: 480, borderRadius: R.lg, overflow: 'hidden', backgroundColor: '#000', marginBottom: S.md, alignItems: 'center', justifyContent: 'center' },
  frame: { position: 'absolute', width: '86%', height: '80%', borderWidth: 3, borderColor: C.accent, borderRadius: R.sm, borderStyle: 'dashed' },
  vTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.md },
  vTitle: { color: '#fff', fontSize: F.large, fontWeight: '700' },
  vClose: { minHeight: TOUCH, minWidth: TOUCH, justifyContent: 'center', paddingHorizontal: S.sm },
  vCloseT: { color: '#fff', fontSize: F.body, fontWeight: '700' },
  vNote: { color: '#fff', fontSize: F.small, textAlign: 'center', paddingHorizontal: S.md },
});
