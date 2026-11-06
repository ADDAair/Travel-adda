import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { View, Text, Pressable, Image, Share, Linking, ActivityIndicator, BackHandler } from 'react-native';
import { tr } from '../lib/lang';
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
import type { Msg, Nav } from './navTypes';
import type { Announcement, LeaderGroup } from '../lib/groups';
import type { Item } from '../lib/types';
import { leaderMyStats, bnCount, type LeaderStats } from '../lib/counts';

const STATUS: Record<string, string> = {
  get active() { return tr('✅ দলে আছেন', '✅ In the group'); },
  get invited() { return tr('📩 আমন্ত্রণ পাঠানো হয়েছে', '📩 Invitation sent'); },
  get left() { return tr('↩️ দল ছেড়েছেন', '↩️ Left the group'); },
  get removed() { return tr('⛔ সরানো হয়েছে', '⛔ Removed'); },
  get declined() { return tr('✖️ আমন্ত্রণ নেননি', '✖️ Declined the invitation'); },
};
const call = (n: string) => Linking.openURL(`tel:${telBd(n)}`).catch(() => {});

// Verified leaders: make groups, share the join code, invite by phone, see members, and write package terms.
export default function LeaderScreen({ navigation }: { navigation: Nav }): JSX.Element {
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err' | 'denied'>('load');
  const [groups, setGroups] = useState<LeaderGroup[]>([]);
  const [sel, setSel] = useState<LeaderGroup | null>(null);
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
    if (name.trim().length < 2) { setMsg({ kind: 'bad', text: tr('দলের একটি নাম লিখুন (যেমন: হজ ২০২৭ – দল ১)।', 'Write a name for the group (e.g. Hajj 2027 – group 1).') }); return; }
    setBusy(true); setMsg(null);
    try { const g = await createGroup(name, season); setName(''); setSeason(''); await load(); setSel(g); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };

  if (sel) return <GroupAdmin g={sel} navigation={navigation} onBack={(m?: Msg) => { setSel(null); setTopMsg(m || null); load(); }} />;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}><Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('🧭 লিডার প্যানেল', '🧭 Leader panel')}</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই চালু হবে', 'Coming soon')} /> : null}
      {state === 'denied' ? <Notice kind="warn" title={tr('এই পাতা শুধু অনুমোদিত লিডারদের জন্য', 'This page is only for approved leaders')} text={tr('\'আমার দল\' পাতা থেকে লিডার হতে আবেদন করুন।', 'Apply to become a leader from the \'My group\' page.')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('তথ্য আনা যায়নি', 'Could not load the information')} text={tr('ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'Check the internet connection and try again.')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' ? (
        <>
          <MyStatsCard />
          <Button title={tr('চুক্তি ও রেফারেল হাজী', 'Contracts and referral hajis')} icon="📜" onPress={() => navigation.navigate('LeaderContracts')} a11yHint={tr('হাজীর আইডিতে চুক্তি পাঠান, উত্তর দেখুন', 'Send a contract to a Haji ID and see the answer')} style={{ marginBottom: S.sm }} />
          <Button title={tr('আমার প্যাকেজ (অফার)', 'My packages (offers)')} icon="🎁" kind="gold" onPress={() => navigation.navigate('LeaderOffers')} a11yHint={tr('হাজীদের অফার পাতায় প্যাকেজ দিন', 'Put packages on the hajis\' offers page')} style={{ marginBottom: S.sm }} />
          <Button title={tr('আমার লিডার প্রোফাইল', 'My leader profile')} icon="👤" kind="secondary" onPress={() => navigation.navigate('LeaderMe')} a11yHint={tr('হাজীরা তালিকায় আপনাকে কীভাবে দেখেন', 'How hajis see you in the list')} style={{ marginBottom: S.md }} />
          {topMsg ? <Notice kind={topMsg.kind} title={topMsg.text} /> : null}
          <Text style={st.h}>{tr('👥 আমার দলগুলো', '👥 My groups')}</Text>
          {groups.length === 0 ? <Notice kind="info" title={tr('এখনো কোনো দল নেই', 'No groups yet')} text={tr('নিচে দলের নাম লিখে প্রথম দল বানান।', 'Write a group name below to make your first group.')} /> : null}
          {groups.map((g) => (
            <Pressable key={g.id} onPress={() => { setTopMsg(null); setSel(g); }} style={st.card} accessibilityRole="button" accessibilityLabel={tr(`${g.name} দল খুলুন`, `Open group ${g.name}`)}>
              <Text style={st.gName}>{g.name} ›</Text>
              <Text style={st.small}>{g.season ? `${g.season} · ` : ''}{tr('কোড', 'Code')}: {g.join_code}{g.active ? '' : tr(' · বন্ধ', ' · closed')}</Text>
            </Pressable>
          ))}
          <View style={st.card}>
            <Text style={st.h}>{tr('➕ নতুন দল বানান', '➕ Make a new group')}</Text>
            {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
            <Field label={tr('দলের নাম', 'Group name')} hint={tr('যেমন: হজ ২০২৭ – দল ১', 'e.g. Hajj 2027 – group 1')} value={name} onChangeText={setName} maxLength={80} />
            <Field label={tr('মৌসুম (ইচ্ছা করলে)', 'Season (optional)')} hint={tr('যেমন: হজ ২০২৭ বা ওমরাহ রমজান', 'e.g. Hajj 2027 or Umrah Ramadan')} value={season} onChangeText={setSeason} maxLength={40} />
            <Button title={tr('দল বানান', 'Make group')} icon="👥" onPress={make} loading={busy} />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

// The leader's OWN numbers (032): hajis in his open groups, running contracts, call requests this month.
function MyStatsCard(): JSX.Element | null {
  const [s, setS] = useState<LeaderStats | null>(null);
  useEffect(() => { leaderMyStats().then(setS); }, []);
  if (!s) return null;           // loading, offline or step 032 not run: nothing rather than wrong numbers
  const items = [
    { icon: '🕋', label: tr('আপনার দলে হাজী', 'Hajis in your groups'), v: tr(`${bnCount(s.hajis)} জন`, `${bnCount(s.hajis)}`) },
    { icon: '📜', label: tr('চালু চুক্তি', 'Active contracts'), v: tr(`${bnCount(s.contracts)}টি`, `${bnCount(s.contracts)}`) },
    { icon: '📞', label: tr('এ মাসে ফোনের অনুরোধ', 'Call requests this month'), v: tr(`${bnCount(s.callsMonth)}টি`, `${bnCount(s.callsMonth)}`) },
  ];
  return (
    <View style={[st.card, { flexDirection: 'row', flexWrap: 'wrap', gap: S.md }]} accessible
      accessibilityLabel={`${tr('আপনার হিসাব', 'Your numbers')}: ${items.map((x) => `${x.label} ${x.v}`).join(', ')}`}>
      {items.map((x) => (
        <View key={x.label} style={{ flex: 1, minWidth: 110 }}>
          <Text style={st.small}>{x.icon} {x.label}</Text>
          <Text style={st.h}>{x.v}</Text>
        </View>
      ))}
    </View>
  );
}

function AnnounceBox({ g }: { g: LeaderGroup }): JSX.Element {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    try { setRows((await groupAnnouncements([g.id])).rows); } catch (e) { setRows([]); if (notReady(e)) setMsg({ kind: 'info', text: tr('ঘোষণা পাঠানো শীঘ্রই চালু হবে।', 'Sending announcements is coming soon.') }); }
  }, [g]);
  useEffect(() => { load(); }, [load]);
  const send = () => {
    if (busy) return;
    if (text.trim().length < 2) { setMsg({ kind: 'bad', text: tr('ঘোষণাটি লিখুন।', 'Write the announcement.') }); return; }
    confirm(tr('দলের সবাইকে ঘোষণাটি পাঠাবেন?', 'Send the announcement to everyone in the group?'), text.trim(), tr('হ্যাঁ, পাঠান', 'Yes, send'), async () => {
      setBusy(true); setMsg(null);
      try { await postAnnouncement(g.id, text); setText(''); setMsg({ kind: 'ok', text: tr('ঘোষণা পাঠানো হয়েছে। হাজীরা "আমার দল" পাতায় দেখবেন।', 'Announcement sent. Hajis will see it on the "My group" page.') }); await load(); }
      catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string } | null)?.code === '42501' ? tr('পাঠানো যায়নি। একদিনে ৩০টির বেশি ঘোষণা পাঠানো যায় না।', 'Not sent. No more than 30 announcements can be sent in one day.') : errText(e) }); }   // the text stays in the box
      finally { setBusy(false); }
    });
  };
  const del = (a: Announcement) => confirm(tr('ঘোষণাটি মুছে ফেলবেন?', 'Delete the announcement?'), tr('হাজীরা আর এটি দেখবেন না।', 'Hajis will no longer see it.'), tr('হ্যাঁ, মুছুন', 'Yes, delete'), async () => {
    setBusy(true); setMsg(null);
    try { await deleteAnnouncement(a.id); setMsg({ kind: 'ok', text: tr('ঘোষণা মুছে ফেলা হয়েছে।', 'Announcement deleted.') }); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  });
  return (
    <View style={st.card}>
      <Text style={st.h}>{tr('📢 দলের সবাইকে ঘোষণা', '📢 Announcement to the whole group')}</Text>
      <Text style={st.small}>{tr('যেমন বাসের সময়, দেখা করার জায়গা। দলের সবাই অ্যাপের "আমার দল" পাতায় দেখবেন। জরুরি হলে ফোনও করুন।', 'Such as bus times or a meeting place. Everyone in the group sees it on the app\'s "My group" page. If urgent, also call.')}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Field label={tr('ঘোষণা', 'Announcement')} hint={tr('যেমন: কাল ভোর ৫টায় বাস ছাড়বে, হোটেলের নিচে থাকুন', 'e.g. the bus leaves at 5am tomorrow, wait below the hotel')} value={text} onChangeText={setText} multiline maxLength={500} />
      <Button title={tr('সবাইকে পাঠান', 'Send to everyone')} icon="📢" onPress={send} loading={busy} />
      {(rows || []).slice(0, 10).map((a) => (
        <View key={a.id} style={st.cRow}>
          <Text style={st.small}>{fmtWhen(a.created_at)}</Text>
          <Text style={st.p}>{a.body}</Text>
          <Pressable onPress={() => del(a)} disabled={busy} style={st.leave} accessibilityRole="button" accessibilityLabel={tr('এই ঘোষণা মুছুন', 'Delete this announcement')}><Text style={st.leaveT}>{tr('মুছুন', 'Delete')}</Text></Pressable>
        </View>
      ))}
    </View>
  );
}

function GroupAdmin({ g, onBack, navigation }: { g: LeaderGroup; onBack: (m?: Msg) => void; navigation: Nav }): JSX.Element {
  const [active, setActive] = useState<boolean>(g.active !== false);
  const [members, setMembers] = useState<Item<typeof groupMembers>[] | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Item<typeof mySentInvites>[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [form, setForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await groupMembers(g.id));
    } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); setMembers((x) => x || []); }
    try { setSent((await mySentInvites(g.id)).filter((x) => x.kind === 'member')); } catch (e) { setSent([]); }   // before step 021: none
  }, [g]);
  useEffect(() => { load(); }, [load]);

  const share = () => Share.share({ message: tr(`"আমি হাজী" অ্যাপে আমাদের "${g.name}" দলে যোগ দিন।\nঅ্যাপের "আমার দল" পাতায় এই কোড লিখুন: ${g.join_code}`, `Join our group "${g.name}" in the "Ami Haji" app.\nType this code on the "My group" page of the app: ${g.join_code}`) }).catch(() => {});
  const invite = async () => {
    if (busy) return;
    const p = normalizePhone(phone);
    if (!isValidBdPhone(p)) { setMsg({ kind: 'bad', text: tr('সঠিক ১১ সংখ্যার মোবাইল নম্বর লিখুন (০১ দিয়ে শুরু)।', 'Write a correct 11-digit mobile number (starting with 01).') }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await inviteByPhone(g.id, p);
      if (r === 'sent') setPhone('');
      setMsg({ kind: r === 'sent' ? 'ok' : 'warn', text: r === 'sent' ? tr(`${inviteResultText('sent')} অ্যাকাউন্ট না থাকলে তাঁকে দলের কোডটি পাঠান।`, `${inviteResultText('sent')} If they have no account, send them the group code.`) : inviteResultText(String(r)) });
      await load();
    } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };
  const cancelSent = (x: Item<typeof mySentInvites>) => confirm(tr('আমন্ত্রণটি বাতিল করবেন?', 'Cancel the invitation?'), x.hint, tr('হ্যাঁ, বাতিল', 'Yes, cancel'), async () => {
    setBusy(true); setMsg(null);
    try { await cancelInvite(x.id); await load(); setMsg({ kind: 'ok', text: tr('আমন্ত্রণ বাতিল হয়েছে।', 'Invitation cancelled.') }); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  });
  const removeIt = () => confirm(tr(`"${g.name}" দল বাদ দেবেন?`, `Remove the group "${g.name}"?`),
    tr('দলে কেউ না থাকলে দলটি পুরো মুছে যাবে, ফেরানো যাবে না। কেউ যোগ দিয়ে থাকলে মোছা হবে না, বন্ধ করা হবে: নতুন কেউ যোগ দিতে পারবেন না, আগের তথ্য থাকবে।', 'If nobody is in the group it is deleted completely and cannot be brought back. If someone has joined, it is not deleted but closed: nobody new can join, and the earlier data is kept.'),
    tr('হ্যাঁ, বাদ দিন', 'Yes, remove'), async () => {
      setBusy(true); setMsg(null);
      try {
        const r = await removeGroup(g.id);
        if (r === 'deleted' || r === 'closed') { onBack({ kind: 'ok', text: removeGroupText(r) }); return; }
        setMsg({ kind: 'info', text: removeGroupText(r) });
      } catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string }).code === 'soon' ? tr('দল বাদ দেওয়ার সুবিধা শীঘ্রই আসছে।', 'Removing groups is coming soon.') : errText(e) }); }
      setBusy(false);
    });
  const reopen = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await reopenGroup(g.id); setActive(true); setMsg({ kind: 'ok', text: tr('দলটি আবার চালু হয়েছে। হাজীরা কোড দিয়ে যোগ দিতে পারবেন।', 'The group is open again. Hajis can join with the code.') }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string }).code === 'soon' ? tr('এই সুবিধা শীঘ্রই আসছে।', 'This is coming soon.') : errText(e) }); }
    finally { setBusy(false); }
  };
  const remove = (m: Item<typeof groupMembers>) => confirm(tr(`${m.full_name}-কে দল থেকে সরাবেন?`, `Remove ${m.full_name} from the group?`), tr('তিনি আর আপনার দলের শর্ত দেখতে পাবেন না।', 'They will no longer see your group\'s terms.'), tr('হ্যাঁ, সরান', 'Yes, remove'), async () => {
    setBusy(true); setMsg(null);
    try { await removeMember(g.id, m.user_id); await load(); setMsg({ kind: 'ok', text: tr('সরানো হয়েছে।', 'Removed.') }); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  });

  const joined = (members || []).filter((m) => m.status === 'active');
  const nameOf = Object.fromEntries((members || []).map((m) => [m.user_id, m.full_name]));

  if (form) return <ContractForm g={g} onDone={(saved: boolean) => { setForm(false); if (saved) { setMsg({ kind: 'ok', text: tr('শর্ত সংরক্ষণ হয়েছে। দলের হাজীরা এখন পড়ে সম্মতি দিতে পারবেন।', 'Terms saved. Hajis in the group can now read and agree to them.') }); load(); } }} />;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => onBack()} style={st.back} accessibilityRole="button" accessibilityLabel={tr('লিডার প্যানেলে ফিরে যান', 'Back to the leader panel')}><Text style={st.backT}>{tr('‹ সব দল', '‹ All groups')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{g.name}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {!active ? (
        <Notice kind="warn" title={tr('এই দলটি বন্ধ', 'This group is closed')} text={tr('নতুন কেউ যোগ দিতে পারবেন না। আগের সদস্য ও তথ্য রাখা আছে।', 'Nobody new can join. Earlier members and data are kept.')}>
          <Button title={tr('দলটি আবার চালু করুন', 'Open the group again')} icon="🔓" kind="secondary" onPress={reopen} loading={busy} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}

      <View style={st.card}>
        <Text style={st.lbl}>{tr('দলে যোগ দেওয়ার কোড', 'Code to join the group')}</Text>
        <Text style={{ fontSize: 34, fontWeight: '800', color: C.primary, letterSpacing: 4, marginVertical: S.xs }} selectable accessibilityLabel={`${tr('কোড', 'Code')} ${g.join_code.split('').join(' ')}`}>{g.join_code}</Text>
        <Text style={st.small}>{tr('হাজীরা অ্যাপের "আমার দল" পাতায় এই কোড লিখে যোগ দেবেন।', 'Hajis join by typing this code on the app\'s "My group" page.')}</Text>
        {active ? <Button title={tr('কোডটি পাঠান (হোয়াটসঅ্যাপ/এসএমএস)', 'Send the code (WhatsApp/SMS)')} icon="📤" kind="secondary" onPress={share} /> : <Text style={st.small}>{tr('দল বন্ধ থাকায় এই কোড এখন কাজ করবে না।', 'The group is closed, so this code does not work now.')}</Text>}
      </View>

      <View style={st.card}>
        <Text style={st.h}>{tr('💬 হাজীদের প্রশ্ন ও 🤝 খাদেম', '💬 Hajis\' questions and 🤝 khadems')}</Text>
        <Text style={st.small}>{tr('প্রতিটি হাজী আপনাকে ও খাদেমদের আলাদাভাবে প্রশ্ন বা পরামর্শ লিখতে পারেন; অন্য হাজীরা দেখেন না।', 'Each haji can write questions or suggestions to you and the khadems privately; other hajis do not see them.')}</Text>
        <Button title={tr('হাজীদের প্রশ্ন দেখুন', 'See hajis\' questions')} icon="💬" onPress={() => navigation.navigate('HelpInbox', { groupId: g.id })} style={{ marginTop: S.sm }} />
        <Button title={tr('খাদেম যোগ / সরান', 'Add / remove khadems')} icon="🤝" kind="secondary" onPress={() => navigation.navigate('GroupStaff', { groupId: g.id, groupName: g.name, tab: 'khadem' })} style={{ marginTop: S.sm }} />
        <Button title={tr('তৈরি উত্তর লিখুন', 'Write ready answers')} icon="📋" kind="secondary" onPress={() => navigation.navigate('GroupStaff', { groupId: g.id, groupName: g.name, tab: 'faq' })} style={{ marginTop: S.sm }} />
      </View>

      <AnnounceBox g={g} />

      <View style={st.card}>
        <Text style={st.h}>{tr('📱 মোবাইল নম্বরে আমন্ত্রণ', '📱 Invite by mobile number')}</Text>
        {active ? (
          <>
            <Field label={tr('হাজীর মোবাইল নম্বর', 'Haji\'s mobile number')} hint={tr('যেমন: 01712345678', 'e.g. 01712345678')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={14} />
            <Button title={tr('আমন্ত্রণ পাঠান', 'Send invitation')} icon="📩" onPress={invite} loading={busy} />
          </>
        ) : <Text style={st.small}>{tr('দল বন্ধ থাকায় নতুন আমন্ত্রণ পাঠানো যাবে না।', 'The group is closed, so no new invitations can be sent.')}</Text>}
        {sent.length ? (
          <>
            <Text style={[st.lbl, { marginTop: S.md }]}>{tr('পাঠানো আমন্ত্রণ (গোপনীয়তার জন্য নম্বরের কিছু অংশ লুকানো)', 'Invitations sent (part of the number hidden for privacy)')}</Text>
            {sent.map((x) => (
              <View key={x.id} style={{ borderTopWidth: 1, borderColor: C.line, paddingVertical: S.xs }}>
                <Text style={st.p}>📩 {x.hint} · {x.joined ? tr('✅ দলে যোগ দিয়েছেন', '✅ Joined the group') : tr('⏳ উত্তরের অপেক্ষায়', '⏳ Waiting for an answer')}</Text>
                {!x.joined ? <Button title={tr('বাতিল করুন', 'Cancel')} kind="secondary" onPress={() => cancelSent(x)} disabled={busy} style={{ marginTop: S.xs }} /> : null}
              </View>
            ))}
          </>
        ) : null}
      </View>

      <View style={st.card}>
        <Text style={st.h}>{tr(`👥 সদস্য: ${toBn(joined.length)} জন`, `👥 Members: ${joined.length}`)}</Text>
        {members === null ? <ActivityIndicator color={C.primary} /> : null}
        {members && members.length === 0 ? <Text style={st.p}>{tr('এখনো কেউ যোগ দেননি।', 'Nobody has joined yet.')}</Text> : null}
        {(members || []).map((m) => <MemberRow key={m.user_id} m={m} onRemove={() => remove(m)} busy={busy} />)}
      </View>

      <Notice kind="info" title={tr('চুক্তি এখন প্রতিটি হাজীর সাথে আলাদা', 'Contracts are now separate with each haji')} text={tr('লিডার প্যানেলের "চুক্তি" অংশ থেকে হাজীর আইডিতে চুক্তির অনুরোধ পাঠান।', 'Send a contract request to the Haji ID from the "Contracts" part of the leader panel.')} />
      {active ? (
        <View style={[st.card, { borderWidth: 1, borderColor: C.bad }]}>
          <Text style={st.h}>{tr('🗑️ ভুল করে দল খুলেছেন?', '🗑️ Made a group by mistake?')}</Text>
          <Text style={st.small}>{tr('কেউ যোগ না দিয়ে থাকলে দলটি পুরো মুছে যাবে। কেউ যোগ দিয়ে থাকলে বা আমন্ত্রণ পেয়ে থাকলে দলটি বন্ধ হবে, রেকর্ড থাকবে।', 'If nobody has joined, the group is deleted completely. If someone has joined or been invited, the group is closed and the record is kept.')}</Text>
          <Button title={tr('দল বাদ দিন', 'Remove group')} icon="🗑️" kind="danger" onPress={removeIt} loading={busy} style={{ marginTop: S.sm }} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function MemberRow({ m, onRemove, busy }: { m: Item<typeof groupMembers>; onRemove: () => void; busy: boolean }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; signedAvatarUrl(m.avatar_path).then((u) => { if (on) setUrl(u); }); return () => { on = false; }; }, [m.avatar_path]);
  const isActive = m.status === 'active' || m.status === 'invited';
  return (
    <View style={[st.cRow, { paddingVertical: S.sm }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {url ? <Image source={{ uri: url }} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.line }} accessibilityLabel={tr(`${m.full_name}-এর ছবি`, `Photo of ${m.full_name}`)} />
          : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 30 }}>👤</Text></View>}
        <View style={{ flex: 1, marginLeft: S.sm }}>
          <Text style={st.val}>{m.full_name}</Text>
          <Text style={st.small}>{tr('আইডি', 'ID')}: {m.haji_code} · {toBn(m.phone)}</Text>
          <Text style={st.small}>{STATUS[m.status] || m.status}</Text>
          {m.phone_verified === true ? <Text style={st.small}>{tr('✔️ অ্যাকাউন্ট যাচাই করা (মোবাইল বা ইমেইলের কোডে)', '✔️ Account verified (by mobile or email code)')}</Text> : null}
          {m.phone_verified === false ? <Text style={st.small}>{tr('⚠️ অ্যাকাউন্ট এখনো যাচাই হয়নি, ফোন করে নিশ্চিত হোন', '⚠️ Account not verified yet; call to make sure')}</Text> : null}
        </View>
      </View>
      {m.status === 'active' ? <Button title={tr(`ফোন করুন (${toBn(m.phone)})`, `Call (${m.phone})`)} icon="📞" kind="secondary" onPress={() => call(m.phone)} style={{ marginTop: S.sm }} /> : null}
      {isActive ? (
        <Pressable onPress={onRemove} disabled={busy} style={st.leave} accessibilityRole="button" accessibilityLabel={tr(`${m.full_name}-কে দল থেকে সরান`, `Remove ${m.full_name} from the group`)}><Text style={st.leaveT}>{tr('দল থেকে সরান', 'Remove from group')}</Text></Pressable>
      ) : null}
    </View>
  );
}

function ContractForm({ g, onDone }: { g: LeaderGroup; onDone: (saved: boolean) => void }): JSX.Element {
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
    if (f.title.trim().length < 2) e.title = tr('প্যাকেজের নাম লিখুন।', 'Write the package name.');
    if (!f.price.trim() || !Number.isFinite(price) || price < 0 || price >= 1e8) e.price = tr('মোট দাম শুধু সংখ্যায় লিখুন (যেমন: 650000)।', 'Write the total price in numbers only (e.g. 650000).');
    if (f.includes.trim().length < 2) e.includes = tr('প্যাকেজে কী কী আছে লিখুন।', 'Write what the package includes.');
    if (f.refund.trim().length < 2) e.refund = tr('বাতিল করলে টাকা কীভাবে ফেরত হবে লিখুন।', 'Write how money is refunded if cancelled.');
    if (from === null) e.from = tr('তারিখ এভাবে লিখুন: ২০-০৫-২০২৭', 'Write the date like this: 20-05-2027');
    if (to === null) e.to = tr('তারিখ এভাবে লিখুন: ১০-০৬-২০২৭', 'Write the date like this: 10-06-2027');
    if (from && to && to < from) e.to = tr('ফেরার তারিখ যাওয়ার তারিখের পরে হতে হবে।', 'The return date must be after the departure date.');
    setErr(e); setFail('');
    if (Object.keys(e).length) return;
    confirm(tr('শর্তটি সংরক্ষণ করবেন?', 'Save the terms?'), tr('সংরক্ষণের পর আর বদলানো বা মোছা যাবে না। দাম ও শর্ত আরেকবার মিলিয়ে নিন।', 'After saving they cannot be changed or deleted. Check the price and terms once more.'), tr('হ্যাঁ, সংরক্ষণ করুন', 'Yes, save'), async () => {
      setBusy(true);
      try {
        await createContract({ group_id: g.id, title: f.title.trim(), price_bdt: price, includes: f.includes.trim(), excludes: f.excludes.trim() || null, travel_from: from || null, travel_to: to || null, refund_policy: f.refund.trim() });
        onDone(true);
      } catch (x) { setFail(errText(x)); setBusy(false); }   // the form keeps everything typed
    });
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => onDone(false)} style={st.back} accessibilityRole="button" accessibilityLabel={tr('শর্ত না লিখে ফিরে যান', 'Go back without writing terms')}><Text style={st.backT}>{tr('‹ ফিরে যান', '‹ Back')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('✍️ নতুন প্যাকেজের শর্ত', '✍️ Terms for a new package')}</Text>
      <Text style={st.small}>{tr('দল', 'Group')}: {g.name}</Text>
      {fail ? <Notice kind="bad" title={fail} /> : null}
      <Field label={tr('প্যাকেজের নাম', 'Package name')} hint={tr('যেমন: হজ প্যাকেজ ২০২৭ (সাধারণ)', 'e.g. Hajj package 2027 (standard)')} value={f.title} onChangeText={set('title')} maxLength={120} error={err.title} />
      <Field label={tr('জনপ্রতি মোট দাম (টাকা)', 'Total price per person (Tk)')} hint={tr('যেমন: 650000', 'e.g. 650000')} value={f.price} onChangeText={set('price')} keyboardType="numeric" maxLength={12} error={err.price} />
      <Field label={tr('প্যাকেজে যা আছে', 'What the package includes')} hint={tr('বিমান টিকেট, ভিসা, হোটেল (হারাম থেকে কত দূরে), খাবার, যাতায়াত, কুরবানি...', 'Air ticket, visa, hotel (how far from the Haram), food, transport, sacrifice...')} value={f.includes} onChangeText={set('includes')} multiline maxLength={3000} error={err.includes} />
      <Field label={tr('যা নেই (ইচ্ছা করলে)', 'Not included (optional)')} hint={tr('যেমন: কুরবানির টাকা, ব্যক্তিগত খরচ', 'e.g. sacrifice money, personal costs')} value={f.excludes} onChangeText={set('excludes')} multiline maxLength={3000} />
      <Field label={tr('যাওয়ার তারিখ (ইচ্ছা করলে)', 'Departure date (optional)')} hint={tr('দিন-মাস-বছর, যেমন: ২০-০৫-২০২৭', 'day-month-year, e.g. 20-05-2027')} value={f.from} onChangeText={set('from')} maxLength={10} error={err.from} />
      <Field label={tr('ফেরার তারিখ (ইচ্ছা করলে)', 'Return date (optional)')} hint={tr('দিন-মাস-বছর, যেমন: ১০-০৬-২০২৭', 'day-month-year, e.g. 10-06-2027')} value={f.to} onChangeText={set('to')} maxLength={10} error={err.to} />
      <Field label={tr('বাতিল ও টাকা ফেরতের নিয়ম', 'Cancellation and refund rules')} hint={tr('যেমন: ভিসার আগে বাতিল করলে কত টাকা ফেরত, ভিসার পরে কত', 'e.g. how much is refunded if cancelled before the visa, and after')} value={f.refund} onChangeText={set('refund')} multiline maxLength={3000} error={err.refund} />
      <Button title={tr('শর্ত সংরক্ষণ করুন', 'Save terms')} icon="💾" onPress={save} loading={busy} />
    </ScrollView>
  );
}
