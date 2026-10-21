import React from 'react';
import { View, Text } from 'react-native';
import { C, S } from '../theme';
import { toBn } from '../lib/phone';
import { INCLUDES, KIND, refOf, daysOf } from '../lib/offers';
import { st, fmtDay, fmtTaka } from '../screens/GroupScreen';

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
