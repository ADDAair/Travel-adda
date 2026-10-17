import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import { notReady } from '../lib/groups';
import { INCLUDES, KIND, refOf, daysOf, getHelpline, listOffers, myInterests, requestCallback, cancelCallback } from '../lib/offers';
import { st, errText, confirm, fmtDay, fmtTaka } from './GroupScreen';

const dist = (m) => (m == null ? '' : m >= 1000 ? `হারাম থেকে প্রায় ${toBn((m / 1000).toFixed(1))} কিমি` : `হারাম থেকে প্রায় ${toBn(m)} মিটার`);

// One package. Used on the Offers page (haji) and in the leader's own list.
export function OfferCard({ o, children }) {
  const has = new Set(o.includes || []);
  const Row = ({ l, v }) => (v ? <View style={st.cRow}><Text style={st.lbl}>{l}</Text><Text style={st.p}>{v}</Text></View> : null);
  return (
    <View style={st.card}>
      <Text style={st.small}>{KIND[o.kind]?.icon} {KIND[o.kind]?.label} · প্যাকেজ নম্বর {refOf(o.id)}</Text>
      <Text style={st.gName}>{o.title}</Text>
      {o.agency_name ? <Text style={st.val}>✔️ {o.agency_name}</Text> : null}
      {o.agency_name ? <Text style={st.small}>অ্যাডমিন যাচাই করা গ্রুপ লিডারের এজেন্সি</Text> : null}
      <Text style={{ fontSize: 28, fontWeight: '800', color: C.primary, marginTop: S.xs }}>{fmtTaka(o.price_bdt)}</Text>
      <Text style={st.small}>জনপ্রতি মোট দাম</Text>
      <Row l="যাত্রা" v={`${fmtDay(o.depart_on)} থেকে ${fmtDay(o.return_on)} · মোট ${toBn(daysOf(o))} দিন`} />
      <Row l="অফার চলবে" v={o.valid_until ? `${fmtDay(o.valid_until)} পর্যন্ত` : ''} />
      <Row l="মক্কার হোটেল" v={[o.makkah_hotel, dist(o.makkah_distance_m)].filter(Boolean).join(' · ')} />
      <Row l="মদিনার হোটেল" v={[o.madinah_hotel, dist(o.madinah_distance_m)].filter(Boolean).join(' · ')} />
      <Row l="এক রুমে" v={o.room_share ? `${toBn(o.room_share)} জন` : ''} />
      <View style={st.cRow}>
        <Text style={st.lbl}>প্যাকেজে যা আছে / নেই</Text>
        {INCLUDES.map((x) => (
          <Text key={x.id} style={[st.p, { color: has.has(x.id) ? C.text : C.muted }]}>{has.has(x.id) ? '✅ আছে:' : '✖️ নেই:'} {x.label}</Text>
        ))}
      </View>
      <Row l="আরও তথ্য" v={o.notes} />
      {children}
    </View>
  );
}

export default function OffersScreen({ navigation }) {
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
