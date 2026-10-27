import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Alert, ActivityIndicator, BackHandler, Platform } from 'react-native';
import ScrollView from '../components/KbScroll';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { toBn } from '../lib/phone';
import { myProfile, myGroups, joinGroup, respondInvite, leaveGroup, groupContracts, myAcceptances, acceptContract, notReady, telBd, groupAnnouncements } from '../lib/groups';

const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
export const fmtDay = (iso) => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${toBn(d.getDate())} ${MONTHS[d.getMonth()]} ${toBn(d.getFullYear())}`; };
export const fmtWhen = (iso) => {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours(); const part = h < 4 ? 'রাত' : h < 6 ? 'ভোর' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকেল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
  return `${fmtDay(iso)}, ${part} ${toBn(`${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`)}`;
};
export const fmtTaka = (n) => `${toBn(Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }))} টাকা`;
export const errText = (e) => {
  const m = String((e && e.message) || '').toLowerCase();
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) return 'ইন্টারনেট সংযোগ নেই বা দুর্বল। সংযোগ দেখে আবার চেষ্টা করুন।';
  return 'কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।';
};
export const confirm = (title, text, yes, onYes) => {
  if (Platform.OS === 'web') { if (global.confirm && global.confirm(title)) onYes(); return; }   // web preview (tests) only
  Alert.alert(title, text, [{ text: 'না', style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);
};
const call = (n) => Linking.openURL(`tel:${telBd(n)}`).catch(() => {});

// Haji side: my group(s), the leader, invitations, joining with a code, and the package terms to agree to.
export default function GroupScreen({ navigation }) {
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState(null);
  const [app, setApp] = useState(null);
  const [state, setState] = useState('load');      // load | ok | soon | err
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(null);           // group shown with its terms
  const [ann, setAnn] = useState(null);             // { rows, offline } leader announcements

  const load = useCallback(async () => {
    try {
      const [p, g] = await Promise.all([myProfile(), myGroups()]);
      setMe(p); setRows(g);
      const ids = g.filter((x) => x.status === 'active').map((x) => x.group_id);
      groupAnnouncements(ids).then(setAnn).catch(() => setAnn(null));
      setState('ok');
    } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(null); return true; });
    return () => sub.remove();
  }, [open]);

  const run = async (fn, okText) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const r = await fn(); if (okText) { const t = okText(r); setMsg(typeof t === 'string' ? { kind: 'ok', text: t } : t); } await load(); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };
  const join = () => {
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 8) { setMsg({ kind: 'bad', text: 'কোডটি ৮ অক্ষরের। লিডারের দেওয়া কোড ঠিকমতো লিখুন।' }); return; }
    run(() => joinGroup(c), (r) => (r === 'ok' ? (setCode(''), 'দলে যোগ দেওয়া হয়েছে।') : r === 'removed' ? { kind: 'warn', text: 'লিডার আপনাকে এই দল থেকে সরিয়ে দিয়েছেন। লিডারের সাথে কথা বলুন।' } : r === 'own_group' ? { kind: 'info', text: 'এটা আপনার নিজের দল।' } : { kind: 'bad', text: 'এই কোডে কোনো দল পাওয়া যায়নি। আবার দেখে লিখুন।' }));
  };

  if (open) return <GroupTerms group={open} onBack={() => { setOpen(null); load(); }} />;

  const invites = (rows || []).filter((r) => r.status === 'invited');
  const active = (rows || []).filter((r) => r.status === 'active');

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান"><Text style={st.backT}>‹ হোম</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">👥 আমার দল ও লিডার</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} style={{ marginTop: S.lg }} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" text="দল ও লিডারের সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে। চালু হলে এখানেই দেখা যাবে।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}

      {state === 'ok' ? (
        <>
          {me && me.role === 'leader' ? <Button title="লিডার প্যানেল খুলুন" icon="🧭" kind="gold" onPress={() => navigation.navigate('Leader')} style={{ marginBottom: S.md }} /> : null}
          {me && me.role === 'admin' ? <Button title="অ্যাডমিন: লিডার আবেদন" icon="🛡️" kind="gold" onPress={() => navigation.navigate('Admin')} style={{ marginBottom: S.md }} /> : null}

          {invites.map((g) => (
            <View key={g.group_id} style={[st.card, st.invite]}>
              <Text style={st.h}>📩 দলে যোগ দেওয়ার আমন্ত্রণ</Text>
              <Text style={st.p}>{g.leader_name} আপনাকে "{g.group_name}" দলে আমন্ত্রণ জানিয়েছেন।{g.agency_name ? ` এজেন্সি: ${g.agency_name}।` : ''}</Text>
              <Text style={st.small}>🔒 দলে যোগ দিলে লিডার আপনার নাম, আইডি ও ছবি দেখতে পাবেন। চুক্তি চালু হলে মোবাইল নম্বরও দেখবেন।</Text>
              <Button title="রাজি, যোগ দিন" icon="✅" onPress={() => run(() => respondInvite(g.group_id, true), () => 'দলে যোগ দেওয়া হয়েছে।')} loading={busy} style={{ marginTop: S.sm }} />
              <Button title="না, যোগ দেব না" kind="secondary" onPress={() => confirm('আমন্ত্রণ বাতিল করবেন?', '', 'হ্যাঁ, বাতিল', () => run(() => respondInvite(g.group_id, false), () => 'আমন্ত্রণ বাতিল করা হয়েছে।'))} disabled={busy} style={{ marginTop: S.sm }} />
            </View>
          ))}

          {me && me.verified === false ? (
            <Notice kind="info" title="আপনার অ্যাকাউন্ট যাচাই করুন" text="মোবাইল নম্বর বা ইমেইলে আসা কোড দিয়ে যাচাই করলে লিডার আপনার নম্বর দিয়ে আপনাকে দলে আমন্ত্রণ জানাতে পারবেন।">
              <Button title="অ্যাকাউন্ট যাচাই করুন" icon="✅" kind="secondary" onPress={() => navigation.navigate('VerifyPhone')} style={{ marginTop: S.sm }} />
            </Notice>
          ) : null}
          {active.length === 0 && invites.length === 0 ? (
            <Notice kind="info" title="আপনি এখনো কোনো দলে নেই" text="আপনার গ্রুপ লিডারের কাছ থেকে ৮ অক্ষরের কোড নিয়ে নিচে লিখুন। অথবা লিডারকে আপনার মোবাইল নম্বর দিন, তিনি আমন্ত্রণ পাঠাবেন।" />
          ) : null}

          {active.map((g) => (
            <View key={g.group_id} style={st.card}>
              <Text style={st.gName}>{g.group_name}</Text>
              {g.season ? <Text style={st.small}>{g.season}</Text> : null}
              <View style={st.leader}>
                <Text style={st.lbl}>গ্রুপ লিডার {g.agency_name ? `· ${g.agency_name}` : ''}</Text>
                <Text style={st.val}>✔️ {g.leader_name}</Text>
                <Text style={st.small}>অ্যাপের অ্যাডমিন যাচাই করে লিডার হিসেবে অনুমোদন দিয়েছেন।</Text>
              </View>
              <Announcements rows={ann ? ann.rows.filter((a) => a.group_id === g.group_id) : null} offline={ann && ann.offline} />
              <Button title="লিডার ও খাদেমকে প্রশ্ন করুন" icon="💬" kind="gold" onPress={() => navigation.navigate('HelpChat', { groupId: g.group_id })} a11yHint="সমস্যা বা পরামর্শ লিখুন; শুধু লিডার ও খাদেম দেখবেন" style={{ marginBottom: S.sm }} />
              {g.leader_phone ? <Button title={`লিডারকে ফোন করুন (${toBn(g.leader_phone)})`} icon="📞" onPress={() => call(g.leader_phone)} />
                : <Text style={st.small}>🔒 লিডারের সাথে চুক্তি চালু হলে এখানে তাঁর ফোন নম্বর দেখাবে। তার আগে যোগাযোগ Travel Adda হেল্পলাইনের মাধ্যমে।</Text>}
              <Pressable onPress={() => confirm('এই দল ছেড়ে দেবেন?', 'আবার যোগ দিতে লিডারের কোড লাগবে।', 'হ্যাঁ, ছেড়ে দিন', () => run(() => leaveGroup(g.group_id), () => 'দল ছেড়ে দেওয়া হয়েছে।'))}
                style={st.leave} accessibilityRole="button" accessibilityLabel="দল ছেড়ে দিন"><Text style={st.leaveT}>দল ছেড়ে দিন</Text></Pressable>
            </View>
          ))}

          <View style={st.card}>
            <Text style={st.h}>🔑 কোড দিয়ে দলে যোগ দিন</Text>
            <Field label="লিডারের দেওয়া কোড" hint="যেমন: AB12CD34" value={code} onChangeText={(v) => setCode(v.toUpperCase())} maxLength={12} autoCapitalize="characters" autoCorrect={false} />
            <Text style={st.small}>🔒 দলে যোগ দিলে লিডার আপনার নাম, আইডি ও ছবি দেখতে পাবেন। চুক্তি চালু হলে মোবাইল নম্বরও দেখবেন।</Text>
            <Button title="দলে যোগ দিন" icon="➕" onPress={join} loading={busy} />
          </View>

        </>
      ) : null}
    </ScrollView>
  );
}

function Announcements({ rows, offline }) {
  const [all, setAll] = useState(false);
  if (!rows || rows.length === 0) return null;
  const list = all ? rows : rows.slice(0, 3);
  return (
    <View style={st.ann}>
      <Text style={st.h}>📢 লিডারের ঘোষণা</Text>
      {offline ? <Text style={st.small}>ইন্টারনেট নেই, ফোনে রাখা শেষ ঘোষণাগুলো দেখানো হচ্ছে।</Text> : null}
      {list.map((a, i) => (
        <View key={a.id} style={[st.annRow, i === 0 && { borderTopWidth: 0 }]} accessible accessibilityLabel={`ঘোষণা, ${fmtWhen(a.created_at)}: ${a.body}`}>
          <Text style={st.small}>{i === 0 ? '🆕 ' : ''}{fmtWhen(a.created_at)}</Text>
          <Text style={st.p} selectable>{a.body}</Text>
        </View>
      ))}
      {rows.length > 3 ? (
        <Pressable onPress={() => setAll((x) => !x)} style={st.leave} accessibilityRole="button">
          <Text style={[st.leaveT, { color: C.primary }]}>{all ? 'কম দেখান' : `সব ঘোষণা দেখুন (${toBn(rows.length)}টি)`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function GroupTerms({ group, onBack }) {
  const [rows, setRows] = useState(null);
  const [acc, setAcc] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setErr('');
    try { const [c, a] = await Promise.all([groupContracts(group.group_id), myAcceptances()]); setRows(c); setAcc(a); }
    catch (e) { setErr(errText(e)); setRows((x) => x || []); }
  }, [group]);
  useEffect(() => { load(); }, [load]);
  const agree = (c) => confirm('এই শর্তে সম্মতি দেবেন?', 'সম্মতি দেওয়ার পর আর ফেরানো যাবে না। আগে পুরোটা পড়ে নিন।', 'হ্যাঁ, আমি সম্মত', async () => {
    setBusy(true); setErr('');
    try { await acceptContract(c.id); await load(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  });
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={onBack} style={st.back} accessibilityRole="button" accessibilityLabel="দলের পাতায় ফিরে যান"><Text style={st.backT}>‹ আমার দল</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">📜 প্যাকেজের শর্ত</Text>
      <Text style={st.small}>{group.group_name} · লিডার: {group.leader_name}</Text>
      {err ? <Notice kind="bad" title={err} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && rows.length === 0 && !err ? <Notice kind="info" title="এখনো কোনো শর্ত দেওয়া হয়নি" text="লিডার প্যাকেজের শর্ত লিখলে এখানে দেখা যাবে।" /> : null}
      {(rows || []).map((c) => <ContractCard key={c.id} c={c} acceptedAt={acc[c.id]} onAgree={() => agree(c)} busy={busy} />)}
      <Notice kind="info" title="জেনে রাখুন" text="শর্ত একবার লেখার পর লিডারও আর বদলাতে পারেন না। নতুন শর্ত দিলে আলাদা করে দেখাবে। টাকা শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে দিন, লিডারকে সরাসরি নয়।" />
    </ScrollView>
  );
}

export function ContractCard({ c, acceptedAt, onAgree, busy, footer }) {
  const Row = ({ l, v }) => (v ? <View style={st.cRow}><Text style={st.lbl}>{l}</Text><Text style={st.p}>{v}</Text></View> : null);
  return (
    <View style={st.card}>
      <Text style={st.gName}>{c.title}</Text>
      <Text style={st.small}>লিখেছেন লিডার, {fmtDay(c.created_at)}</Text>
      <Row l="মোট দাম" v={fmtTaka(c.price_bdt)} />
      <Row l="যা অন্তর্ভুক্ত" v={c.includes} />
      <Row l="যা অন্তর্ভুক্ত নয়" v={c.excludes} />
      <Row l="যাত্রার সময়" v={c.travel_from ? `${fmtDay(c.travel_from)}${c.travel_to ? ` থেকে ${fmtDay(c.travel_to)}` : ''}` : ''} />
      <Row l="বাতিল ও টাকা ফেরতের নিয়ম" v={c.refund_policy} />
      {onAgree ? (acceptedAt
        ? <Notice kind="ok" title={`আপনি সম্মতি দিয়েছেন: ${fmtDay(acceptedAt)}`} />
        : <Button title="আমি পড়েছি ও সম্মত" icon="✍️" onPress={onAgree} loading={busy} style={{ marginTop: S.sm }} />) : null}
      {footer}
    </View>
  );
}

export const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 36, marginBottom: S.sm },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: S.md, marginBottom: S.md, ...shadow },
  invite: { borderWidth: 2, borderColor: C.accent, backgroundColor: C.accentSoft },
  h: { fontSize: F.large, fontWeight: '700', color: C.text, marginBottom: S.xs, lineHeight: 30 },
  gName: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 34 },
  p: { fontSize: F.body, color: C.text, lineHeight: 28 },
  small: { fontSize: F.small, color: C.muted, lineHeight: 22, marginBottom: S.xs },
  leader: { backgroundColor: C.okSoft, borderRadius: R.md, padding: S.sm, marginVertical: S.sm },
  lbl: { fontSize: F.small, color: C.muted },
  val: { fontSize: F.large, fontWeight: '700', color: C.text },
  leave: { minHeight: TOUCH, justifyContent: 'center', alignSelf: 'center', marginTop: S.xs },
  leaveT: { fontSize: F.small, color: C.bad, fontWeight: '700', textDecorationLine: 'underline' },
  ann: { backgroundColor: C.goldSoft, borderRadius: R.md, padding: S.sm, marginBottom: S.sm, borderWidth: 1, borderColor: C.gold },
  annRow: { borderTopWidth: 1, borderColor: C.line, paddingTop: S.xs, marginTop: S.xs },
  cRow: { borderTopWidth: 1, borderColor: C.line, paddingTop: S.xs, marginTop: S.xs },
});
