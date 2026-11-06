import React, { useCallback, useEffect, useState, type JSX, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Alert, ActivityIndicator, BackHandler, Platform } from 'react-native';
import ScrollView from '../components/KbScroll';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { tr, getLang, monthName, takaText } from '../lib/lang';
import { toBn } from '../lib/phone';
import { myProfile, myGroups, joinGroup, respondInvite, leaveGroup, groupContracts, myAcceptances, acceptContract, notReady, telBd, groupAnnouncements } from '../lib/groups';
import type { Msg, Nav } from './navTypes';
import type { Announcement, Profile } from '../lib/groups';
import type { Item, TableRow } from '../lib/types';

type MyGroup = Item<typeof myGroups>;
type Contract = TableRow<'contracts'>;

export const fmtDay = (iso: string | number | Date | null | undefined): string => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${toBn(d.getDate())} ${monthName(d.getMonth())} ${toBn(d.getFullYear())}`; };
export const fmtWhen = (iso: string | number | Date | null | undefined): string => {
  if (iso == null) return '';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours(); const hm = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (getLang() === 'en') return `${fmtDay(iso)}, ${hm} ${h < 12 ? 'AM' : 'PM'}`;
  const part = h < 4 ? 'রাত' : h < 6 ? 'ভোর' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকেল' : h < 20 ? 'সন্ধ্যা' : 'রাত';   // i18n-ok: Bengali only (English above)
  return `${fmtDay(iso)}, ${part} ${toBn(hm)}`;
};
export const fmtTaka = (n: unknown): string => takaText(n, 2);
export const errText = (e: unknown): string => {
  const m = String((e && (e as { message?: string }).message) || '').toLowerCase();
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) return tr('ইন্টারনেট সংযোগ নেই বা দুর্বল। সংযোগ দেখে আবার চেষ্টা করুন।', 'No internet or a weak connection. Check the connection and try again.');
  return tr('কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।', 'That did not work. Try again a little later.');
};
export const confirm = (title: string, text: string, yes: string, onYes: () => void): void => {
  const g = globalThis as unknown as { confirm?: (t: string) => boolean };
  if (Platform.OS === 'web') { if (g.confirm && g.confirm(title)) onYes(); return; }   // web preview (tests) only
  Alert.alert(title, text, [{ text: tr('না', 'No'), style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);
};
const call = (n: string) => Linking.openURL(`tel:${telBd(n)}`).catch(() => {});

// Haji side: my group(s), the leader, invitations, joining with a code, and the package terms to agree to.
export default function GroupScreen({ navigation }: { navigation: Nav }): JSX.Element {
  const [me, setMe] = useState<Profile | null>(null);
  const [rows, setRows] = useState<MyGroup[] | null>(null);
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [open, setOpen] = useState<MyGroup | null>(null);           // group shown with its terms
  const [ann, setAnn] = useState<{ rows: Announcement[]; offline: boolean } | null>(null);             // { rows, offline } leader announcements

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

  const run = async (fn: () => Promise<unknown>, okText?: (r: unknown) => string | Msg) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const r = await fn(); if (okText) { const t = okText(r); setMsg(typeof t === 'string' ? { kind: 'ok', text: t } : t); } await load(); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };
  const join = () => {
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 8) { setMsg({ kind: 'bad', text: tr('কোডটি ৮ অক্ষরের। লিডারের দেওয়া কোড ঠিকমতো লিখুন।', 'The code has 8 characters. Write the leader\'s code correctly.') }); return; }
    run(() => joinGroup(c), (r) => (r === 'ok' ? (setCode(''), tr('দলে যোগ দেওয়া হয়েছে।', 'You joined the group.')) : r === 'removed' ? { kind: 'warn', text: tr('লিডার আপনাকে এই দল থেকে সরিয়ে দিয়েছেন। লিডারের সাথে কথা বলুন।', 'The leader removed you from this group. Talk to the leader.') } : r === 'own_group' ? { kind: 'info', text: tr('এটা আপনার নিজের দল।', 'This is your own group.') } : { kind: 'bad', text: tr('এই কোডে কোনো দল পাওয়া যায়নি। আবার দেখে লিখুন।', 'No group was found with this code. Check and write it again.') }));
  };

  if (open) return <GroupTerms group={open} onBack={() => { setOpen(null); load(); }} />;

  const invites = (rows || []).filter((r) => r.status === 'invited');
  const active = (rows || []).filter((r) => r.status === 'active');

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('হোমে ফিরে যান', 'Back to Home')}><Text style={st.backT}>{tr('‹ হোম', '‹ Home')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('👥 আমার দল ও লিডার', '👥 My group and leader')}</Text>
      {state === 'load' ? <ActivityIndicator color={C.primary} style={{ marginTop: S.lg }} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই চালু হবে', 'Coming soon')} text={tr('দল ও লিডারের সুবিধা চালু হওয়ার শেষ ধাপ বাকি আছে। চালু হলে এখানেই দেখা যাবে।', 'The group and leader feature has one last step left. It will show here when ready.')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('তথ্য আনা যায়নি', 'Could not get the details')} text={tr('ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'Check the internet connection and try again.')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}

      {state === 'ok' ? (
        <>
          {me && me.role === 'leader' ? <Button title={tr('লিডার প্যানেল খুলুন', 'Open the leader panel')} icon="🧭" kind="gold" onPress={() => navigation.navigate('Leader')} style={{ marginBottom: S.md }} /> : null}
          {me && me.role === 'admin' ? <Button title={tr('অ্যাডমিন: লিডার আবেদন', 'Admin: leader applications')} icon="🛡️" kind="gold" onPress={() => navigation.navigate('Admin')} style={{ marginBottom: S.md }} /> : null}

          {invites.map((g) => (
            <View key={g.group_id} style={[st.card, st.invite]}>
              <Text style={st.h}>{tr('📩 দলে যোগ দেওয়ার আমন্ত্রণ', '📩 Invitation to join a group')}</Text>
              <Text style={st.p}>{tr(`${g.leader_name} আপনাকে "${g.group_name}" দলে আমন্ত্রণ জানিয়েছেন।`, `${g.leader_name} invited you to the group "${g.group_name}".`)}{g.agency_name ? tr(` এজেন্সি: ${g.agency_name}।`, ` Agency: ${g.agency_name}.`) : ''}</Text>
              <Text style={st.small}>{tr('🔒 দলে যোগ দিলে লিডার আপনার নাম, আইডি ও ছবি দেখতে পাবেন। চুক্তি চালু হলে মোবাইল নম্বরও দেখবেন।', '🔒 When you join, the leader sees your name, ID and photo. Once a contract is active, your mobile number too.')}</Text>
              <Button title={tr('রাজি, যোগ দিন', 'Yes, join')} icon="✅" onPress={() => run(() => respondInvite(g.group_id, true), () => tr('দলে যোগ দেওয়া হয়েছে।', 'You joined the group.'))} loading={busy} style={{ marginTop: S.sm }} />
              <Button title={tr('না, যোগ দেব না', 'No, do not join')} kind="secondary" onPress={() => confirm(tr('আমন্ত্রণ বাতিল করবেন?', 'Decline the invitation?'), '', tr('হ্যাঁ, বাতিল', 'Yes, decline'), () => run(() => respondInvite(g.group_id, false), () => tr('আমন্ত্রণ বাতিল করা হয়েছে।', 'Invitation declined.')))} disabled={busy} style={{ marginTop: S.sm }} />
            </View>
          ))}

          {me && me.verified === false ? (
            <Notice kind="info" title={tr('আপনার অ্যাকাউন্ট যাচাই করুন', 'Verify your account')} text={tr('মোবাইল নম্বর বা ইমেইলে আসা কোড দিয়ে যাচাই করলে লিডার আপনার নম্বর দিয়ে আপনাকে দলে আমন্ত্রণ জানাতে পারবেন।', 'Verify with a code on your mobile or email, and a leader can invite you to a group by your number.')}>
              <Button title={tr('অ্যাকাউন্ট যাচাই করুন', 'Verify the account')} icon="✅" kind="secondary" onPress={() => navigation.navigate('VerifyPhone')} style={{ marginTop: S.sm }} />
            </Notice>
          ) : null}
          {active.length === 0 && invites.length === 0 ? (
            <Notice kind="info" title={tr('আপনি এখনো কোনো দলে নেই', 'You are not in a group yet')} text={tr('আপনার গ্রুপ লিডারের কাছ থেকে ৮ অক্ষরের কোড নিয়ে নিচে লিখুন। অথবা লিডারকে আপনার মোবাইল নম্বর দিন, তিনি আমন্ত্রণ পাঠাবেন।', 'Get the 8-character code from your group leader and write it below. Or give the leader your mobile number and they will send an invitation.')} />
          ) : null}

          {active.map((g) => (
            <View key={g.group_id} style={st.card}>
              <Text style={st.gName}>{g.group_name}</Text>
              {g.season ? <Text style={st.small}>{g.season}</Text> : null}
              <View style={st.leader}>
                <Text style={st.lbl}>{tr('গ্রুপ লিডার', 'Group leader')} {g.agency_name ? `· ${g.agency_name}` : ''}</Text>
                <Text style={st.val}>✔️ {g.leader_name}</Text>
                <Text style={st.small}>{tr('অ্যাপের অ্যাডমিন যাচাই করে লিডার হিসেবে অনুমোদন দিয়েছেন।', 'The app admin has checked and approved this leader.')}</Text>
              </View>
              <Announcements rows={ann ? ann.rows.filter((a) => a.group_id === g.group_id) : null} offline={ann && ann.offline} />
              <Button title={tr('লিডার ও খাদেমকে প্রশ্ন করুন', 'Ask the leader and khadems')} icon="💬" kind="gold" onPress={() => navigation.navigate('HelpChat', { groupId: g.group_id })} a11yHint={tr('সমস্যা বা পরামর্শ লিখুন; শুধু লিডার ও খাদেম দেখবেন', 'Write a problem or question; only the leader and khadems see it')} style={{ marginBottom: S.sm }} />
              {g.leader_phone ? <Button title={tr(`লিডারকে ফোন করুন (${toBn(g.leader_phone)})`, `Call the leader (${g.leader_phone})`)} icon="📞" onPress={() => call(g.leader_phone)} />
                : <Text style={st.small}>{tr('🔒 লিডারের সাথে চুক্তি চালু হলে এখানে তাঁর ফোন নম্বর দেখাবে। তার আগে যোগাযোগ Travel Adda হেল্পলাইনের মাধ্যমে।', '🔒 The leader\'s phone number shows here once your contract is active. Until then, contact goes through the Travel Adda helpline.')}</Text>}
              <Pressable onPress={() => confirm(tr('এই দল ছেড়ে দেবেন?', 'Leave this group?'), tr('আবার যোগ দিতে লিডারের কোড লাগবে।', 'You will need the leader\'s code to join again.'), tr('হ্যাঁ, ছেড়ে দিন', 'Yes, leave'), () => run(() => leaveGroup(g.group_id), () => tr('দল ছেড়ে দেওয়া হয়েছে।', 'You left the group.')))}
                style={st.leave} accessibilityRole="button" accessibilityLabel={tr('দল ছেড়ে দিন', 'Leave the group')}><Text style={st.leaveT}>{tr('দল ছেড়ে দিন', 'Leave the group')}</Text></Pressable>
            </View>
          ))}

          <View style={st.card}>
            <Text style={st.h}>{tr('🔑 কোড দিয়ে দলে যোগ দিন', '🔑 Join a group with a code')}</Text>
            <Field label={tr('লিডারের দেওয়া কোড', 'Code from the leader')} hint={tr('যেমন: AB12CD34', 'e.g. AB12CD34')} value={code} onChangeText={(v: string) => setCode(v.toUpperCase())} maxLength={12} autoCapitalize="characters" autoCorrect={false} />
            <Text style={st.small}>{tr('🔒 দলে যোগ দিলে লিডার আপনার নাম, আইডি ও ছবি দেখতে পাবেন। চুক্তি চালু হলে মোবাইল নম্বরও দেখবেন।', '🔒 When you join, the leader sees your name, ID and photo. Once a contract is active, your mobile number too.')}</Text>
            <Button title={tr('দলে যোগ দিন', 'Join the group')} icon="➕" onPress={join} loading={busy} />
          </View>

        </>
      ) : null}
    </ScrollView>
  );
}

function Announcements({ rows, offline }: { rows: Announcement[] | null; offline?: boolean | null }): JSX.Element | null {
  const [all, setAll] = useState(false);
  if (!rows || rows.length === 0) return null;
  const list = all ? rows : rows.slice(0, 3);
  return (
    <View style={st.ann}>
      <Text style={st.h}>{tr('📢 লিডারের ঘোষণা', '📢 Leader\'s announcements')}</Text>
      {offline ? <Text style={st.small}>{tr('ইন্টারনেট নেই, ফোনে রাখা শেষ ঘোষণাগুলো দেখানো হচ্ছে।', 'No internet; showing the last announcements saved on the phone.')}</Text> : null}
      {list.map((a, i) => (
        <View key={a.id} style={[st.annRow, i === 0 && { borderTopWidth: 0 }]} accessible accessibilityLabel={tr(`ঘোষণা, ${fmtWhen(a.created_at)}: ${a.body}`, `Announcement, ${fmtWhen(a.created_at)}: ${a.body}`)}>
          <Text style={st.small}>{i === 0 ? '🆕 ' : ''}{fmtWhen(a.created_at)}</Text>
          <Text style={st.p} selectable>{a.body}</Text>
        </View>
      ))}
      {rows.length > 3 ? (
        <Pressable onPress={() => setAll((x) => !x)} style={st.leave} accessibilityRole="button">
          <Text style={[st.leaveT, { color: C.primary }]}>{all ? tr('কম দেখান', 'Show less') : tr(`সব ঘোষণা দেখুন (${toBn(rows.length)}টি)`, `See all announcements (${rows.length})`)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function GroupTerms({ group, onBack }: { group: MyGroup; onBack: () => void }): JSX.Element {
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [acc, setAcc] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setErr('');
    try { const [c, a] = await Promise.all([groupContracts(group.group_id), myAcceptances()]); setRows(c); setAcc(a); }
    catch (e) { setErr(errText(e)); setRows((x) => x || []); }
  }, [group]);
  useEffect(() => { load(); }, [load]);
  const agree = (c: Contract) => confirm(tr('এই শর্তে সম্মতি দেবেন?', 'Agree to these terms?'), tr('সম্মতি দেওয়ার পর আর ফেরানো যাবে না। আগে পুরোটা পড়ে নিন।', 'After agreeing it cannot be undone. Read it all first.'), tr('হ্যাঁ, আমি সম্মত', 'Yes, I agree'), async () => {
    setBusy(true); setErr('');
    try { await acceptContract(c.id); await load(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  });
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={onBack} style={st.back} accessibilityRole="button" accessibilityLabel={tr('দলের পাতায় ফিরে যান', 'Back to the group page')}><Text style={st.backT}>{tr('‹ আমার দল', '‹ My group')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('📜 প্যাকেজের শর্ত', '📜 Package terms')}</Text>
      <Text style={st.small}>{group.group_name} · {tr('লিডার', 'Leader')}: {group.leader_name}</Text>
      {err ? <Notice kind="bad" title={err} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && rows.length === 0 && !err ? <Notice kind="info" title={tr('এখনো কোনো শর্ত দেওয়া হয়নি', 'No terms given yet')} text={tr('লিডার প্যাকেজের শর্ত লিখলে এখানে দেখা যাবে।', 'When the leader writes the package terms, they will show here.')} /> : null}
      {(rows || []).map((c) => <ContractCard key={c.id} c={c} acceptedAt={acc[c.id]} onAgree={() => agree(c)} busy={busy} />)}
      <Notice kind="info" title={tr('জেনে রাখুন', 'Good to know')} text={tr('শর্ত একবার লেখার পর লিডারও আর বদলাতে পারেন না। নতুন শর্ত দিলে আলাদা করে দেখাবে। টাকা শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে দিন, লিডারকে সরাসরি নয়।', 'Once written, the terms cannot be changed even by the leader. New terms show separately. Pay only into Travel Adda\'s official account, never to the leader directly.')} />
    </ScrollView>
  );
}

export function ContractCard({ c, acceptedAt, onAgree, busy, footer }: { c: Contract; acceptedAt?: string | null; onAgree?: () => void; busy?: boolean; footer?: ReactNode }): JSX.Element {
  const Line = ({ l, v }: { l: string; v?: string | null }) => (v ? <View style={st.cRow}><Text style={st.lbl}>{l}</Text><Text style={st.p}>{v}</Text></View> : null);
  return (
    <View style={st.card}>
      <Text style={st.gName}>{c.title}</Text>
      <Text style={st.small}>{tr('লিখেছেন লিডার', 'Written by the leader')}, {fmtDay(c.created_at)}</Text>
      <Line l={tr('মোট দাম', 'Total price')} v={fmtTaka(c.price_bdt)} />
      <Line l={tr('যা অন্তর্ভুক্ত', 'Included')} v={c.includes} />
      <Line l={tr('যা অন্তর্ভুক্ত নয়', 'Not included')} v={c.excludes} />
      <Line l={tr('যাত্রার সময়', 'Travel time')} v={c.travel_from ? `${fmtDay(c.travel_from)}${c.travel_to ? tr(` থেকে ${fmtDay(c.travel_to)}`, ` to ${fmtDay(c.travel_to)}`) : ''}` : ''} />
      <Line l={tr('বাতিল ও টাকা ফেরতের নিয়ম', 'Cancellation and refund rules')} v={c.refund_policy} />
      {onAgree ? (acceptedAt
        ? <Notice kind="ok" title={tr(`আপনি সম্মতি দিয়েছেন: ${fmtDay(acceptedAt)}`, `You agreed on ${fmtDay(acceptedAt)}`)} />
        : <Button title={tr('আমি পড়েছি ও সম্মত', 'I have read and agree')} icon="✍️" onPress={onAgree} loading={busy} style={{ marginTop: S.sm }} />) : null}
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
