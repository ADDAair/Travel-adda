import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import { supabase } from '../lib/supabase';
import { myProfile, adminApplications, reviewApplication, leaderDocUrl, notReady, telBd } from '../lib/groups';
import { st, errText, confirm, fmtDay, fmtTaka } from './GroupScreen';
import { KIND, refOf, adminInterests, markInterest, hideOffer, adminOffers, getHelpline, setSetting, cleanHelpline } from '../lib/offers';

const STATUS = { pending: '⏳ যাচাই বাকি', approved: '✅ অনুমোদিত', rejected: '✖️ বাতিল' };

// Admin only (the database refuses everyone else): leader applications, "please call me" requests,
// package moderation and the helpline number.
export default function AdminScreen({ navigation }) {
  const [state, setState] = useState('load');
  const [tab, setTab] = useState('apps');
  useEffect(() => {
    myProfile().then((p) => setState(p.role === 'admin' ? 'ok' : 'denied')).catch((e) => setState(notReady(e) ? 'soon' : 'err'));
  }, []);
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Group')} style={st.back} accessibilityRole="button" accessibilityLabel="আমার দল পাতায় ফিরে যান"><Text style={st.backT}>‹ আমার দল</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">🛡️ অ্যাডমিন</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" /> : null}
      {state === 'denied' ? <Notice kind="warn" title="এই পাতা শুধু অ্যাডমিনের জন্য" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে পাতাটি আবার খুলুন।" /> : null}
      {state === 'ok' ? (
        <>
          {/* two rows of two, so the labels never get cut on small phones or with large text */}
          <Segmented value={tab} onChange={setTab} options={[
            { id: 'apps', icon: '🧭', label: 'লিডার আবেদন' },
            { id: 'calls', icon: '🙋', label: 'ফোনের অনুরোধ' },
          ]} />
          <View style={{ height: S.xs }} />
          <Segmented value={tab} onChange={setTab} options={[
            { id: 'offers', icon: '🎁', label: 'প্যাকেজ' },
            { id: 'help', icon: '☎️', label: 'হেল্পলাইন' },
          ]} />
          <View style={{ height: S.md }} />
          {tab === 'apps' ? <AppsTab /> : tab === 'calls' ? <CallsTab /> : tab === 'offers' ? <OffersTab /> : <HelpTab />}
        </>
      ) : null}
    </ScrollView>
  );
}

// Shared loader: 'load' | 'ok' | 'soon' | 'err', with a retry button.
function useLoad(fn) {
  const [state, setState] = useState('load');
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { setData(await fn()); setState('ok'); } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, [fn]);
  useEffect(() => { load(); }, [load]);
  const gate = state === 'load' ? <ActivityIndicator color={C.primary} />
    : state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" text="এই অংশের ডেটাবেস ধাপ এখনো চালানো হয়নি।" />
      : state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null;
  return { state, data, load, gate };
}

function AppsTab() {
  const { state, data, load, gate } = useLoad(adminApplications);
  const [msg, setMsg] = useState(null);
  const rows = data || [];
  const pending = rows.filter((r) => r.status === 'pending');
  const done = rows.filter((r) => r.status !== 'pending');
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <Notice kind="info" title="অনুমোদনের আগে যাচাই করুন" text="ধর্ম মন্ত্রণালয়ের হজ এজেন্সির তালিকায় লাইসেন্স নম্বর মিলিয়ে দেখুন, আর আবেদনকারীকে ফোন করে নিশ্চিত হোন।" />
          {pending.length === 0 ? <Notice kind="ok" title="কোনো আবেদন বাকি নেই" /> : null}
          {pending.map((r) => <AppCard key={r.id} r={r} onDone={(t) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t) => setMsg({ kind: 'bad', text: t })} />)}
          {done.length ? <Text style={[st.h, { marginTop: S.md }]}>আগের সিদ্ধান্ত</Text> : null}
          {done.map((r) => (
            <View key={r.id} style={st.card}>
              <Text style={st.val}>{r.full_name} · {r.agency_name}</Text>
              <Text style={st.small}>{STATUS[r.status]} · {fmtDay(r.created_at)}{r.admin_note ? ` · নোট: ${r.admin_note}` : ''}</Text>
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

function CallsTab() {
  const { state, data, load, gate } = useLoad(adminInterests);
  const [msg, setMsg] = useState(null);
  const rows = data || [];
  const open = rows.filter((r) => r.status === 'new');
  const done = rows.filter((r) => r.status !== 'new');
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <Text style={st.small}>হাজীরা প্যাকেজ দেখে "আমাকে ফোন করুন" চাপলে এখানে আসে। এজেন্সি এই নাম-নম্বর দেখে না।</Text>
          {open.length === 0 ? <Notice kind="ok" title="কোনো অনুরোধ বাকি নেই" /> : null}
          {open.map((r) => <CallCard key={r.id} r={r} onDone={(t) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t) => setMsg({ kind: 'bad', text: t })} />)}
          {done.length ? <Text style={[st.h, { marginTop: S.md }]}>যাদের সাথে কথা হয়েছে</Text> : null}
          {done.map((r) => (
            <View key={r.id} style={st.card}>
              <Text style={st.val}>{r.full_name} · {toBn(r.phone)}</Text>
              <Text style={st.small}>{r.offer_title} ({refOf(r.offer_id)}) · {fmtDay(r.created_at)}{r.admin_note ? ` · নোট: ${r.admin_note}` : ''}</Text>
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

function CallCard({ r, onDone, onFail }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const mark = () => confirm('এই হাজীর সাথে কথা হয়েছে?', 'অনুরোধটি "কথা হয়েছে" তালিকায় চলে যাবে।', 'হ্যাঁ, কথা হয়েছে', async () => {
    setBusy(true);
    try { const res = await markInterest(r.id, note.trim()); onDone(res === 'ok' ? 'চিহ্নিত করা হয়েছে।' : 'অনুরোধটি আর খোলা নেই (হয়তো হাজী বাতিল করেছেন)।'); }
    catch (e) { onFail(errText(e)); setBusy(false); }
  });
  const tel = (n) => Linking.openURL(`tel:${telBd(n)}`).catch(() => {});
  return (
    <View style={[st.card, st.invite]}>
      <Text style={st.gName}>{r.full_name}</Text>
      <Text style={st.small}>আইডি: {r.haji_code} · {fmtDay(r.created_at)}</Text>
      <View style={st.cRow}><Text style={st.lbl}>প্যাকেজ</Text><Text style={st.p}>{KIND[r.offer_kind]?.label} · {r.offer_title} ({refOf(r.offer_id)}) · {fmtTaka(r.price_bdt)}</Text></View>
      <View style={st.cRow}><Text style={st.lbl}>এজেন্সি ও লিডার</Text><Text style={st.p}>{r.agency_name || '—'} · {r.leader_name} · {toBn(r.leader_phone)}</Text></View>
      <Button title={`হাজীকে ফোন করুন (${toBn(r.phone)})`} icon="📞" onPress={() => tel(r.phone)} style={{ marginTop: S.sm }} />
      <Button title={`লিডারকে ফোন করুন (${toBn(r.leader_phone)})`} icon="📞" kind="secondary" onPress={() => tel(r.leader_phone)} style={{ marginTop: S.sm }} />
      <View style={{ marginTop: S.md }}>
        <Field label="নোট (ইচ্ছা করলে)" hint="যেমন: রবিবার অফিসে মিটিং" value={note} onChangeText={setNote} maxLength={300} />
      </View>
      <Button title="কথা হয়েছে" icon="✅" kind="gold" onPress={mark} loading={busy} />
    </View>
  );
}

function OffersTab() {
  const { state, data, load, gate } = useLoad(adminOffers);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const hide = (o) => confirm(o.hidden_by_admin ? 'প্যাকেজটি আবার দেখাবেন?' : 'প্যাকেজটি সবার কাছ থেকে লুকাবেন?', o.hidden_by_admin ? '' : 'ভুল বা সন্দেহজনক তথ্য থাকলে লুকান। লিডার নিজে আর দেখাতে পারবেন না।',
    o.hidden_by_admin ? 'হ্যাঁ, দেখান' : 'হ্যাঁ, লুকান', async () => {
      setBusy(true); setMsg(null);
      try { await hideOffer(o.id, !o.hidden_by_admin); setMsg({ kind: 'ok', text: o.hidden_by_admin ? 'আবার দেখানো হচ্ছে।' : 'লুকানো হয়েছে।' }); await load(); }
      catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
      finally { setBusy(false); }
    });
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' && data.length === 0 ? <Notice kind="info" title="এখনো কোনো প্যাকেজ নেই" /> : null}
      {state === 'ok' ? data.map((o) => (
        <View key={o.id} style={st.card}>
          <Text style={st.val}>{KIND[o.kind]?.icon} {o.title} ({refOf(o.id)})</Text>
          <Text style={st.small}>{fmtTaka(o.price_bdt)} · {fmtDay(o.depart_on)} থেকে {fmtDay(o.return_on)}</Text>
          <Text style={st.small}>{o.hidden_by_admin ? '⛔ আপনি লুকিয়েছেন' : o.active ? '✅ দেখা যাচ্ছে' : '🙈 লিডার লুকিয়েছেন'}</Text>
          <Button title={o.hidden_by_admin ? 'আবার দেখান' : 'সবার কাছ থেকে লুকান'} kind={o.hidden_by_admin ? 'secondary' : 'danger'} onPress={() => hide(o)} disabled={busy} style={{ marginTop: S.xs }} />
        </View>
      )) : null}
    </>
  );
}

function HelpTab() {
  const [phone, setPhone] = useState('');
  const [hours, setHours] = useState('');
  const [state, setState] = useState('load');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [otpLive, setOtpLive] = useState(false);
  useEffect(() => { getHelpline().then((h) => { setPhone(h.phone); setHours(h.hours); setOtpLive(!!h.otpLive); setState('ok'); }).catch((e) => setState(notReady(e) ? 'soon' : 'err')); }, []);
  const toggleOtp = () => confirm(otpLive ? 'নম্বর যাচাই বাধ্যতামূলক বন্ধ করবেন?' : 'নম্বর যাচাই বাধ্যতামূলক করবেন?',
    otpLive ? 'তখন যাচাই না করা নম্বরেও আমন্ত্রণ যাবে।' : 'এরপর লিডারের আমন্ত্রণ শুধু যাচাই করা নম্বরে যাবে, আর লিডার আবেদনেও যাচাই করা নম্বর লাগবে। আগে নিজের নম্বর যাচাই করে দেখে নিন যে কোড আসছে।',
    otpLive ? 'হ্যাঁ, বন্ধ করুন' : 'হ্যাঁ, চালু করুন', async () => {
      setBusy(true); setMsg(null);
      try {
        if (!otpLive) {
          const me = await supabase.from('profiles').select('phone_verified').single();
          if (me.error || !me.data?.phone_verified) { setMsg({ kind: 'warn', text: 'আগে "আমার তথ্য" থেকে নিজের নম্বর যাচাই করুন। এতে নিশ্চিত হবে এসএমএস ঠিকমতো আসছে।' }); return; }
        }
        await setSetting('otp_live', otpLive ? '' : 'yes'); setOtpLive(!otpLive);
        setMsg({ kind: 'ok', text: otpLive ? 'নম্বর যাচাই বাধ্যতামূলক বন্ধ করা হয়েছে।' : 'নম্বর যাচাই এখন বাধ্যতামূলক।' });
      } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
      finally { setBusy(false); }
    });
  const save = async () => {
    if (busy) return;
    const p = cleanHelpline(phone);
    if (p && !/^\+?[0-9]{6,15}$/.test(p)) { setMsg({ kind: 'bad', text: 'নম্বরটি ঠিক নেই। যেমন: +8801XXXXXXXXX' }); return; }
    setBusy(true); setMsg(null);
    try { await setSetting('helpline_phone', p); await setSetting('helpline_hours', hours.trim()); setPhone(p); setMsg({ kind: 'ok', text: p ? 'হেল্পলাইন সংরক্ষণ হয়েছে। সবার অ্যাপে এখন এই নম্বর দেখাবে।' : 'হেল্পলাইন নম্বর সরানো হয়েছে।' }); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };
  if (state === 'load') return <ActivityIndicator color={C.primary} />;
  if (state === 'soon') return <Notice kind="info" title="শীঘ্রই চালু হবে" text="এই অংশের ডেটাবেস ধাপ এখনো চালানো হয়নি।" />;
  if (state === 'err') return <Notice kind="bad" title="তথ্য আনা যায়নি" />;
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Text style={[st.p, { marginBottom: S.md }]}>অফার পাতায় "হেল্পলাইনে ফোন করুন" বাটন এই নম্বরে কল করবে। দেশের কোডসহ লিখুন, যাতে সৌদি থেকেও কল যায়।</Text>
      <Field label="হেল্পলাইন নম্বর" hint="যেমন: +8801XXXXXXXXX" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={16} />
      <Field label="কখন ফোন ধরা হয় (ইচ্ছা করলে)" hint="যেমন: প্রতিদিন সকাল ১০টা – রাত ৮টা" value={hours} onChangeText={setHours} maxLength={80} />
      <Button title="সংরক্ষণ করুন" icon="💾" onPress={save} loading={busy} />
      <View style={[st.card, { marginTop: S.lg }]}>
        <Text style={st.h}>📱 এসএমএস কোডে নম্বর যাচাই</Text>
        <Text style={st.val}>{otpLive ? '✅ বাধ্যতামূলক চালু আছে' : '⏸️ বাধ্যতামূলক নয়'}</Text>
        <Text style={st.small}>চালু থাকলে লিডারের আমন্ত্রণ শুধু যাচাই করা নম্বরে যায়, আর লিডার আবেদনেও যাচাই করা নম্বর লাগে।</Text>
        <Button title={otpLive ? 'বাধ্যতামূলক বন্ধ করুন' : 'বাধ্যতামূলক চালু করুন'} kind={otpLive ? 'danger' : 'secondary'} onPress={toggleOtp} disabled={busy} style={{ marginTop: S.sm }} />
      </View>
    </>
  );
}

function AppCard({ r, onDone, onFail }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = (approve) => confirm(approve ? `${r.full_name}-কে লিডার হিসেবে অনুমোদন দেবেন?` : 'আবেদনটি বাতিল করবেন?',
    approve ? 'অনুমোদনের পর তিনি দল বানাতে ও হাজীদের নাম, ফোন ও ছবি দেখতে পারবেন।' : 'আবেদনকারী আপনার নোট দেখতে পাবেন।',
    approve ? 'হ্যাঁ, অনুমোদন দিন' : 'হ্যাঁ, বাতিল করুন', async () => {
      setBusy(true);
      try {
        const res = await reviewApplication(r.id, approve, note.trim());
        if (res === 'ok') onDone(approve ? 'অনুমোদন দেওয়া হয়েছে।' : 'আবেদন বাতিল করা হয়েছে।');
        else onDone('এই আবেদনের সিদ্ধান্ত আগেই নেওয়া হয়েছে।');
      } catch (e) { onFail(errText(e)); setBusy(false); }
    });
  const openDoc = async () => {
    try { await Linking.openURL(await leaderDocUrl(r.doc_path)); } catch (e) { onFail('কাগজটি খোলা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।'); }
  };
  return (
    <View style={[st.card, st.invite]}>
      <Text style={st.gName}>{r.full_name}</Text>
      <Text style={st.small}>আইডি: {r.haji_code} · ফোন: {toBn(r.phone)} · {fmtDay(r.created_at)}</Text>
      <View style={st.cRow}><Text style={st.lbl}>এজেন্সি</Text><Text style={st.p}>{r.agency_name}</Text></View>
      <View style={st.cRow}><Text style={st.lbl}>লাইসেন্স নম্বর</Text><Text style={st.p} selectable>{r.license_no}</Text></View>
      <Button title={`ফোন করুন (${toBn(r.phone)})`} icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(r.phone)}`).catch(() => {})} style={{ marginTop: S.sm }} />
      {r.doc_path ? <Button title="জমা দেওয়া কাগজ দেখুন" icon="📄" kind="secondary" onPress={openDoc} style={{ marginTop: S.sm }} /> : <Text style={st.small}>কোনো কাগজ দেননি।</Text>}
      <View style={{ marginTop: S.md }}>
        <Field label="নোট (ইচ্ছা করলে)" hint="যেমন: লাইসেন্স নম্বর মেলেনি" value={note} onChangeText={setNote} maxLength={500} />
      </View>
      <Button title="অনুমোদন দিন" icon="✅" onPress={() => decide(true)} loading={busy} />
      <Button title="বাতিল করুন" kind="danger" onPress={() => decide(false)} disabled={busy} style={{ marginTop: S.sm }} />
    </View>
  );
}
