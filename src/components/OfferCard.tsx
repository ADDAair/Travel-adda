import React, { type JSX, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { C, S, R, F, TOUCH } from '../theme';
import { toBn } from '../lib/phone';
import { INCLUDES, KIND, refOf, daysOf } from '../lib/offers';
import { routeSteps, hasRoute } from '../lib/offerRoute';
import { tr } from '../lib/lang';
import { badgeText, seatsLine, shortDates, nightsText, walkText, type Badge } from '../lib/offerList';
import { LEADER_KINDS } from '../lib/leaderKinds';
import { st, fmtDay, fmtTaka } from '../screens/GroupScreen';
import { Avatar } from '../screens/LeadersScreen';
import type { AnyPackage } from '../lib/types';

type Offer = AnyPackage;   // a package row (haji list, leader's own, or admin check)

const dist = (m: number | null | undefined, place: string): string => (m == null ? '' : m >= 1000 ? tr(`${place} থেকে প্রায় ${toBn((m / 1000).toFixed(1))} কিমি`, `about ${(m / 1000).toFixed(1)} km from ${place}`) : tr(`${place} থেকে প্রায় ${toBn(m)} মিটার`, `about ${m} m from ${place}`));
const stars = (n: number): string => (n > 0 ? `⭐ ${toBn(Number(n).toFixed(1))}` : tr('⭐ এখনো রেটিং নেই', '⭐ No rating yet'));
const yearsSince = (iso: string): string => { const d = Date.parse(iso); if (!d) return ''; const m = Math.floor((Date.now() - d) / (30.4 * 86400000)); return m < 1 ? tr('এই মাসে যোগ দিয়েছেন', 'Joined this month') : m < 12 ? tr(`${toBn(m)} মাস ধরে অ্যাপে`, `${m} month${m === 1 ? '' : 's'} on the app`) : tr(`${toBn(Math.floor(m / 12))} বছর ধরে অ্যাপে`, `${Math.floor(m / 12)} year${Math.floor(m / 12) === 1 ? '' : 's'} on the app`); };

// The journey as a vertical line of steps: fly out → holy cities with nights → fly home.
export function RouteTimeline({ o }: { o: Offer }): JSX.Element {
  const steps = routeSteps(o);
  if (!steps) return <View style={st.cRow}><Text style={st.lbl}>{tr('যাত্রাপথ', 'Route')}</Text><Text style={[st.p, { color: C.muted }]}>{tr('লিডার যাত্রাপথ উল্লেখ করেননি। হেল্পলাইনে জিজ্ঞেস করুন।', 'The leader did not give the route. Ask the helpline.')}</Text></View>;
  return (
    <View style={st.cRow} accessible accessibilityLabel={`${tr('যাত্রাপথ', 'Route')}: ${steps.map((x) => `${x.title}, ${x.text}`).join('. ')}`}>
      <Text style={[st.lbl, { marginBottom: S.xs }]}>{tr('যাত্রাপথ', 'Route')}</Text>
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
      <Text style={[st.lbl, { marginBottom: S.xs }]}>{tr('যে লিডার প্যাকেজটি দিচ্ছেন', 'The leader offering this package')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar path={o.avatar_path} size={64} name={o.leader_name} />
        <View style={{ flex: 1, marginLeft: S.md }}>
          <Text style={[st.val, { fontSize: F.large }]}>{o.leader_name}</Text>
          <Text style={st.small}>{tr('আইডি', 'ID')}: {o.leader_code}{o.district ? ` · ${o.district}` : ''}</Text>
          <Text style={[st.small, { color: C.primary, fontWeight: '700' }]}>{ta ? LEADER_KINDS.travel_adda.badge : `✔️ ${o.agency_name || ''} (${tr('যাচাই করা এজেন্সি', 'verified agency')})`}</Text>
        </View>
      </View>
      <Text style={[st.p, { marginTop: S.sm }]}>{stars(Number(o.rating_avg || 0))}{o.rating_count ? tr(` (${toBn(o.rating_count)} জন হাজীর রেটিং)`, ` (rated by ${o.rating_count} haji${o.rating_count === 1 ? '' : 's'})`) : ''}</Text>
      <Text style={[st.p, { color: o.complaints_verified ? C.bad : C.ok }]}>{o.complaints_verified ? tr(`⚠️ যাচাই হওয়া অভিযোগ: ${toBn(o.complaints_verified)}টি`, `⚠️ Verified complaints: ${o.complaints_verified}`) : tr('✅ কোনো যাচাই হওয়া অভিযোগ নেই', '✅ No verified complaints')}</Text>
      {o.member_since ? <Text style={st.small}>{yearsSince(o.member_since)}</Text> : null}
      {onProfile ? <Pressable onPress={onProfile} style={{ minHeight: TOUCH, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={tr(`${o.leader_name}-এর পুরো প্রোফাইল, রেটিং ও অভিযোগ দেখুন`, `See ${o.leader_name}'s full profile, ratings and complaints`)}>
        <Text style={[st.p, { color: C.primary, fontWeight: '700' }]}>{tr('👤 লিডারের পুরো প্রোফাইল দেখুন ›', '👤 See the leader\'s full profile ›')}</Text></Pressable> : null}
      {onMore ? <Pressable onPress={onMore} style={{ minHeight: TOUCH, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={tr(`${o.leader_name}-এর আরও প্যাকেজ দেখুন`, `See more packages from ${o.leader_name}`)}>
        <Text style={[st.p, { color: C.primary, fontWeight: '700' }]}>{tr('🎁 এই লিডারের সব প্যাকেজ দেখুন ›', '🎁 See all packages from this leader ›')}</Text></Pressable> : null}
    </View>
  );
}

// Short card for the list (owner choice Nov 2026): only what a haji compares first — name, days, price, dates and
// nights, walking distance to the Haram — plus the app's own badges. Leader, route and the rest are on the full page.
export function BadgePill({ b, o }: { b: Badge; o?: Offer }): JSX.Element {
  const cheap = b === 'cheap'; const warn = b === 'seats' || b === 'full';
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: R.pill, paddingHorizontal: S.sm, paddingVertical: 2, marginRight: S.xs, marginTop: 2,
      backgroundColor: cheap ? C.okSoft : warn ? C.warnSoft : C.goldSoft, borderWidth: 1, borderColor: cheap ? C.ok : warn ? C.warn : C.gold }}>
      <Text style={{ fontSize: F.small, fontWeight: '700', color: C.text }}>{badgeText(b, o)}</Text>
    </View>
  );
}

export function OfferSummary({ o, onOpen, note, noteColor, badges }: { o: Offer; onOpen?: () => void; note?: string | null; noteColor?: string; badges?: Badge[] }): JSX.Element {
  const dates = shortDates(o); const nights = nightsText(o); const walk = walkText(o.makkah_distance_m);
  const b = badges || [];
  const label = [`${o.title}`, tr(`${fmtTaka(o.price_bdt)} জনপ্রতি`, `${fmtTaka(o.price_bdt)} per person`), tr(`${toBn(daysOf(o))} দিন`, `${daysOf(o)} days`), dates, nights, walk,
    ...b.map((x) => badgeText(x, o).replace(/^\S+ /, '')),
    o.leader_name || o.agency_name ? tr(`লিডার ${o.leader_name || o.agency_name}${o.leader_code ? `, আইডি ${o.leader_code}` : ''}`, `Leader ${o.leader_name || o.agency_name}${o.leader_code ? `, ID ${o.leader_code}` : ''}`) : '', note || '', tr('বিস্তারিত দেখতে চাপুন', 'Tap to see details')].filter(Boolean).join(tr('। ', '. '));
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [st.card, { borderWidth: 1.5, borderColor: C.primary, paddingVertical: S.sm, marginBottom: S.sm, opacity: pressed ? 0.85 : 1 }]}
      accessibilityRole="button" accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: S.sm }}>
        <Text style={{ flex: 1, fontSize: F.large, fontWeight: '700', color: C.primary, lineHeight: 28 }}>{o.title}</Text>
        <View style={{ backgroundColor: C.goldSoft, borderRadius: R.md, paddingHorizontal: S.sm, paddingVertical: 2 }}>
          <Text style={{ fontSize: F.small, fontWeight: '700', color: C.text }}>{tr(`${toBn(daysOf(o))} দিন`, `${daysOf(o)} days`)}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 24, fontWeight: '800', color: C.text, lineHeight: 34 }}>{fmtTaka(o.price_bdt)} <Text style={st.small}>{tr('জনপ্রতি', 'per person')}</Text></Text>
      {b.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 2 }}>{b.map((x) => <BadgePill key={x} b={x} o={o} />)}</View> : null}
      {dates || nights ? <Text style={st.p}>📅 {[dates, nights].filter(Boolean).join(' · ')}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm }}>
        <Text style={[st.p, { flex: 1 }]}>{walk ? `🚶 ${walk}` : ''}</Text>
        <Text style={[st.p, { color: C.primary, fontWeight: '700' }]}>{tr('দেখুন ›', 'See ›')}</Text>
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
      <Text style={st.small}>{KIND[o.kind || '']?.icon} {KIND[o.kind || '']?.label} · {tr('প্যাকেজ নম্বর', 'Package no.')} {refOf(o.id)}</Text>
      <Text style={st.gName}>{o.title}</Text>
      <Text style={{ fontSize: 28, fontWeight: '800', color: C.primary, marginTop: S.xs }}>{fmtTaka(o.price_bdt)}</Text>
      <Text style={st.small}>{tr('জনপ্রতি মোট দাম', 'Total price per person')}</Text>
      <Line l={tr('যাত্রার তারিখ', 'Travel dates')} v={tr(`${fmtDay(o.depart_on)} থেকে ${fmtDay(o.return_on)} · মোট ${toBn(daysOf(o))} দিন`, `${fmtDay(o.depart_on)} to ${fmtDay(o.return_on)} · ${daysOf(o)} days in all`)} />
      <Line l={tr('অফার চলবে', 'Offer valid')} v={o.valid_until ? tr(`${fmtDay(o.valid_until)} পর্যন্ত`, `until ${fmtDay(o.valid_until)}`) : ''} />
      <Line l={tr('💺 আসন', '💺 Seats')} v={seatsLine(o)} />
      {hasRoute(o) || o.leader_name ? <RouteTimeline o={o} /> : null}
      <Line l={tr('🕋 মক্কার হোটেল', '🕋 Makkah hotel')} v={[o.makkah_hotel, dist(o.makkah_distance_m, tr('হারাম', 'the Haram'))].filter(Boolean).join(' · ')} />
      <Line l={tr('🕌 মদিনার হোটেল', '🕌 Madinah hotel')} v={[o.madinah_hotel, dist(o.madinah_distance_m, tr('মসজিদে নববী', 'Masjid an-Nabawi'))].filter(Boolean).join(' · ')} />
      <Line l={tr('এক রুমে', 'People per room')} v={o.room_share ? tr(`${toBn(o.room_share)} জন`, `${o.room_share}`) : ''} />
      <View style={st.cRow}>
        <Text style={st.lbl}>{tr('প্যাকেজে যা আছে', 'Included in the package')}</Text>
        {list.filter((x) => has.has(x.id)).map((x) => <Text key={x.id} style={st.p}>✅ {x.icon} {x.label}</Text>)}
        {list.some((x) => !has.has(x.id)) ? <Text style={[st.lbl, { marginTop: S.sm }]}>{tr('যা নেই (নিজে ব্যবস্থা করতে হবে)', 'Not included (arrange it yourself)')}</Text> : null}
        {list.filter((x) => !has.has(x.id)).map((x) => <Text key={x.id} style={[st.p, { color: C.muted }]}>✖️ {x.label}</Text>)}
      </View>
      <Line l={tr('আরও তথ্য', 'More info')} v={o.notes} />
      <LeaderBox o={o} onProfile={onProfile} onMore={onMore} />
      {children}
    </View>
  );
}
