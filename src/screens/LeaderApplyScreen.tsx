import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator } from 'react-native';
import { tr } from '../lib/lang';
import ScrollView from '../components/KbScroll';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import WorkAreaFields, { areaText, type Area } from '../components/WorkAreaFields';
import DistrictPicker from '../components/DistrictPicker';
import { applyLeader, myApplication, notReady, leaderKindsReady } from '../lib/groups';
import { LEADER_KINDS, PROFESSIONS, professionName, validateApplication } from '../lib/leaderKinds';
import { useMe } from '../lib/me';
import { getTerms, agreeTerms, type TermsText } from '../lib/market';
import { DocCamera } from './DocsScreen';
import { st, errText, fmtDay } from './GroupScreen';
import type { Msg, Nav } from './navTypes';
import type { Res } from '../lib/types';

type Kind = 'agency' | 'travel_adda';
type PickedFile = { uri: string; kind: 'image' | 'pdf'; name: string };

// Last step of a LEADER account. First the kind of leader:
//  * own agency: office details (agency, Umrah and Hajj licence numbers, licence picture)
//  * Travel Adda's own leader: no office or licence, a picture of the national ID (NID) instead
// then profession (optional) and the WORK AREA (district > upazila from lists, union typed) -- not the office address.
// The admin checks them by hand; until then the leader panel stays locked. (Haji accounts never see this.)
export default function LeaderApplyScreen({ navigation }: { navigation: Nav }): JSX.Element {
  const { me, refreshMe } = useMe();
  const [app, setApp] = useState<Res<typeof myApplication> | undefined>(undefined);      // undefined = loading, null = none yet
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');
  const [kind, setKind] = useState<Kind | null>(null);           // 'agency' | 'travel_adda'
  const [kindsOk, setKindsOk] = useState(true);       // false = database step 017 not run yet
  const [profession, setProfession] = useState('');
  const [f, setF] = useState({ agency: '', umrah: '', hajj: '' });
  const [area, setArea] = useState<Area>({ district: '', upazila: '', union: '' });
  const [file, setFile] = useState<PickedFile | null>(null);
  const [cam, setCam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const [terms, setTerms] = useState<TermsText | null>(null);          // leader terms text (null = none written)
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  useEffect(() => { getTerms('leader').then(setTerms).catch(() => {}); leaderKindsReady().then(setKindsOk).catch(() => {}); }, []);
  const chooseKind = (k: Kind | null) => { if (busy) return; setKind(k); setFile(null); setErr({}); setMsg(null); };
  const set = (k: 'agency' | 'umrah' | 'hajj') => (v: string) => setF((x) => ({ ...x, [k]: v }));

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
      if (pdf && a.size && a.size > 5 * 1024 * 1024) { setMsg({ kind: 'bad', text: tr('ফাইলটি ৫ এমবির বেশি বড়। ছোট ফাইল দিন বা ক্যামেরায় ছবি তুলুন।', 'The file is larger than 5 MB. Choose a smaller file or take a photo with the camera.') }); return; }
      setFile({ uri: a.uri, kind: pdf ? 'pdf' : 'image', name: a.name || tr('ফাইল', 'File') });
    } catch (e) { setMsg({ kind: 'bad', text: tr('ফাইল খোলা যায়নি। আবার চেষ্টা করুন।', 'Could not open the file. Try again.') }); }
  };

  const submit = async () => {
    if (busy) return;
    const e = validateApplication({ kind: kind || '', agency: f.agency, umrah: f.umrah, hajj: f.hajj, area, file, agreed: agree, termsExist: !!terms });
    setErr(e); setMsg(null);
    if (Object.keys(e).length) { setMsg({ kind: 'bad', text: tr('লাল চিহ্ন দেওয়া ঘরগুলো ঠিক করুন।', 'Fix the boxes marked in red.') }); return; }
    setBusy(true);
    try {
      if (terms) await agreeTerms('leader');           // recorded first: the database refuses an application without it
      await applyLeader({ kind: kind || 'agency', agency: f.agency, umrah: f.umrah, hajj: f.hajj, area, profession: kindsOk ? profession : '', file }); await load(); }
    catch (err0) {
      const x = err0 as { code?: string; message?: string } | null;
      const m = String((x && x.message) || '');
      if (notReady(x)) setMsg({ kind: 'info', text: tr('লিডার নিবন্ধন শীঘ্রই চালু হবে।', 'Leader registration is coming soon.') });
      else if (x && x.code === 'kinds-soon') { setKindsOk(false); setMsg({ kind: 'info', text: tr('Travel Adda-র নিজস্ব লিডার হিসেবে নিবন্ধন শীঘ্রই চালু হবে। নিজের এজেন্সি থাকলে সেই ধরনটি বেছে জমা দিতে পারেন।', 'Registration as Travel Adda\'s own leader is coming soon. If you have your own agency, choose that kind and send.') }); }
      else if (x && x.code === 'bad-file') setMsg({ kind: 'bad', text: tr('ফাইলটি আসল ছবি বা PDF নয়। কাগজের ছবি তুলে আবার জমা দিন।', 'The file is not a real picture or PDF. Take a photo of the paper and send again.') });
      else if (x && x.code === 'too-big') setMsg({ kind: 'bad', text: tr('ছবি বা ফাইলটি ৫ এমবির বেশি বড়।', 'The picture or file is larger than 5 MB.') });
      else if (x && x.code === '23505') { setMsg({ kind: 'info', text: tr('আপনার একটি আবেদন আগে থেকেই যাচাই হচ্ছে।', 'An application of yours is already being checked.') }); load(); }
      else if ((x && x.code === '42501') || /row-level security|not allowed/i.test(m)) setMsg({ kind: 'warn', text: tr('এখন জমা দেওয়া যাচ্ছে না। যাচাই বাধ্যতামূলক থাকলে আগে "আমার তথ্য" থেকে মোবাইল নম্বর বা ইমেইল যাচাই করুন।', 'Cannot send now. If verification is required, first verify your mobile number or email from "My info".') });
      else if (x && x.code === '23514' && /reserved/i.test(m)) setErr((o) => ({ ...o, agency: tr('এজেন্সির নামে "Travel Adda" ব্যবহার করা যাবে না।', '"Travel Adda" cannot be used in the agency name.') }));
      else setMsg({ kind: 'bad', text: errText(x) });   // what was typed stays in the form
    } finally { setBusy(false); }
  };

  if (cam) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setCam(false)}>
        <SafeAreaProvider><DocCamera onCancel={() => setCam(false)} onUse={(uri: string) => { setCam(false); setFile({ uri, kind: 'image', name: tr('ক্যামেরার ছবি', 'Camera photo') }); }} /></SafeAreaProvider>
      </Modal>
    );
  }

  const approved = me && me.role === 'leader';
  const pending = app && app.status === 'pending';
  const showForm = state === 'ok' && !approved && !pending && me && me.account_type === 'leader';

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}><Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('🧭 লিডার নিবন্ধন', '🧭 Leader registration')}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই চালু হবে', 'Coming soon')} text={tr('লিডার নিবন্ধনের শেষ ধাপ চালু হওয়া বাকি আছে।', 'The last step of leader registration is still to come.')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('তথ্য আনা যায়নি', 'Could not load the information')} text={tr('ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'Check the internet connection and try again.')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && me && me.account_type !== 'leader' && !approved ? <Notice kind="info" title={tr('এটি হাজী অ্যাকাউন্ট', 'This is a haji account')} text={tr('লিডার হিসেবে কাজ করতে আলাদা লিডার অ্যাকাউন্ট খুলতে হয় (নতুন অ্যাকাউন্ট খোলার সময় \'আমি গ্রুপ লিডার\' বাছুন)।', 'To work as a leader you need a separate leader account (choose \'I am a group leader\' when opening a new account).')} /> : null}
      {approved ? (
        <>
          <Notice kind="ok" title={tr('আপনি অনুমোদিত লিডার', 'You are an approved leader')} />
          <Button title={tr('লিডার প্যানেল খুলুন', 'Open the leader panel')} icon="🧭" onPress={() => navigation.navigate('Leader')} />
        </>
      ) : null}
      {pending && app ? (
        <>
          <Notice kind="info" title={tr('আপনার আবেদন যাচাই হচ্ছে', 'Your application is being checked')} text={tr(`জমা দিয়েছেন: ${fmtDay(app?.created_at)}। অ্যাডমিন ${app?.leader_kind === 'travel_adda' ? 'পরিচয়পত্র' : 'লাইসেন্স'} মিলিয়ে দেখবেন, দরকার হলে ফোন করবেন। অনুমোদন হলে হোমে "লিডার প্যানেল" চালু হবে।`, `Sent: ${fmtDay(app?.created_at)}. The admin will check your ${app?.leader_kind === 'travel_adda' ? 'ID card' : 'licence'} and call you if needed. Once approved, "Leader panel" turns on at Home.`)} />
          <View style={st.card}>
            <Text style={st.lbl}>{tr('লিডারের ধরন', 'Kind of leader')}</Text><Text style={st.p}>{app.leader_kind === 'travel_adda' ? LEADER_KINDS.travel_adda.badge : tr(`🏢 এজেন্সি: ${app.agency_name}`, `🏢 Agency: ${app.agency_name}`)}</Text>
            {app.profession ? <><Text style={st.lbl}>{tr('পেশা', 'Profession')}</Text><Text style={st.p}>{app.profession}</Text></> : null}
            {app.umrah_license ? <><Text style={st.lbl}>{tr('ওমরাহ লাইসেন্স', 'Umrah licence')}</Text><Text style={st.p}>{app.umrah_license}</Text></> : null}
            {app.hajj_license ? <><Text style={st.lbl}>{tr('হজ লাইসেন্স', 'Hajj licence')}</Text><Text style={st.p}>{app.hajj_license}</Text></> : null}
            {app.district ? <><Text style={st.lbl}>{tr('কাজের এলাকা', 'Work area')}</Text><Text style={st.p}>{areaText(app)}</Text></> : null}
          </View>
          <Button title={tr('আবার দেখুন', 'Check again')} icon="🔄" kind="secondary" onPress={load} />
        </>
      ) : null}
      {showForm ? (
        <>
          {app && app.status === 'rejected' ? <Notice kind="warn" title={tr('আগের আবেদন অনুমোদন হয়নি', 'The earlier application was not approved')} text={app.admin_note || tr('সঠিক তথ্য দিয়ে আবার জমা দিন।', 'Send again with correct information.')} /> : null}
          <Text style={[st.p, { marginBottom: S.md }]}>{tr('হাজীরা লিডারের তালিকায় আপনার তথ্য দেখে ভরসা করবেন, তাই সঠিক তথ্য দিন। আপনার ফোন নম্বর তালিকায় দেখানো হবে না।', 'Hajis will trust you from your details in the leader list, so give correct information. Your phone number will not be shown in the list.')}</Text>
          {!kind ? (
            <>
              <Text style={[st.h, { marginBottom: S.sm }]} accessibilityRole="header">{tr('আপনি কোন ধরনের লিডার?', 'What kind of leader are you?')}</Text>
              {(['agency', 'travel_adda'] as const).map((k) => {
                const soon = k === 'travel_adda' && !kindsOk;
                return (
                  <Pressable key={k} onPress={() => !soon && chooseKind(k)} disabled={soon}
                    style={[st.card, { flexDirection: 'row', alignItems: 'center', gap: S.md, borderWidth: 2, borderColor: soon ? C.line : C.primary, minHeight: 88, opacity: soon ? 0.6 : 1 }]}
                    accessibilityRole="button" accessibilityState={{ disabled: soon }} accessibilityLabel={tr(`${LEADER_KINDS[k].title}। ${soon ? tr('শীঘ্রই আসছে', 'Coming soon') : LEADER_KINDS[k].what}`, `${LEADER_KINDS[k].title}. ${soon ? 'Coming soon' : LEADER_KINDS[k].what}`)}>
                    <Text style={{ fontSize: 36 }} importantForAccessibility="no">{LEADER_KINDS[k].icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.h, { color: C.primary }]}>{LEADER_KINDS[k].title}</Text>
                      <Text style={st.small}>{soon ? tr('শীঘ্রই আসছে', 'Coming soon') : LEADER_KINDS[k].what}</Text>
                    </View>
                  </Pressable>
                );
              })}
              {err.kind ? <Text style={[st.p, { color: C.bad, fontWeight: '700' }]}>⚠️ {err.kind}</Text> : null}
            </>
          ) : (
            <Pressable onPress={() => chooseKind(null)} style={{ minHeight: 48, justifyContent: 'center', marginBottom: S.sm }} accessibilityRole="button" accessibilityLabel={tr(`লিডারের ধরন: ${LEADER_KINDS[kind].title}। বদলাতে চাপুন`, `Kind of leader: ${LEADER_KINDS[kind].title}. Tap to change`)}>
              <Text style={[st.p, { color: C.primary, fontWeight: '700' }]}>{LEADER_KINDS[kind].icon} {LEADER_KINDS[kind].title} · <Text style={{ textDecorationLine: 'underline' }}>{tr('বদলান', 'Change')}</Text></Text>
            </Pressable>
          )}
          {kind ? (<>
          {kind === 'agency' ? (
            <>
              <Text style={[st.h, { marginBottom: S.sm }]} accessibilityRole="header">{tr('🏢 অফিসের তথ্য', '🏢 Office details')}</Text>
              <Field label={tr('এজেন্সির নাম', 'Agency name')} value={f.agency} onChangeText={set('agency')} maxLength={120} error={err.agency} />
              <Field label={tr('ওমরাহ লাইসেন্স নম্বর', 'Umrah licence number')} hint={tr('ধর্ম মন্ত্রণালয়ের ওমরাহ লাইসেন্স', 'Umrah licence from the Ministry of Religious Affairs')} value={f.umrah} onChangeText={set('umrah')} maxLength={40} error={err.umrah} autoCapitalize="characters" />
              <Field label={tr('হজ লাইসেন্স নম্বর', 'Hajj licence number')} hint={tr('হজ লাইসেন্স থাকলে', 'If you have a Hajj licence')} value={f.hajj} onChangeText={set('hajj')} maxLength={40} autoCapitalize="characters" />
            </>
          ) : null}
          <View style={[st.card, err.file ? { borderWidth: 2, borderColor: C.bad } : null]}>
            <Text style={st.h}>{kind === 'travel_adda' ? tr('🪪 জাতীয় পরিচয়পত্রের (NID) ছবি', '🪪 Picture of national ID card (NID)') : tr('লাইসেন্সের ছবি বা PDF', 'Picture or PDF of the licence')}</Text>
            <Text style={st.small}>{kind === 'travel_adda' ? tr('সামনের দিকের পরিষ্কার ছবি। শুধু অ্যাডমিন দেখতে পারবেন, হাজীরা কখনো দেখবেন না।', 'A clear picture of the front. Only the admin can see it; hajis never will.') : tr('শুধু অ্যাডমিন দেখতে পারবেন।', 'Only the admin can see it.')}</Text>
            {err.file ? <Text style={[st.small, { color: C.bad }]}>⚠️ {err.file}</Text> : null}
            {file ? (
              <>
                <Notice kind="ok" title={tr(`যুক্ত হয়েছে: ${file.kind === 'pdf' ? '📕 ' : '🖼️ '}${file.name}`, `Added: ${file.kind === 'pdf' ? '📕 ' : '🖼️ '}${file.name}`)} />
                <Button title={tr('কাগজটি সরিয়ে দিন', 'Remove the document')} kind="danger" onPress={() => setFile(null)} disabled={busy} />
              </>
            ) : (
              <>
                <Button title={tr('ক্যামেরায় ছবি তুলুন', 'Take a photo with the camera')} icon="📷" kind="secondary" onPress={() => setCam(true)} disabled={busy} />
                <Button title={tr('ফোন থেকে ফাইল বাছুন', 'Choose a file from the phone')} icon="📁" kind="secondary" onPress={pick} disabled={busy} style={{ marginTop: S.sm }} />
              </>
            )}
          </View>
          {kindsOk ? (
            <View style={{ marginBottom: S.sm }}>
              <DistrictPicker label={tr('আপনার পেশা (ঐচ্ছিক)', 'Your profession (optional)')} value={profession} onChange={setProfession} options={PROFESSIONS}
                placeholder={tr('পেশা বাছুন', 'Choose a profession')} searchHint={tr('যেমন: ইমাম', 'e.g. Imam')} noun={tr('পেশা', 'profession')} allowOther nameOf={professionName} />
              {profession ? (
                <Pressable onPress={() => setProfession('')} style={{ minHeight: 48, justifyContent: 'center', marginTop: -S.sm }} accessibilityRole="button" accessibilityLabel={tr('পেশা মুছে দিন', 'Clear the profession')}>
                  <Text style={[st.small, { color: C.primary, textDecorationLine: 'underline' }]}>{tr('পেশা মুছে দিন', 'Clear the profession')}</Text>
                </Pressable>
              ) : <Text style={[st.small, { marginTop: -S.sm }]}>{tr('লিডারি ছাড়া আর কী করেন (যেমন ইমাম, মুয়াজ্জিন, মাদ্রাসার শিক্ষক)। হাজীরা আপনার পাতায় দেখবেন।', 'What else you do besides being a leader (e.g. imam, muezzin, madrasa teacher). Hajis will see it on your page.')}</Text>}
            </View>
          ) : null}
          <WorkAreaFields value={area} onChange={setArea} errors={err} />
          {terms ? (
            <View style={[st.card, err.agree && { borderColor: C.bad, borderWidth: 2 }]}>
              <Pressable onPress={() => setAgree(!agree)} style={{ minHeight: 48, justifyContent: 'center' }} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} accessibilityLabel={tr('আমি লিডারদের শর্তাবলি পড়েছি ও মেনে নিচ্ছি', 'I have read and accept the terms for leaders')}>
                <Text style={st.p}>{tr(`${agree ? '☑️' : '⬜'} আমি লিডারদের শর্তাবলি পড়েছি ও মেনে নিচ্ছি`, `${agree ? '☑️' : '⬜'} I have read and accept the terms for leaders`)}</Text>
              </Pressable>
              <Pressable onPress={() => setShowTerms(true)} style={{ minHeight: 48, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={tr('লিডারদের শর্তাবলি পড়ুন', 'Read the terms for leaders')}>
                <Text style={[st.p, { color: C.primary, fontWeight: '700', textDecorationLine: 'underline' }]}>{tr('📜 লিডারদের শর্তাবলি পড়ুন', '📜 Read the terms for leaders')}</Text>
              </Pressable>
              <Text style={st.small}>{tr('বিশেষ করে: অ্যাপের হাজীদের কাছ থেকে সরাসরি টাকা নেওয়া যাবে না, সব টাকা Travel Adda-র মাধ্যমে আসবে।', 'In particular: you may not take money directly from the app\'s hajis; all money comes through Travel Adda.')}</Text>
              {err.agree ? <Text style={[st.p, { color: C.bad, fontWeight: '700' }]}>⚠️ {err.agree}</Text> : null}
            </View>
          ) : null}
          <Button title={tr('নিবন্ধন জমা দিন', 'Send registration')} icon="📨" onPress={submit} loading={busy} />
          </>) : null}
          <Modal visible={showTerms} animationType="slide" onRequestClose={() => setShowTerms(false)}>
            <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={[st.wrap, { paddingTop: 48 }]}>
              <Text style={st.title}>{tr('📜 লিডারদের শর্তাবলি', '📜 Terms for leaders')}</Text>
              <Text style={[st.p, { lineHeight: 30 }]} selectable>{terms ? terms.body : ''}</Text>
              <Button title={tr('পড়েছি, মেনে নিচ্ছি', 'I have read and accept')} icon="✅" onPress={() => { setShowTerms(false); setAgree(true); }} style={{ marginTop: S.lg }} />
              <Button title={tr('বন্ধ করুন (টিক দেব না)', 'Close (I will not tick)')} kind="secondary" onPress={() => setShowTerms(false)} style={{ marginTop: S.sm, marginBottom: S.xl }} />
            </ScrollView>
          </Modal>
        </>
      ) : null}
    </ScrollView>
  );
}
