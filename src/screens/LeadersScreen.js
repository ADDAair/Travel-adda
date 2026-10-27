import React, { useCallback, useEffect, useState } from 'react';
import { areaText } from '../components/WorkAreaFields';
import { LEADER_KINDS } from '../lib/leaderKinds';
import { View, Text, Pressable, Image, ActivityIndicator, Linking } from 'react-native';
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

export function Avatar({ path, size = 64, name }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let on = true; if (path) signedAvatarUrl(path).then((u) => on && setUrl(u)); return () => { on = false; }; }, [path]);
  return url ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.line }} accessibilityLabel={`${name}-এর ছবি`} />
    : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: size / 2 }}>👤</Text></View>;
}

// Directory of approved leaders: photo, agency, area, licences, rating and verified complaints. No phone numbers.
export default function LeadersScreen({ navigation, route }) {
  const [district, setDistrict] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [state, setState] = useState('load');
  const [open, setOpen] = useState(route?.params?.id || null);

  const load = useCallback(async () => {
    try { setRows(await listLeaders(district, q)); setState('ok'); }
    catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, [district, q]);
  useEffect(() => { const t = setTimeout(load, 350); return () => clearTimeout(t); }, [load]);

  if (open) return <LeaderProfile id={open} onBack={() => { setOpen(null); load(); }} navigation={navigation} />;
  const onlyMine = rows && rows.length && rows[0].only_mine;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('MyLeader')} style={st.back} accessibilityRole="button" accessibilityLabel="লিডার ও চুক্তি পাতায় ফিরে যান"><Text style={st.backT}>‹ লিডার ও চুক্তি</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">🔎 যাচাই করা লিডার</Text>
      <Text style={[st.small, { marginBottom: S.sm }]}>সব লিডারের লাইসেন্স অ্যাডমিন যাচাই করেছেন। বেশি রেটিং আগে দেখানো হচ্ছে। লিডারের ফোন নম্বর দেখানো হয় না; কথা বলতে চাইলে Travel Adda হেল্পলাইন ব্যবস্থা করে দেবে।</Text>
      {onlyMine ? <Notice kind="info" title="রেফারেল কোডের কারণে শুধু আপনার লিডারকে দেখানো হচ্ছে" text='অন্য লিডার দেখতে "লিডার ও চুক্তি" পাতা থেকে রেফারেল বাতিলের অনুরোধ করুন।' /> : (
        <>
          <DistrictPicker label="জেলা" value={district} onChange={setDistrict} allowAll />
          <Field label="নাম, এজেন্সি, উপজেলা, ইউনিয়ন বা আইডি দিয়ে খুঁজুন" hint="যেমন: আল-হারামাইন" value={q} onChangeText={setQ} />
        </>
      )}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" text="লিডারের তালিকা চালু হওয়ার শেষ ধাপ বাকি আছে।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তালিকা আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && rows.length === 0 ? <Notice kind="info" title="এই খোঁজে কোনো লিডার পাওয়া যায়নি" text="জেলা বা খোঁজার লেখা বদলে দেখুন।" /> : null}
      {state === 'ok' ? rows.map((l) => (
        <Pressable key={l.id} onPress={() => setOpen(l.id)} style={({ pressed }) => [st.card, { flexDirection: 'row', gap: S.sm, alignItems: 'center' }, pressed && { opacity: 0.9 }]}
          accessibilityRole="button" accessibilityLabel={`${l.full_name}, ${l.agency_name}, ${starText(l.rating_avg, l.rating_count)}। প্রোফাইল খুলুন`}>
          <Avatar path={l.avatar_path} name={l.full_name} />
          <View style={{ flex: 1 }}>
            <Text style={st.val}>{l.full_name}</Text>
            {l.leader_kind === 'travel_adda' ? <Text style={[st.small, { color: C.primary, fontWeight: '700' }]}>{LEADER_KINDS.travel_adda.badge}</Text> : null}
            <Text style={st.small}>{l.leader_kind === 'travel_adda' ? '' : `${l.agency_name} · `}{l.leader_code}{l.profession ? ` · ${l.profession}` : ''}</Text>
            <Text style={st.small}>📍 {areaText(l) || '—'}</Text>
            <Text style={st.small}>{starText(l.rating_avg, l.rating_count)}{l.complaints_verified ? ` · ⚠️ ${toBn(l.complaints_verified)}টি যাচাই করা অভিযোগ` : ''}</Text>
          </View>
          <Text style={{ fontSize: 24, color: C.primary }}>›</Text>
        </Pressable>
      )) : null}
    </ScrollView>
  );
}

function LeaderProfile({ id, onBack, navigation }) {
  const [l, setL] = useState(undefined);
  const [reviews, setReviews] = useState([]);
  const [help, setHelp] = useState(null);
  const [req, setReq] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    try {
      const [p, r, q] = await Promise.all([leaderPublic(id), leaderReviews(id), myLeaderCallRequest(id).catch(() => null)]);
      setL(p); setReviews(r); setReq(q);
    } catch (e) { setL(null); setMsg({ kind: 'bad', text: errText(e) }); }
  }, [id]);
  useEffect(() => { load(); getHelpline().then(setHelp).catch(() => {}); }, [load]);

  const ask = () => confirm('আপনাকে ফোন করার অনুরোধ পাঠাবেন?', `আপনার নাম ও নম্বর শুধু Travel Adda টিম দেখবে। টিম আপনাকে ফোন করে ${l.full_name}-এর সাথে কথা বলার বা দেখা করার ব্যবস্থা করবে।`, 'হ্যাঁ, পাঠান', async () => {
    setBusy(true); setMsg(null);
    try { await requestLeaderCall(id); setMsg({ kind: 'ok', text: 'অনুরোধ পাঠানো হয়েছে। Travel Adda টিম আপনাকে ফোন করবে।' }); await load(); }
    catch (e) { setMsg({ kind: e?.code === '23505' ? 'info' : 'bad', text: e?.code === '23505' ? 'এই লিডারের জন্য আপনার অনুরোধ আগেই পাঠানো আছে।' : e?.code === '42501' ? 'অনুরোধ পাঠানো যায়নি (হয়তো আপনার ১০টি অনুরোধ খোলা আছে)।' : errText(e) }); }
    finally { setBusy(false); }
  });

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={onBack} style={st.back} accessibilityRole="button" accessibilityLabel="লিডারের তালিকায় ফিরে যান"><Text style={st.backT}>‹ সব লিডার</Text></Pressable>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {l === undefined ? <ActivityIndicator color={C.primary} /> : null}
      {l === null ? <Notice kind="info" title="এই লিডারকে এখন দেখানো যাচ্ছে না" /> : null}
      {l ? (
        <>
          <View style={[st.card, { alignItems: 'center' }]}>
            <Avatar path={l.avatar_path} size={112} name={l.full_name} />
            <Text style={[st.gName, { textAlign: 'center', marginTop: S.sm }]}>{l.full_name}</Text>
            <Text style={st.small}>লিডার আইডি: {l.leader_code}</Text>
            <Text style={st.val}>{l.leader_kind === 'travel_adda' ? LEADER_KINDS.travel_adda.badge : `✔️ ${l.agency_name}`}</Text>
            {l.profession ? <Text style={st.p}>পেশা: {l.profession}</Text> : null}
            <Text style={st.p}>{starText(l.rating_avg, l.rating_count)}</Text>
            {l.complaints_verified ? <Text style={[st.p, { color: C.bad }]}>⚠️ {toBn(l.complaints_verified)}টি যাচাই করা অভিযোগ</Text> : <Text style={st.small}>কোনো যাচাই করা অভিযোগ নেই</Text>}
            <Button title="এই লিডারের প্যাকেজ দেখুন" icon="🎁" kind="secondary" onPress={() => navigation.navigate('Offers', { leader: l.leader_code })} style={{ marginTop: S.sm, alignSelf: 'stretch' }} />
          </View>
          <View style={st.card}>
            <View style={st.cRow}><Text style={st.lbl}>কাজের এলাকা</Text><Text style={st.p}>{areaText(l) || '—'}</Text></View>
            {l.umrah_license ? <View style={st.cRow}><Text style={st.lbl}>ওমরাহ লাইসেন্স</Text><Text style={st.p}>{l.umrah_license}</Text></View> : null}
            {l.hajj_license ? <View style={st.cRow}><Text style={st.lbl}>হজ লাইসেন্স</Text><Text style={st.p}>{l.hajj_license}</Text></View> : null}
            <View style={st.cRow}><Text style={st.lbl}>অ্যাপে আছেন</Text><Text style={st.p}>{fmtDay(l.member_since)} থেকে</Text></View>
            {l.bio ? <View style={st.cRow}><Text style={st.lbl}>লিডারের কথা</Text><Text style={st.p}>{l.bio}</Text></View> : null}
          </View>
          <View style={st.card}>
            <Text style={st.h}>📞 কথা বলতে বা দেখা করতে চান?</Text>
            <Text style={st.small}>লিডারের নম্বর সরাসরি দেওয়া হয় না। Travel Adda টিম লিডারের সুবিধামতো সময়ে কথা বা দেখা করার ব্যবস্থা করবে। চুক্তি চালু হলে নম্বর দুপক্ষই পাবেন।</Text>
            {help && help.phone ? <Button title="Travel Adda হেল্পলাইনে ফোন করুন" icon="📞" onPress={() => Linking.openURL(`tel:${help.phone}`).catch(() => {})} style={{ marginTop: S.sm }} /> : null}
            {help && help.phone ? <Text style={st.small}>ফোনে বলুন: "লিডার আইডি {l.leader_code}"{help.hours ? ` · সময়: ${help.hours}` : ''}</Text> : null}
            {req && req.status === 'new' ? <Notice kind="ok" title="আপনার অনুরোধ পাঠানো আছে" text={`পাঠিয়েছেন: ${fmtDay(req.created_at)}। টিম আপনাকে ফোন করবে।`} />
              : <Button title="আমাকে ফোন করুন" icon="🙋" kind="secondary" onPress={ask} loading={busy} style={{ marginTop: S.sm }} />}
          </View>
          {reviews.length ? <Text style={[st.h, { marginTop: S.sm }]}>হাজীদের মন্তব্য ও যাচাই করা অভিযোগ</Text> : null}
          {reviews.map((r, i) => (
            <View key={`${r.kind}${i}`} style={[st.card, r.kind === 'complaint' && { borderWidth: 2, borderColor: C.bad }]}>
              <Text style={st.small}>{r.kind === 'complaint' ? '⚠️ যাচাই করা অভিযোগ' : `${'⭐'.repeat(r.stars || 0)} রেটিং`} · {fmtDay(r.at)}</Text>
              <Text style={st.p}>{r.body}</Text>
            </View>
          ))}
          <Text style={st.small}>রেটিং ও অভিযোগ শুধু সেই হাজীরা দিতে পারেন, যাঁরা এই লিডারের সাথে অ্যাপে চুক্তি করেছেন। রেটিং গণনা হয় Travel Adda টাকা জমা যাচাই করার পরে। অভিযোগ দেখানো হয় অ্যাডমিন যাচাইয়ের পরে।</Text>
          <ReportBlock targetId={l.id} targetName={l.full_name} />
        </>
      ) : null}
    </ScrollView>
  );
}
