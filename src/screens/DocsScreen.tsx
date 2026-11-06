import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Modal, ActivityIndicator, Alert, Linking, BackHandler, Platform } from 'react-native';
import ScrollView from '../components/KbScroll';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { toBn } from '../lib/phone';
import { tr, monthName } from '../lib/lang';
import { DOC_TYPES, typeOf, uploadDoc, listDocs, openDoc, deleteDoc, docIsPdf, setDocExpiry } from '../lib/docs';
import { scheduleDocReminders } from '../lib/docReminders';
import { lockWanted, unlock } from '../lib/applock';
import { parseDate, daysUntil, ymdToInput } from '../lib/dates';
import type { ScrollRef } from '../components/KbScroll';
import type { Msg, Nav, Route } from './navTypes';
import type { DocRow } from '../lib/docs';
type Picked = { uri: string; kind: 'image' | 'pdf' };

const fmtDay = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${toBn(d.getDate())} ${monthName(d.getMonth())} ${toBn(d.getFullYear())}`; };
const errText = (err: unknown) => {
  const e = (err || {}) as { message?: string; code?: string };
  const m = String(e.message || '').toLowerCase();
  if (e.code === 'too-big') return tr('ফাইলটি ৫ MB-এর বেশি বড়। ছোট ফাইল বাছুন বা ক্যামেরায় ছবি তুলুন।', 'The file is bigger than 5 MB. Choose a smaller file or take a photo with the camera.');
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) return tr('ইন্টারনেট সংযোগ নেই বা দুর্বল। সংযোগ দেখে আবার চেষ্টা করুন।', 'No internet or a weak connection. Check the connection and try again.');
  return tr('কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।', 'That did not work. Try again a little later.');
};

// Optional lock (set in "আমার তথ্য"): the phone's fingerprint / face / PIN must open this page each time.
export default function DocsScreen(props: { navigation: Nav; route?: Route }) {
  const { navigation } = props;
  const [lock, setLock] = useState('check');           // check | locked | open
  const tryOpen = useCallback(async () => { if (await unlock()) setLock('open'); else setLock('locked'); }, []);
  const check = useCallback(async () => { if (await lockWanted()) { setLock('locked'); tryOpen(); } else setLock('open'); }, [tryOpen]);
  useEffect(() => { check(); }, [check]);
  useEffect(() => navigation?.addListener?.('blur', () => setLock('check')), [navigation]);
  useEffect(() => navigation?.addListener?.('focus', () => check()), [navigation, check]);
  if (lock === 'open') return <DocsInner {...props} />;
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.md }}>
      {lock === 'check' ? <ActivityIndicator color={C.primary} /> : (
        <Notice kind="info" title={tr('🔒 কাগজপত্র তালা দেওয়া', '🔒 Documents are locked')} text={tr('আপনার পাসপোর্ট-ভিসার ছবি নিরাপদ রাখতে এই পাতা খুলতে ফোনের আঙুলের ছাপ বা পিন লাগে।', 'To keep your passport and visa photos safe, this page needs the phone\'s fingerprint or PIN.')}>
          <Button title={tr('খুলুন', 'Open')} icon="🔓" onPress={tryOpen} style={{ marginTop: S.sm }} />
          <Button title={tr('হোমে ফিরে যান', 'Back to Home')} kind="secondary" onPress={() => navigation.navigate('Home')} style={{ marginTop: S.sm }} />
        </Notice>
      )}
    </ScrollView>
  );
}

function DocsInner({ navigation }: { navigation: Nav }) {
  const [rows, setRows] = useState<DocRow[] | null>(null);          // null = loading
  const [offline, setOffline] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [step, setStep] = useState('list');        // list | type | source
  const [type, setType] = useState<string | null>(null);
  const [cam, setCam] = useState(false);
  const [pending, setPending] = useState<Picked | null>(null);    // picked file kept for retry
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);            // { kind, text }
  const [viewing, setViewing] = useState<DocRow | null>(null);    // row
  const scrollRef = useRef<ScrollRef | null>(null);

  const load = useCallback(async () => {
    setLoadErr('');
    try { const r = await listDocs(); setRows(r.rows); setOffline(r.offline); if (!r.offline) scheduleDocReminders(r.rows); }
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

  const upload = async (file: { uri: string; kind: 'image' | 'pdf' }) => {
    if (busy || !type) return;
    setPending(file); setBusy(true); setMsg(null);
    try {
      await uploadDoc(type, file);
      setPending(null); setStep('list');
      setMsg({ kind: 'ok', text: tr(`${typeOf(type).label} সংরক্ষণ হয়েছে।`, `${typeOf(type).label} saved.`) });
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
    } catch (e) { setMsg({ kind: 'bad', text: tr('ফাইল খোলা যায়নি। আবার চেষ্টা করুন।', 'Could not open the file. Try again.') }); }
  };

  const doDelete = async (row: DocRow) => {
    setBusy(true); setMsg(null);
    try { await deleteDoc(row); setViewing(null); setMsg({ kind: 'ok', text: tr('মুছে ফেলা হয়েছে।', 'Deleted.') }); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: tr(`মুছে ফেলা যায়নি। ${errText(e)}`, `Could not delete. ${errText(e)}`) }); }
    finally { setBusy(false); top(); }
  };
  const askDelete = (row: DocRow) => {
    const title = tr(`${typeOf(row.doc_type).label} মুছে ফেলবেন?`, `Delete ${typeOf(row.doc_type).label}?`);
    const g = globalThis as unknown as { confirm?: (t: string) => boolean };
    if (Platform.OS === 'web') { if (g.confirm && g.confirm(title)) doDelete(row); return; }   // web preview (tests) only
    Alert.alert(title, tr('এটা আর ফেরানো যাবে না।', 'This cannot be undone.'), [
      { text: tr('না, রাখুন', 'No, keep it'), style: 'cancel' },
      { text: tr('হ্যাঁ, মুছুন', 'Yes, delete'), style: 'destructive', onPress: () => doDelete(row) },
    ]);
  };

  const grouped = DOC_TYPES.map((t) => ({ t, items: (rows || []).filter((r) => r.doc_type === t.id) })).filter((g) => g.items.length);

  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {step === 'list' ? (
        <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}>
          <Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => !busy && setStep(step === 'source' ? 'type' : 'list')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('পেছনে যান', 'Go back')}>
          <Text style={st.backT}>{tr('‹ পেছনে', '‹ Back')}</Text>
        </Pressable>
      )}
      {msg ? <Notice kind={msg.kind} title={msg.text}>
        {msg.kind === 'bad' && pending && !busy ? <Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={() => upload(pending)} style={{ marginTop: S.sm }} /> : null}
      </Notice> : null}
      {busy ? <View style={st.busy}><ActivityIndicator color={C.primary} size="large" /><Text style={st.p}>{tr('অপেক্ষা করুন, কাজ চলছে…', 'Please wait, working…')}</Text></View> : null}

      {step === 'type' && !busy ? (
        <>
          <Text style={st.title} accessibilityRole="header">{tr('কোন কাগজ যোগ করবেন?', 'Which document will you add?')}</Text>
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
          <Text style={st.title} accessibilityRole="header">{typeOf(type || '').icon} {tr(`${typeOf(type || '').label}: কীভাবে যোগ করবেন?`, `${typeOf(type || '').label}: how will you add it?`)}</Text>
          <Button title={tr('ক্যামেরায় ছবি তুলুন', 'Take a photo with the camera')} icon="📷" onPress={() => { setMsg(null); setCam(true); }} a11yHint={tr('কাগজটি টেবিলে রেখে ওপর থেকে ছবি তুলুন', 'Put the document on a table and take the photo from above')} />
          <Text style={st.small}>{tr('কাগজটি সমান জায়গায় রেখে, ভালো আলোতে ওপর থেকে ছবি তুলুন। পুরো কাগজ যেন ফ্রেমে থাকে।', 'Put the document on a flat place and take the photo from above in good light. Keep the whole document in the frame.')}</Text>
          <Button title={tr('ফোন থেকে ছবি বা PDF বেছে নিন', 'Choose a photo or PDF from the phone')} icon="📁" kind="secondary" onPress={pickFile} style={{ marginTop: S.md }} />
          <Text style={st.small}>{tr('এজেন্সি যে ছবি বা PDF পাঠিয়েছে, সেটাও রাখতে পারেন। সর্বোচ্চ ৫ MB।', 'You can also keep a photo or PDF sent by the agency. Up to 5 MB.')}</Text>
        </>
      ) : null}

      {step === 'list' ? (
        <>
          <Text style={st.title} accessibilityRole="header">{tr('📄 আমার কাগজপত্র', '📄 My documents')}</Text>
          <Text style={st.p}>{tr('পাসপোর্ট, ভিসা, টিকেটের ছবি বা PDF এখানে রাখুন। শুধু আপনি দেখতে পারবেন।', 'Keep photos or PDFs of your passport, visa and ticket here. Only you can see them.')}</Text>
          <Text style={st.small}>{tr('📶 যে ছবি একবার খুলেছেন, সেটা ইন্টারনেট ছাড়াও খুলবে। তবু আসল কাগজ সবসময় সাথে রাখুন।', '📶 A photo you have opened once also opens without internet. Still, always carry the real documents.')}</Text>
          {!busy ? <Button title={tr('নতুন কাগজ যোগ করুন', 'Add a new document')} icon="➕" onPress={() => { setMsg(null); setStep('type'); }} style={{ marginVertical: S.md }} /> : null}
          {offline ? <Notice kind="warn" title={tr('ইন্টারনেট নেই', 'No internet')} text={tr('আগের তালিকা দেখানো হচ্ছে। যে ছবি আগে খুলেছেন, সেগুলো খুলবে।', 'Showing the earlier list. Photos you opened before will open.')} /> : null}
          {loadErr && !offline ? <Notice kind="bad" title={loadErr}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
          {rows === null ? <ActivityIndicator color={C.primary} style={{ marginTop: S.lg }} /> : null}
          {rows && rows.length === 0 && !loadErr ? <Notice kind="info" title={tr('এখনো কোনো কাগজ রাখা হয়নি', 'No documents kept yet')} text={tr('ওপরের বাটন চেপে প্রথমে পাসপোর্টের ছবি যোগ করুন।', 'Tap the button above and add your passport photo first.')} /> : null}
          {grouped.map((g) => (
            <View key={g.t.id}>
              <Text style={st.group}>{g.t.icon} {g.t.label}</Text>
              {g.items.map((r, i) => (
                <React.Fragment key={r.id}>
                <View style={st.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.rowT}>{g.t.label}{g.items.length > 1 ? ` ${toBn(g.items.length - i)}` : ''}</Text>
                    <Text style={st.rowW}>{docIsPdf(r) ? 'PDF' : tr('ছবি', 'Photo')} · {tr('যোগ করা', 'added')}: {fmtDay(r.created_at)}</Text>
                  </View>
                  <Pressable onPress={() => setViewing(r)} style={st.rowBtn} accessibilityRole="button" accessibilityLabel={tr(`${g.t.label} দেখুন`, `See ${g.t.label}`)}>
                    <Text style={st.rowBtnT}>{tr('দেখুন', 'See')}</Text>
                  </Pressable>
                  <Pressable onPress={() => askDelete(r)} disabled={busy} style={[st.rowBtn, st.rowDel]} accessibilityRole="button" accessibilityLabel={tr(`${g.t.label} মুছুন`, `Delete ${g.t.label}`)}>
                    <Text style={[st.rowBtnT, { color: C.bad }]}>{tr('মুছুন', 'Delete')}</Text>
                  </Pressable>
                </View>
                {['passport', 'visa'].includes(r.doc_type) && 'expires_on' in r ? <Expiry row={r} onSaved={(nr: DocRow, note: string) => { setRows((x) => (x || []).map((y) => (y.id === nr.id ? nr : y))); setMsg({ kind: 'ok', text: note }); }} /> : null}
                </React.Fragment>
              ))}
            </View>
          ))}
          <Text style={st.small}>{tr('🔒 কাগজগুলো প্রাইভেট জায়গায় থাকে। লগআউট করলে এই ফোনে রাখা কপিগুলো মুছে যায়।', '🔒 The documents are kept in a private place. Logging out removes the copies on this phone.')}</Text>
        </>
      ) : null}

      <Modal visible={cam} animationType="slide" onRequestClose={() => setCam(false)}>
        <SafeAreaProvider><DocCamera onCancel={() => setCam(false)} onUse={(uri: string) => { setCam(false); upload({ uri, kind: 'image' }); }} /></SafeAreaProvider>
      </Modal>
      <Modal visible={!!viewing} animationType="fade" onRequestClose={() => setViewing(null)}>
        <SafeAreaProvider>{viewing ? <Viewer row={viewing} onClose={() => setViewing(null)} onDelete={() => askDelete(viewing)} /> : null}</SafeAreaProvider>
      </Modal>
    </ScrollView>
  );
}

// Expiry date of a passport / visa, with a warning and phone reminders.
function Expiry({ row, onSaved }: { row: DocRow; onSaved: (nr: DocRow, note: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(ymdToInput(row.expires_on));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const left = row.expires_on ? daysUntil(row.expires_on) : null;
  const save = async (clear?: boolean) => {
    if (busy) return;
    const ymd = clear ? null : parseDate(val, 2000);
    if (!clear && !ymd) { setErr(tr('তারিখ এভাবে লিখুন: ২০-০৫-২০৩০', 'Write the date like this: 20-05-2030')); return; }
    setBusy(true); setErr('');
    try {
      const nr = await setDocExpiry(row, ymd);
      const all = await listDocs().catch(() => null);
      const res = await scheduleDocReminders(all ? all.rows : [nr], { ask: !clear });
      setEdit(false);
      onSaved(nr, clear ? tr('মেয়াদের তারিখ সরানো হয়েছে।', 'Expiry date removed.') : res.ok ? tr('মেয়াদের তারিখ সংরক্ষণ হয়েছে। মেয়াদ শেষের আগে ফোনে মনে করিয়ে দেওয়া হবে।', 'Expiry date saved. The phone will remind you before it expires.') : tr('মেয়াদের তারিখ সংরক্ষণ হয়েছে। নোটিফিকেশনের অনুমতি না থাকায় ফোনে মনে করানো যাবে না।', 'Expiry date saved. Without notification permission the phone cannot remind you.'));
    } catch (e) { setErr(errText(e)); }   // the typed date stays
    finally { setBusy(false); }
  };
  let warn = null;
  if (left !== null && left < 0) warn = <Notice kind="bad" title={tr('মেয়াদ শেষ হয়ে গেছে', 'It has expired')} text={tr('নতুন করে করতে হবে। এজেন্সি বা পাসপোর্ট অফিসে যোগাযোগ করুন।', 'It must be renewed. Contact the agency or passport office.')} />;
  else if (left !== null && row.doc_type === 'passport' && left < 183) warn = <Notice kind="warn" title={tr('পাসপোর্টের মেয়াদ ৬ মাসের কম', 'Passport valid for less than 6 months')} text={tr('সৌদি ভিসার জন্য সাধারণত পাসপোর্টের মেয়াদ অন্তত ৬ মাস থাকতে হয়। আগেই নবায়ন করুন।', 'A Saudi visa usually needs at least 6 months of passport validity. Renew it early.')} />;
  return (
    <View style={st.exp}>
      {row.expires_on ? <Text style={st.rowW}>⏳ {tr('মেয়াদ শেষ', 'Expires')}: {ymdToInput(row.expires_on)}{left !== null && left >= 0 ? tr(` (আর ${toBn(left)} দিন)`, ` (${left} days left)`) : ''}</Text> : <Text style={st.rowW}>{tr('মেয়াদের তারিখ লিখলে শেষ হওয়ার আগে ফোনে মনে করিয়ে দেবে।', 'Write the expiry date and the phone will remind you before it ends.')}</Text>}
      {warn}
      {edit ? (
        <>
          <Field label={tr('মেয়াদ শেষের তারিখ', 'Expiry date')} hint={tr('দিন-মাস-বছর, যেমন: ২০-০৫-২০৩০', 'day-month-year, e.g. 20-05-2030')} value={val} onChangeText={setVal} maxLength={10} error={err} />
          <Button title={tr('তারিখ সংরক্ষণ করুন', 'Save the date')} icon="💾" onPress={() => save(false)} loading={busy} />
          {row.expires_on ? <Button title={tr('তারিখ সরিয়ে দিন', 'Remove the date')} kind="danger" onPress={() => save(true)} disabled={busy} style={{ marginTop: S.xs }} /> : null}
          <Button title={tr('বাতিল', 'Cancel')} kind="secondary" onPress={() => { setEdit(false); setErr(''); }} disabled={busy} style={{ marginTop: S.xs }} />
        </>
      ) : (
        <Pressable onPress={() => setEdit(true)} style={st.expBtn} accessibilityRole="button" accessibilityLabel={tr(`${typeOf(row.doc_type).label}-এর মেয়াদের তারিখ ${row.expires_on ? 'বদলান' : 'লিখুন'}`, `${row.expires_on ? 'Change' : 'Write'} the expiry date of ${typeOf(row.doc_type).label}`)}>
          <Text style={st.rowBtnT}>📅 {row.expires_on ? tr('মেয়াদের তারিখ বদলান', 'Change the expiry date') : tr('মেয়াদের তারিখ লিখুন', 'Write the expiry date')}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function DocCamera({ onCancel, onUse }: { onCancel: () => void; onUse: (uri: string) => void }) {
  const ins = useSafeAreaInsets();
  const [perm, requestPerm] = useCameraPermissions();
  const camRef = useRef<CameraView | null>(null);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const snap = async () => {
    if (!ready || taking || !camRef.current) return;
    setTaking(true); setErr('');
    try { const p = await camRef.current.takePictureAsync({ quality: 0.8 }); if (!p || !p.uri) throw new Error('no'); setUri(p.uri); }
    catch (e) { setErr(tr('ছবি তোলা যায়নি। আবার চেষ্টা করুন।', 'The photo could not be taken. Try again.')); }
    finally { setTaking(false); }
  };
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, paddingTop: ins.top + S.md, paddingBottom: ins.bottom + S.lg }}>
      {!perm ? <ActivityIndicator color={C.primary} /> : !perm.granted ? (
        <>
          <Text style={st.title}>{tr('ক্যামেরার অনুমতি দরকার', 'Camera permission needed')}</Text>
          {perm.canAskAgain === false ? (
            <>
              <Notice kind="warn" title={tr('ক্যামেরার অনুমতি বন্ধ করা আছে', 'Camera permission is off')} text={tr('ফোনের সেটিংসে গিয়ে এই অ্যাপের ক্যামেরা চালু করুন।', 'Turn on the camera for this app in the phone settings.')} />
              <Button title={tr('ফোনের সেটিংস খুলুন', 'Open phone settings')} icon="⚙️" onPress={() => Linking.openSettings().catch(() => {})} />
            </>
          ) : <Button title={tr('ক্যামেরা চালু করুন', 'Turn on the camera')} icon="📷" onPress={requestPerm} />}
        </>
      ) : !uri ? (
        <>
          <Text style={st.title}>{tr('কাগজটি ফ্রেমের ভেতরে রাখুন', 'Keep the document inside the frame')}</Text>
          <View style={st.camBox}>
            <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} onMountError={() => setErr(tr('ক্যামেরা চালু হয়নি।', 'The camera did not start.'))} />
            <View style={st.frame} pointerEvents="none" />
          </View>
          {err ? <Notice kind="bad" title={err} /> : null}
          <Button title={taking ? tr('ছবি তোলা হচ্ছে…', 'Taking the photo…') : ready ? tr('ছবি তুলুন', 'Take photo') : tr('ক্যামেরা তৈরি হচ্ছে…', 'Getting the camera ready…')} icon="📸" onPress={snap} loading={taking} disabled={!ready} />
        </>
      ) : (
        <>
          <Text style={st.title}>{tr('লেখা পরিষ্কার পড়া যাচ্ছে?', 'Can the writing be read clearly?')}</Text>
          <View style={st.camBox}><Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel={tr('তোলা ছবি', 'The photo taken')} /></View>
          <Button title={tr('এই ছবি রাখুন', 'Keep this photo')} icon="✅" onPress={() => onUse(uri)} />
          <Button title={tr('আবার তুলুন', 'Take again')} icon="🔄" kind="secondary" onPress={() => setUri(null)} style={{ marginTop: S.sm }} />
        </>
      )}
      <Button title={tr('বাতিল', 'Cancel')} icon="✖️" kind="secondary" onPress={onCancel} style={{ marginTop: S.md }} />
    </ScrollView>
  );
}

function Viewer({ row, onClose, onDelete }: { row: DocRow; onClose: () => void; onDelete: () => void }) {
  const ins = useSafeAreaInsets();
  const [src, setSrc] = useState<{ uri: string; local: boolean } | null>(null);
  const [err, setErr] = useState('');
  const pdf = docIsPdf(row);
  useEffect(() => {
    let alive = true;
    openDoc(row).then((r) => { if (alive) setSrc(r); }).catch((e) => {
      if (alive) setErr(e && e.code === 'offline' ? tr('ইন্টারনেট নেই, আর এই কাগজটি আগে খোলা হয়নি বলে ফোনে কপি নেই। ইন্টারনেট পেলে একবার খুলে রাখুন।', 'No internet, and this document was never opened before, so there is no copy on the phone. Open it once when you have internet.') : tr('খোলা যায়নি। আবার চেষ্টা করুন।', 'Could not open. Try again.'));
    });
    return () => { alive = false; };
  }, [row]);
  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: ins.top, paddingBottom: ins.bottom }}>
      <View style={st.vTop}>
        <Text style={st.vTitle}>{typeOf(row.doc_type).icon} {typeOf(row.doc_type).label}</Text>
        <Pressable onPress={onClose} style={st.vClose} accessibilityRole="button" accessibilityLabel={tr('বন্ধ করুন', 'Close')}><Text style={st.vCloseT}>{tr('✖ বন্ধ', '✖ Close')}</Text></Pressable>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', padding: S.sm }}>
        {err ? <Notice kind="warn" title={err} /> : !src ? <ActivityIndicator color="#fff" size="large" /> : pdf ? (
          <View style={{ padding: S.lg }}>
            <Text style={[st.p, { color: '#fff', textAlign: 'center' }]}>{tr('এটি একটি PDF ফাইল। ফোনের PDF দেখার অ্যাপে খুলবে (ইন্টারনেট লাগবে)।', 'This is a PDF file. It opens in the phone\'s PDF app (needs internet).')}</Text>
            <Button title={tr('PDF খুলুন', 'Open PDF')} icon="📄" kind="gold" onPress={() => Linking.openURL(src.uri).catch(() => setErr(tr('PDF খোলা যায়নি।', 'Could not open the PDF.')))} style={{ marginTop: S.md }} />
          </View>
        ) : <Image source={{ uri: src.uri }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel={tr(`${typeOf(row.doc_type).label}-এর ছবি`, `Photo of ${typeOf(row.doc_type).label}`)} />}
      </View>
      {src && src.local ? <Text style={st.vNote}>{tr('📶 এই কপি ফোনে রাখা আছে, ইন্টারনেট ছাড়াও খুলবে।', '📶 This copy is on the phone and opens without internet.')}</Text> : null}
      <View style={{ padding: S.md }}>
        <Button title={tr('মুছে ফেলুন', 'Delete')} icon="🗑️" kind="danger" onPress={onDelete} />
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
  exp: { marginTop: -S.xs + 2, marginBottom: S.sm, padding: S.sm, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  expBtn: { minHeight: TOUCH, justifyContent: 'center', alignItems: 'center', borderRadius: R.sm, borderWidth: 1.5, borderColor: C.primary, marginTop: S.xs, paddingHorizontal: S.sm },
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
