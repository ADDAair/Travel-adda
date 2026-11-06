import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { areaText } from '../components/WorkAreaFields';
import { LEADER_KINDS } from '../lib/leaderKinds';
import { View, Text, Pressable, Image, ActivityIndicator, Linking } from 'react-native';
import { tr } from '../lib/lang';
import ScrollView from '../components/KbScroll';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import DistrictPicker from '../components/DistrictPicker';
import { starText, ReportBlock } from '../components/market';
import { toBn } from '../lib/phone';
import { notReady } from '../lib/groups';
import { signedAvatarUrl } from '../lib/avatar';
import { getHelpline } from '../lib/offers';
import { listLeaders, leaderPublic, leaderReviews, myLeaderCallRequest, requestLeaderCall } from '../lib/market';
import { st, confirm, errText, fmtDay } from './GroupScreen';
import type { Msg, Nav, Route } from './navTypes';
import type { Res } from '../lib/types';
import type { Helpline } from '../lib/offers';

export function Avatar({ path, size = 64, name }: { path?: string | null; size?: number; name?: string }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; if (path) signedAvatarUrl(path).then((u) => on && setUrl(u)); return () => { on = false; }; }, [path]);
  return url ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.line }} accessibilityLabel={tr(`${name}-এর ছবি`, `Photo of ${name}`)} />
    : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: size / 2 }}>👤</Text></View>;
}

// Directory of approved leaders: photo, agency, area, licences, rating and verified complaints. No phone numbers.
export default function LeadersScreen({ navigation, route }: { navigation: Nav; route?: Route<{ id?: string }> }): JSX.Element {
  const [district, setDistrict] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Res<typeof listLeaders> | null>(null);
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');
  const [open, setOpen] = useState<string | null>(route?.params?.id || null);

  const load = useCallback(async () => {
    try { setRows(await listLeaders(district, q)); setState('ok'); }
    catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, [district, q]);
  useEffect(() => { const t = setTimeout(load, 350); return () => clearTimeout(t); }, [load]);

  if (open) return <LeaderProfile id={open} onBack={() => { setOpen(null); load(); }} navigation={navigation} />;
  const onlyMine = rows && rows.length && rows[0].only_mine;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('MyLeader')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('লিডার ও চুক্তি পাতায় ফিরে যান', 'Back to the Leader and contract page')}><Text style={st.backT}>{tr('‹ লিডার ও চুক্তি', '‹ Leader and contract')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('🔎 যাচাই করা লিডার', '🔎 Verified leaders')}</Text>
      <Text style={[st.small, { marginBottom: S.sm }]}>{tr('সব লিডারের লাইসেন্স অ্যাডমিন যাচাই করেছেন। বেশি রেটিং আগে দেখানো হচ্ছে। লিডারের ফোন নম্বর দেখানো হয় না; কথা বলতে চাইলে Travel Adda হেল্পলাইন ব্যবস্থা করে দেবে।', 'The admin has checked every leader\'s licence. Higher ratings are shown first. Leaders\' phone numbers are not shown; to talk to one, the Travel Adda helpline will arrange it.')}</Text>
      {onlyMine ? <Notice kind="info" title={tr('রেফারেল কোডের কারণে শুধু আপনার লিডারকে দেখানো হচ্ছে', 'Only your leader is shown because of your referral code')} text={tr('অন্য লিডার দেখতে "লিডার ও চুক্তি" পাতা থেকে রেফারেল বাতিলের অনুরোধ করুন।', 'To see other leaders, ask to cancel the referral on the "Leader and contract" page.')} /> : (
        <>
          <DistrictPicker label={tr('জেলা', 'District')} value={district} onChange={setDistrict} allowAll />
          <Field label={tr('নাম, এজেন্সি, উপজেলা, ইউনিয়ন বা আইডি দিয়ে খুঁজুন', 'Search by name, agency, upazila, union or ID')} hint={tr('যেমন: আল-হারামাইন', 'e.g. Al-Haramain')} value={q} onChangeText={setQ} />
        </>
      )}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই চালু হবে', 'Coming soon')} text={tr('লিডারের তালিকা চালু হওয়ার শেষ ধাপ বাকি আছে।', 'The last step to turn on the leader list is still to come.')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('তালিকা আনা যায়নি', 'Could not load the list')} text={tr('ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'Check the internet connection and try again.')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && rows && rows.length === 0 ? <Notice kind="info" title={tr('এই খোঁজে কোনো লিডার পাওয়া যায়নি', 'No leader found for this search')} text={tr('জেলা বা খোঁজার লেখা বদলে দেখুন।', 'Try another district or search text.')} /> : null}
      {state === 'ok' && rows ? rows.map((l) => (
        <Pressable key={l.id} onPress={() => setOpen(l.id)} style={({ pressed }) => [st.card, { flexDirection: 'row', gap: S.sm, alignItems: 'center' }, pressed && { opacity: 0.9 }]}
          accessibilityRole="button" accessibilityLabel={tr(`${l.full_name}, ${l.agency_name}, ${starText(l.rating_avg, l.rating_count)}। প্রোফাইল খুলুন`, `${l.full_name}, ${l.agency_name}, ${starText(l.rating_avg, l.rating_count)}. Open profile`)}>
          <Avatar path={l.avatar_path} name={l.full_name} />
          <View style={{ flex: 1 }}>
            <Text style={st.val}>{l.full_name}</Text>
            {l.leader_kind === 'travel_adda' ? <Text style={[st.small, { color: C.primary, fontWeight: '700' }]}>{LEADER_KINDS.travel_adda.badge}</Text> : null}
            <Text style={st.small}>{l.leader_kind === 'travel_adda' ? '' : `${l.agency_name} · `}{l.leader_code}{l.profession ? ` · ${l.profession}` : ''}</Text>
            <Text style={st.small}>📍 {areaText(l) || '—'}</Text>
            <Text style={st.small}>{starText(l.rating_avg, l.rating_count)}{l.complaints_verified ? tr(` · ⚠️ ${toBn(l.complaints_verified)}টি যাচাই করা অভিযোগ`, ` · ⚠️ ${l.complaints_verified} verified complaint${l.complaints_verified === 1 ? '' : 's'}`) : ''}</Text>
          </View>
          <Text style={{ fontSize: 24, color: C.primary }}>›</Text>
        </Pressable>
      )) : null}
    </ScrollView>
  );
}

function LeaderProfile({ id, onBack, navigation }: { id: string; onBack: () => void; navigation: Nav }): JSX.Element {
  const [l, setL] = useState<Res<typeof leaderPublic> | undefined>(undefined);
  const [reviews, setReviews] = useState<Res<typeof leaderReviews>>([]);
  const [help, setHelp] = useState<Helpline | null>(null);
  const [req, setReq] = useState<Res<typeof myLeaderCallRequest> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    try {
      const [p, r, q] = await Promise.all([leaderPublic(id), leaderReviews(id), myLeaderCallRequest(id).catch(() => null)]);
      setL(p); setReviews(r); setReq(q);
    } catch (e) { setL(null); setMsg({ kind: 'bad', text: errText(e) }); }
  }, [id]);
  useEffect(() => { load(); getHelpline().then(setHelp).catch(() => {}); }, [load]);

  const ask = () => confirm(tr('আপনাকে ফোন করার অনুরোধ পাঠাবেন?', 'Send a request to be called?'), tr(`আপনার নাম ও নম্বর শুধু Travel Adda টিম দেখবে। টিম আপনাকে ফোন করে ${l ? l.full_name : 'লিডার'}-এর সাথে কথা বলার বা দেখা করার ব্যবস্থা করবে।`, `Only the Travel Adda team sees your name and number. The team will call you and arrange a talk or meeting with ${l ? l.full_name : 'the leader'}.`), tr('হ্যাঁ, পাঠান', 'Yes, send'), async () => {
    setBusy(true); setMsg(null);
    try { await requestLeaderCall(id); setMsg({ kind: 'ok', text: tr('অনুরোধ পাঠানো হয়েছে। Travel Adda টিম আপনাকে ফোন করবে।', 'Request sent. The Travel Adda team will call you.') }); await load(); }
    catch (err) {
      const e = err as { code?: string } | null;
      setMsg({ kind: e?.code === '23505' ? 'info' : 'bad', text: e?.code === '23505' ? tr('এই লিডারের জন্য আপনার অনুরোধ আগেই পাঠানো আছে।', 'You have already sent a request for this leader.') : e?.code === '42501' ? tr('অনুরোধ পাঠানো যায়নি (হয়তো আপনার ১০টি অনুরোধ খোলা আছে)।', 'The request could not be sent (maybe you already have 10 open requests).') : errText(e) }); }
    finally { setBusy(false); }
  });

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={onBack} style={st.back} accessibilityRole="button" accessibilityLabel={tr('লিডারের তালিকায় ফিরে যান', 'Back to the leader list')}><Text style={st.backT}>{tr('‹ সব লিডার', '‹ All leaders')}</Text></Pressable>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {l === undefined ? <ActivityIndicator color={C.primary} /> : null}
      {l === null ? <Notice kind="info" title={tr('এই লিডারকে এখন দেখানো যাচ্ছে না', 'This leader cannot be shown now')} /> : null}
      {l ? (
        <>
          <View style={[st.card, { alignItems: 'center' }]}>
            <Avatar path={l.avatar_path} size={112} name={l.full_name} />
            <Text style={[st.gName, { textAlign: 'center', marginTop: S.sm }]}>{l.full_name}</Text>
            <Text style={st.small}>{tr('লিডার আইডি', 'Leader ID')}: {l.leader_code}</Text>
            <Text style={st.val}>{l.leader_kind === 'travel_adda' ? LEADER_KINDS.travel_adda.badge : `✔️ ${l.agency_name}`}</Text>
            {l.profession ? <Text style={st.p}>{tr('পেশা', 'Profession')}: {l.profession}</Text> : null}
            <Text style={st.p}>{starText(l.rating_avg, l.rating_count)}</Text>
            {l.complaints_verified ? <Text style={[st.p, { color: C.bad }]}>{tr(`⚠️ ${toBn(l.complaints_verified)}টি যাচাই করা অভিযোগ`, `⚠️ ${l.complaints_verified} verified complaint${l.complaints_verified === 1 ? '' : 's'}`)}</Text> : <Text style={st.small}>{tr('কোনো যাচাই করা অভিযোগ নেই', 'No verified complaints')}</Text>}
            <Button title={tr('এই লিডারের প্যাকেজ দেখুন', 'See this leader\'s packages')} icon="🎁" kind="secondary" onPress={() => navigation.navigate('Offers', { leader: l.leader_code })} style={{ marginTop: S.sm, alignSelf: 'stretch' }} />
          </View>
          <View style={st.card}>
            <View style={st.cRow}><Text style={st.lbl}>{tr('কাজের এলাকা', 'Work area')}</Text><Text style={st.p}>{areaText(l) || '—'}</Text></View>
            {l.umrah_license ? <View style={st.cRow}><Text style={st.lbl}>{tr('ওমরাহ লাইসেন্স', 'Umrah licence')}</Text><Text style={st.p}>{l.umrah_license}</Text></View> : null}
            {l.hajj_license ? <View style={st.cRow}><Text style={st.lbl}>{tr('হজ লাইসেন্স', 'Hajj licence')}</Text><Text style={st.p}>{l.hajj_license}</Text></View> : null}
            <View style={st.cRow}><Text style={st.lbl}>{tr('অ্যাপে আছেন', 'On the app')}</Text><Text style={st.p}>{tr(`${fmtDay(l.member_since)} থেকে`, `Since ${fmtDay(l.member_since)}`)}</Text></View>
            {l.bio ? <View style={st.cRow}><Text style={st.lbl}>{tr('লিডারের কথা', 'About the leader')}</Text><Text style={st.p}>{l.bio}</Text></View> : null}
          </View>
          <View style={st.card}>
            <Text style={st.h}>{tr('📞 কথা বলতে বা দেখা করতে চান?', '📞 Want to talk or meet?')}</Text>
            <Text style={st.small}>{tr('লিডারের নম্বর সরাসরি দেওয়া হয় না। Travel Adda টিম লিডারের সুবিধামতো সময়ে কথা বা দেখা করার ব্যবস্থা করবে। চুক্তি চালু হলে নম্বর দুপক্ষই পাবেন।', 'The leader\'s number is not given directly. The Travel Adda team will arrange a talk or meeting at a time that suits the leader. Once a contract is active, both sides get the numbers.')}</Text>
            {help && help.phone ? <Button title={tr('Travel Adda হেল্পলাইনে ফোন করুন', 'Call the Travel Adda helpline')} icon="📞" onPress={() => Linking.openURL(`tel:${help.phone}`).catch(() => {})} style={{ marginTop: S.sm }} /> : null}
            {help && help.phone ? <Text style={st.small}>{tr(`ফোনে বলুন: "লিডার আইডি ${l.leader_code}"`, `Say on the phone: "Leader ID ${l.leader_code}"`)}{help.hours ? tr(` · সময়: ${help.hours}`, ` · Hours: ${help.hours}`) : ''}</Text> : null}
            {req && req.status === 'new' ? <Notice kind="ok" title={tr('আপনার অনুরোধ পাঠানো আছে', 'Your request has been sent')} text={tr(`পাঠিয়েছেন: ${fmtDay(req.created_at)}। টিম আপনাকে ফোন করবে।`, `Sent: ${fmtDay(req.created_at)}. The team will call you.`)} />
              : <Button title={tr('আমাকে ফোন করুন', 'Call me')} icon="🙋" kind="secondary" onPress={ask} loading={busy} style={{ marginTop: S.sm }} />}
          </View>
          {reviews.length ? <Text style={[st.h, { marginTop: S.sm }]}>{tr('হাজীদের মন্তব্য ও যাচাই করা অভিযোগ', 'Hajis\' comments and verified complaints')}</Text> : null}
          {reviews.map((r, i: number) => (
            <View key={`${r.kind}${i}`} style={[st.card, r.kind === 'complaint' && { borderWidth: 2, borderColor: C.bad }]}>
              <Text style={st.small}>{r.kind === 'complaint' ? tr('⚠️ যাচাই করা অভিযোগ', '⚠️ Verified complaint') : tr(`${'⭐'.repeat(r.stars || 0)} রেটিং`, `${'⭐'.repeat(r.stars || 0)} rating`)} · {fmtDay(r.at)}</Text>
              <Text style={st.p}>{r.body}</Text>
            </View>
          ))}
          <Text style={st.small}>{tr('রেটিং ও অভিযোগ শুধু সেই হাজীরা দিতে পারেন, যাঁরা এই লিডারের সাথে অ্যাপে চুক্তি করেছেন। রেটিং গণনা হয় Travel Adda টাকা জমা যাচাই করার পরে। অভিযোগ দেখানো হয় অ্যাডমিন যাচাইয়ের পরে।', 'Only hajis who made a contract with this leader in the app can rate or complain. A rating counts after Travel Adda checks the payment. Complaints are shown after the admin checks them.')}</Text>
          <ReportBlock targetId={l.id} targetName={l.full_name} />
        </>
      ) : null}
    </ScrollView>
  );
}
