import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import ScrollView from '../components/KbScroll';
import { C, S } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { notReady } from '../lib/groups';
import { mySentInvites, cancelInvite } from '../lib/help';
import { groupKhadems, addKhadem, removeKhadem, khademResultText, faqList, saveFaq, deleteFaq, helpErrorText } from '../lib/help';
import { toBn } from '../lib/phone';
import { st } from './GroupScreen';

const confirm = (title, text, yes, fn) => Alert.alert(title, text, [{ text: 'না', style: 'cancel' }, { text: yes, style: 'destructive', onPress: fn }]);

// Leader: one group's khadems (helpers in Makkah/Madinah) and its ready answers (FAQ) for the help chat.
export default function GroupStaffScreen({ navigation, route }) {
  const gid = route?.params?.groupId;
  const gname = route?.params?.groupName || '';
  const [tab, setTab] = useState(route?.params?.tab === 'faq' ? 'faq' : 'khadem');
  const [state, setState] = useState('load');
  const [khadems, setKhadems] = useState([]);
  const [faq, setFaq] = useState([]);
  const [ident, setIdent] = useState('');
  const [edit, setEdit] = useState(null);                 // null | { id?, q, a }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sent, setSent] = useState([]);

  const load = useCallback(async () => {
    if (!gid) return;
    try { const [k, f] = await Promise.all([groupKhadems(gid), faqList(gid)]); setKhadems(k); setFaq(f); setState('ok'); }
    catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, [gid]);
  const loadSent = useCallback(async () => { if (!gid) return; try { setSent((await mySentInvites(gid)).filter((x) => x.kind === 'khadem')); } catch (e) { setSent([]); } }, [gid]);
  useEffect(() => { setMsg(null); setEdit(null); setState('load'); load(); loadSent(); }, [load, loadSent]);

  const run = async (fn) => { if (busy) return; setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); } finally { setBusy(false); } };
  const add = () => run(async () => {
    if (ident.trim().length < 4) { setMsg({ kind: 'bad', text: 'খাদেমের আইডি (যেমন TA-00042) বা মোবাইল নম্বর লিখুন।' }); return; }
    const r = await addKhadem(gid, ident);
    setMsg({ kind: r === 'ok' || r === 'sent' ? 'ok' : r === 'already' ? 'info' : 'warn', text: khademResultText(r) });
    if (r === 'ok' || r === 'sent') { setIdent(''); await load(); await loadSent(); }
  });
  const remove = (k) => confirm(`${k.full_name}-কে খাদেম থেকে সরাবেন?`, 'সাথে সাথে তিনি এই দলের হাজী ও প্রশ্ন আর দেখতে পারবেন না।', 'হ্যাঁ, সরান',
    () => run(async () => { await removeKhadem(gid, k.user_id); setMsg({ kind: 'ok', text: 'সরানো হয়েছে।' }); await load(); }));
  const save = () => run(async () => {
    try { await saveFaq(gid, edit.id, edit.q, edit.a); }
    catch (e) { if (e.code === 'short') { setMsg({ kind: 'bad', text: 'প্রশ্ন ও উত্তর দুটোই লিখুন।' }); return; } if (/faq limit/i.test(e.message || '')) { setMsg({ kind: 'bad', text: 'একটি দলে সর্বোচ্চ ৩০টি তৈরি উত্তর রাখা যায়।' }); return; } throw e; }
    setEdit(null); setMsg({ kind: 'ok', text: 'সংরক্ষণ হয়েছে। হাজীরা প্রশ্ন করার আগে এটি দেখবেন।' }); await load();
  });
  const del = (f) => confirm('এই তৈরি উত্তরটি মুছবেন?', f.question, 'হ্যাঁ, মুছুন', () => run(async () => { await deleteFaq(f.id); setMsg({ kind: 'ok', text: 'মুছে ফেলা হয়েছে।' }); await load(); }));

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Leader')} style={st.back} accessibilityRole="button" accessibilityLabel="লিডার প্যানেলে ফিরে যান"><Text style={st.backT}>‹ লিডার প্যানেল</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{gname || 'দল'}</Text>
      <Segmented value={tab} onChange={(t) => { if (!busy) { setTab(t); setMsg(null); } }} options={[{ id: 'khadem', label: '🤝 খাদেম' }, { id: 'faq', label: '📋 তৈরি উত্তর' }]} />
      <View style={{ height: S.md }} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই আসছে" text="খাদেম ও তৈরি উত্তরের সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}

      {state === 'ok' && tab === 'khadem' ? (
        <>
          <Text style={[st.p, { marginBottom: S.md }]}>খাদেমরা আপনার অনুপস্থিতিতে মক্কা-মদিনায় হাজীদের সেবা করবেন। তাঁরা দলের হাজীদের দেখবেন, প্রশ্নের উত্তর দেবেন, আর চুক্তি হওয়া হাজীদের ফোন নম্বর পাবেন। খাদেমকে আগে অ্যাপে নিজের অ্যাকাউন্ট খুলতে হবে, আর অনুরোধ পেয়ে রাজি হতে হবে।</Text>
          <View style={st.card}>
            <Text style={st.h}>➕ খাদেম যোগ করুন</Text>
            <Field label="খাদেমের আইডি বা মোবাইল নম্বর" hint="যেমন: TA-00042 বা 01712345678" value={ident} onChangeText={setIdent} maxLength={20} autoCapitalize="characters" autoCorrect={false} editable={!busy} />
            <Button title="খাদেম হওয়ার অনুরোধ পাঠান" icon="🤝" onPress={add} loading={busy} />
            <Text style={st.small}>তিনি রাজি হলে তবেই খাদেম হবেন। একটি দলে সর্বোচ্চ ১০ জন খাদেম।</Text>
            {sent.length ? (
              <>
                <Text style={[st.lbl, { marginTop: S.md }]}>পাঠানো অনুরোধ (গোপনীয়তার জন্য কিছু অংশ লুকানো)</Text>
                {sent.map((x) => (
                  <View key={x.id} style={{ borderTopWidth: 1, borderColor: C.line, paddingVertical: S.xs }}>
                    <Text style={st.p}>🤝 {x.hint} · {x.joined ? '✅ রাজি হয়েছেন' : '⏳ উত্তরের অপেক্ষায়'}</Text>
                    {!x.joined ? <Button title="অনুরোধ বাতিল করুন" kind="secondary" disabled={busy} style={{ marginTop: S.xs }}
                      onPress={() => confirm('অনুরোধটি বাতিল করবেন?', x.hint, 'হ্যাঁ, বাতিল', () => run(async () => { await cancelInvite(x.id); await loadSent(); setMsg({ kind: 'ok', text: 'অনুরোধ বাতিল হয়েছে।' }); }))} /> : null}
                  </View>
                ))}
              </>
            ) : null}
          </View>
          <View style={st.card}>
            <Text style={st.h}>🤝 এই দলের খাদেম: {toBn(khadems.length)} জন</Text>
            {khadems.length === 0 ? <Text style={st.p}>এখনো কোনো খাদেম নেই।</Text> : null}
            {khadems.map((k) => (
              <View key={k.user_id} style={{ borderTopWidth: 1, borderColor: C.line, paddingVertical: S.sm }}>
                <Text style={st.val}>🤝 {k.full_name}</Text>
                <Text style={st.small}>আইডি: {k.code}{k.phone ? ` · ${toBn(k.phone)}` : ''}</Text>
                <Button title="খাদেম থেকে সরান" kind="danger" onPress={() => remove(k)} disabled={busy} style={{ marginTop: S.xs }} />
              </View>
            ))}
          </View>
        </>
      ) : null}

      {state === 'ok' && tab === 'faq' ? (
        <>
          <Text style={[st.p, { marginBottom: S.md }]}>যে প্রশ্ন হাজীরা বারবার করেন (হোটেল কোথায়, বাস কখন, খাবারের সময়), সেগুলোর উত্তর এখানে লিখে রাখুন। হাজীরা প্রশ্ন করার পাতায় আগে এগুলো দেখবেন।</Text>
          {edit ? (
            <View style={st.card}>
              <Text style={st.h}>{edit.id ? '✏️ তৈরি উত্তর বদলান' : '➕ নতুন তৈরি উত্তর'}</Text>
              <Field label="প্রশ্ন" hint="যেমন: মক্কায় আমাদের হোটেল কোথায়?" value={edit.q} onChangeText={(v) => setEdit({ ...edit, q: v })} maxLength={150} editable={!busy} />
              <Field label="উত্তর" hint="যেমন: হোটেল আল-সাফা, হারাম শরীফ থেকে হেঁটে ৫ মিনিট" value={edit.a} onChangeText={(v) => setEdit({ ...edit, a: v })} multiline maxLength={1000} editable={!busy} />
              <Button title="সংরক্ষণ করুন" icon="💾" onPress={save} loading={busy} />
              <Button title="বাতিল" kind="secondary" onPress={() => { setEdit(null); setMsg(null); }} disabled={busy} style={{ marginTop: S.sm }} />
            </View>
          ) : <Button title="নতুন তৈরি উত্তর লিখুন" icon="➕" onPress={() => setEdit({ q: '', a: '' })} style={{ marginBottom: S.md }} />}
          {faq.length === 0 && !edit ? <Text style={st.p}>এখনো কোনো তৈরি উত্তর নেই।</Text> : null}
          {faq.map((f) => (
            <View key={f.id} style={st.card}>
              <Text style={[st.p, { fontWeight: '700' }]}>❓ {f.question}</Text>
              <Text style={st.p}>{f.answer}</Text>
              <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.sm }}>
                <Button title="বদলান" icon="✏️" kind="secondary" onPress={() => { setEdit({ id: f.id, q: f.question, a: f.answer }); setMsg(null); }} disabled={busy} style={{ flex: 1 }} />
                <Button title="মুছুন" kind="danger" onPress={() => del(f)} disabled={busy} style={{ flex: 1 }} />
              </View>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
