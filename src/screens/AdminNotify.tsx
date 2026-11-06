import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { tr } from '../lib/lang';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { C, S, R, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import { notReady } from '../lib/groups';
import { audienceSize, sendNotification, listBroadcasts, withdrawBroadcast, noEnYet } from '../lib/notifications';
import { st, errText, confirm, fmtWhen } from './GroupScreen';
import type { Msg } from './navTypes';
import type { Res, Item } from '../lib/types';

type Aud = 'all' | 'haji' | 'leader' | 'one';
const AUD: Record<string, string> = { get all() { return tr('সবাই', 'Everyone'); }, get haji() { return tr('সব হাজী', 'All hajis'); }, get leader() { return tr('সব লিডার', 'All leaders'); }, get one() { return tr('একজন', 'One person'); } };

// Admin / staff with the 'notify' permission: send a notice to everyone, to hajis, to leaders, or to one account.
export default function NotifyTab(): JSX.Element {
  const [aud, setAud] = useState<Aud>('all');
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [titleEn, setTitleEn] = useState('');   // optional: people who chose English see these (037)
  const [bodyEn, setBodyEn] = useState('');
  const [important, setImportant] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Res<typeof listBroadcasts> | null>(null);
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');

  const loadSent = useCallback(async () => {
    try { setSent(await listBroadcasts()); setState('ok'); } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { loadSent(); }, [loadSent]);
  useEffect(() => {
    setSize(null);
    if (aud !== 'one') audienceSize(aud).then((n) => setSize(n == null ? null : Number(n))).catch(() => setSize(null));
  }, [aud]);

  const send = () => {
    if (busy) return;
    const e: Record<string, string> = {};
    if (title.trim().length < 2) e.title = tr('শিরোনাম লিখুন।', 'Write a title.');
    if (bodyEn.trim() && !titleEn.trim()) e.titleEn = tr('ইংরেজি বিস্তারিত দিলে ইংরেজি শিরোনামও লিখুন।', 'If you write English details, write the English title too.');
    if (aud === 'one' && target.trim().length < 5) e.target = tr('হাজী/লিডার আইডি (যেমন TA-00123) বা মোবাইল নম্বর লিখুন।', 'Write the haji/leader ID (e.g. TA-00123) or mobile number.');
    setErr(e); setMsg(null);
    if (Object.keys(e).length) return;
    const who = aud === 'one' ? target.trim() : tr(`${AUD[aud]}${size != null ? ` (${toBn(size)} জন)` : ''}`, `${AUD[aud]}${size != null ? ` (${toBn(size)} people)` : ''}`);
    confirm(tr(`নোটিফিকেশন পাঠাবেন: ${who}?`, `Send the notification to: ${who}?`), tr(`"${title.trim()}"\n\nপাঠানোর পর বদলানো যায় না; ভুল হলে তুলে নিতে পারবেন।`, `"${title.trim()}"

It cannot be changed after sending; if wrong, you can take it back.`), tr('হ্যাঁ, পাঠান', 'Yes, send'), async () => {
      setBusy(true);
      try {
        const r = await sendNotification(aud, title.trim(), body.trim(), target.trim(), important, titleEn, bodyEn);
        if (r === 'ok') { setTitle(''); setBody(''); setTitleEn(''); setBodyEn(''); setTarget(''); setImportant(false); setMsg({ kind: 'ok', text: tr('নোটিফিকেশন পাঠানো হয়েছে। সবাই অ্যাপের 🔔 ঘণ্টায় দেখবেন।', 'Notification sent. Everyone will see it in the app\'s 🔔 bell.') }); loadSent(); }
        else if (r === 'not_found') setErr({ target: tr('এই আইডি বা নম্বরে কোনো অ্যাকাউন্ট পাওয়া যায়নি।', 'No account found with this ID or number.') });
        else if (r === 'too_many') setMsg({ kind: 'warn', text: tr('এক ঘণ্টায় অনেক নোটিফিকেশন পাঠানো হয়েছে। একটু পরে আবার চেষ্টা করুন।', 'Many notifications were sent in one hour. Try again a little later.') });
        else setMsg({ kind: 'bad', text: tr('তথ্য ঠিক নেই।', 'The details are not right.') });
      } catch (x) { setMsg({ kind: 'bad', text: titleEn.trim() && notReady(x) ? noEnYet() : errText(x) }); }   // the text stays
      finally { setBusy(false); }
    });
  };
  const withdraw = (b: Item<typeof listBroadcasts>) => confirm(tr('নোটিফিকেশনটি তুলে নেবেন?', 'Take the notification back?'), tr('যাঁরা এখনো দেখেননি, তাঁরা আর দেখবেন না।', 'Those who have not seen it yet will not see it.'), tr('হ্যাঁ, তুলে নিন', 'Yes, take it back'), async () => {
    try { await withdrawBroadcast(b.id); setMsg({ kind: 'ok', text: tr('তুলে নেওয়া হয়েছে।', 'Taken back.') }); loadSent(); } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
  });

  if (state === 'soon') return <Notice kind="info" title={tr("শীঘ্রই চালু হবে", 'Coming soon')} text={tr("নোটিফিকেশনের ডেটাবেস ধাপ (০০৯) এখনো চালানো হয়নি।", 'The database step (009) for notifications has not been run yet.')} />;
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <View style={st.card}>
        <Text style={st.h}>{tr('📣 নতুন নোটিফিকেশন', '📣 New notification')}</Text>
        <Text style={st.lbl}>{tr('কাকে পাঠাবেন', 'Send to')}</Text>
        <Segmented value={aud} onChange={setAud} options={[{ id: 'all', label: tr('সবাই', 'Everyone') }, { id: 'haji', label: tr('হাজী', 'Hajis') }]} />
        <View style={{ height: S.xs }} />
        <Segmented value={aud} onChange={setAud} options={[{ id: 'leader', label: tr('লিডার', 'Leaders') }, { id: 'one', label: tr('একজন', 'One person') }]} />
        {aud !== 'one' && size != null ? <Text style={[st.small, { marginTop: S.xs }]}>{toBn(size)} {tr('জন পাবেন', 'people will get it')}</Text> : null}
        <View style={{ height: S.md }} />
        {aud === 'one' ? <Field label={tr("আইডি বা মোবাইল নম্বর", 'ID or mobile number')} hint={tr("যেমন: TA-00123 বা 01712345678", 'e.g. TA-00123 or 01712345678')} value={target} onChangeText={setTarget} maxLength={20} autoCapitalize="characters" error={err.target} /> : null}
        <Field label={tr("শিরোনাম", 'Title')} hint={tr("যেমন: হজ নিবন্ধনের শেষ তারিখ ৩০ নভেম্বর", 'e.g. last date for Hajj registration is 30 November')} value={title} onChangeText={setTitle} maxLength={120} error={err.title} />
        <Field label={tr("বিস্তারিত (ইচ্ছা করলে)", 'Details (optional)')} value={body} onChangeText={setBody} multiline maxLength={1000} />
        <Text style={[st.small, { marginBottom: S.xs }]}>{tr('🌐 যাঁরা অ্যাপ ইংরেজিতে চালান, তাঁরা ইংরেজি লেখা দেখবেন। খালি রাখলে সবাই বাংলাই দেখবেন।', '🌐 People who use the app in English will see the English text. If left empty, everyone sees the Bengali.')}</Text>
        <Field label={tr('ইংরেজি শিরোনাম (ইচ্ছা করলে)', 'English title (optional)')} hint={tr('যেমন: Last date for Hajj registration is 30 November', 'e.g. Last date for Hajj registration is 30 November')} value={titleEn} onChangeText={setTitleEn} maxLength={120} error={err.titleEn} />
        <Field label={tr('ইংরেজি বিস্তারিত (ইচ্ছা করলে)', 'English details (optional)')} value={bodyEn} onChangeText={setBodyEn} multiline maxLength={1000} />
        {aud !== 'one' ? (
          <Pressable onPress={() => setImportant(!important)} style={{ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', marginBottom: S.sm }}
            accessibilityRole="checkbox" accessibilityState={{ checked: important }} accessibilityLabel={tr("জরুরি নোটিশ হিসেবে দেখান", 'Show as an urgent notice')}>
            <Text style={st.p}>{important ? '☑️' : '⬜'} {tr('জরুরি নোটিশ (হোমে ওপরে কমলা রঙে দেখাবে)', 'Urgent notice (shown in orange at the top of Home)')}</Text>
          </Pressable>
        ) : null}
        {title.trim() ? (
          <View style={{ borderWidth: 2, borderColor: important ? C.accent : C.gold, backgroundColor: important ? C.accentSoft : C.goldSoft, borderRadius: R.md, padding: S.sm, marginBottom: S.sm }}>
            <Text style={st.small}>{tr('দেখতে এমন হবে:', 'It will look like this:')}</Text>
            <Text style={[st.p, { fontWeight: '700' }]}>{important ? '⚠️ ' : '📣 '}{title.trim()}</Text>
            {body.trim() ? <Text style={st.small}>{body.trim()}</Text> : null}
            {titleEn.trim() ? <Text style={[st.small, { marginTop: S.xs }]}>{tr('ইংরেজিতে:', 'In English:')}</Text> : null}
            {titleEn.trim() ? <Text style={[st.p, { fontWeight: '700' }]}>{important ? '⚠️ ' : '📣 '}{titleEn.trim()}</Text> : null}
            {titleEn.trim() && bodyEn.trim() ? <Text style={st.small}>{bodyEn.trim()}</Text> : null}
          </View>
        ) : null}
        <Button title={tr("পাঠান", 'Send')} icon="📨" onPress={send} loading={busy} />
      </View>
      <Text style={[st.h, { marginTop: S.sm }]}>{tr('আগে পাঠানো (সবাইকে / দলে দলে)', 'Sent before (to everyone / to groups)')}</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr("তালিকা আনা যায়নি", 'Could not load the list')} /> : null}
      {(sent || []).map((b) => (
        <View key={b.id} style={[st.card, b.withdrawn && { opacity: 0.6 }]}>
          <Text style={st.val}>{b.important ? '⚠️ ' : ''}{b.title}</Text>
          {b.body ? <Text style={st.small}>{b.body}</Text> : null}
          <Text style={st.small}>{AUD[b.audience]} · {fmtWhen(b.created_at)} · {b.sender || ''} · {toBn(b.reads)} {tr('জন পড়েছেন', 'people have read it')}{b.withdrawn ? tr(' · তুলে নেওয়া হয়েছে', ' · taken back') : ''}</Text>
          {!b.withdrawn ? <Pressable onPress={() => withdraw(b)} style={st.leave} accessibilityRole="button"><Text style={st.leaveT}>{tr('তুলে নিন', 'Take back')}</Text></Pressable> : null}
        </View>
      ))}
    </>
  );
}
