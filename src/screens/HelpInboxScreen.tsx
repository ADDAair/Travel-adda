import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { tr } from '../lib/lang';
import ScrollView from '../components/KbScroll';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import ChatBubbles, { fmtWhen } from '../components/ChatBubbles';
import { leaderGroups, notReady } from '../lib/groups';
import { useMe } from '../lib/me';
import { helpInbox, helpThread, replyHelp, setThreadStatus, myKhademGroups, checkMessage, helpErrorText, MAX_MESSAGE } from '../lib/help';
import { toBn } from '../lib/phone';
import { st } from './GroupScreen';
import type { Msg, Nav, Route } from './navTypes';

// Leader or khadem: the hajis' questions of a group. Waiting questions first. Opens one conversation to answer.
export default function HelpInboxScreen({ navigation, route }: { navigation: Nav; route?: Route }) {
  const { me } = useMe();
  type Grp = { id: string; name: string; role: string; waiting?: number };
  const [groups, setGroups] = useState<Grp[] | undefined>(undefined);       // [{ id, name, role }]
  const [gid, setGid] = useState<string | null>(route?.params?.groupId || null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof helpInbox>> | null>(null);
  const [state, setState] = useState('load');
  const [thread, setThread] = useState<Awaited<ReturnType<typeof helpInbox>>[number] | null>(null);            // inbox row being answered
  const [msgs, setMsgs] = useState<Awaited<ReturnType<typeof helpThread>>>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { if (route?.params?.groupId) { setGid(route.params.groupId); setThread(null); } }, [route?.params?.groupId]);

  const loadGroups = useCallback(async () => {
    try {
      const led: Grp[] = me && me.role === 'leader' ? (await leaderGroups()).filter((g) => g.active).map((g) => ({ id: g.id, name: g.name, role: 'leader' })) : [];
      let kh: Grp[] = [];
      try { kh = (await myKhademGroups()).map((g) => ({ id: g.group_id, name: g.group_name, role: 'khadem', waiting: g.waiting })); } catch (e) { if (!notReady(e)) throw e; }
      const all = [...led, ...kh.filter((k) => !led.some((l) => l.id === k.id))];
      setGroups(all);
      setGid((cur) => (cur && all.some((x) => x.id === cur) ? cur : all[0] ? all[0].id : null));
      if (!all.length) setState('ok');
    } catch (e) { setGroups([]); setState(notReady(e) ? 'soon' : 'err'); }
  }, [me]);
  const loadInbox = useCallback(async (quiet?: boolean) => {
    if (!gid) return;
    try { setRows(await helpInbox(gid)); setState('ok'); }
    catch (e) { if (!quiet) setState(notReady(e) ? 'soon' : 'err'); }
  }, [gid]);
  const loadThread = useCallback(async (quiet?: boolean) => {
    if (!thread) return;
    try { setMsgs(await helpThread(thread.thread_id)); } catch (e) { if (!quiet) setMsg({ kind: 'bad', text: helpErrorText(e) }); }
  }, [thread]);
  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => { loadInbox(); }, [loadInbox]);
  useEffect(() => { loadThread(); }, [loadThread]);
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!t) t = setInterval(() => { loadInbox(true); loadThread(true); }, 15000); };
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    start();
    const a = navigation?.addListener?.('focus', () => { loadGroups(); start(); });
    const b = navigation?.addListener?.('blur', stop);
    return () => { stop(); if (a) a(); if (b) b(); };
  }, [navigation, loadInbox, loadThread, loadGroups]);

  const reply = async () => {
    if (busy || !thread) return;
    const bad = checkMessage(text);
    if (bad) { setMsg({ kind: 'bad', text: bad }); return; }
    setBusy(true); setMsg(null);
    try { await replyHelp(thread.thread_id, text); setText(''); setMsg({ kind: 'ok', text: tr('উত্তর পাঠানো হয়েছে। হাজী নোটিফিকেশন পাবেন।', 'Answer sent. The haji will get a notification.') }); await loadThread(true); loadInbox(true); }
    catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }      // the text stays in the box
    finally { setBusy(false); }
  };
  const toggleClosed = async () => {
    if (busy || !thread) return;
    setBusy(true); setMsg(null);
    const next = thread.status === 'closed' ? 'open' : 'closed';
    try { await setThreadStatus(thread.thread_id, next); setThread({ ...thread, status: next }); setMsg({ kind: 'ok', text: next === 'closed' ? tr('সমাধান হয়েছে হিসেবে রাখা হলো। হাজী আবার লিখলে নিজে থেকেই খুলে যাবে।', 'Marked as solved. If the haji writes again it will open by itself.') : tr('আবার খোলা হলো।', 'Opened again.') }); loadInbox(true); }
    catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }
    finally { setBusy(false); }
  };

  const g = (groups || []).find((x) => x.id === gid);
  if (thread) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => { setThread(null); setMsg(null); setText(''); loadInbox(true); }} style={st.back} accessibilityRole="button" accessibilityLabel={tr('সব প্রশ্নের তালিকায় ফিরে যান', 'Back to the list of all questions')}><Text style={st.backT}>{tr('‹ সব প্রশ্ন', '‹ All questions')}</Text></Pressable>
        <Text style={st.title} accessibilityRole="header">🕋 {thread.haji_name}</Text>
        <Text style={[st.small, { marginBottom: S.md }]}>{tr(`আইডি: ${thread.haji_code} · দল: ${g ? g.name : ''}`, `ID: ${thread.haji_code} · Group: ${g ? g.name : ''}`)}</Text>
        <View style={st.card}><ChatBubbles rows={msgs} viewer="staff" /></View>
        {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
        <Field label={tr('আপনার উত্তর', 'Your answer')} hint={tr('পরিষ্কার করে, ছোট বাক্যে লিখুন', 'Write clearly, in short sentences')} value={text} onChangeText={setText} multiline maxLength={MAX_MESSAGE} editable={!busy} />
        <Button title={tr('উত্তর পাঠান', 'Send answer')} icon="📨" onPress={reply} loading={busy} />
        <Button title={thread.status === 'closed' ? tr('আবার খুলুন', 'Open again') : tr('সমাধান হয়েছে', 'Solved')} icon={thread.status === 'closed' ? '🔓' : '✅'} kind="secondary" onPress={toggleClosed} disabled={busy} style={{ marginTop: S.sm, marginBottom: S.xl }} />
      </ScrollView>
    );
  }

  const waiting = (rows || []).filter((r) => r.status === 'open' && r.last_from_haji).length;
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate(me && me.role === 'leader' ? 'Leader' : 'KhademHome')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('আগের পাতায় ফিরে যান', 'Back to the previous page')}><Text style={st.backT}>‹ {me && me.role === 'leader' ? tr('লিডার প্যানেল', 'Leader panel') : tr('খাদেমের পাতা', 'Khadem page')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('💬 হাজীদের প্রশ্ন', '💬 Hajis\' questions')}</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই আসছে', 'Coming soon')} text={tr('হাজীদের প্রশ্নের উত্তর দেওয়ার সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে।', 'The last step to turn on answering hajis\' questions is still to come.')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('তথ্য আনা যায়নি', 'Could not load the information')} text={tr('ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'Check the internet connection and try again.')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={() => { loadGroups(); loadInbox(); }} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && groups && groups.length === 0 ? <Notice kind="info" title={tr('কোনো দল নেই', 'No groups')} text={tr('আপনি কোনো দলের লিডার বা খাদেম হলে এখানে হাজীদের প্রশ্ন দেখবেন।', 'When you are a leader or khadem of a group, you will see hajis\' questions here.')} /> : null}
      {state === 'ok' && g ? (
        <>
          {groups && groups.length > 1 ? groups.map((x) => (
            <Pressable key={x.id} onPress={() => setGid(x.id)} style={[st.card, { paddingVertical: S.sm, marginBottom: S.xs, borderWidth: x.id === gid ? 2 : 1, borderColor: x.id === gid ? C.primary : C.line }]}
              accessibilityRole="button" accessibilityState={{ selected: x.id === gid }} accessibilityLabel={tr(`${x.name} দল, আপনি ${x.role === 'leader' ? 'লিডার' : 'খাদেম'}`, `Group ${x.name}, you are ${x.role === 'leader' ? 'the leader' : 'a khadem'}`)}>
              <Text style={st.val}>{x.id === gid ? '✅ ' : ''}{x.name}</Text>
              <Text style={st.small}>{tr('আপনি', 'You')}: {x.role === 'leader' ? tr('🧭 লিডার', '🧭 Leader') : tr('🤝 খাদেম', '🤝 Khadem')}</Text>
            </Pressable>
          )) : <Text style={[st.small, { marginBottom: S.sm }]}>{tr('দল', 'Group')}: {g.name} · {tr('আপনি', 'You')}: {g.role === 'leader' ? tr('🧭 লিডার', '🧭 Leader') : tr('🤝 খাদেম', '🤝 Khadem')}</Text>}
          <Notice kind={waiting ? 'warn' : 'ok'} title={waiting ? tr(`⏳ ${toBn(waiting)}টি প্রশ্নের উত্তর বাকি`, `⏳ ${waiting} question${waiting === 1 ? '' : 's'} waiting for an answer`) : tr('সব প্রশ্নের উত্তর দেওয়া হয়েছে', 'All questions have been answered')} />
          {rows === null ? <ActivityIndicator color={C.primary} /> : null}
          {rows && rows.length === 0 ? <Text style={st.p}>{tr('এখনো কোনো হাজী প্রশ্ন করেননি।', 'No haji has asked a question yet.')}</Text> : null}
          {(rows || []).map((r) => (
            <Pressable key={r.thread_id} onPress={() => { setThread(r); setMsgs([]); setMsg(null); }} style={[st.card, r.status === 'open' && r.last_from_haji ? { borderWidth: 2, borderColor: C.warn } : null]}
              accessibilityRole="button" accessibilityLabel={tr(`${r.haji_name}। ${r.status === 'closed' ? tr('সমাধান হয়েছে', 'Solved') : r.last_from_haji ? 'উত্তর বাকি' : 'উত্তর দেওয়া হয়েছে'}। শেষ বার্তা: ${r.last_body}। খুলতে চাপুন`, `${r.haji_name}. ${r.status === 'closed' ? 'Solved' : r.last_from_haji ? 'Waiting for an answer' : 'Answered'}. Last message: ${r.last_body}. Tap to open`)}>
              <Text style={st.val}>🕋 {r.haji_name}</Text>
              <Text style={[st.small, { fontWeight: '700' }]}>{r.status === 'closed' ? tr('✅ সমাধান হয়েছে', '✅ Solved') : r.last_from_haji ? tr('⏳ উত্তর বাকি', '⏳ Waiting for an answer') : tr('✔️ উত্তর দেওয়া হয়েছে', '✔️ Answered')} · {fmtWhen(r.last_at)}</Text>
              <Text style={st.p} numberOfLines={2}>{r.last_body}</Text>
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
