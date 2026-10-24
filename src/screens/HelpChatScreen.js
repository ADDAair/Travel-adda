import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import ChatBubbles from '../components/ChatBubbles';
import { myGroups, notReady, telBd } from '../lib/groups';
import { myHelpMessages, faqList, groupKhadems, sendHelp, checkMessage, helpErrorText, MAX_MESSAGE } from '../lib/help';
import { toBn } from '../lib/phone';
import { st } from './GroupScreen';

// Haji: a private conversation with the group's leader and khadems. Ready answers are shown first.
// Other hajis never see it. New answers are fetched every 15 seconds while this page is open.
export default function HelpChatScreen({ navigation, route }) {
  const [groups, setGroups] = useState(undefined);
  const [gid, setGid] = useState(route?.params?.groupId || null);
  const [state, setState] = useState('load');        // load | ok | soon | err
  const [msgs, setMsgs] = useState([]);
  const [faq, setFaq] = useState([]);
  const [khadems, setKhadems] = useState([]);
  const [openQ, setOpenQ] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const scroller = useRef(null);
  useEffect(() => { if (route?.params?.groupId) setGid(route.params.groupId); }, [route?.params?.groupId]);

  const loadGroups = useCallback(async () => {
    try {
      const g = (await myGroups()).filter((x) => x.status === 'active');
      setGroups(g);
      setGid((cur) => (cur && g.some((x) => x.group_id === cur) ? cur : g[0] ? g[0].group_id : null));
      if (!g.length) setState('ok');
    } catch (e) { setGroups([]); setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  const loadChat = useCallback(async (quiet) => {
    if (!gid) return;
    try {
      const [m, f, k] = await Promise.all([myHelpMessages(gid), faqList(gid), groupKhadems(gid)]);
      setMsgs(m); setFaq(f); setKhadems(k); setState('ok');
    } catch (e) { if (!quiet) setState(notReady(e) ? 'soon' : 'err'); }
  }, [gid]);
  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => { loadChat(); }, [loadChat]);
  // fetch new answers every 15 s, only while this page is on screen
  useEffect(() => {
    let t = null;
    const start = () => { if (!t) t = setInterval(() => loadChat(true), 15000); };
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    start();
    const a = navigation?.addListener?.('focus', () => { loadGroups(); start(); });
    const b = navigation?.addListener?.('blur', stop);
    return () => { stop(); if (a) a(); if (b) b(); };
  }, [navigation, loadChat, loadGroups]);

  const send = async () => {
    if (busy) return;
    const bad = checkMessage(text);
    if (bad) { setMsg({ kind: 'bad', text: bad }); return; }
    setBusy(true); setMsg(null);
    try {
      await sendHelp(gid, text);
      setText('');
      setMsg({ kind: 'ok', text: 'পাঠানো হয়েছে। লিডার বা খাদেম উত্তর দিলে নোটিফিকেশন পাবেন।' });
      await loadChat(true);
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }   // the text stays in the box
    finally { setBusy(false); }
  };

  const g = (groups || []).find((x) => x.group_id === gid);
  return (
    <ScrollView ref={scroller} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Group')} style={st.back} accessibilityRole="button" accessibilityLabel="আমার দল পাতায় ফিরে যান"><Text style={st.backT}>‹ আমার দল</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">💬 লিডার ও খাদেমকে জিজ্ঞেস করুন</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই আসছে" text="দলের লিডার ও খাদেমকে প্রশ্ন করার সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={() => { loadGroups(); loadChat(); }} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && groups && groups.length === 0 ? (
        <Notice kind="info" title="আপনি এখনো কোনো দলে নেই" text="দলে যোগ দিলে এখানে লিডার ও খাদেমকে প্রশ্ন করতে পারবেন।">
          <Button title="আমার দল পাতা খুলুন" icon="👥" kind="secondary" onPress={() => navigation.navigate('Group')} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}
      {state === 'ok' && g ? (
        <>
          {groups.length > 1 ? (
            <View style={{ marginBottom: S.md }}>
              <Text style={st.lbl}>কোন দলের লিডারকে লিখবেন?</Text>
              {groups.map((x) => (
                <Pressable key={x.group_id} onPress={() => { setGid(x.group_id); setMsg(null); }} style={[st.card, { paddingVertical: S.sm, marginBottom: S.xs, borderWidth: x.group_id === gid ? 2 : 1, borderColor: x.group_id === gid ? C.primary : C.line }]}
                  accessibilityRole="button" accessibilityState={{ selected: x.group_id === gid }} accessibilityLabel={`${x.group_name} দল`}>
                  <Text style={st.val}>{x.group_id === gid ? '✅ ' : ''}{x.group_name}</Text>
                </Pressable>
              ))}
            </View>
          ) : <Text style={[st.small, { marginBottom: S.sm }]}>দল: {g.group_name} · লিডার: {g.leader_name}</Text>}
          <Text style={[st.small, { marginBottom: S.md }]}>🔒 এখানে যা লিখবেন তা শুধু এই দলের লিডার ও খাদেমরা দেখবেন, অন্য হাজীরা দেখবেন না।</Text>

          {faq.length ? (
            <View style={st.card}>
              <Text style={st.h}>📋 আগে দেখে নিন: সাধারণ প্রশ্নের উত্তর</Text>
              {faq.map((f) => (
                <View key={f.id} style={{ borderTopWidth: 1, borderColor: C.line }}>
                  <Pressable onPress={() => setOpenQ(openQ === f.id ? null : f.id)} style={{ minHeight: 48, justifyContent: 'center', paddingVertical: S.xs }}
                    accessibilityRole="button" accessibilityState={{ expanded: openQ === f.id }} accessibilityLabel={`প্রশ্ন: ${f.question}। উত্তর ${openQ === f.id ? 'লুকাতে' : 'দেখতে'} চাপুন`}>
                    <Text style={[st.p, { fontWeight: '700', color: C.primary }]}>{openQ === f.id ? '▾' : '▸'} {f.question}</Text>
                  </Pressable>
                  {openQ === f.id ? <Text style={[st.p, { marginBottom: S.sm }]} selectable>{f.answer}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}

          {khadems.length ? (
            <View style={st.card}>
              <Text style={st.h}>🤝 এই দলের খাদেম</Text>
              <Text style={st.small}>লিডারের অনুপস্থিতিতে মক্কা-মদিনায় এঁরা আপনাকে সাহায্য করবেন।</Text>
              {khadems.map((k) => (
                <View key={k.user_id} style={{ borderTopWidth: 1, borderColor: C.line, paddingVertical: S.sm }}>
                  <Text style={st.val}>🤝 {k.full_name}</Text>
                  {k.phone ? <Button title={`ফোন করুন (${toBn(k.phone)})`} icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(k.phone)}`).catch(() => {})} style={{ marginTop: S.xs }} />
                    : <Text style={st.small}>🔒 লিডারের সাথে চুক্তি চালু হলে খাদেমের নম্বর দেখাবে।</Text>}
                </View>
              ))}
            </View>
          ) : null}

          <View style={st.card}>
            <Text style={st.h}>🗨️ আপনার কথোপকথন</Text>
            {msgs.length === 0 ? <Text style={st.p}>এখনো কিছু লেখেননি। সমস্যা বা পরামর্শ নিচে লিখে পাঠান।</Text> : <ChatBubbles rows={msgs} viewer="haji" />}
          </View>
          {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
          <Field label="আপনার প্রশ্ন, সমস্যা বা পরামর্শ" hint="যেমন: আমার রুমের এসি কাজ করছে না" value={text} onChangeText={setText} multiline maxLength={MAX_MESSAGE} editable={!busy} />
          <Button title="পাঠান" icon="📨" onPress={send} loading={busy} />
          <Text style={[st.small, { marginTop: S.sm, marginBottom: S.xl }]}>খুব জরুরি হলে (অসুস্থ, হারিয়ে গেছেন) এখানে অপেক্ষা না করে নিচের "জরুরি" বোতাম থেকে ফোন করুন।</Text>
        </>
      ) : null}
    </ScrollView>
  );
}
