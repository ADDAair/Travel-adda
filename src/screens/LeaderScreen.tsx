import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { View, Text, Pressable, Image, Share, Linking, ActivityIndicator, BackHandler } from 'react-native';
import ScrollView from '../components/KbScroll';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { toBn, normalizeDigits, normalizePhone, isValidBdPhone } from '../lib/phone';
import { signedAvatarUrl } from '../lib/avatar';
import { parseDate } from '../lib/dates';
import { inviteResultText, mySentInvites, cancelInvite } from '../lib/help';
import { removeGroup, reopenGroup, removeGroupText } from '../lib/groups';
import { myProfile, leaderGroups, createGroup, inviteByPhone, groupMembers, removeMember, createContract, notReady, telBd, groupAnnouncements, postAnnouncement, deleteAnnouncement } from '../lib/groups';
import { st, errText, confirm, fmtWhen } from './GroupScreen';
import type { Msg, Nav, Row } from './navTypes';

const STATUS: Record<string, string> = { active: '✅ দলে আছেন', invited: '📩 আমন্ত্রণ পাঠানো হয়েছে', left: '↩️ দল ছেড়েছেন', removed: '⛔ সরানো হয়েছে', declined: '✖️ আমন্ত্রণ নেননি' };
const call = (n: string) => Linking.openURL(`tel:${telBd(n)}`).catch(() => {});

// Verified leaders: make groups, share the join code, invite by phone, see members, and write package terms.
export default function LeaderScreen({ navigation }: { navigation: Nav }): JSX.Element {
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err' | 'denied'>('load');
  const [groups, setGroups] = useState<Row[]>([]);
  const [sel, setSel] = useState<Row | null>(null);
  const [name, setName] = useState('');
  const [season, setSeason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [topMsg, setTopMsg] = useState<Msg>(null);     // what happened to a group that was removed

  const load = useCallback(async () => {
    try {
      const p = await myProfile();
      if (p.role !== 'leader') { setState('denied'); return; }
      setGroups(await leaderGroups()); setState('ok');
    } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!sel) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setSel(null); return true; });
    return () => sub.remove();
  }, [sel]);

  const make = async () => {
    if (busy) return;
    if (name.trim().length < 2) { setMsg({ kind: 'bad', text: 'দলের একটি নাম লিখুন (যেমন: হজ ২০২৭ – দল ১)।' }); return; }
    setBusy(true); setMsg(null);
    try { const g = await createGroup(name, season); setName(''); setSeason(''); await load(); setSel(g); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };

  if (sel) return <GroupAdmin g={sel} navigation={navigation} onBack={(m?: Msg) => { setSel(null); setTopMsg(m || null); load(); }} />;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান"><Text style={st.backT}>‹ হোম</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">🧭 লিডার প্যানেল</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" /> : null}
      {state === 'denied' ? <Notice kind="warn" title="এই পাতা শুধু অনুমোদিত লিডারদের জন্য" text="'আমার দল' পাতা থেকে লিডার হতে আবেদন করুন।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' ? (
        <>
          <Button title="চুক্তি ও রেফারেল হাজী" icon="📜" onPress={() => navigation.navigate('LeaderContracts')} a11yHint="হাজীর আইডিতে চুক্তি পাঠান, উত্তর দেখুন" style={{ marginBottom: S.sm }} />
          <Button title="আমার প্যাকেজ (অফার)" icon="🎁" kind="gold" onPress={() => navigation.navigate('LeaderOffers')} a11yHint="হাজীদের অফার পাতায় প্যাকেজ দিন" style={{ marginBottom: S.sm }} />
          <Button title="আমার লিডার প্রোফাইল" icon="👤" kind="secondary" onPress={() => navigation.navigate('LeaderMe')} a11yHint="হাজীরা তালিকায় আপনাকে কীভাবে দেখেন" style={{ marginBottom: S.md }} />
          {topMsg ? <Notice kind={topMsg.kind} title={topMsg.text} /> : null}
          <Text style={st.h}>👥 আমার দলগুলো</Text>
          {groups.length === 0 ? <Notice kind="info" title="এখনো কোনো দল নেই" text="নিচে দলের নাম লিখে প্রথম দল বানান।" /> : null}
          {groups.map((g) => (
            <Pressable key={g.id} onPress={() => { setTopMsg(null); setSel(g); }} style={st.card} accessibilityRole="button" accessibilityLabel={`${g.name} দল খুলুন`}>
              <Text style={st.gName}>{g.name} ›</Text>
              <Text style={st.small}>{g.season ? `${g.season} · ` : ''}কোড: {g.join_code}{g.active ? '' : ' · বন্ধ'}</Text>
            </Pressable>
          ))}
          <View style={st.card}>
            <Text style={st.h}>➕ নতুন দল বানান</Text>
            {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
            <Field label="দলের নাম" hint="যেমন: হজ ২০২৭ – দল ১" value={name} onChangeText={setName} maxLength={80} />
            <Field label="মৌসুম (ইচ্ছা করলে)" hint="যেমন: হজ ২০২৭ বা ওমরাহ রমজান" value={season} onChangeText={setSeason} maxLength={40} />
            <Button title="দল বানান" icon="👥" onPress={make} loading={busy} />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function AnnounceBox({ g }: { g: Row }): JSX.Element {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    try { setRows((await groupAnnouncements([g.id])).rows); } catch (e) { setRows([]); if (notReady(e)) setMsg({ kind: 'info', text: 'ঘোষণা পাঠানো শীঘ্রই চালু হবে।' }); }
  }, [g]);
  useEffect(() => { load(); }, [load]);
  const send = () => {
    if (busy) return;
    if (text.trim().length < 2) { setMsg({ kind: 'bad', text: 'ঘোষণাটি লিখুন।' }); return; }
    confirm('দলের সবাইকে ঘোষণাটি পাঠাবেন?', text.trim(), 'হ্যাঁ, পাঠান', async () => {
      setBusy(true); setMsg(null);
      try { await postAnnouncement(g.id, text); setText(''); setMsg({ kind: 'ok', text: 'ঘোষণা পাঠানো হয়েছে। হাজীরা "আমার দল" পাতায় দেখবেন।' }); await load(); }
      catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string } | null)?.code === '42501' ? 'পাঠানো যায়নি। একদিনে ৩০টির বেশি ঘোষণা পাঠানো যায় না।' : errText(e) }); }   // the text stays in the box
      finally { setBusy(false); }
    });
  };
  const del = (a: Row) => confirm('ঘোষণাটি মুছে ফেলবেন?', 'হাজীরা আর এটি দেখবেন না।', 'হ্যাঁ, মুছুন', async () => {
    setBusy(true); setMsg(null);
    try { await deleteAnnouncement(a.id); setMsg({ kind: 'ok', text: 'ঘোষণা মুছে ফেলা হয়েছে।' }); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  });
  return (
    <View style={st.card}>
      <Text style={st.h}>📢 দলের সবাইকে ঘোষণা</Text>
      <Text style={st.small}>যেমন বাসের সময়, দেখা করার জায়গা। দলের সবাই অ্যাপের "আমার দল" পাতায় দেখবেন। জরুরি হলে ফোনও করুন।</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Field label="ঘোষণা" hint="যেমন: কাল ভোর ৫টায় বাস ছাড়বে, হোটেলের নিচে থাকুন" value={text} onChangeText={setText} multiline maxLength={500} />
      <Button title="সবাইকে পাঠান" icon="📢" onPress={send} loading={busy} />
      {(rows || []).slice(0, 10).map((a) => (
        <View key={a.id} style={st.cRow}>
          <Text style={st.small}>{fmtWhen(a.created_at)}</Text>
          <Text style={st.p}>{a.body}</Text>
          <Pressable onPress={() => del(a)} disabled={busy} style={st.leave} accessibilityRole="button" accessibilityLabel="এই ঘোষণা মুছুন"><Text style={st.leaveT}>মুছুন</Text></Pressable>
        </View>
      ))}
    </View>
  );
}

function GroupAdmin({ g, onBack, navigation }: { g: Row; onBack: (m?: Msg) => void; navigation: Nav }): JSX.Element {
  const [active, setActive] = useState<boolean>(g.active !== false);
  const [members, setMembers] = useState<Row[] | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Row[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [form, setForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await groupMembers(g.id));
    } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); setMembers((x) => x || []); }
    try { setSent((await mySentInvites(g.id)).filter((x) => x.kind === 'member')); } catch (e) { setSent([]); }   // before step 021: none
  }, [g]);
  useEffect(() => { load(); }, [load]);

  const share = () => Share.share({ message: `Travel Adda অ্যাপে আমাদের "${g.name}" দলে যোগ দিন।\nঅ্যাপের "আমার দল" পাতায় এই কোড লিখুন: ${g.join_code}` }).catch(() => {});
  const invite = async () => {
    if (busy) return;
    const p = normalizePhone(phone);
    if (!isValidBdPhone(p)) { setMsg({ kind: 'bad', text: 'সঠিক ১১ সংখ্যার মোবাইল নম্বর লিখুন (০১ দিয়ে শুরু)।' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await inviteByPhone(g.id, p);
      if (r === 'sent') setPhone('');
      setMsg({ kind: r === 'sent' ? 'ok' : 'warn', text: r === 'sent' ? `${inviteResultText('sent')} অ্যাকাউন্ট না থাকলে তাঁকে দলের কোডটি পাঠান।` : inviteResultText(String(r)) });
      await load();
    } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };
  const cancelSent = (x: Row) => confirm('আমন্ত্রণটি বাতিল করবেন?', x.hint, 'হ্যাঁ, বাতিল', async () => {
    setBusy(true); setMsg(null);
    try { await cancelInvite(x.id); await load(); setMsg({ kind: 'ok', text: 'আমন্ত্রণ বাতিল হয়েছে।' }); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  });
  const removeIt = () => confirm(`"${g.name}" দল বাদ দেবেন?`,
    'দলে কেউ না থাকলে দলটি পুরো মুছে যাবে, ফেরানো যাবে না। কেউ যোগ দিয়ে থাকলে মোছা হবে না, বন্ধ করা হবে: নতুন কেউ যোগ দিতে পারবেন না, আগের তথ্য থাকবে।',
    'হ্যাঁ, বাদ দিন', async () => {
      setBusy(true); setMsg(null);
      try {
        const r = await removeGroup(g.id);
        if (r === 'deleted' || r === 'closed') { onBack({ kind: 'ok', text: removeGroupText(r) }); return; }
        setMsg({ kind: 'info', text: removeGroupText(r) });
      } catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string }).code === 'soon' ? 'দল বাদ দেওয়ার সুবিধা শীঘ্রই আসছে।' : errText(e) }); }
      setBusy(false);
    });
  const reopen = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await reopenGroup(g.id); setActive(true); setMsg({ kind: 'ok', text: 'দলটি আবার চালু হয়েছে। হাজীরা কোড দিয়ে যোগ দিতে পারবেন।' }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string }).code === 'soon' ? 'এই সুবিধা শীঘ্রই আসছে।' : errText(e) }); }
    finally { setBusy(false); }
  };
  const remove = (m: Row) => confirm(`${m.full_name}-কে দল থেকে সরাবেন?`, 'তিনি আর আপনার দলের শর্ত দেখতে পাবেন না।', 'হ্যাঁ, সরান', async () => {
    setBusy(true); setMsg(null);
    try { await removeMember(g.id, m.user_id); await load(); setMsg({ kind: 'ok', text: 'সরানো হয়েছে।' }); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  });

  const joined = (members || []).filter((m) => m.status === 'active');
  const nameOf = Object.fromEntries((members || []).map((m) => [m.user_id, m.full_name]));

  if (form) return <ContractForm g={g} onDone={(saved: boolean) => { setForm(false); if (saved) { setMsg({ kind: 'ok', text: 'শর্ত সংরক্ষণ হয়েছে। দলের হাজীরা এখন পড়ে সম্মতি দিতে পারবেন।' }); load(); } }} />;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => onBack()} style={st.back} accessibilityRole="button" accessibilityLabel="লিডার প্যানেলে ফিরে যান"><Text style={st.backT}>‹ সব দল</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{g.name}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {!active ? (
        <Notice kind="warn" title="এই দলটি বন্ধ" text="নতুন কেউ যোগ দিতে পারবেন না। আগের সদস্য ও তথ্য রাখা আছে।">
          <Button title="দলটি আবার চালু করুন" icon="🔓" kind="secondary" onPress={reopen} loading={busy} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}

      <View style={st.card}>
        <Text style={st.lbl}>দলে যোগ দেওয়ার কোড</Text>
        <Text style={{ fontSize: 34, fontWeight: '800', color: C.primary, letterSpacing: 4, marginVertical: S.xs }} selectable accessibilityLabel={`কোড ${g.join_code.split('').join(' ')}`}>{g.join_code}</Text>
        <Text style={st.small}>হাজীরা অ্যাপের "আমার দল" পাতায় এই কোড লিখে যোগ দেবেন।</Text>
        {active ? <Button title="কোডটি পাঠান (হোয়াটসঅ্যাপ/এসএমএস)" icon="📤" kind="secondary" onPress={share} /> : <Text style={st.small}>দল বন্ধ থাকায় এই কোড এখন কাজ করবে না।</Text>}
      </View>

      <View style={st.card}>
        <Text style={st.h}>💬 হাজীদের প্রশ্ন ও 🤝 খাদেম</Text>
        <Text style={st.small}>প্রতিটি হাজী আপনাকে ও খাদেমদের আলাদাভাবে প্রশ্ন বা পরামর্শ লিখতে পারেন; অন্য হাজীরা দেখেন না।</Text>
        <Button title="হাজীদের প্রশ্ন দেখুন" icon="💬" onPress={() => navigation.navigate('HelpInbox', { groupId: g.id })} style={{ marginTop: S.sm }} />
        <Button title="খাদেম যোগ / সরান" icon="🤝" kind="secondary" onPress={() => navigation.navigate('GroupStaff', { groupId: g.id, groupName: g.name, tab: 'khadem' })} style={{ marginTop: S.sm }} />
        <Button title="তৈরি উত্তর লিখুন" icon="📋" kind="secondary" onPress={() => navigation.navigate('GroupStaff', { groupId: g.id, groupName: g.name, tab: 'faq' })} style={{ marginTop: S.sm }} />
      </View>

      <AnnounceBox g={g} />

      <View style={st.card}>
        <Text style={st.h}>📱 মোবাইল নম্বরে আমন্ত্রণ</Text>
        {active ? (
          <>
            <Field label="হাজীর মোবাইল নম্বর" hint="যেমন: 01712345678" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={14} />
            <Button title="আমন্ত্রণ পাঠান" icon="📩" onPress={invite} loading={busy} />
          </>
        ) : <Text style={st.small}>দল বন্ধ থাকায় নতুন আমন্ত্রণ পাঠানো যাবে না।</Text>}
        {sent.length ? (
          <>
            <Text style={[st.lbl, { marginTop: S.md }]}>পাঠানো আমন্ত্রণ (গোপনীয়তার জন্য নম্বরের কিছু অংশ লুকানো)</Text>
            {sent.map((x) => (
              <View key={x.id} style={{ borderTopWidth: 1, borderColor: C.line, paddingVertical: S.xs }}>
                <Text style={st.p}>📩 {x.hint} · {x.joined ? '✅ দলে যোগ দিয়েছেন' : '⏳ উত্তরের অপেক্ষায়'}</Text>
                {!x.joined ? <Button title="বাতিল করুন" kind="secondary" onPress={() => cancelSent(x)} disabled={busy} style={{ marginTop: S.xs }} /> : null}
              </View>
            ))}
          </>
        ) : null}
      </View>

      <View style={st.card}>
        <Text style={st.h}>👥 সদস্য: {toBn(joined.length)} জন</Text>
        {members === null ? <ActivityIndicator color={C.primary} /> : null}
        {members && members.length === 0 ? <Text style={st.p}>এখনো কেউ যোগ দেননি।</Text> : null}
        {(members || []).map((m) => <MemberRow key={m.user_id} m={m} onRemove={() => remove(m)} busy={busy} />)}
      </View>

      <Notice kind="info" title="চুক্তি এখন প্রতিটি হাজীর সাথে আলাদা" text='লিডার প্যানেলের "চুক্তি" অংশ থেকে হাজীর আইডিতে চুক্তির অনুরোধ পাঠান।' />
      {active ? (
        <View style={[st.card, { borderWidth: 1, borderColor: C.bad }]}>
          <Text style={st.h}>🗑️ ভুল করে দল খুলেছেন?</Text>
          <Text style={st.small}>কেউ যোগ না দিয়ে থাকলে দলটি পুরো মুছে যাবে। কেউ যোগ দিয়ে থাকলে বা আমন্ত্রণ পেয়ে থাকলে দলটি বন্ধ হবে, রেকর্ড থাকবে।</Text>
          <Button title="দল বাদ দিন" icon="🗑️" kind="danger" onPress={removeIt} loading={busy} style={{ marginTop: S.sm }} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function MemberRow({ m, onRemove, busy }: { m: Row; onRemove: () => void; busy: boolean }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; signedAvatarUrl(m.avatar_path).then((u) => { if (on) setUrl(u); }); return () => { on = false; }; }, [m.avatar_path]);
  const isActive = m.status === 'active' || m.status === 'invited';
  return (
    <View style={[st.cRow, { paddingVertical: S.sm }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {url ? <Image source={{ uri: url }} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.line }} accessibilityLabel={`${m.full_name}-এর ছবি`} />
          : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 30 }}>👤</Text></View>}
        <View style={{ flex: 1, marginLeft: S.sm }}>
          <Text style={st.val}>{m.full_name}</Text>
          <Text style={st.small}>আইডি: {m.haji_code} · {toBn(m.phone)}</Text>
          <Text style={st.small}>{STATUS[m.status] || m.status}</Text>
          {m.phone_verified === true ? <Text style={st.small}>✔️ অ্যাকাউন্ট যাচাই করা (মোবাইল বা ইমেইলের কোডে)</Text> : null}
          {m.phone_verified === false ? <Text style={st.small}>⚠️ অ্যাকাউন্ট এখনো যাচাই হয়নি, ফোন করে নিশ্চিত হোন</Text> : null}
        </View>
      </View>
      {m.status === 'active' ? <Button title={`ফোন করুন (${toBn(m.phone)})`} icon="📞" kind="secondary" onPress={() => call(m.phone)} style={{ marginTop: S.sm }} /> : null}
      {isActive ? (
        <Pressable onPress={onRemove} disabled={busy} style={st.leave} accessibilityRole="button" accessibilityLabel={`${m.full_name}-কে দল থেকে সরান`}><Text style={st.leaveT}>দল থেকে সরান</Text></Pressable>
      ) : null}
    </View>
  );
}

function ContractForm({ g, onDone }: { g: Row; onDone: (saved: boolean) => void }): JSX.Element {
  const [f, setF] = useState({ title: '', price: '', includes: '', excludes: '', from: '', to: '', refund: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onDone(false); return true; });
    return () => sub.remove();
  }, [onDone]);

  const save = () => {
    if (busy) return;
    const e: Record<string, string> = {};
    const price = Number(normalizeDigits(f.price).replace(/[,\s]/g, ''));
    const from = parseDate(f.from); const to = parseDate(f.to);
    if (f.title.trim().length < 2) e.title = 'প্যাকেজের নাম লিখুন।';
    if (!f.price.trim() || !Number.isFinite(price) || price < 0 || price >= 1e8) e.price = 'মোট দাম শুধু সংখ্যায় লিখুন (যেমন: 650000)।';
    if (f.includes.trim().length < 2) e.includes = 'প্যাকেজে কী কী আছে লিখুন।';
    if (f.refund.trim().length < 2) e.refund = 'বাতিল করলে টাকা কীভাবে ফেরত হবে লিখুন।';
    if (from === null) e.from = 'তারিখ এভাবে লিখুন: ২০-০৫-২০২৭';
    if (to === null) e.to = 'তারিখ এভাবে লিখুন: ১০-০৬-২০২৭';
    if (from && to && to < from) e.to = 'ফেরার তারিখ যাওয়ার তারিখের পরে হতে হবে।';
    setErr(e); setFail('');
    if (Object.keys(e).length) return;
    confirm('শর্তটি সংরক্ষণ করবেন?', 'সংরক্ষণের পর আর বদলানো বা মোছা যাবে না। দাম ও শর্ত আরেকবার মিলিয়ে নিন।', 'হ্যাঁ, সংরক্ষণ করুন', async () => {
      setBusy(true);
      try {
        await createContract({ group_id: g.id, title: f.title.trim(), price_bdt: price, includes: f.includes.trim(), excludes: f.excludes.trim() || null, travel_from: from || null, travel_to: to || null, refund_policy: f.refund.trim() });
        onDone(true);
      } catch (x) { setFail(errText(x)); setBusy(false); }   // the form keeps everything typed
    });
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => onDone(false)} style={st.back} accessibilityRole="button" accessibilityLabel="শর্ত না লিখে ফিরে যান"><Text style={st.backT}>‹ ফিরে যান</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">✍️ নতুন প্যাকেজের শর্ত</Text>
      <Text style={st.small}>দল: {g.name}</Text>
      {fail ? <Notice kind="bad" title={fail} /> : null}
      <Field label="প্যাকেজের নাম" hint="যেমন: হজ প্যাকেজ ২০২৭ (সাধারণ)" value={f.title} onChangeText={set('title')} maxLength={120} error={err.title} />
      <Field label="জনপ্রতি মোট দাম (টাকা)" hint="যেমন: 650000" value={f.price} onChangeText={set('price')} keyboardType="numeric" maxLength={12} error={err.price} />
      <Field label="প্যাকেজে যা আছে" hint="বিমান টিকেট, ভিসা, হোটেল (হারাম থেকে কত দূরে), খাবার, যাতায়াত, কুরবানি..." value={f.includes} onChangeText={set('includes')} multiline maxLength={3000} error={err.includes} />
      <Field label="যা নেই (ইচ্ছা করলে)" hint="যেমন: কুরবানির টাকা, ব্যক্তিগত খরচ" value={f.excludes} onChangeText={set('excludes')} multiline maxLength={3000} />
      <Field label="যাওয়ার তারিখ (ইচ্ছা করলে)" hint="দিন-মাস-বছর, যেমন: ২০-০৫-২০২৭" value={f.from} onChangeText={set('from')} maxLength={10} error={err.from} />
      <Field label="ফেরার তারিখ (ইচ্ছা করলে)" hint="দিন-মাস-বছর, যেমন: ১০-০৬-২০২৭" value={f.to} onChangeText={set('to')} maxLength={10} error={err.to} />
      <Field label="বাতিল ও টাকা ফেরতের নিয়ম" hint="যেমন: ভিসার আগে বাতিল করলে কত টাকা ফেরত, ভিসার পরে কত" value={f.refund} onChangeText={set('refund')} multiline maxLength={3000} error={err.refund} />
      <Button title="শর্ত সংরক্ষণ করুন" icon="💾" onPress={save} loading={busy} />
    </ScrollView>
  );
}
