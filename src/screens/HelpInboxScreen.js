import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import ChatBubbles, { fmtWhen } from '../components/ChatBubbles';
import { leaderGroups, notReady } from '../lib/groups';
import { useMe } from '../lib/me';
import { helpInbox, helpThread, replyHelp, setThreadStatus, myKhademGroups, checkMessage, helpErrorText, MAX_MESSAGE } from '../lib/help';
import { toBn } from '../lib/phone';
import { st } from './GroupScreen';

// Leader or khadem: the hajis' questions of a group. Waiting questions first. Opens one conversation to answer.
export default function HelpInboxScreen({ navigation, route }) {
  const { me } = useMe();
  const [groups, setGroups] = useState(undefined);       // [{ id, name, role }]
  const [gid, setGid] = useState(route?.params?.groupId || null);
  const [rows, setRows] = useState(null);
  const [state, setState] = useState('load');
  const [thread, setThread] = useState(null);            // inbox row being answered
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (route?.params?.groupId) { setGid(route.params.groupId); setThread(null); } }, [route?.params?.groupId]);

  const loadGroups = useCallback(async () => {
    try {
      const led = me && me.role === 'leader' ? (await leaderGroups()).filter((g) => g.active).map((g) => ({ id: g.id, name: g.name, role: 'leader' })) : [];
      let kh = [];
      try { kh = (await myKhademGroups()).map((g) => ({ id: g.group_id, name: g.group_name, role: 'khadem', waiting: g.waiting })); } catch (e) { if (!notReady(e)) throw e; }
      const all = [...led, ...kh.filter((k) => !led.some((l) => l.id === k.id))];
      setGroups(all);
      setGid((cur) => (cur && all.some((x) => x.id === cur) ? cur : all[0] ? all[0].id : null));
      if (!all.length) setState('ok');
    } catch (e) { setGroups([]); setState(notReady(e) ? 'soon' : 'err'); }
  }, [me]);
  const loadInbox = useCallback(async (quiet) => {
    if (!gid) return;
    try { setRows(await helpInbox(gid)); setState('ok'); }
    catch (e) { if (!quiet) setState(notReady(e) ? 'soon' : 'err'); }
  }, [gid]);
  const loadThread = useCallback(async (quiet) => {
    if (!thread) return;
    try { setMsgs(await helpThread(thread.thread_id)); } catch (e) { if (!quiet) setMsg({ kind: 'bad', text: helpErrorText(e) }); }
  }, [thread]);
  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => { loadInbox(); }, [loadInbox]);
  useEffect(() => { loadThread(); }, [loadThread]);
  useEffect(() => {
    let t = null;
    const start = () => { if (!t) t = setInterval(() => { loadInbox(true); loadThread(true); }, 15000); };
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    start();
    const a = navigation?.addListener?.('focus', () => { loadGroups(); start(); });
    const b = navigation?.addListener?.('blur', stop);
    return () => { stop(); if (a) a(); if (b) b(); };
  }, [navigation, loadInbox, loadThread, loadGroups]);

  const reply = async () => {
    if (busy) return;
    const bad = checkMessage(text);
    if (bad) { setMsg({ kind: 'bad', text: bad }); return; }
    setBusy(true); setMsg(null);
    try { await replyHelp(thread.thread_id, text); setText(''); setMsg({ kind: 'ok', text: 'উত্তর পাঠানো হয়েছে। হাজী নোটিফিকেশন পাবেন।' }); await loadThread(true); loadInbox(true); }
    catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }      // the text stays in the box
    finally { setBusy(false); }
  };
  const toggleClosed = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const next = thread.status === 'closed' ? 'open' : 'closed';
    try { await setThreadStatus(thread.thread_id, next); setThread({ ...thread, status: next }); setMsg({ kind: 'ok', text: next === 'closed' ? 'সমাধান হয়েছে হিসেবে রাখা হলো। হাজী আবার লিখলে নিজে থেকেই খুলে যাবে।' : 'আবার খোলা হলো।' }); loadInbox(true); }
    catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }
    finally { setBusy(false); }
  };

  const g = (groups || []).find((x) => x.id === gid);
  if (thread) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => { setThread(null); setMsg(null); setText(''); loadInbox(true); }} style={st.back} accessibilityRole="button" accessibilityLabel="সব প্রশ্নের তালিকায় ফিরে যান"><Text style={st.backT}>‹ সব প্রশ্ন</Text></Pressable>
        <Text style={st.title} accessibilityRole="header">🕋 {thread.haji_name}</Text>
        <Text style={[st.small, { marginBottom: S.md }]}>আইডি: {thread.haji_code} · দল: {g ? g.name : ''}</Text>
        <View style={st.card}><ChatBubbles rows={msgs} viewer="staff" /></View>
        {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
        <Field label="আপনার উত্তর" hint="পরিষ্কার করে, ছোট বাক্যে লিখুন" value={text} onChangeText={setText} multiline maxLength={MAX_MESSAGE} editable={!busy} />
        <Button title="উত্তর পাঠান" icon="📨" onPress={reply} loading={busy} />
        <Button title={thread.status === 'closed' ? 'আবার খুলুন' : 'সমাধান হয়েছে'} icon={thread.status === 'closed' ? '🔓' : '✅'} kind="secondary" onPress={toggleClosed} disabled={busy} style={{ marginTop: S.sm, marginBottom: S.xl }} />
      </ScrollView>
    );
  }

  const waiting = (rows || []).filter((r) => r.status === 'open' && r.last_from_haji).length;
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate(me && me.role === 'leader' ? 'Leader' : 'KhademHome')} style={st.back} accessibilityRole="button" accessibilityLabel="আগের পাতায় ফিরে যান"><Text style={st.backT}>‹ {me && me.role === 'leader' ? 'লিডার প্যানেল' : 'খাদেমের পাতা'}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">💬 হাজীদের প্রশ্ন</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই আসছে" text="হাজীদের প্রশ্নের উত্তর দেওয়ার সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={() => { loadGroups(); loadInbox(); }} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && groups && groups.length === 0 ? <Notice kind="info" title="কোনো দল নেই" text="আপনি কোনো দলের লিডার বা খাদেম হলে এখানে হাজীদের প্রশ্ন দেখবেন।" /> : null}
      {state === 'ok' && g ? (
        <>
          {groups.length > 1 ? groups.map((x) => (
            <Pressable key={x.id} onPress={() => setGid(x.id)} style={[st.card, { paddingVertical: S.sm, marginBottom: S.xs, borderWidth: x.id === gid ? 2 : 1, borderColor: x.id === gid ? C.primary : C.line }]}
              accessibilityRole="button" accessibilityState={{ selected: x.id === gid }} accessibilityLabel={`${x.name} দল, আপনি ${x.role === 'leader' ? 'লিডার' : 'খাদেম'}`}>
              <Text style={st.val}>{x.id === gid ? '✅ ' : ''}{x.name}</Text>
              <Text style={st.small}>আপনি: {x.role === 'leader' ? '🧭 লিডার' : '🤝 খাদেম'}</Text>
            </Pressable>
          )) : <Text style={[st.small, { marginBottom: S.sm }]}>দল: {g.name} · আপনি: {g.role === 'leader' ? '🧭 লিডার' : '🤝 খাদেম'}</Text>}
          <Notice kind={waiting ? 'warn' : 'ok'} title={waiting ? `⏳ ${toBn(waiting)}টি প্রশ্নের উত্তর বাকি` : 'সব প্রশ্নের উত্তর দেওয়া হয়েছে'} />
          {rows === null ? <ActivityIndicator color={C.primary} /> : null}
          {rows && rows.length === 0 ? <Text style={st.p}>এখনো কোনো হাজী প্রশ্ন করেননি।</Text> : null}
          {(rows || []).map((r) => (
            <Pressable key={r.thread_id} onPress={() => { setThread(r); setMsgs([]); setMsg(null); }} style={[st.card, r.status === 'open' && r.last_from_haji ? { borderWidth: 2, borderColor: C.warn } : null]}
              accessibilityRole="button" accessibilityLabel={`${r.haji_name}। ${r.status === 'closed' ? 'সমাধান হয়েছে' : r.last_from_haji ? 'উত্তর বাকি' : 'উত্তর দেওয়া হয়েছে'}। শেষ বার্তা: ${r.last_body}। খুলতে চাপুন`}>
              <Text style={st.val}>🕋 {r.haji_name}</Text>
              <Text style={[st.small, { fontWeight: '700' }]}>{r.status === 'closed' ? '✅ সমাধান হয়েছে' : r.last_from_haji ? '⏳ উত্তর বাকি' : '✔️ উত্তর দেওয়া হয়েছে'} · {fmtWhen(r.last_at)}</Text>
              <Text style={st.p} numberOfLines={2}>{r.last_body}</Text>
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
