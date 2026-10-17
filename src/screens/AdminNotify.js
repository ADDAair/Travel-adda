import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { C, F, S, R, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import { notReady } from '../lib/groups';
import { audienceSize, sendNotification, listBroadcasts, withdrawBroadcast } from '../lib/notifications';
import { st, errText, confirm, fmtWhen } from './GroupScreen';

const AUD = { all: 'সবাই', haji: 'সব হাজী', leader: 'সব লিডার', one: 'একজন' };

// Admin / staff with the 'notify' permission: send a notice to everyone, to hajis, to leaders, or to one account.
export default function NotifyTab() {
  const [aud, setAud] = useState('all');
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [important, setImportant] = useState(false);
  const [size, setSize] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState({});
  const [sent, setSent] = useState(null);
  const [state, setState] = useState('load');

  const loadSent = useCallback(async () => {
    try { setSent(await listBroadcasts()); setState('ok'); } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { loadSent(); }, [loadSent]);
  useEffect(() => {
    setSize(null);
    if (aud !== 'one') audienceSize(aud).then(setSize).catch(() => setSize(null));
  }, [aud]);

  const send = () => {
    if (busy) return;
    const e = {};
    if (title.trim().length < 2) e.title = 'শিরোনাম লিখুন।';
    if (aud === 'one' && target.trim().length < 5) e.target = 'হাজী/লিডার আইডি (যেমন TA-00123) বা মোবাইল নম্বর লিখুন।';
    setErr(e); setMsg(null);
    if (Object.keys(e).length) return;
    const who = aud === 'one' ? target.trim() : `${AUD[aud]}${size != null ? ` (${toBn(size)} জন)` : ''}`;
    confirm(`নোটিফিকেশন পাঠাবেন: ${who}?`, `"${title.trim()}"\n\nপাঠানোর পর বদলানো যায় না; ভুল হলে তুলে নিতে পারবেন।`, 'হ্যাঁ, পাঠান', async () => {
      setBusy(true);
      try {
        const r = await sendNotification(aud, title.trim(), body.trim(), target.trim(), important);
        if (r === 'ok') { setTitle(''); setBody(''); setTarget(''); setImportant(false); setMsg({ kind: 'ok', text: 'নোটিফিকেশন পাঠানো হয়েছে। সবাই অ্যাপের 🔔 ঘণ্টায় দেখবেন।' }); loadSent(); }
        else if (r === 'not_found') setErr({ target: 'এই আইডি বা নম্বরে কোনো অ্যাকাউন্ট পাওয়া যায়নি।' });
        else if (r === 'too_many') setMsg({ kind: 'warn', text: 'এক ঘণ্টায় অনেক নোটিফিকেশন পাঠানো হয়েছে। একটু পরে আবার চেষ্টা করুন।' });
        else setMsg({ kind: 'bad', text: 'তথ্য ঠিক নেই।' });
      } catch (x) { setMsg({ kind: 'bad', text: errText(x) }); }   // the text stays
      finally { setBusy(false); }
    });
  };
  const withdraw = (b) => confirm('নোটিফিকেশনটি তুলে নেবেন?', 'যাঁরা এখনো দেখেননি, তাঁরা আর দেখবেন না।', 'হ্যাঁ, তুলে নিন', async () => {
    try { await withdrawBroadcast(b.id); setMsg({ kind: 'ok', text: 'তুলে নেওয়া হয়েছে।' }); loadSent(); } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
  });

  if (state === 'soon') return <Notice kind="info" title="শীঘ্রই চালু হবে" text="নোটিফিকেশনের ডেটাবেস ধাপ (০০৯) এখনো চালানো হয়নি।" />;
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <View style={st.card}>
        <Text style={st.h}>📣 নতুন নোটিফিকেশন</Text>
        <Text style={st.lbl}>কাকে পাঠাবেন</Text>
        <Segmented value={aud} onChange={setAud} options={[{ id: 'all', label: 'সবাই' }, { id: 'haji', label: 'হাজী' }]} />
        <View style={{ height: S.xs }} />
        <Segmented value={aud} onChange={setAud} options={[{ id: 'leader', label: 'লিডার' }, { id: 'one', label: 'একজন' }]} />
        {aud !== 'one' && size != null ? <Text style={[st.small, { marginTop: S.xs }]}>{toBn(size)} জন পাবেন</Text> : null}
        <View style={{ height: S.md }} />
        {aud === 'one' ? <Field label="আইডি বা মোবাইল নম্বর" hint="যেমন: TA-00123 বা 01712345678" value={target} onChangeText={setTarget} maxLength={20} autoCapitalize="characters" error={err.target} /> : null}
        <Field label="শিরোনাম" hint="যেমন: হজ নিবন্ধনের শেষ তারিখ ৩০ নভেম্বর" value={title} onChangeText={setTitle} maxLength={120} error={err.title} />
        <Field label="বিস্তারিত (ইচ্ছা করলে)" value={body} onChangeText={setBody} multiline maxLength={1000} />
        {aud !== 'one' ? (
          <Pressable onPress={() => setImportant(!important)} style={{ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', marginBottom: S.sm }}
            accessibilityRole="checkbox" accessibilityState={{ checked: important }} accessibilityLabel="জরুরি নোটিশ হিসেবে দেখান">
            <Text style={st.p}>{important ? '☑️' : '⬜'} জরুরি নোটিশ (হোমে ওপরে কমলা রঙে দেখাবে)</Text>
          </Pressable>
        ) : null}
        {title.trim() ? (
          <View style={{ borderWidth: 2, borderColor: important ? C.accent : C.gold, backgroundColor: important ? C.accentSoft : C.goldSoft, borderRadius: R.md, padding: S.sm, marginBottom: S.sm }}>
            <Text style={st.small}>দেখতে এমন হবে:</Text>
            <Text style={[st.p, { fontWeight: '700' }]}>{important ? '⚠️ ' : '📣 '}{title.trim()}</Text>
            {body.trim() ? <Text style={st.small}>{body.trim()}</Text> : null}
          </View>
        ) : null}
        <Button title="পাঠান" icon="📨" onPress={send} loading={busy} />
      </View>
      <Text style={[st.h, { marginTop: S.sm }]}>আগে পাঠানো (সবাইকে / দলে দলে)</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'err' ? <Notice kind="bad" title="তালিকা আনা যায়নি" /> : null}
      {(sent || []).map((b) => (
        <View key={b.id} style={[st.card, b.withdrawn && { opacity: 0.6 }]}>
          <Text style={st.val}>{b.important ? '⚠️ ' : ''}{b.title}</Text>
          {b.body ? <Text style={st.small}>{b.body}</Text> : null}
          <Text style={st.small}>{AUD[b.audience]} · {fmtWhen(b.created_at)} · {b.sender || ''} · {toBn(b.reads)} জন পড়েছেন{b.withdrawn ? ' · তুলে নেওয়া হয়েছে' : ''}</Text>
          {!b.withdrawn ? <Pressable onPress={() => withdraw(b)} style={st.leave} accessibilityRole="button"><Text style={st.leaveT}>তুলে নিন</Text></Pressable> : null}
        </View>
      ))}
    </>
  );
}
