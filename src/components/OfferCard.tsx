import React, { type JSX, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { C, S, R, F, TOUCH } from '../theme';
import { toBn } from '../lib/phone';
import { INCLUDES, KIND, refOf, daysOf } from '../lib/offers';
import { routeSteps, hasRoute } from '../lib/offerRoute';
import { BADGE_TEXT, shortDates, nightsText, walkText, type Badge } from '../lib/offerList';
import { LEADER_KINDS } from '../lib/leaderKinds';
import { st, fmtDay, fmtTaka } from '../screens/GroupScreen';
import { Avatar } from '../screens/LeadersScreen';
import type { AnyPackage } from '../lib/types';

type Offer = AnyPackage;   // a package row (haji list, leader's own, or admin check)

const dist = (m: number | null | undefined, place: string): string => (m == null ? '' : m >= 1000 ? `${place} থেকে প্রায় ${toBn((m / 1000).toFixed(1))} কিমি` : `${place} থেকে প্রায় ${toBn(m)} মিটার`);
const stars = (n: number): string => (n > 0 ? `⭐ ${toBn(Number(n).toFixed(1))}` : '⭐ এখনো রেটিং নেই');
const yearsSince = (iso: string): string => { const d = Date.parse(iso); if (!d) return ''; const m = Math.floor((Date.now() - d) / (30.4 * 86400000)); return m < 1 ? 'এই মাসে যোগ দিয়েছেন' : m < 12 ? `${toBn(m)} মাস ধরে অ্যাপে` : `${toBn(Math.floor(m / 12))} বছর ধরে অ্যাপে`; };

// The journey as a vertical line of steps: fly out → holy cities with nights → fly home.
export function RouteTimeline({ o }: { o: Offer }): JSX.Element {
  const steps = routeSteps(o);
  if (!steps) return <View style={st.cRow}><Text style={st.lbl}>যাত্রাপথ</Text><Text style={[st.p, { color: C.muted }]}>লিডার যাত্রাপথ উল্লেখ করেননি। হেল্পলাইনে জিজ্ঞেস করুন।</Text></View>;
  return (
    <View style={st.cRow} accessible accessibilityLabel={`যাত্রাপথ: ${steps.map((x) => `${x.title}, ${x.text}`).join('। ')}`}>
      <Text style={[st.lbl, { marginBottom: S.xs }]}>যাত্রাপথ</Text>
      {steps.map((x, i) => (
        <View key={i} style={{ flexDirection: 'row' }}>
          <View style={{ width: 44, alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: i === 0 || i === steps.length - 1 ? C.primarySoft : C.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>{x.icon}</Text>
            </View>
            {i < steps.length - 1 ? <View style={{ width: 3, flex: 1, minHeight: 14, backgroundColor: C.line }} /> : null}
          </View>
          <View style={{ flex: 1, paddingLeft: S.sm, paddingBottom: S.sm }}>
            <Text style={[st.p, { fontWeight: '700' }]}>{x.title}{x.when ? ` · ${fmtDay(x.when)}` : ''}</Text>
            <Text style={st.p}>{x.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// Who offers this package. Phone never shown (contact goes through Travel Adda).
export function LeaderBox({ o, onProfile, onMore }: { o: Offer; onProfile?: () => void; onMore?: () => void }): JSX.Element | null {
  if (!o.leader_name) return o.agency_name ? <Text style={st.val}>✔️ {o.agency_name}</Text> : null;
  const ta = o.leader_kind === 'travel_adda';
  return (
    <View style={[st.cRow, { paddingTop: S.sm }]}>
      <Text style={[st.lbl, { marginBottom: S.xs }]}>যে লিডার প্যাকেজটি দিচ্ছেন</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar path={o.avatar_path} size={64} name={o.leader_name} />
        <View style={{ flex: 1, marginLeft: S.md }}>
          <Text style={[st.val, { fontSize: F.large }]}>{o.leader_name}</Text>
          <Text style={st.small}>আইডি: {o.leader_code}{o.district ? ` · ${o.district}` : ''}</Text>
          <Text style={[st.small, { color: C.primary, fontWeight: '700' }]}>{ta ? LEADER_KINDS.travel_adda.badge : `✔️ ${o.agency_name || ''} (যাচাই করা এজেন্সি)`}</Text>
        </View>
      </View>
      <Text style={[st.p, { marginTop: S.sm }]}>{stars(Number(o.rating_avg || 0))}{o.rating_count ? ` (${toBn(o.rating_count)} জন হাজীর রেটিং)` : ''}</Text>
      <Text style={[st.p, { color: o.complaints_verified ? C.bad : C.ok }]}>{o.complaints_verified ? `⚠️ যাচাই হওয়া অভিযোগ: ${toBn(o.complaints_verified)}টি` : '✅ কোনো যাচাই হওয়া অভিযোগ নেই'}</Text>
      {o.member_since ? <Text style={st.small}>{yearsSince(o.member_since)}</Text> : null}
      {onProfile ? <Pressable onPress={onProfile} style={{ minHeight: TOUCH, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={`${o.leader_name}-এর পুরো প্রোফাইল, রেটিং ও অভিযোগ দেখুন`}>
        <Text style={[st.p, { color: C.primary, fontWeight: '700' }]}>👤 লিডারের পুরো প্রোফাইল দেখুন ›</Text></Pressable> : null}
      {onMore ? <Pressable onPress={onMore} style={{ minHeight: TOUCH, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={`${o.leader_name}-এর আরও প্যাকেজ দেখুন`}>
        <Text style={[st.p, { color: C.primary, fontWeight: '700' }]}>🎁 এই লিডারের সব প্যাকেজ দেখুন ›</Text></Pressable> : null}
    </View>
  );
}

// Short card for the list (owner choice Nov 2026): only what a haji compares first — name, days, price, dates and
// nights, walking distance to the Haram — plus the app's own badges. Leader, route and the rest are on the full page.
export function BadgePill({ b }: { b: Badge }): JSX.Element {
  const cheap = b === 'cheap';
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: R.pill, paddingHorizontal: S.sm, paddingVertical: 2, marginRight: S.xs, marginTop: 2,
      backgroundColor: cheap ? C.okSoft : C.goldSoft, borderWidth: 1, borderColor: cheap ? C.ok : C.gold }}>
      <Text style={{ fontSize: F.small, fontWeight: '700', color: C.text }}>{BADGE_TEXT[b]}</Text>
    </View>
  );
}

export function OfferSummary({ o, onOpen, note, noteColor, badges }: { o: Offer; onOpen?: () => void; note?: string | null; noteColor?: string; badges?: Badge[] }): JSX.Element {
  const dates = shortDates(o); const nights = nightsText(o); const walk = walkText(o.makkah_distance_m);
  const b = badges || [];
  const label = [`${o.title}`, `${fmtTaka(o.price_bdt)} জনপ্রতি`, `${toBn(daysOf(o))} দিন`, dates, nights, walk,
    ...b.map((x) => BADGE_TEXT[x].replace(/^\S+ /, '')),
    o.leader_name || o.agency_name ? `লিডার ${o.leader_name || o.agency_name}${o.leader_code ? `, আইডি ${o.leader_code}` : ''}` : '', note || '', 'বিস্তারিত দেখতে চাপুন'].filter(Boolean).join('। ');
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [st.card, { borderWidth: 1.5, borderColor: C.primary, paddingVertical: S.sm, marginBottom: S.sm, opacity: pressed ? 0.85 : 1 }]}
      accessibilityRole="button" accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: S.sm }}>
        <Text style={{ flex: 1, fontSize: F.large, fontWeight: '700', color: C.primary, lineHeight: 28 }}>{o.title}</Text>
        <View style={{ backgroundColor: C.goldSoft, borderRadius: R.md, paddingHorizontal: S.sm, paddingVertical: 2 }}>
          <Text style={{ fontSize: F.small, fontWeight: '700', color: C.text }}>{toBn(daysOf(o))} দিন</Text>
        </View>
      </View>
      <Text style={{ fontSize: 24, fontWeight: '800', color: C.text, lineHeight: 34 }}>{fmtTaka(o.price_bdt)} <Text style={st.small}>জনপ্রতি</Text></Text>
      {b.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 2 }}>{b.map((x) => <BadgePill key={x} b={x} />)}</View> : null}
      {dates || nights ? <Text style={st.p}>📅 {[dates, nights].filter(Boolean).join(' · ')}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm }}>
        <Text style={[st.p, { flex: 1 }]}>{walk ? `🚶 ${walk}` : ''}</Text>
        <Text style={[st.p, { color: C.primary, fontWeight: '700' }]}>দেখুন ›</Text>
      </View>
      {note ? <Text style={[st.small, { fontWeight: '700', color: noteColor || C.ok, marginBottom: 0 }]}>{note}</Text> : null}
    </Pressable>
  );
}

// Full package. Used on the package page (haji), in the leader's own list and in the admin check.
export function OfferCard({ o, children, onProfile, onMore }: { o: Offer; children?: ReactNode; onProfile?: () => void; onMore?: () => void }): JSX.Element {
  const has = new Set<string>(o.includes || []);
  const list = INCLUDES.filter((x) => o.kind === 'hajj' || x.id !== 'qurbani');
  const Line = ({ l, v }: { l: string; v?: string | null }) => (v ? <View style={st.cRow}><Text style={st.lbl}>{l}</Text><Text style={st.p}>{v}</Text></View> : null);
  return (
    <View style={st.card}>
      <Text style={st.small}>{KIND[o.kind || '']?.icon} {KIND[o.kind || '']?.label} · প্যাকেজ নম্বর {refOf(o.id)}</Text>
      <Text style={st.gName}>{o.title}</Text>
      <Text style={{ fontSize: 28, fontWeight: '800', color: C.primary, marginTop: S.xs }}>{fmtTaka(o.price_bdt)}</Text>
      <Text style={st.small}>জনপ্রতি মোট দাম</Text>
      <Line l="যাত্রার তারিখ" v={`${fmtDay(o.depart_on)} থেকে ${fmtDay(o.return_on)} · মোট ${toBn(daysOf(o))} দিন`} />
      <Line l="অফার চলবে" v={o.valid_until ? `${fmtDay(o.valid_until)} পর্যন্ত` : ''} />
      {hasRoute(o) || o.leader_name ? <RouteTimeline o={o} /> : null}
      <Line l="🕋 মক্কার হোটেল" v={[o.makkah_hotel, dist(o.makkah_distance_m, 'হারাম')].filter(Boolean).join(' · ')} />
      <Line l="🕌 মদিনার হোটেল" v={[o.madinah_hotel, dist(o.madinah_distance_m, 'মসজিদে নববী')].filter(Boolean).join(' · ')} />
      <Line l="এক রুমে" v={o.room_share ? `${toBn(o.room_share)} জন` : ''} />
      <View style={st.cRow}>
        <Text style={st.lbl}>প্যাকেজে যা আছে</Text>
        {list.filter((x) => has.has(x.id)).map((x) => <Text key={x.id} style={st.p}>✅ {x.icon} {x.label}</Text>)}
        {list.some((x) => !has.has(x.id)) ? <Text style={[st.lbl, { marginTop: S.sm }]}>যা নেই (নিজে ব্যবস্থা করতে হবে)</Text> : null}
        {list.filter((x) => !has.has(x.id)).map((x) => <Text key={x.id} style={[st.p, { color: C.muted }]}>✖️ {x.label}</Text>)}
      </View>
      <Line l="আরও তথ্য" v={o.notes} />
      <LeaderBox o={o} onProfile={onProfile} onMore={onMore} />
      {children}
    </View>
  );
}
