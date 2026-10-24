import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, ActivityIndicator, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { ContractDetails, ReasonBox, Stars } from '../components/market';
import { toBn } from '../lib/phone';
import { notReady, telBd } from '../lib/groups';
import { signedAvatarUrl } from '../lib/avatar';
import { myContracts, respondContract, cancelContract, rateLeader, fileComplaint, myComplaints, myReferral, setReferral, requestReferralCancel } from '../lib/market';
import { shareContractPdf } from '../lib/contractPdf';
import PaymentBox from '../components/PaymentBox';
import { st, confirm, errText, fmtDay } from './GroupScreen';

const COMPLAINT_STATUS = { pending: '⏳ অ্যাডমিন যাচাই করছেন', verified: '✅ যাচাই হয়েছে (সবাই দেখতে পাবেন)', rejected: '✖️ প্রমাণ পাওয়া যায়নি' };

// Haji: my leader (referral), contracts to read and accept, cancel with a reason, PDF, rating and complaints.
export default function MyLeaderScreen({ navigation }) {
  const [rows, setRows] = useState(null);
  const [ref, setRef] = useState(undefined);
  const [complaints, setComplaints] = useState([]);
  const [state, setState] = useState('load');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, r, k] = await Promise.all([myContracts(), myReferral(), myComplaints()]);
      setRows(c); setRef(r); setComplaints(k); setState('ok');
    } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const act = async (fn, ok) => {
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
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান"><Text style={st.backT}>‹ হোম</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">🤝 লিডার ও চুক্তি</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" text="লিডার তালিকা, রেফারেল কোড ও চুক্তির সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}

      {state === 'ok' ? (
        <>
          {sent.map((c) => (
            <View key={c.id} style={[st.card, st.invite]}>
              <Text style={st.h}>📩 নতুন চুক্তির অনুরোধ</Text>
              <ContractDetails c={c} />
              {active ? <Notice kind="warn" title="আপনার একটি চুক্তি চালু আছে" text="একসাথে একটাই চুক্তি রাখা যায়। নতুনটিতে রাজি হতে আগে চালু চুক্তিটি বাতিল করুন।" /> : (
                <Button title="পড়েছি, আমি রাজি" icon="✍️" onPress={() => confirm('এই চুক্তিতে রাজি হবেন?', 'রাজি হলে চুক্তি চালু হবে, লিডার আপনার ফোন নম্বর দেখবেন, আপনিও লিডারের নম্বর পাবেন। আগে সব শর্ত পড়ে নিন।', 'হ্যাঁ, রাজি', () => act(() => respondContract(c.id, true), (r) => (r === 'ok' ? { kind: 'ok', text: 'চুক্তি চালু হয়েছে। চুক্তির PDF নিচ থেকে নিতে পারবেন।' } : r === 'have_active' ? { kind: 'warn', text: 'আপনার আরেকটি চুক্তি চালু আছে।' } : { kind: 'warn', text: 'চুক্তিটি আর পাওয়া যাচ্ছে না (হয়তো লিডার ফিরিয়ে নিয়েছেন)।' })))}
                  loading={busy} style={{ marginTop: S.md }} />
              )}
              <Button title="না, রাজি নই" kind="secondary" onPress={() => confirm('চুক্তির অনুরোধটি ফিরিয়ে দেবেন?', '', 'হ্যাঁ, ফিরিয়ে দিন', () => act(() => respondContract(c.id, false), () => ({ kind: 'ok', text: 'অনুরোধটি ফিরিয়ে দেওয়া হয়েছে।' })))} disabled={busy} style={{ marginTop: S.sm }} />
            </View>
          ))}

          {active ? <ActiveContract c={active} busy={busy} act={act} setMsg={setMsg} /> : null}

          <ReferralCard r={ref} busy={busy} act={act} hasContract={!!active} />

          <Button title="যাচাই করা লিডার খুঁজুন" icon="🔎" kind="secondary" onPress={() => navigation.navigate('Leaders')} style={{ marginBottom: S.sm }} />
          <Button title="আমার দল ও লিডারের ঘোষণা" icon="📢" kind="secondary" onPress={() => navigation.navigate('Group')} style={{ marginBottom: S.md }} />

          {!active && sent.length === 0 ? (
            <Notice kind="info" title="এখনো কোনো চুক্তি নেই" text="পছন্দের লিডার খুঁজে হেল্পলাইনের মাধ্যমে যোগাযোগ করুন। লিডার আপনার হাজী আইডিতে চুক্তির অনুরোধ পাঠালে এখানে দেখবেন, পড়ে রাজি হতে পারবেন।" />
          ) : null}

          {past.length ? <Text style={[st.h, { marginTop: S.md }]}>আগের চুক্তি</Text> : null}
          {past.map((c) => <PastContract key={c.id} c={c} busy={busy} act={act} setMsg={setMsg} />)}

          {complaints.length ? <Text style={[st.h, { marginTop: S.md }]}>আমার অভিযোগ</Text> : null}
          {complaints.map((k) => (
            <View key={k.id} style={st.card}>
              <Text style={st.small}>{fmtDay(k.created_at)} · চুক্তি {k.contract_no} · {k.leader_name}</Text>
              <Text style={st.p}>{k.body}</Text>
              <Text style={st.val}>{COMPLAINT_STATUS[k.status]}</Text>
              {k.files ? <Text style={st.small}>📎 প্রমাণ: {toBn(k.files)}টি ফাইল</Text> : null}
              {k.admin_note ? <Text style={st.small}>অ্যাডমিনের নোট: {k.admin_note}</Text> : null}
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function PdfButton({ c, setMsg }) {
  const [busy, setBusy] = useState(false);
  return <Button title="চুক্তির PDF নিন" icon="📄" kind="secondary" loading={busy} style={{ marginTop: S.sm }}
    onPress={async () => { setBusy(true); try { await shareContractPdf(c); } catch (e) { setMsg({ kind: 'bad', text: 'PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।' }); } finally { setBusy(false); } }} />;
}

function ActiveContract({ c, busy, act, setMsg }) {
  const [cancel, setCancel] = useState(false);
  return (
    <View style={[st.card, { borderWidth: 2, borderColor: C.ok }]}>
      <ContractDetails c={c} />
      {c.leader_phone ? <Button title={`লিডারকে ফোন করুন (${toBn(c.leader_phone)})`} icon="📞" onPress={() => Linking.openURL(`tel:${telBd(c.leader_phone)}`).catch(() => {})} style={{ marginTop: S.md }} /> : null}
      <PaymentBox contract={c} />
      <PdfButton c={c} setMsg={setMsg} />
      <RateBox c={c} busy={busy} act={act} />
      <ComplaintBox c={c} setMsg={setMsg} />
      {cancel ? (
        <ReasonBox title="চুক্তি বাতিল" hint="যেমন: লিডার ভিসার কাজ শুরু করেননি" button="চুক্তি বাতিল করুন" busy={busy} onClose={() => setCancel(false)}
          onSubmit={(reason) => act(() => cancelContract(c.id, reason), (r) => { setCancel(false); return r === 'ok' ? { kind: 'ok', text: 'চুক্তি বাতিল হয়েছে। Travel Adda-তে জমা দেওয়া টাকা চুক্তির ফেরতের নিয়ম অনুযায়ী মেটানো হবে; Travel Adda হেল্পলাইনে যোগাযোগ করুন।' } : { kind: 'warn', text: 'চুক্তিটি আর চালু নেই।' }; })} />
      ) : (
        <Pressable onPress={() => setCancel(true)} style={st.leave} accessibilityRole="button" accessibilityLabel="চুক্তি বাতিল করুন"><Text style={st.leaveT}>চুক্তি বাতিল করুন</Text></Pressable>
      )}
    </View>
  );
}

function PastContract({ c, busy, act, setMsg }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={st.card}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={`${c.title}, ${open ? 'লুকান' : 'বিস্তারিত দেখুন'}`}>
        <Text style={st.val}>{c.title} {open ? '▴' : '▾'}</Text>
        <Text style={st.small}>চুক্তি {c.contract_no} · {c.leader_name}</Text>
      </Pressable>
      {open ? <ContractDetails c={c} /> : null}
      {c.status !== 'declined' ? <PdfButton c={c} setMsg={setMsg} /> : null}
      {c.status !== 'declined' ? <RateBox c={c} busy={busy} act={act} /> : null}
      {c.status !== 'declined' ? <ComplaintBox c={c} setMsg={setMsg} /> : null}
    </View>
  );
}

function RateBox({ c, busy, act }) {
  const [stars, setStars] = useState(c.my_stars || 0);
  const [comment, setComment] = useState(c.my_comment || '');
  const [open, setOpen] = useState(false);
  if (!open) {
    return <Button title={c.my_stars ? `আপনার রেটিং: ${'⭐'.repeat(c.my_stars)} (বদলান)` : 'লিডারকে রেটিং দিন'} icon={c.my_stars ? undefined : '⭐'} kind="secondary" onPress={() => setOpen(true)} style={{ marginTop: S.sm }} />;
  }
  return (
    <View style={[st.cRow, { paddingTop: S.sm }]}>
      <Text style={st.h}>⭐ লিডার কেমন ছিলেন?</Text>
      <Stars value={stars} onChange={setStars} />
      <Field label="মন্তব্য (ইচ্ছা করলে, সবাই দেখবেন)" value={comment} onChangeText={setComment} multiline maxLength={500} />
      <Text style={st.small}>ℹ️ Travel Adda আপনার টাকা জমা যাচাই করার পর আপনার রেটিং ও মন্তব্য লিডারের প্রোফাইলে দেখাবে ও গণনা হবে। এতে নকল রেটিং দেওয়া যায় না।</Text>
      <Button title="রেটিং জমা দিন" onPress={() => { if (!stars) return; act(() => rateLeader(c.id, stars, comment), (r) => { setOpen(false); return r === 'ok' ? { kind: 'ok', text: 'রেটিং জমা হয়েছে। ধন্যবাদ। টাকা জমা যাচাইয়ের পর এটি লিডারের প্রোফাইলে দেখাবে।' } : { kind: 'warn', text: 'রেটিং দেওয়া যায়নি।' }; }); }} disabled={!stars} loading={busy} />
      <Button title="বাতিল" kind="secondary" onPress={() => setOpen(false)} style={{ marginTop: S.sm }} />
    </View>
  );
}

function ComplaintBox({ c, setMsg }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'audio/*', 'video/*'], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets || !r.assets[0]) return;
      const a = r.assets[0];
      const mime = a.mimeType || '';
      const kind = mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : null;
      if (!kind) { setErr('শুধু ছবি, অডিও বা ভিডিও দেওয়া যাবে।'); return; }
      if (a.size && a.size > 20 * 1024 * 1024) { setErr('ফাইলটি ২০ এমবির বেশি বড়। ছোট ফাইল দিন।'); return; }
      if (files.length >= 5) { setErr('সর্বোচ্চ ৫টি ফাইল দেওয়া যায়।'); return; }
      setErr(''); setFiles((x) => [...x, { uri: a.uri, kind, mime, name: a.name || 'ফাইল' }]);
    } catch (e) { setErr('ফাইল খোলা যায়নি।'); }
  };
  const send = () => {
    if (body.trim().length < 10) { setErr('কী হয়েছে, একটু বিস্তারিত লিখুন (অন্তত ১০ অক্ষর)।'); return; }
    confirm('অভিযোগ পাঠাবেন?', 'অ্যাডমিন যাচাই করবেন। যাচাই হলে অভিযোগের লেখা লিডারের প্রোফাইলে সবাই দেখবেন (আপনার নাম দেখাবে না)।', 'হ্যাঁ, পাঠান', async () => {
      setBusy(true); setErr('');
      try {
        const r = await fileComplaint(c.id, body, files);
        setOpen(false); setBody(''); setFiles([]);
        setMsg(r.failed ? { kind: 'warn', text: `অভিযোগ জমা হয়েছে, কিন্তু ${toBn(r.failed)}টি ফাইল পাঠানো যায়নি।` } : { kind: 'ok', text: 'অভিযোগ জমা হয়েছে। অ্যাডমিন যাচাই করে জানাবেন।' });
      } catch (e) { setErr(String(e?.message || '').includes('too many') ? 'আজ আর অভিযোগ পাঠানো যাবে না।' : errText(e)); }   // text stays
      finally { setBusy(false); }
    });
  };
  if (!open) return <Pressable onPress={() => setOpen(true)} style={st.leave} accessibilityRole="button"><Text style={[st.leaveT, { color: C.warn || C.bad }]}>🚩 লিডারের বিরুদ্ধে অভিযোগ</Text></Pressable>;
  return (
    <View style={[st.cRow, { paddingTop: S.sm }]}>
      <Text style={st.h}>🚩 অভিযোগ</Text>
      <Field label="কী হয়েছে লিখুন" hint="তারিখ, জায়গা, কী কথা হয়েছিল" value={body} onChangeText={setBody} multiline maxLength={2000} error={err} />
      {files.map((f, i) => <Text key={`${f.uri}${i}`} style={st.small}>📎 {f.kind === 'image' ? 'ছবি' : f.kind === 'audio' ? 'অডিও' : 'ভিডিও'}: {f.name}</Text>)}
      <Button title="প্রমাণ যোগ করুন (ছবি/অডিও/ভিডিও)" icon="📎" kind="secondary" onPress={pick} disabled={busy} />
      <Button title="অভিযোগ পাঠান" icon="📨" kind="danger" onPress={send} loading={busy} style={{ marginTop: S.sm }} />
      <Button title="বাতিল" kind="secondary" onPress={() => setOpen(false)} disabled={busy} style={{ marginTop: S.sm }} />
    </View>
  );
}

function ReferralCard({ r, busy, act, hasContract }) {
  const [code, setCode] = useState('');
  const [cancel, setCancel] = useState(false);
  const [photo, setPhoto] = useState(null);
  useEffect(() => { if (r && r.avatar_path) signedAvatarUrl(r.avatar_path).then(setPhoto); }, [r]);
  if (r && r.status !== 'rejected') {
    return (
      <View style={st.card}>
        <Text style={st.h}>🧭 আমার লিডার (রেফারেল)</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: 28 }} accessibilityLabel={`${r.full_name}-এর ছবি`} /> : <Text style={{ fontSize: 40 }}>👤</Text>}
          <View style={{ flex: 1 }}>
            <Text style={st.val}>{r.full_name}</Text>
            <Text style={st.small}>{r.leader_code}{r.agency_name ? ` · ${r.agency_name}` : ''}</Text>
          </View>
        </View>
        <Text style={[st.p, { marginTop: S.sm }]}>{r.status === 'confirmed' ? '✅ লিডার আপনাকে নিশ্চিত করেছেন।' : '⏳ লিডার এখনো নিশ্চিত করেননি।'}</Text>
        <Text style={st.small}>রেফারেল থাকা অবস্থায় তালিকায় শুধু এই লিডারকে দেখবেন, আর শুধু তিনিই চুক্তি পাঠাতে পারবেন।</Text>
        {r.cancel_requested ? <Notice kind="info" title="রেফারেল বাতিলের অনুরোধ অ্যাডমিনের কাছে আছে" /> : cancel ? (
          <ReasonBox title="রেফারেল বাতিলের অনুরোধ" hint="কেন অন্য লিডার খুঁজতে চান" button="অনুরোধ পাঠান" min={5} busy={busy} onClose={() => setCancel(false)}
            onSubmit={(reason) => act(() => requestReferralCancel(reason), (x) => { setCancel(false); return x === 'ok' ? { kind: 'ok', text: 'অনুরোধ পাঠানো হয়েছে। অ্যাডমিন অনুমোদন দিলে অন্য লিডার দেখতে পাবেন।' } : { kind: 'warn', text: 'অনুরোধ পাঠানো যায়নি।' }; })} />
        ) : !hasContract ? (
          <Pressable onPress={() => setCancel(true)} style={st.leave} accessibilityRole="button"><Text style={st.leaveT}>রেফারেল বাতিলের অনুরোধ</Text></Pressable>
        ) : null}
      </View>
    );
  }
  return (
    <View style={st.card}>
      <Text style={st.h}>🔑 লিডারের রেফারেল কোড আছে?</Text>
      {r && r.status === 'rejected' ? <Text style={st.small}>আগের লিডার রেফারেল নিশ্চিত করেননি। চাইলে নতুন কোড দিন।</Text> : null}
      <Field label="রেফারেল কোড" hint="যেমন: TL-00012" value={code} onChangeText={(v) => setCode(v.toUpperCase())} maxLength={12} autoCapitalize="characters" autoCorrect={false} />
      <Button title="কোড যুক্ত করুন" icon="➕" kind="secondary" loading={busy} onPress={() => {
        const c = code.trim().replace(/\s/g, '').replace(/^TL(\d)/, 'TL-$1');
        if (!/^TL-\d{1,8}$/.test(c)) return act(async () => 'format', () => ({ kind: 'bad', text: 'কোড এমন হয়: TL-00012' }));
        return act(() => setReferral(c), (x) => (x === 'ok' ? { kind: 'ok', text: 'রেফারেল কোড যুক্ত হয়েছে। লিডার নিশ্চিত করলে এখানে দেখবেন।' } : x === 'already' ? { kind: 'info', text: 'আপনার একজন লিডার আগে থেকেই যুক্ত আছেন।' } : { kind: 'bad', text: 'এই কোডে কোনো লিডার পাওয়া যায়নি।' }));
      }} />
    </View>
  );
}
