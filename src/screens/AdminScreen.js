import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { toBn } from '../lib/phone';
import { supabase } from '../lib/supabase';
import { adminApplications, reviewApplication, leaderDocUrl, notReady, telBd } from '../lib/groups';
import { myPerms, PERMS, listComplaints, decideComplaint, evidenceUrl, listReports, handleReport, referralCancels, decideReferralCancel, findUsers, setUserStatus, listStaff, setStaff, listAudit, setText, stats, exportCsv } from '../lib/admin';
import { getTerms } from '../lib/market';
import { signedAvatarUrl } from '../lib/avatar';
import { Image } from 'react-native';
import { st, errText, confirm, fmtDay, fmtTaka } from './GroupScreen';
import MoneyTab from './AdminMoney';
import NotifyTab from './AdminNotify';
import { KIND, refOf, adminInterests, markInterest, hideOffer, adminOffers, getHelpline, setSetting, cleanHelpline } from '../lib/offers';

const STATUS = { pending: '⏳ যাচাই বাকি', approved: '✅ অনুমোদিত', rejected: '✖️ বাতিল' };

// Sections, each shown only to people with the matching permission ('admin' = the owner only).
const SECTIONS = [
  { id: 'stats', icon: '📊', label: 'পরিসংখ্যান', perm: 'reports' },
  { id: 'apps', icon: '🧭', label: 'লিডার আবেদন', perm: 'applications' },
  { id: 'calls', icon: '🙋', label: 'ফোনের অনুরোধ', perm: 'calls' },
  { id: 'complaints', icon: '🚩', label: 'অভিযোগ', perm: 'complaints' },
  { id: 'reports', icon: '📮', label: 'রিপোর্ট', perm: 'reports' },
  { id: 'users', icon: '👥', label: 'ব্যবহারকারী', perm: 'users' },
  { id: 'notify', icon: '📣', label: 'নোটিফিকেশন পাঠান', perm: 'notify' },
  { id: 'money', icon: '💳', label: 'টাকা ও কমিশন', perm: 'payments' },
  { id: 'offers', icon: '🎁', label: 'প্যাকেজ', perm: 'offers' },
  { id: 'staff', icon: '🪪', label: 'স্টাফ', perm: 'admin' },
  { id: 'terms', icon: '📜', label: 'শর্তাবলি', perm: 'admin' },
  { id: 'audit', icon: '🧾', label: 'কাজের রেকর্ড', perm: 'admin' },
  { id: 'help', icon: '☎️', label: 'হেল্পলাইন', perm: 'admin' },
];

// Admin and staff (the database refuses everyone else).
export default function AdminScreen({ navigation }) {
  const [perms, setPerms] = useState(null);
  const [state, setState] = useState('load');
  const [tab, setTab] = useState(null);
  useEffect(() => {
    myPerms().then((p) => { setPerms(p); setState(p.length ? 'ok' : 'denied'); }).catch((e) => setState(notReady(e) ? 'soon' : 'err'));
  }, []);
  const mine = SECTIONS.filter((x) => perms && perms.includes(x.perm));
  const cur = mine.find((x) => x.id === tab);
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => (cur ? setTab(null) : navigation.navigate('Account'))} style={st.back} accessibilityRole="button" accessibilityLabel={cur ? 'অ্যাডমিন মেনুতে ফিরে যান' : 'আমার তথ্য পাতায় ফিরে যান'}>
        <Text style={st.backT}>{cur ? '‹ অ্যাডমিন মেনু' : '‹ আমার তথ্য'}</Text>
      </Pressable>
      <Text style={st.title} accessibilityRole="header">🛡️ {cur ? cur.label : 'অ্যাডমিন'}</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" /> : null}
      {state === 'denied' ? <Notice kind="warn" title="এই পাতা শুধু অ্যাডমিন ও স্টাফদের জন্য" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে পাতাটি আবার খুলুন।" /> : null}
      {state === 'ok' && !cur ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
          {mine.map((x) => (
            <Pressable key={x.id} onPress={() => setTab(x.id)} style={({ pressed }) => [st.card, { width: '47%', minHeight: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 0 }, pressed && { opacity: 0.85 }]}
              accessibilityRole="button" accessibilityLabel={`${x.label} খুলুন`}>
              <Text style={{ fontSize: 32 }} importantForAccessibility="no">{x.icon}</Text>
              <Text style={[st.val, { textAlign: 'center' }]}>{x.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {cur ? (
        cur.id === 'stats' ? <StatsTab admin={perms.includes('admin')} />
          : cur.id === 'apps' ? <AppsTab />
            : cur.id === 'calls' ? <CallsTab />
              : cur.id === 'complaints' ? <ComplaintsTab />
                : cur.id === 'reports' ? <ReportsTab canUsers={perms.includes('users')} />
                  : cur.id === 'users' ? <UsersTab />
                    : cur.id === 'money' ? <MoneyTab owner={perms.includes('admin')} />
                    : cur.id === 'notify' ? <NotifyTab />
                    : cur.id === 'offers' ? <OffersTab />
                      : cur.id === 'staff' ? <StaffTab />
                        : cur.id === 'terms' ? <TermsTab />
                          : cur.id === 'audit' ? <AuditTab /> : <HelpTab />
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
          <Text style={st.small}>হাজীরা প্যাকেজ বা লিডারের প্রোফাইল দেখে "আমাকে ফোন করুন" চাপলে এখানে আসে। লিডার এই নাম-নম্বর দেখেন না। হাজী ও লিডারের সাথে কথা বলে মিটিংয়ের ব্যবস্থা করুন।</Text>
          {open.length === 0 ? <Notice kind="ok" title="কোনো অনুরোধ বাকি নেই" /> : null}
          {open.map((r) => <CallCard key={r.id} r={r} onDone={(t) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t) => setMsg({ kind: 'bad', text: t })} />)}
          {done.length ? <Text style={[st.h, { marginTop: S.md }]}>যাদের সাথে কথা হয়েছে</Text> : null}
          {done.map((r) => (
            <View key={r.id} style={st.card}>
              <Text style={st.val}>{r.full_name} · {toBn(r.phone)}</Text>
              <Text style={st.small}>{r.offer_id ? `${r.offer_title} (${refOf(r.offer_id)})` : `লিডার: ${r.leader_name}`} · {fmtDay(r.created_at)}{r.admin_note ? ` · নোট: ${r.admin_note}` : ''}</Text>
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
      <View style={st.cRow}><Text style={st.lbl}>{r.offer_id ? 'প্যাকেজ' : 'কোন লিডারের ব্যাপারে'}</Text><Text style={st.p}>{r.offer_id ? `${KIND[r.offer_kind]?.label} · ${r.offer_title} (${refOf(r.offer_id)}) · ${fmtTaka(r.price_bdt)}` : 'লিডারের প্রোফাইল থেকে কথা বলতে চেয়েছেন'}</Text></View>
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
    approve ? 'অনুমোদনের পর তিনি লিডার তালিকায় দেখা যাবেন, প্যাকেজ দিতে ও হাজীদের চুক্তি পাঠাতে পারবেন।' : 'আবেদনকারী আপনার নোট দেখতে পাবেন।',
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
      {r.umrah_license || r.hajj_license ? (
        <>
          {r.umrah_license ? <View style={st.cRow}><Text style={st.lbl}>ওমরাহ লাইসেন্স</Text><Text style={st.p} selectable>{r.umrah_license}</Text></View> : null}
          {r.hajj_license ? <View style={st.cRow}><Text style={st.lbl}>হজ লাইসেন্স</Text><Text style={st.p} selectable>{r.hajj_license}</Text></View> : null}
        </>
      ) : <View style={st.cRow}><Text style={st.lbl}>লাইসেন্স নম্বর</Text><Text style={st.p} selectable>{r.license_no}</Text></View>}
      {r.district ? <View style={st.cRow}><Text style={st.lbl}>এলাকা</Text><Text style={st.p}>{[r.upazila, r.district].filter(Boolean).join(', ')}</Text></View> : null}
      <Photo path={r.avatar_path} />
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

function Photo({ path }) {
  const [u, setU] = useState(null);
  useEffect(() => { if (path) signedAvatarUrl(path).then(setU); }, [path]);
  return u ? <Image source={{ uri: u }} style={{ width: 96, height: 96, borderRadius: 48, marginTop: S.sm }} accessibilityLabel="আবেদনকারীর ছবি" /> : null;
}

const STAT_LABELS = [
  ['hajis', 'হাজী অ্যাকাউন্ট'], ['leaders', 'অনুমোদিত লিডার'], ['leaders_pending', 'লিডার আবেদন বাকি'], ['suspended', 'বন্ধ অ্যাকাউন্ট'],
  ['contracts_active', 'চালু চুক্তি'], ['contracts_sent', 'উত্তরের অপেক্ষায় চুক্তি'], ['contracts_completed', 'সম্পন্ন চুক্তি'], ['contracts_cancelled', 'বাতিল চুক্তি'],
  ['complaints_pending', 'অভিযোগ যাচাই বাকি'], ['reports_new', 'নতুন রিপোর্ট'], ['calls_new', 'ফোনের অনুরোধ বাকি'], ['offers_visible', 'দেখানো প্যাকেজ'], ['new_users_7d', 'গত ৭ দিনে নতুন অ্যাকাউন্ট'],
  ['payments_pending', 'টাকার জমা যাচাই বাকি'], ['money_in', 'মোট পাওয়া টাকা'], ['money_out_leaders', 'লিডারদের দেওয়া'], ['money_refunded', 'হাজীদের ফেরত'],
];
const MONEY_STATS = ['money_in', 'money_out_leaders', 'money_refunded'];
function StatsTab({ admin }) {
  const { state, data, gate } = useLoad(stats);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const dl = async (kind) => {
    setBusy(kind); setMsg(null);
    try { const n = await exportCsv(kind); setMsg({ kind: 'ok', text: `${toBn(n)}টি সারি তৈরি হয়েছে। ফোনের মেনু থেকে সংরক্ষণ বা পাঠান (Excel-এ খোলে)।` }); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(null); }
  };
  return (
    <>
      {gate}
      {state === 'ok' && data ? (
        <View style={st.card}>
          {STAT_LABELS.map(([k, l]) => <View key={k} style={[st.cRow, { flexDirection: 'row', justifyContent: 'space-between' }]}><Text style={st.p}>{l}</Text><Text style={st.val}>{MONEY_STATS.includes(k) ? fmtTaka(data[k] ?? 0) : toBn(data[k] ?? 0)}</Text></View>)}
        </View>
      ) : null}
      {admin ? (
        <View style={st.card}>
          <Text style={st.h}>⬇️ স্প্রেডশিট (Excel) ডাউনলোড</Text>
          <Text style={st.small}>এতে মোবাইল নম্বরসহ ব্যক্তিগত তথ্য থাকে; নিরাপদ জায়গায় রাখুন, কাউকে পাঠানোর আগে ভাবুন।</Text>
          {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
          <Button title="সব ব্যবহারকারী" icon="👥" kind="secondary" onPress={() => dl('users')} loading={busy === 'users'} disabled={!!busy} style={{ marginTop: S.sm }} />
          <Button title="সব চুক্তি" icon="📜" kind="secondary" onPress={() => dl('contracts')} loading={busy === 'contracts'} disabled={!!busy} style={{ marginTop: S.sm }} />
          <Button title="সব অভিযোগ" icon="🚩" kind="secondary" onPress={() => dl('complaints')} loading={busy === 'complaints'} disabled={!!busy} style={{ marginTop: S.sm }} />
          <Button title="সব টাকা জমা" icon="💳" kind="secondary" onPress={() => dl('payments')} loading={busy === 'payments'} disabled={!!busy} style={{ marginTop: S.sm }} />
          <Button title="চুক্তিভিত্তিক হিসাব ও কমিশন" icon="📒" kind="secondary" onPress={() => dl('ledger')} loading={busy === 'ledger'} disabled={!!busy} style={{ marginTop: S.sm }} />
        </View>
      ) : null}
    </>
  );
}

function ComplaintsTab() {
  const { state, data, load, gate } = useLoad(listComplaints);
  const [msg, setMsg] = useState(null);
  const rows = data || [];
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <Text style={st.small}>যাচাই করলে অভিযোগের লেখা লিডারের প্রোফাইলে সবাই দেখবে (হাজীর নাম দেখাবে না)। আগে প্রমাণ দেখুন, দুপক্ষকে ফোন করুন।</Text>
          {rows.filter((r) => r.status === 'pending').length === 0 ? <Notice kind="ok" title="যাচাই বাকি এমন অভিযোগ নেই" /> : null}
          {rows.map((r) => <ComplaintCard key={r.id} r={r} onDone={(t) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t) => setMsg({ kind: 'bad', text: t })} />)}
        </>
      ) : null}
    </>
  );
}
function ComplaintCard({ r, onDone, onFail }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const tel = (n) => Linking.openURL(`tel:${telBd(n)}`).catch(() => {});
  const open = async (f) => { try { await Linking.openURL(await evidenceUrl(f.path)); } catch (e) { onFail('ফাইলটি খোলা যায়নি।'); } };
  const decide = (v) => confirm(v ? 'অভিযোগটি যাচাই করা হিসেবে প্রকাশ করবেন?' : 'অভিযোগটি বাতিল করবেন?', v ? 'লিডারের প্রোফাইলে সবাই দেখবেন।' : 'হাজী আপনার নোট দেখবেন।', v ? 'হ্যাঁ, প্রকাশ করুন' : 'হ্যাঁ, বাতিল', async () => {
    setBusy(true);
    try { const x = await decideComplaint(r.id, v, note.trim()); onDone(x === 'ok' ? (v ? 'অভিযোগ যাচাই করা হিসেবে প্রকাশ হয়েছে।' : 'অভিযোগ বাতিল হয়েছে।') : 'আগেই সিদ্ধান্ত নেওয়া হয়েছে।'); }
    catch (e) { onFail(errText(e)); setBusy(false); }
  });
  const pending = r.status === 'pending';
  return (
    <View style={[st.card, pending && st.invite]}>
      <Text style={st.small}>{fmtDay(r.created_at)} · চুক্তি {r.contract_no} · {pending ? '⏳ যাচাই বাকি' : r.status === 'verified' ? '✅ প্রকাশিত' : '✖️ বাতিল'}</Text>
      <Text style={st.p} selectable>{r.body}</Text>
      <View style={st.cRow}><Text style={st.lbl}>হাজী</Text><Text style={st.p}>{r.haji_name} ({r.haji_code}){r.haji_phone ? ` · ${toBn(r.haji_phone)}` : ''}</Text></View>
      <View style={st.cRow}><Text style={st.lbl}>লিডার</Text><Text style={st.p}>{r.leader_name} ({r.leader_code}) · {toBn(r.leader_phone)}</Text></View>
      {(r.files || []).map((f, i) => <Button key={f.path} title={`প্রমাণ ${toBn(i + 1)} দেখুন (${f.kind === 'image' ? 'ছবি' : f.kind === 'audio' ? 'অডিও' : 'ভিডিও'})`} icon="📎" kind="secondary" onPress={() => open(f)} style={{ marginTop: S.xs }} />)}
      {pending ? (
        <>
          {r.haji_phone ? <Button title="হাজীকে ফোন করুন" icon="📞" kind="secondary" onPress={() => tel(r.haji_phone)} style={{ marginTop: S.sm }} /> : null}
          <Button title="লিডারকে ফোন করুন" icon="📞" kind="secondary" onPress={() => tel(r.leader_phone)} style={{ marginTop: S.sm }} />
          <View style={{ marginTop: S.md }}><Field label="নোট" hint="যেমন: দুপক্ষের সাথে কথা হয়েছে" value={note} onChangeText={setNote} maxLength={500} /></View>
          <Button title="যাচাই হয়েছে, প্রকাশ করুন" icon="✅" onPress={() => decide(true)} loading={busy} />
          <Button title="প্রমাণ নেই, বাতিল করুন" kind="danger" onPress={() => decide(false)} disabled={busy} style={{ marginTop: S.sm }} />
        </>
      ) : r.admin_note ? <Text style={st.small}>নোট: {r.admin_note}</Text> : null}
    </View>
  );
}

const REASON = { fraud: 'প্রতারণা/টাকা', abuse: 'খারাপ ব্যবহার', fake: 'ভুয়া তথ্য', spam: 'বিরক্তিকর', other: 'অন্য' };
function ReportsTab({ canUsers }) {
  const { state, data, load, gate } = useLoad(listReports);
  const [cancels, setCancels] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (canUsers) referralCancels().then(setCancels).catch(() => {}); }, [canUsers, data]);
  const act = async (fn, t) => { setBusy(true); setMsg(null); try { await fn(); setMsg({ kind: 'ok', text: t }); await load(); } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); } finally { setBusy(false); } };
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {canUsers && cancels.length ? <Text style={st.h}>🔑 রেফারেল বাতিলের অনুরোধ</Text> : null}
      {cancels.map((c) => (
        <View key={c.haji_id} style={[st.card, st.invite]}>
          <Text style={st.val}>{c.haji_name} ({c.haji_code}) → {c.leader_name} ({c.leader_code})</Text>
          <Text style={st.p}>কারণ: {c.cancel_reason}</Text>
          <Text style={st.small}>{fmtDay(c.cancel_at)} · হাজীর ফোন {toBn(c.haji_phone)}</Text>
          <Button title="অনুমোদন দিন" icon="✅" onPress={() => act(() => decideReferralCancel(c.haji_id, true), 'রেফারেল বাতিল হয়েছে।')} disabled={busy} style={{ marginTop: S.sm }} />
          <Button title="না" kind="secondary" onPress={() => act(() => decideReferralCancel(c.haji_id, false), 'অনুরোধ ফিরিয়ে দেওয়া হয়েছে।')} disabled={busy} style={{ marginTop: S.sm }} />
        </View>
      ))}
      <Text style={st.h}>📮 ব্যবহারকারীর রিপোর্ট</Text>
      {gate}
      {state === 'ok' && data.length === 0 ? <Notice kind="ok" title="কোনো রিপোর্ট নেই" /> : null}
      {state === 'ok' ? data.map((r) => (
        <View key={r.id} style={[st.card, r.status === 'new' && st.invite]}>
          <Text style={st.small}>{fmtDay(r.created_at)} · {REASON[r.reason]} · {r.status === 'new' ? 'নতুন' : 'দেখা হয়েছে'}</Text>
          <Text style={st.val}>{r.target_name} ({r.target_code}) · {r.target_type === 'leader' ? 'লিডার' : 'হাজী'}{r.target_status === 'suspended' ? ' · বন্ধ' : ''}</Text>
          <Text style={st.small}>রিপোর্ট করেছেন: {r.reporter_name} ({r.reporter_code})</Text>
          {r.details ? <Text style={st.p}>{r.details}</Text> : null}
          {r.status === 'new' ? <Button title="দেখা হয়েছে" icon="✅" kind="secondary" onPress={() => act(() => handleReport(r.id, null), 'চিহ্নিত করা হয়েছে।')} disabled={busy} style={{ marginTop: S.sm }} /> : null}
          {canUsers && r.status === 'new' ? <Text style={st.small}>দরকার হলে "ব্যবহারকারী" অংশ থেকে {r.target_code} খুঁজে অ্যাকাউন্ট বন্ধ করুন।</Text> : null}
        </View>
      )) : null}
    </>
  );
}

function UsersTab() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState({});
  const search = async () => {
    if (q.trim().length < 3) { setMsg({ kind: 'bad', text: 'অন্তত ৩ অক্ষর লিখুন (নাম, আইডি বা মোবাইল নম্বর)।' }); return; }
    setBusy(true); setMsg(null);
    try { setRows(await findUsers(q.trim())); } catch (e) { setMsg({ kind: notReady(e) ? 'info' : 'bad', text: notReady(e) ? 'শীঘ্রই চালু হবে।' : errText(e) }); }
    finally { setBusy(false); }
  };
  const change = (u, status) => {
    const why = (reason[u.id] || '').trim();
    if (why.length < 5) { setMsg({ kind: 'bad', text: 'কারণ লিখুন (অন্তত ৫ অক্ষর)।' }); return; }
    confirm(status === 'suspended' ? `${u.full_name}-এর অ্যাকাউন্ট বন্ধ করবেন?` : `${u.full_name}-এর অ্যাকাউন্ট আবার চালু করবেন?`,
      status === 'suspended' ? 'তিনি অ্যাপ ব্যবহার করতে পারবেন না; লিডার হলে তাঁর প্যাকেজও লুকিয়ে যাবে।' : '', status === 'suspended' ? 'হ্যাঁ, বন্ধ করুন' : 'হ্যাঁ, চালু করুন', async () => {
        setBusy(true); setMsg(null);
        try { const r = await setUserStatus(u.id, status, why); setMsg(r === 'ok' ? { kind: 'ok', text: 'করা হয়েছে।' } : { kind: 'warn', text: 'এই অ্যাকাউন্টে এটা করা যাবে না।' }); await search(); }
        catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
        finally { setBusy(false); }
      });
  };
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Field label="নাম, আইডি বা মোবাইল নম্বর" hint="যেমন: TL-00012 বা 01712" value={q} onChangeText={setQ} />
      <Button title="খুঁজুন" icon="🔎" onPress={search} loading={busy} />
      {rows && rows.length === 0 ? <Notice kind="info" title="কাউকে পাওয়া যায়নি" /> : null}
      {(rows || []).map((u) => (
        <View key={u.id} style={[st.card, { marginTop: S.md }]}>
          <Text style={st.val}>{u.full_name} ({u.haji_code})</Text>
          <Text style={st.small}>{toBn(u.phone)} · {u.account_type === 'leader' ? 'লিডার অ্যাকাউন্ট' : 'হাজী অ্যাকাউন্ট'} · ভূমিকা: {u.role} · {u.status === 'active' ? '✅ চালু' : '⛔ বন্ধ'}</Text>
          {u.role !== 'admin' ? (
            <>
              <Field label="কারণ" hint="যেমন: একাধিক যাচাই করা অভিযোগ" value={reason[u.id] || ''} onChangeText={(v) => setReason((x) => ({ ...x, [u.id]: v }))} maxLength={300} />
              {u.status === 'active'
                ? <Button title="অ্যাকাউন্ট বন্ধ করুন" icon="⛔" kind="danger" onPress={() => change(u, 'suspended')} disabled={busy} />
                : <Button title="আবার চালু করুন" icon="✅" kind="secondary" onPress={() => change(u, 'active')} disabled={busy} />}
            </>
          ) : null}
        </View>
      ))}
    </>
  );
}

function StaffTab() {
  const { state, data, load, gate } = useLoad(listStaff);
  const [phone, setPhone] = useState('');
  const [sel, setSel] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = (ph, perms) => confirm(perms.length ? 'এই স্টাফকে এই অধিকারগুলো দেবেন?' : 'এই স্টাফের সব অধিকার সরিয়ে দেবেন?', perms.map((x) => PERMS.find((p) => p.id === x)?.label).join(', '), 'হ্যাঁ', async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await setStaff(ph, perms);
      setMsg(r === 'ok' ? { kind: 'ok', text: 'সংরক্ষণ হয়েছে।' } : r === 'not_found' ? { kind: 'bad', text: 'এই নম্বরে কোনো অ্যাকাউন্ট নেই। আগে স্টাফকে অ্যাপে হাজী অ্যাকাউন্ট খুলতে বলুন।' } : { kind: 'bad', text: 'এই অ্যাকাউন্টকে স্টাফ বানানো যাবে না (লিডার বা অ্যাডমিন)।' });
      if (r === 'ok') { setPhone(''); setSel([]); }
      await load();
    } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  });
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <View style={st.card}>
        <Text style={st.h}>➕ স্টাফ যোগ / অধিকার বদলান</Text>
        <Text style={st.small}>স্টাফ আগে অ্যাপে সাধারণ (হাজী) অ্যাকাউন্ট খুলবেন। তারপর তাঁর নম্বর লিখে কাজ বেছে দিন।</Text>
        <Field label="স্টাফের মোবাইল নম্বর" hint="যেমন: 01712345678" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={11} />
        {PERMS.map((p) => (
          <Pressable key={p.id} onPress={() => setSel((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))} style={{ minHeight: 48, justifyContent: 'center' }}
            accessibilityRole="checkbox" accessibilityState={{ checked: sel.includes(p.id) }}>
            <Text style={st.p}>{sel.includes(p.id) ? '☑️' : '⬜'} {p.label}</Text>
          </Pressable>
        ))}
        <Button title="সংরক্ষণ করুন" icon="💾" onPress={() => { if (!/^01[3-9]\d{8}$/.test(phone.trim())) { setMsg({ kind: 'bad', text: 'সঠিক ১১ সংখ্যার নম্বর লিখুন।' }); return; } if (!sel.length) { setMsg({ kind: 'bad', text: 'অন্তত একটি কাজ বাছুন।' }); return; } save(phone.trim(), sel); }} loading={busy} />
      </View>
      {gate}
      {state === 'ok' && data.length === 0 ? <Notice kind="info" title="এখনো কোনো স্টাফ নেই" /> : null}
      {state === 'ok' ? data.map((u) => (
        <View key={u.user_id} style={st.card}>
          <Text style={st.val}>{u.full_name} · {toBn(u.phone)}</Text>
          <Text style={st.small}>{u.perms.map((x) => PERMS.find((p) => p.id === x)?.label).join(', ')}</Text>
          <Button title="অধিকার বদলান" kind="secondary" onPress={() => { setPhone(u.phone); setSel(u.perms); }} disabled={busy} style={{ marginTop: S.sm }} />
          <Button title="স্টাফ থেকে সরান" kind="danger" onPress={() => save(u.phone, [])} disabled={busy} style={{ marginTop: S.sm }} />
        </View>
      )) : null}
    </>
  );
}

function TermsTab() {
  const [body, setBody] = useState('');
  const [state, setState] = useState('load');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getTerms().then((t) => { setBody(t ? t.body : ''); setState('ok'); }).catch(() => setState('ok')); }, []);
  const save = () => confirm('শর্তাবলি সংরক্ষণ করবেন?', 'নতুন অ্যাকাউন্ট খোলার সময় সবাই এটা দেখবেন ও টিক দেবেন। সবার অ্যাপে সঙ্গে সঙ্গে বদলে যাবে।', 'হ্যাঁ, সংরক্ষণ', async () => {
    setBusy(true); setMsg(null);
    try { await setText('terms', body.trim()); setMsg({ kind: 'ok', text: body.trim() ? 'শর্তাবলি সংরক্ষণ হয়েছে।' : 'শর্তাবলি সরানো হয়েছে।' }); }
    catch (e) { setMsg({ kind: 'bad', text: notReady(e) ? 'শীঘ্রই চালু হবে।' : errText(e) }); }   // text stays in the box
    finally { setBusy(false); }
  });
  if (state === 'load') return <ActivityIndicator color={C.primary} />;
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Notice kind="warn" title="আইনি লেখা" text="শর্তাবলি আপনার কোম্পানির পক্ষ থেকে একজন আইনজীবীকে দিয়ে দেখিয়ে নিন। এখানে যা লিখবেন, অ্যাপে হুবহু তাই দেখাবে।" />
      <Field label="শর্তাবলির পুরো লেখা" value={body} onChangeText={setBody} multiline maxLength={20000} />
      <Button title="সংরক্ষণ করুন" icon="💾" onPress={save} loading={busy} />
    </>
  );
}

const ACTION = { approve_leader: 'লিডার অনুমোদন', reject_leader: 'লিডার আবেদন বাতিল', complaint_verified: 'অভিযোগ প্রকাশ', complaint_rejected: 'অভিযোগ বাতিল',
  report_handled: 'রিপোর্ট দেখা', suspend_user: 'অ্যাকাউন্ট বন্ধ', reactivate_user: 'অ্যাকাউন্ট চালু', staff_set: 'স্টাফের অধিকার', staff_removed: 'স্টাফ সরানো',
  referral_cancel_ok: 'রেফারেল বাতিল অনুমোদন', referral_cancel_no: 'রেফারেল বাতিল নাকচ', call_done: 'ফোনের অনুরোধ শেষ', offer_hidden: 'প্যাকেজ লুকানো', offer_shown: 'প্যাকেজ দেখানো',
  text_terms: 'শর্তাবলি বদল', export_users: 'ব্যবহারকারী ডাউনলোড', export_contracts: 'চুক্তি ডাউনলোড', export_complaints: 'অভিযোগ ডাউনলোড' };
function AuditTab() {
  const { state, data, gate } = useLoad(listAudit);
  return (
    <>
      <Text style={st.small}>অ্যাডমিন ও স্টাফ কে কবে কী করেছেন, তার রেকর্ড। এটা কেউ মুছতে বা বদলাতে পারেন না।</Text>
      {gate}
      {state === 'ok' && data.length === 0 ? <Notice kind="info" title="এখনো কোনো রেকর্ড নেই" /> : null}
      {state === 'ok' ? data.map((a) => (
        <View key={a.id} style={st.card}>
          <Text style={st.small}>{fmtDay(a.at)} · {a.actor_name || '—'}</Text>
          <Text style={st.val}>{ACTION[a.action] || a.action}{a.target_name ? ` · ${a.target_name} (${a.target_code})` : ''}</Text>
          {a.detail ? <Text style={st.small}>{a.detail}</Text> : null}
        </View>
      )) : null}
    </>
  );
}
