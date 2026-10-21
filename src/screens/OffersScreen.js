import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Notice, Segmented } from '../components/ui';
import { notReady } from '../lib/groups';
import { KIND, refOf, getHelpline, listOffers, myInterests, requestCallback, cancelCallback } from '../lib/offers';
import { st, errText, confirm, fmtDay } from './GroupScreen';
import { useMe, isLeaderAccount } from '../lib/me';
import LeaderOffersScreen from './LeaderOffersScreen';

import { OfferCard } from '../components/OfferCard';

export { OfferCard };

// The "অফার" tab: hajis browse packages; a leader account manages its own packages here.
export default function OffersScreen({ navigation }) {
  const { me } = useMe();
  const leader = isLeaderAccount(me);
  useEffect(() => { navigation?.setOptions?.({ title: leader ? 'আমার প্যাকেজ' : 'অফার ও প্যাকেজ' }); }, [leader, navigation]);
  if (!leader) return <HajiOffers navigation={navigation} />;
  if (me.role !== 'leader') return <PendingLeader navigation={navigation} />;
  return <LeaderOffersScreen navigation={navigation} inTab />;
}

// Leader account not approved yet: packages can be added after the admin's approval.
function PendingLeader({ navigation }) {
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Text style={st.title} accessibilityRole="header">🎁 আমার প্যাকেজ</Text>
      <Notice kind="info" title="অনুমোদনের পর প্যাকেজ দিতে পারবেন" text={'অ্যাডমিন আপনার লাইসেন্স যাচাই করে অনুমোদন দিলে এখানে ওমরাহ ও হজ প্যাকেজ যোগ করতে পারবেন। হাজীরা তখন "অফার" পাতায় আপনার প্যাকেজ দেখবেন।'} />
      <Button title="লিডার নিবন্ধনের অবস্থা দেখুন" icon="🧭" onPress={() => navigation.navigate('LeaderApply')} />
    </ScrollView>
  );
}

function HajiOffers({ navigation }) {
  const [kind, setKind] = useState('umrah');
  const [rows, setRows] = useState(null);
  const [state, setState] = useState('load');
  const [help, setHelp] = useState(null);
  const [mine, setMine] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async (k) => {
    setState((x) => (x === 'ok' ? 'ok' : 'load'));
    getHelpline().then(setHelp).catch(() => {});
    try {
      const [r, m] = await Promise.all([listOffers(k), myInterests()]);
      setRows(r); setMine(m); setState('ok');
    } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(kind); }, [kind, load]);
  useEffect(() => navigation?.addListener?.('focus', () => load(kind)), [navigation, kind, load]);

  const ask = (o) => confirm('আপনাকে ফোন করার অনুরোধ পাঠাবেন?',
    'আপনার নাম ও মোবাইল নম্বর শুধু Travel Adda টিম দেখবে। টিম আপনাকে ফোন করে এজেন্সির সাথে কথা বলার ব্যবস্থা করবে।',
    'হ্যাঁ, পাঠান', async () => {
      if (busy) return;
      setBusy(o.id); setMsg(null);
      try { await requestCallback(o.id); setMsg({ kind: 'ok', text: 'অনুরোধ পাঠানো হয়েছে। Travel Adda টিম আপনাকে ফোন করবে।' }); await load(kind); }
      catch (e) {
        const m = String(e?.message || '');
        if (e?.code === '23505') setMsg({ kind: 'info', text: 'এই প্যাকেজের জন্য আপনার অনুরোধ আগেই পাঠানো আছে।' });
        else if (e?.code === '42501' || /row-level security/i.test(m)) setMsg({ kind: 'warn', text: 'অনুরোধ পাঠানো যায়নি। হয়তো প্যাকেজটি আর নেই, অথবা আপনার ১০টি অনুরোধ এখনো খোলা আছে।' });
        else setMsg({ kind: 'bad', text: errText(e) });
      } finally { setBusy(null); }
    });
  const cancel = (r) => confirm('অনুরোধটি বাতিল করবেন?', 'টিম আর এই প্যাকেজের জন্য আপনাকে ফোন করবে না।', 'হ্যাঁ, বাতিল', async () => {
    setBusy(r.offer_id); setMsg(null);
    try { await cancelCallback(r.id); setMsg({ kind: 'ok', text: 'অনুরোধ বাতিল করা হয়েছে।' }); await load(kind); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(null); }
  });
  const callHelp = () => Linking.openURL(`tel:${help.phone}`).catch(() => {});

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Text style={st.title} accessibilityRole="header">🎁 অফার ও প্যাকেজ</Text>
      <Segmented options={[{ id: 'umrah', icon: '🔄', label: 'ওমরাহ' }, { id: 'hajj', icon: '🕋', label: 'হজ' }]} value={kind} onChange={(k) => { setRows(null); setKind(k); setMsg(null); }} />
      <Text style={[st.small, { marginTop: S.sm }]}>কম দামের প্যাকেজ আগে দেখানো হচ্ছে। সব প্যাকেজ অ্যাডমিন যাচাই করা লিডারদের।</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' || (state === 'ok' && rows === null) ? <ActivityIndicator color={C.primary} style={{ marginTop: S.lg }} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই আসছে" text="যাচাই করা গ্রুপ লিডারদের হজ ও ওমরাহ প্যাকেজ এখানে দেখা যাবে।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="প্যাকেজ আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={() => load(kind)} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && rows && rows.length === 0 ? <Notice kind="info" title={`এখন কোনো ${KIND[kind].label} প্যাকেজ নেই`} text="লিডাররা প্যাকেজ দিলে এখানে দেখা যাবে। পরে আবার দেখুন।" /> : null}
      {state === 'ok' && rows ? rows.map((o) => {
        const r = mine[o.id];
        const open = r && r.status === 'new';
        return (
          <OfferCard key={o.id} o={o}>
            <View style={[st.cRow, { paddingTop: S.sm }]}>
              {help && help.phone ? (
                <>
                  <Button title="Travel Adda হেল্পলাইনে ফোন করুন" icon="📞" onPress={callHelp} a11yHint={`ফোনে প্যাকেজ নম্বর ${refOf(o.id)} বলুন`} />
                  <Text style={st.small}>ফোনে বলুন: "প্যাকেজ নম্বর {refOf(o.id)}"{help.hours ? ` · সময়: ${help.hours}` : ''}</Text>
                </>
              ) : <Notice kind="info" title="হেল্পলাইন নম্বর শীঘ্রই আসছে" text='এখন "আমাকে ফোন করুন" চাপুন, টিম আপনাকে ফোন করবে।' />}
              {open ? (
                <>
                  <Notice kind="ok" title="আপনার অনুরোধ পাঠানো আছে" text={`পাঠিয়েছেন: ${fmtDay(r.created_at)}। Travel Adda টিম আপনাকে ফোন করবে।`} />
                  <Button title="অনুরোধ বাতিল করুন" kind="danger" onPress={() => cancel(r)} disabled={!!busy} />
                </>
              ) : (
                <>
                  {r && r.status === 'contacted' ? <Text style={st.small}>✅ টিম আগে এই প্যাকেজ নিয়ে আপনার সাথে কথা বলেছে।</Text> : null}
                  <Button title="আমাকে ফোন করুন" icon="🙋" kind="secondary" onPress={() => ask(o)} loading={busy === o.id} style={{ marginTop: S.sm }} />
                </>
              )}
            </View>
          </OfferCard>
        );
      }) : null}
      <Notice kind="info" title="জেনে রাখুন" text="চুক্তি হওয়ার পর টাকা শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে দিন, লিডারকে সরাসরি নয়। Travel Adda টাকা যাচাই করে লিডারকে দেয়, তাই আপনার টাকা নিরাপদ থাকে।" />
    </ScrollView>
  );
}
