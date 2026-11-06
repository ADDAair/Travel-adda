import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator, Image } from 'react-native';
import { tr } from '../lib/lang';
import { withCopy } from '../lib/offlineStore';
import { OfflineNote } from '../components/OfflineNote';
import ScrollView from '../components/KbScroll';
import * as DocumentPicker from 'expo-document-picker';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { ContractDetails, ReasonBox, Stars } from '../components/market';
import { toBn } from '../lib/phone';
import { notReady, telBd } from '../lib/groups';
import { signedAvatarUrl } from '../lib/avatar';
import { myContracts, respondContract, cancelContract, rateLeader, fileComplaint, myComplaints, myReferral, setReferral, requestReferralCancel, type Evidence } from '../lib/market';
import { shareContractPdf } from '../lib/contractPdf';
import PaymentBox from '../components/PaymentBox';
import { myChatConsents, type MyConsent } from '../lib/chatConsent';
import { st, confirm, errText, fmtDay, fmtWhen } from './GroupScreen';
import type { Msg, Nav } from './navTypes';

import type { MyContract, Res } from '../lib/types';

type Act = (fn: () => Promise<unknown>, ok: (r: unknown) => Msg) => Promise<void>;
type Box = { c: MyContract; busy: boolean; act: Act; setMsg: (m: Msg) => void };

const COMPLAINT_STATUS: Record<string, string> = {
  get pending() { return tr('⏳ অ্যাডমিন যাচাই করছেন', '⏳ The admin is checking'); },
  get verified() { return tr('✅ যাচাই হয়েছে (সবাই দেখতে পাবেন)', '✅ Verified (everyone can see it)'); },
  get rejected() { return tr('✖️ প্রমাণ পাওয়া যায়নি', '✖️ No proof found'); },
};

// Haji: my leader (referral), contracts to read and accept, cancel with a reason, PDF, rating and complaints.
export default function MyLeaderScreen({ navigation }: { navigation: Nav }): JSX.Element {
  const [rows, setRows] = useState<MyContract[] | null>(null);
  const [ref, setRef] = useState<Res<typeof myReferral> | undefined>(undefined);
  const [complaints, setComplaints] = useState<Res<typeof myComplaints>>([]);
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [asks, setAsks] = useState<MyConsent[]>([]);
  const [offAt, setOffAt] = useState<number | null>(null);   // showing the copy saved on this phone (no internet)

  const load = useCallback(async () => {
    myChatConsents().then(setAsks).catch(() => {});
    try {
      const x = await withCopy('myLeader', () => Promise.all([myContracts(), myReferral(), myComplaints()]));
      const [c, r, k] = x.data;
      setRows(c); setRef(r); setComplaints(k); setOffAt(x.offline ? x.at : null); setState('ok');
    } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const act: Act = async (fn, ok) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const r = await fn(); const t = ok(r); if (t) setMsg(t); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };

  const active = (rows || []).find((c) => c.status === 'accepted');
  const sent = (rows || []).filter((c) => c.status === 'sent');
  const past = (rows || []).filter((c) => ['completed', 'cancelled', 'declined'].includes(c.status));

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}><Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('🤝 লিডার ও চুক্তি', '🤝 Leader and contract')}</Text>
      {offAt ? <OfflineNote when={fmtWhen(offAt)} /> : null}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {asks.some((k) => k.status === 'asked') ? (
        <Notice kind="warn" title={tr('🔐 Travel Adda আপনার অনুমতি চাইছে', '🔐 Travel Adda is asking your permission')} text={tr('বিরোধ মেটাতে লিডারের সাথে আপনার প্রশ্ন-উত্তর দেখার অনুমতি চাওয়া হয়েছে। আপনি রাজি না হলে কেউ দেখবে না।', 'Permission is asked to see your questions and answers with the leader, to settle a dispute. If you do not agree, nobody will see them.')}>
          <Button title={tr('অনুরোধটি দেখুন', 'See the request')} icon="🔐" onPress={() => navigation.navigate('ChatConsent')} style={{ marginTop: S.sm }} />
        </Notice>
      ) : asks.length ? (
        <Button title={tr('প্রশ্ন-উত্তর দেখার অনুমতি (চালু আছে)', 'Permission to see questions and answers (on)')} icon="🔐" kind="secondary" onPress={() => navigation.navigate('ChatConsent')} style={{ marginBottom: S.md }} />
      ) : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই চালু হবে', 'Coming soon')} text={tr('লিডার তালিকা, রেফারেল কোড ও চুক্তির সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে।', 'The last step to turn on the leader list, referral codes and contracts is still to come.')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('তথ্য আনা যায়নি', 'Could not load the information')} text={tr('ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'Check the internet connection and try again.')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}

      {state === 'ok' ? (
        <>
          {sent.map((c) => (
            <View key={c.id} style={[st.card, st.invite]}>
              <Text style={st.h}>{tr('📩 নতুন চুক্তির অনুরোধ', '📩 New contract request')}</Text>
              <ContractDetails c={c} />
              {active ? <Notice kind="warn" title={tr('আপনার একটি চুক্তি চালু আছে', 'You have an active contract')} text={tr('একসাথে একটাই চুক্তি রাখা যায়। নতুনটিতে রাজি হতে আগে চালু চুক্তিটি বাতিল করুন।', 'Only one contract can be active at a time. To accept the new one, first cancel the active contract.')} /> : (
                <Button title={tr('পড়েছি, আমি রাজি', 'I have read it, I agree')} icon="✍️" onPress={() => confirm(tr('এই চুক্তিতে রাজি হবেন?', 'Agree to this contract?'), tr('রাজি হলে চুক্তি চালু হবে, লিডার আপনার ফোন নম্বর দেখবেন, আপনিও লিডারের নম্বর পাবেন। আগে সব শর্ত পড়ে নিন।', 'If you agree, the contract starts, the leader sees your phone number and you get the leader\'s number. Read all the terms first.'), tr('হ্যাঁ, রাজি', 'Yes, I agree'), () => act(() => respondContract(c.id, true), (r) => (r === 'ok' ? { kind: 'ok', text: tr('চুক্তি চালু হয়েছে। চুক্তির PDF নিচ থেকে নিতে পারবেন।', 'The contract is active. You can get the contract PDF below.') } : r === 'have_active' ? { kind: 'warn', text: tr('আপনার আরেকটি চুক্তি চালু আছে।', 'You have another active contract.') } : { kind: 'warn', text: tr('চুক্তিটি আর পাওয়া যাচ্ছে না (হয়তো লিডার ফিরিয়ে নিয়েছেন)।', 'The contract is no longer available (maybe the leader withdrew it).') })))}
                  loading={busy} style={{ marginTop: S.md }} />
              )}
              <Button title={tr('না, রাজি নই', 'No, I do not agree')} kind="secondary" onPress={() => confirm(tr('চুক্তির অনুরোধটি ফিরিয়ে দেবেন?', 'Decline the contract request?'), '', tr('হ্যাঁ, ফিরিয়ে দিন', 'Yes, decline'), () => act(() => respondContract(c.id, false), () => ({ kind: 'ok', text: tr('অনুরোধটি ফিরিয়ে দেওয়া হয়েছে।', 'The request was declined.') })))} disabled={busy} style={{ marginTop: S.sm }} />
            </View>
          ))}

          {active ? <ActiveContract c={active} busy={busy} act={act} setMsg={setMsg} /> : null}

          <ReferralCard r={ref} busy={busy} act={act} hasContract={!!active} />

          <Button title={tr('যাচাই করা লিডার খুঁজুন', 'Find verified leaders')} icon="🔎" kind="secondary" onPress={() => navigation.navigate('Leaders')} style={{ marginBottom: S.sm }} />
          <Button title={tr('আমার দল ও লিডারের ঘোষণা', 'My group and leader announcements')} icon="📢" kind="secondary" onPress={() => navigation.navigate('Group')} style={{ marginBottom: S.md }} />

          {!active && sent.length === 0 ? (
            <Notice kind="info" title={tr('এখনো কোনো চুক্তি নেই', 'No contract yet')} text={tr('পছন্দের লিডার খুঁজে হেল্পলাইনের মাধ্যমে যোগাযোগ করুন। লিডার আপনার হাজী আইডিতে চুক্তির অনুরোধ পাঠালে এখানে দেখবেন, পড়ে রাজি হতে পারবেন।', 'Find a leader you like and get in touch through the helpline. When the leader sends a contract request to your Haji ID, you will see it here and can read and accept it.')} />
          ) : null}

          {past.length ? <Text style={[st.h, { marginTop: S.md }]}>{tr('আগের চুক্তি', 'Earlier contracts')}</Text> : null}
          {past.map((c) => <PastContract key={c.id} c={c} busy={busy} act={act} setMsg={setMsg} />)}

          {complaints.length ? <Text style={[st.h, { marginTop: S.md }]}>{tr('আমার অভিযোগ', 'My complaints')}</Text> : null}
          {complaints.map((k) => (
            <View key={k.id} style={st.card}>
              <Text style={st.small}>{fmtDay(k.created_at)} · {tr('চুক্তি', 'Contract')} {k.contract_no} · {k.leader_name}</Text>
              <Text style={st.p}>{k.body}</Text>
              <Text style={st.val}>{COMPLAINT_STATUS[k.status]}</Text>
              {k.files ? <Text style={st.small}>{tr(`📎 প্রমাণ: ${toBn(k.files)}টি ফাইল`, `📎 Proof: ${k.files} file${k.files === 1 ? '' : 's'}`)}</Text> : null}
              {k.admin_note ? <Text style={st.small}>{tr('অ্যাডমিনের নোট', "Admin's note")}: {k.admin_note}</Text> : null}
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function PdfButton({ c, setMsg }: { c: MyContract; setMsg: (m: Msg) => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  return <Button title={tr('চুক্তির PDF নিন', 'Get the contract PDF')} icon="📄" kind="secondary" loading={busy} style={{ marginTop: S.sm }}
    onPress={async () => { setBusy(true); try { await shareContractPdf(c); } catch (e) { setMsg({ kind: 'bad', text: tr('PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।', 'Could not make the PDF. Try again.') }); } finally { setBusy(false); } }} />;
}

function ActiveContract({ c, busy, act, setMsg }: Box): JSX.Element {
  const [cancel, setCancel] = useState(false);
  return (
    <View style={[st.card, { borderWidth: 2, borderColor: C.ok }]}>
      <ContractDetails c={c} />
      {c.leader_phone ? <Button title={tr(`লিডারকে ফোন করুন (${toBn(c.leader_phone)})`, `Call the leader (${c.leader_phone})`)} icon="📞" onPress={() => Linking.openURL(`tel:${telBd(c.leader_phone)}`).catch(() => {})} style={{ marginTop: S.md }} /> : null}
      <PaymentBox contract={c} />
      <PdfButton c={c} setMsg={setMsg} />
      <RateBox c={c} busy={busy} act={act} />
      <ComplaintBox c={c} setMsg={setMsg} />
      {cancel ? (
        <ReasonBox title={tr('চুক্তি বাতিল', 'Cancel the contract')} hint={tr('যেমন: লিডার ভিসার কাজ শুরু করেননি', 'e.g. the leader has not started the visa work')} button={tr('চুক্তি বাতিল করুন', 'Cancel the contract')} busy={busy} onClose={() => setCancel(false)}
          onSubmit={(reason: string) => act(() => cancelContract(c.id, reason), (r) => { setCancel(false); return r === 'ok' ? { kind: 'ok', text: tr('চুক্তি বাতিল হয়েছে। Travel Adda-তে জমা দেওয়া টাকা চুক্তির ফেরতের নিয়ম অনুযায়ী মেটানো হবে; Travel Adda হেল্পলাইনে যোগাযোগ করুন।', 'The contract is cancelled. Money paid to Travel Adda will be settled by the contract\'s refund rules; contact the Travel Adda helpline.') } : { kind: 'warn', text: tr('চুক্তিটি আর চালু নেই।', 'The contract is no longer active.') }; })} />
      ) : (
        <Pressable onPress={() => setCancel(true)} style={st.leave} accessibilityRole="button" accessibilityLabel={tr('চুক্তি বাতিল করুন', 'Cancel the contract')}><Text style={st.leaveT}>{tr('চুক্তি বাতিল করুন', 'Cancel the contract')}</Text></Pressable>
      )}
    </View>
  );
}

function PastContract({ c, busy, act, setMsg }: Box): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <View style={st.card}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={`${c.title}, ${open ? tr('লুকান', 'hide') : tr('বিস্তারিত দেখুন', 'see details')}`}>
        <Text style={st.val}>{c.title} {open ? '▴' : '▾'}</Text>
        <Text style={st.small}>{tr('চুক্তি', 'Contract')} {c.contract_no} · {c.leader_name}</Text>
      </Pressable>
      {open ? <ContractDetails c={c} /> : null}
      {c.status !== 'declined' ? <PdfButton c={c} setMsg={setMsg} /> : null}
      {c.status !== 'declined' ? <RateBox c={c} busy={busy} act={act} /> : null}
      {c.status !== 'declined' ? <ComplaintBox c={c} setMsg={setMsg} /> : null}
    </View>
  );
}

function RateBox({ c, busy, act }: { c: MyContract; busy: boolean; act: Act }): JSX.Element {
  const [stars, setStars] = useState<number>(c.my_stars || 0);
  const [comment, setComment] = useState(c.my_comment || '');
  const [open, setOpen] = useState(false);
  if (!open) {
    return <Button title={c.my_stars ? tr(`আপনার রেটিং: ${'⭐'.repeat(c.my_stars)} (বদলান)`, `Your rating: ${'⭐'.repeat(c.my_stars)} (change)`) : tr('লিডারকে রেটিং দিন', 'Rate the leader')} icon={c.my_stars ? undefined : '⭐'} kind="secondary" onPress={() => setOpen(true)} style={{ marginTop: S.sm }} />;
  }
  return (
    <View style={[st.cRow, { paddingTop: S.sm }]}>
      <Text style={st.h}>{tr('⭐ লিডার কেমন ছিলেন?', '⭐ How was the leader?')}</Text>
      <Stars value={stars} onChange={setStars} />
      <Field label={tr('মন্তব্য (ইচ্ছা করলে, সবাই দেখবেন)', 'Comment (optional; everyone will see it)')} value={comment} onChangeText={setComment} multiline maxLength={500} />
      <Text style={st.small}>{tr('ℹ️ Travel Adda আপনার টাকা জমা যাচাই করার পর আপনার রেটিং ও মন্তব্য লিডারের প্রোফাইলে দেখাবে ও গণনা হবে। এতে নকল রেটিং দেওয়া যায় না।', 'ℹ️ After Travel Adda checks your payment, your rating and comment show on the leader\'s profile and are counted. This stops fake ratings.')}</Text>
      <Button title={tr('রেটিং জমা দিন', 'Send rating')} onPress={() => { if (!stars) return; act(() => rateLeader(c.id, stars, comment), (r) => { setOpen(false); return r === 'ok' ? { kind: 'ok', text: tr('রেটিং জমা হয়েছে। ধন্যবাদ। টাকা জমা যাচাইয়ের পর এটি লিডারের প্রোফাইলে দেখাবে।', 'Rating sent. Thank you. It shows on the leader\'s profile after the payment is checked.') } : { kind: 'warn', text: tr('রেটিং দেওয়া যায়নি।', 'Could not send the rating.') }; }); }} disabled={!stars} loading={busy} />
      <Button title={tr('বাতিল', 'Cancel')} kind="secondary" onPress={() => setOpen(false)} style={{ marginTop: S.sm }} />
    </View>
  );
}

function ComplaintBox({ c, setMsg }: { c: MyContract; setMsg: (m: Msg) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<(Evidence & { name: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'audio/*', 'video/*'], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets || !r.assets[0]) return;
      const a = r.assets[0];
      const mime = a.mimeType || '';
      const kind: Evidence['kind'] | null = mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : null;
      if (!kind) { setErr(tr('শুধু ছবি, অডিও বা ভিডিও দেওয়া যাবে।', 'Only photos, audio or video can be added.')); return; }
      if (a.size && a.size > 20 * 1024 * 1024) { setErr(tr('ফাইলটি ২০ এমবির বেশি বড়। ছোট ফাইল দিন।', 'The file is larger than 20 MB. Choose a smaller file.')); return; }
      if (files.length >= 5) { setErr(tr('সর্বোচ্চ ৫টি ফাইল দেওয়া যায়।', 'At most 5 files can be added.')); return; }
      setErr(''); setFiles((x) => [...x, { uri: a.uri, kind, mime, name: a.name || tr('ফাইল', 'File') }]);
    } catch (e) { setErr(tr('ফাইল খোলা যায়নি।', 'Could not open the file.')); }
  };
  const send = () => {
    if (body.trim().length < 10) { setErr(tr('কী হয়েছে, একটু বিস্তারিত লিখুন (অন্তত ১০ অক্ষর)।', 'Write what happened in a little more detail (at least 10 letters).')); return; }
    confirm(tr('অভিযোগ পাঠাবেন?', 'Send the complaint?'), tr('অ্যাডমিন যাচাই করবেন। যাচাই হলে অভিযোগের লেখা লিডারের প্রোফাইলে সবাই দেখবেন (আপনার নাম দেখাবে না)।', 'The admin will check it. If verified, everyone sees the complaint text on the leader\'s profile (your name is not shown).'), tr('হ্যাঁ, পাঠান', 'Yes, send'), async () => {
      setBusy(true); setErr('');
      try {
        const r = await fileComplaint(c.id, body, files);
        setOpen(false); setBody(''); setFiles([]);
        setMsg(r.failed ? { kind: 'warn', text: tr(`অভিযোগ জমা হয়েছে, কিন্তু ${toBn(r.failed)}টি ফাইল পাঠানো যায়নি।`, `Complaint sent, but ${r.failed} file${r.failed === 1 ? '' : 's'} could not be sent.`) } : { kind: 'ok', text: tr('অভিযোগ জমা হয়েছে। অ্যাডমিন যাচাই করে জানাবেন।', 'Complaint sent. The admin will check it and let you know.') });
      } catch (e) { setErr(String((e as { message?: string } | null)?.message || '').includes('too many') ? tr('আজ আর অভিযোগ পাঠানো যাবে না।', 'No more complaints can be sent today.') : errText(e)); }   // text stays
      finally { setBusy(false); }
    });
  };
  if (!open) return <Pressable onPress={() => setOpen(true)} style={st.leave} accessibilityRole="button"><Text style={[st.leaveT, { color: C.warn || C.bad }]}>{tr('🚩 লিডারের বিরুদ্ধে অভিযোগ', '🚩 Complain about the leader')}</Text></Pressable>;
  return (
    <View style={[st.cRow, { paddingTop: S.sm }]}>
      <Text style={st.h}>{tr('🚩 অভিযোগ', '🚩 Complaint')}</Text>
      <Field label={tr('কী হয়েছে লিখুন', 'Write what happened')} hint={tr('তারিখ, জায়গা, কী কথা হয়েছিল', 'Date, place, what was said')} value={body} onChangeText={setBody} multiline maxLength={2000} error={err} />
      {files.map((f, i) => <Text key={`${f.uri}${i}`} style={st.small}>📎 {f.kind === 'image' ? tr('ছবি', 'Photo') : f.kind === 'audio' ? tr('অডিও', 'Audio') : tr('ভিডিও', 'Video')}: {f.name}</Text>)}
      <Button title={tr('প্রমাণ যোগ করুন (ছবি/অডিও/ভিডিও)', 'Add proof (photo/audio/video)')} icon="📎" kind="secondary" onPress={pick} disabled={busy} />
      <Button title={tr('অভিযোগ পাঠান', 'Send complaint')} icon="📨" kind="danger" onPress={send} loading={busy} style={{ marginTop: S.sm }} />
      <Button title={tr('বাতিল', 'Cancel')} kind="secondary" onPress={() => setOpen(false)} disabled={busy} style={{ marginTop: S.sm }} />
    </View>
  );
}

function ReferralCard({ r, busy, act, hasContract }: { r: Res<typeof myReferral> | undefined; busy: boolean; act: Act; hasContract: boolean }): JSX.Element {
  const [code, setCode] = useState('');
  const [cancel, setCancel] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { if (r && r.avatar_path) signedAvatarUrl(r.avatar_path).then(setPhoto); }, [r]);
  if (r && r.status !== 'rejected') {
    return (
      <View style={st.card}>
        <Text style={st.h}>{tr('🧭 আমার লিডার (রেফারেল)', '🧭 My leader (referral)')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: 28 }} accessibilityLabel={tr(`${r.full_name}-এর ছবি`, `Photo of ${r.full_name}`)} /> : <Text style={{ fontSize: 40 }}>👤</Text>}
          <View style={{ flex: 1 }}>
            <Text style={st.val}>{r.full_name}</Text>
            <Text style={st.small}>{r.leader_code}{r.agency_name ? ` · ${r.agency_name}` : ''}</Text>
          </View>
        </View>
        <Text style={[st.p, { marginTop: S.sm }]}>{r.status === 'confirmed' ? tr('✅ লিডার আপনাকে নিশ্চিত করেছেন।', '✅ The leader has confirmed you.') : tr('⏳ লিডার এখনো নিশ্চিত করেননি।', '⏳ The leader has not confirmed yet.')}</Text>
        <Text style={st.small}>{tr('রেফারেল থাকা অবস্থায় তালিকায় শুধু এই লিডারকে দেখবেন, আর শুধু তিনিই চুক্তি পাঠাতে পারবেন।', 'While the referral lasts, you see only this leader in the list, and only they can send you a contract.')}</Text>
        {r.cancel_requested ? <Notice kind="info" title={tr('রেফারেল বাতিলের অনুরোধ অ্যাডমিনের কাছে আছে', 'Your request to cancel the referral is with the admin')} /> : cancel ? (
          <ReasonBox title={tr('রেফারেল বাতিলের অনুরোধ', 'Request to cancel the referral')} hint={tr('কেন অন্য লিডার খুঁজতে চান', 'Why you want another leader')} button={tr('অনুরোধ পাঠান', 'Send request')} min={5} busy={busy} onClose={() => setCancel(false)}
            onSubmit={(reason: string) => act(() => requestReferralCancel(reason), (x) => { setCancel(false); return x === 'ok' ? { kind: 'ok', text: tr('অনুরোধ পাঠানো হয়েছে। অ্যাডমিন অনুমোদন দিলে অন্য লিডার দেখতে পাবেন।', 'Request sent. When the admin approves, you can see other leaders.') } : { kind: 'warn', text: tr('অনুরোধ পাঠানো যায়নি।', 'The request could not be sent.') }; })} />
        ) : !hasContract ? (
          <Pressable onPress={() => setCancel(true)} style={st.leave} accessibilityRole="button"><Text style={st.leaveT}>{tr('রেফারেল বাতিলের অনুরোধ', 'Request to cancel the referral')}</Text></Pressable>
        ) : null}
      </View>
    );
  }
  return (
    <View style={st.card}>
      <Text style={st.h}>{tr('🔑 লিডারের রেফারেল কোড আছে?', '🔑 Have a leader\'s referral code?')}</Text>
      {r && r.status === 'rejected' ? <Text style={st.small}>{tr('আগের লিডার রেফারেল নিশ্চিত করেননি। চাইলে নতুন কোড দিন।', 'The earlier leader did not confirm the referral. You can enter a new code.')}</Text> : null}
      <Field label={tr('রেফারেল কোড', 'Referral code')} hint={tr('যেমন: TL-00012', 'e.g. TL-00012')} value={code} onChangeText={(v: string) => setCode(v.toUpperCase())} maxLength={12} autoCapitalize="characters" autoCorrect={false} />
      <Button title={tr('কোড যুক্ত করুন', 'Add code')} icon="➕" kind="secondary" loading={busy} onPress={() => {
        const c = code.trim().replace(/\s/g, '').replace(/^TL(\d)/, 'TL-$1');
        if (!/^TL-\d{1,8}$/.test(c)) return act(async () => 'format', () => ({ kind: 'bad', text: tr('কোড এমন হয়: TL-00012', 'A code looks like this: TL-00012') }));
        return act(() => setReferral(c), (x) => (x === 'ok' ? { kind: 'ok', text: tr('রেফারেল কোড যুক্ত হয়েছে। লিডার নিশ্চিত করলে এখানে দেখবেন।', 'Referral code added. You will see it here when the leader confirms.') } : x === 'already' ? { kind: 'info', text: tr('আপনার একজন লিডার আগে থেকেই যুক্ত আছেন।', 'You already have a leader.') } : { kind: 'bad', text: tr('এই কোডে কোনো লিডার পাওয়া যায়নি।', 'No leader found for this code.') }));
      }} />
    </View>
  );
}
