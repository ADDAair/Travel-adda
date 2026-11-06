import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { tr } from '../lib/lang';
import ScrollView from '../components/KbScroll';
import { C, S } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { notReady } from '../lib/groups';
import { mySentInvites, cancelInvite } from '../lib/help';
import { groupKhadems, addKhadem, removeKhadem, khademResultText, faqList, saveFaq, deleteFaq, helpErrorText } from '../lib/help';
import { toBn } from '../lib/phone';
import { st } from './GroupScreen';
import type { Msg, Nav, Route } from './navTypes';
import type { Res, Item } from '../lib/types';
import { errInfo } from '../lib/errors';

const confirm = (title: string, text: string, yes: string, fn: () => void) => Alert.alert(title, text, [{ text: tr('না', 'No'), style: 'cancel' }, { text: yes, style: 'destructive', onPress: fn }]);

// Leader: one group's khadems (helpers in Makkah/Madinah) and its ready answers (FAQ) for the help chat.
export default function GroupStaffScreen({ navigation, route }: { navigation: Nav; route?: Route }) {
  const gid = route?.params?.groupId || '';
  const gname = route?.params?.groupName || '';
  const [tab, setTab] = useState(route?.params?.tab === 'faq' ? 'faq' : 'khadem');
  const [state, setState] = useState('load');
  const [khadems, setKhadems] = useState<Res<typeof groupKhadems>>([]);
  const [faq, setFaq] = useState<Res<typeof faqList>>([]);
  const [ident, setIdent] = useState('');
  const [edit, setEdit] = useState<{ id?: string; q: string; a: string } | null>(null);                 // null | { id?, q, a }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [sent, setSent] = useState<Res<typeof mySentInvites>>([]);

  const load = useCallback(async () => {
    if (!gid) return;
    try { const [k, f] = await Promise.all([groupKhadems(gid), faqList(gid)]); setKhadems(k); setFaq(f); setState('ok'); }
    catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, [gid]);
  const loadSent = useCallback(async () => { if (!gid) return; try { setSent((await mySentInvites(gid)).filter((x) => x.kind === 'khadem')); } catch (e) { setSent([]); } }, [gid]);
  useEffect(() => { setMsg(null); setEdit(null); setState('load'); load(); loadSent(); }, [load, loadSent]);

  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); } finally { setBusy(false); } };
  const add = () => run(async () => {
    if (ident.trim().length < 4) { setMsg({ kind: 'bad', text: tr('খাদেমের আইডি (যেমন TA-00042) বা মোবাইল নম্বর লিখুন।', 'Write the khadem\'s ID (e.g. TA-00042) or mobile number.') }); return; }
    const r = await addKhadem(gid, ident);
    setMsg({ kind: r === 'ok' || r === 'sent' ? 'ok' : r === 'already' ? 'info' : 'warn', text: khademResultText(r) });
    if (r === 'ok' || r === 'sent') { setIdent(''); await load(); await loadSent(); }
  });
  const remove = (k: Item<typeof groupKhadems>) => confirm(tr(`${k.full_name}-কে খাদেম থেকে সরাবেন?`, `Remove ${k.full_name} as a khadem?`), tr('সাথে সাথে তিনি এই দলের হাজী ও প্রশ্ন আর দেখতে পারবেন না।', 'They will at once stop seeing this group\'s hajis and questions.'), tr('হ্যাঁ, সরান', 'Yes, remove'),
    () => run(async () => { await removeKhadem(gid, k.user_id); setMsg({ kind: 'ok', text: tr('সরানো হয়েছে।', 'Removed.') }); await load(); }));
  const save = () => run(async () => {
    if (!edit) return;
    try { await saveFaq(gid, edit.id || null, edit.q, edit.a); }
    catch (e) { const { code, message } = errInfo(e); if (code === 'short') { setMsg({ kind: 'bad', text: tr('প্রশ্ন ও উত্তর দুটোই লিখুন।', 'Write both the question and the answer.') }); return; } if (/faq limit/i.test(message)) { setMsg({ kind: 'bad', text: tr('একটি দলে সর্বোচ্চ ৩০টি তৈরি উত্তর রাখা যায়।', 'A group can have at most 30 ready answers.') }); return; } throw e; }
    setEdit(null); setMsg({ kind: 'ok', text: tr('সংরক্ষণ হয়েছে। হাজীরা প্রশ্ন করার আগে এটি দেখবেন।', 'Saved. Hajis will see it before asking a question.') }); await load();
  });
  const del = (f: Item<typeof faqList>) => confirm(tr('এই তৈরি উত্তরটি মুছবেন?', 'Delete this ready answer?'), f.question, tr('হ্যাঁ, মুছুন', 'Yes, delete'), () => run(async () => { await deleteFaq(f.id); setMsg({ kind: 'ok', text: tr('মুছে ফেলা হয়েছে।', 'Deleted.') }); await load(); }));

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Leader')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('লিডার প্যানেলে ফিরে যান', 'Back to the leader panel')}><Text style={st.backT}>{tr('‹ লিডার প্যানেল', '‹ Leader panel')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{gname || tr('দল', 'Group')}</Text>
      <Segmented value={tab} onChange={(t) => { if (!busy) { setTab(t); setMsg(null); } }} options={[{ id: 'khadem', label: tr('🤝 খাদেম', '🤝 Khadems') }, { id: 'faq', label: tr('📋 তৈরি উত্তর', '📋 Ready answers') }]} />
      <View style={{ height: S.md }} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই আসছে', 'Coming soon')} text={tr('খাদেম ও তৈরি উত্তরের সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে।', 'The last step to turn on khadems and ready answers is still to come.')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('তথ্য আনা যায়নি', 'Could not load the information')} text={tr('ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'Check the internet connection and try again.')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}

      {state === 'ok' && tab === 'khadem' ? (
        <>
          <Text style={[st.p, { marginBottom: S.md }]}>{tr('খাদেমরা আপনার অনুপস্থিতিতে মক্কা-মদিনায় হাজীদের সেবা করবেন। তাঁরা দলের হাজীদের দেখবেন, প্রশ্নের উত্তর দেবেন, আর চুক্তি হওয়া হাজীদের ফোন নম্বর পাবেন। খাদেমকে আগে অ্যাপে নিজের অ্যাকাউন্ট খুলতে হবে, আর অনুরোধ পেয়ে রাজি হতে হবে।', 'Khadems serve the hajis in Makkah and Madinah when you are not there. They see the group\'s hajis, answer questions, and get the phone numbers of hajis with a contract. A khadem must first open their own account in the app and agree when they get the request.')}</Text>
          <View style={st.card}>
            <Text style={st.h}>{tr('➕ খাদেম যোগ করুন', '➕ Add a khadem')}</Text>
            <Field label={tr('খাদেমের আইডি বা মোবাইল নম্বর', 'Khadem\'s ID or mobile number')} hint={tr('যেমন: TA-00042 বা 01712345678', 'e.g. TA-00042 or 01712345678')} value={ident} onChangeText={setIdent} maxLength={20} autoCapitalize="characters" autoCorrect={false} editable={!busy} />
            <Button title={tr('খাদেম হওয়ার অনুরোধ পাঠান', 'Send request to be a khadem')} icon="🤝" onPress={add} loading={busy} />
            <Text style={st.small}>{tr('তিনি রাজি হলে তবেই খাদেম হবেন। একটি দলে সর্বোচ্চ ১০ জন খাদেম।', 'They become a khadem only if they agree. At most 10 khadems per group.')}</Text>
            {sent.length ? (
              <>
                <Text style={[st.lbl, { marginTop: S.md }]}>{tr('পাঠানো অনুরোধ (গোপনীয়তার জন্য কিছু অংশ লুকানো)', 'Requests sent (partly hidden for privacy)')}</Text>
                {sent.map((x) => (
                  <View key={x.id} style={{ borderTopWidth: 1, borderColor: C.line, paddingVertical: S.xs }}>
                    <Text style={st.p}>🤝 {x.hint} · {x.joined ? tr('✅ রাজি হয়েছেন', '✅ Agreed') : tr('⏳ উত্তরের অপেক্ষায়', '⏳ Waiting for an answer')}</Text>
                    {!x.joined ? <Button title={tr('অনুরোধ বাতিল করুন', 'Cancel request')} kind="secondary" disabled={busy} style={{ marginTop: S.xs }}
                      onPress={() => confirm(tr('অনুরোধটি বাতিল করবেন?', 'Cancel the request?'), x.hint, tr('হ্যাঁ, বাতিল', 'Yes, cancel'), () => run(async () => { await cancelInvite(x.id); await loadSent(); setMsg({ kind: 'ok', text: tr('অনুরোধ বাতিল হয়েছে।', 'Request cancelled.') }); }))} /> : null}
                  </View>
                ))}
              </>
            ) : null}
          </View>
          <View style={st.card}>
            <Text style={st.h}>{tr(`🤝 এই দলের খাদেম: ${toBn(khadems.length)} জন`, `🤝 Khadems of this group: ${khadems.length}`)}</Text>
            {khadems.length === 0 ? <Text style={st.p}>{tr('এখনো কোনো খাদেম নেই।', 'No khadems yet.')}</Text> : null}
            {khadems.map((k) => (
              <View key={k.user_id} style={{ borderTopWidth: 1, borderColor: C.line, paddingVertical: S.sm }}>
                <Text style={st.val}>🤝 {k.full_name}</Text>
                <Text style={st.small}>{tr(`আইডি: ${k.code}${k.phone ? ` · ${toBn(k.phone)}` : ''}`, `ID: ${k.code}${k.phone ? ` · ${k.phone}` : ''}`)}</Text>
                <Button title={tr('খাদেম থেকে সরান', 'Remove as khadem')} kind="danger" onPress={() => remove(k)} disabled={busy} style={{ marginTop: S.xs }} />
              </View>
            ))}
          </View>
        </>
      ) : null}

      {state === 'ok' && tab === 'faq' ? (
        <>
          <Text style={[st.p, { marginBottom: S.md }]}>{tr('যে প্রশ্ন হাজীরা বারবার করেন (হোটেল কোথায়, বাস কখন, খাবারের সময়), সেগুলোর উত্তর এখানে লিখে রাখুন। হাজীরা প্রশ্ন করার পাতায় আগে এগুলো দেখবেন।', 'Write here the answers to questions hajis ask again and again (where the hotel is, when the bus goes, meal times). Hajis see these first on the page for asking questions.')}</Text>
          {edit ? (
            <View style={st.card}>
              <Text style={st.h}>{edit.id ? tr('✏️ তৈরি উত্তর বদলান', '✏️ Change ready answer') : tr('➕ নতুন তৈরি উত্তর', '➕ New ready answer')}</Text>
              <Field label={tr('প্রশ্ন', 'Question')} hint={tr('যেমন: মক্কায় আমাদের হোটেল কোথায়?', 'e.g. Where is our hotel in Makkah?')} value={edit.q} onChangeText={(v) => setEdit({ ...edit, q: v })} maxLength={150} editable={!busy} />
              <Field label={tr('উত্তর', 'Answer')} hint={tr('যেমন: হোটেল আল-সাফা, হারাম শরীফ থেকে হেঁটে ৫ মিনিট', 'e.g. Hotel Al-Safa, 5 minutes\' walk from the Haram')} value={edit.a} onChangeText={(v) => setEdit({ ...edit, a: v })} multiline maxLength={1000} editable={!busy} />
              <Button title={tr('সংরক্ষণ করুন', 'Save')} icon="💾" onPress={save} loading={busy} />
              <Button title={tr('বাতিল', 'Cancel')} kind="secondary" onPress={() => { setEdit(null); setMsg(null); }} disabled={busy} style={{ marginTop: S.sm }} />
            </View>
          ) : <Button title={tr('নতুন তৈরি উত্তর লিখুন', 'Write a new ready answer')} icon="➕" onPress={() => setEdit({ q: '', a: '' })} style={{ marginBottom: S.md }} />}
          {faq.length === 0 && !edit ? <Text style={st.p}>{tr('এখনো কোনো তৈরি উত্তর নেই।', 'No ready answers yet.')}</Text> : null}
          {faq.map((f) => (
            <View key={f.id} style={st.card}>
              <Text style={[st.p, { fontWeight: '700' }]}>❓ {f.question}</Text>
              <Text style={st.p}>{f.answer}</Text>
              <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.sm }}>
                <Button title={tr('বদলান', 'Change')} icon="✏️" kind="secondary" onPress={() => { setEdit({ id: f.id, q: f.question, a: f.answer }); setMsg(null); }} disabled={busy} style={{ flex: 1 }} />
                <Button title={tr('মুছুন', 'Delete')} kind="danger" onPress={() => del(f)} disabled={busy} style={{ flex: 1 }} />
              </View>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
