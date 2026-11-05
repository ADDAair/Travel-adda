import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Linking, ActivityIndicator, Pressable, BackHandler } from 'react-native';
import ScrollView from '../components/KbScroll';
import { C, S, R, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { notReady } from '../lib/groups';
import { KIND, refOf, type Helpline, getHelpline, listOffers, myInterests, requestCallback, cancelCallback } from '../lib/offers';
import { st, errText, confirm, fmtDay, fmtTaka } from './GroupScreen';
import { useMe, isLeaderAccount } from '../lib/me';
import LeaderOffersScreen from './LeaderOffersScreen';

import { OfferCard, OfferSummary, BadgePill } from '../components/OfferCard';
import { badgesFor, featured, monthBar, BADGE_TEXT, type Badge } from '../lib/offerList';
import { daysOf } from '../lib/offers';
import { filterOffers, monthOptions, AIRPORTS_BD, PRICE_LIMITS, parsePrice, monthFilterFor, monthButtonText } from '../lib/offerRoute';
import { toBn } from '../lib/phone';
import FundCard from '../components/FundCard';
import type { Msg, Nav, Route } from './navTypes';
import type { Res } from '../lib/types';
import { errInfo } from '../lib/errors';
import type { ScrollRef } from '../components/KbScroll';
import type { PackageRow } from '../lib/types';

export { OfferCard };

// The "অফার" tab: hajis browse packages; a leader account manages its own packages here.
export default function OffersScreen({ navigation, route }: { navigation: Nav; route?: Route }) {
  const { me } = useMe();
  const leader = isLeaderAccount(me);
  useEffect(() => { navigation?.setOptions?.({ title: leader ? 'আমার প্যাকেজ' : 'অফার ও প্যাকেজ' }); }, [leader, navigation]);
  if (!leader) return <HajiOffers navigation={navigation} route={route} />;
  if (!me || me.role !== 'leader') return <PendingLeader navigation={navigation} />;
  return <LeaderOffersScreen navigation={navigation} inTab />;
}

// Leader account not approved yet: packages can be added after the admin's approval.
function PendingLeader({ navigation }: { navigation: Nav }) {
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Text style={st.title} accessibilityRole="header">🎁 আমার প্যাকেজ</Text>
      <Notice kind="info" title="অনুমোদনের পর প্যাকেজ দিতে পারবেন" text={'অ্যাডমিন আপনার লাইসেন্স যাচাই করে অনুমোদন দিলে এখানে ওমরাহ ও হজ প্যাকেজ যোগ করতে পারবেন। হাজীরা তখন "অফার" পাতায় আপনার প্যাকেজ দেখবেন।'} />
      <Button title="লিডার নিবন্ধনের অবস্থা দেখুন" icon="🧭" onPress={() => navigation.navigate('LeaderApply')} />
    </ScrollView>
  );
}

// A row of choice pills (one may be chosen, tap again to clear). Words, not colour, say what is chosen.
function Pills<T extends string | number>({ label, options, value, onChange }: { label?: string; options: { id: T; label: string }[]; value: T | null; onChange: (v: T | null) => void }) {
  return (
    <View style={{ marginBottom: S.sm }}>
      <Text style={[st.small, { fontWeight: '700' }]}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {options.map((o) => {
          const on = value === o.id;
          return (
            <Pressable key={String(o.id)} onPress={() => onChange(on ? null : o.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
              accessibilityLabel={`${label}: ${o.label}${on ? ', বাছাই করা, বাদ দিতে আবার চাপুন' : ''}`}
              style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.md, marginRight: S.xs, marginTop: S.xs, borderRadius: R.lg,
                borderWidth: 2, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primarySoft : C.card }}>
              <Text style={st.p}>{on ? '✓ ' : ''}{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Umrah month: one button that says what is chosen ("সব মাস" at first); tapping it opens the list of months.
function MonthDropdown({ options, value, onChange }: { options: { id: string; label: string }[]; value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (id: string | null) => { onChange(id); setOpen(false); };
  const Item = ({ id, label }: { id: string | null; label: string }) => {
    const on = value === id;
    return (
      <Pressable onPress={() => pick(id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${label}${on ? ', বাছাই করা' : ''}`}
        style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.md, borderTopWidth: 1, borderColor: C.line, backgroundColor: on ? C.primarySoft : C.card }}>
        <Text style={st.p}>{on ? '✓ ' : '   '}{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ marginBottom: S.md }}>
      <Text style={[st.small, { fontWeight: '700' }]}>কোন মাসে যাবেন</Text>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`মাস: ${monthButtonText(value, options).replace('📅 ', '')}। ${open ? 'তালিকা বন্ধ করতে' : 'অন্য মাস বাছতে'} চাপুন`}
        style={{ minHeight: TOUCH + 8, flexDirection: 'row', alignItems: 'center', marginTop: S.xs, paddingHorizontal: S.md, borderRadius: R.md, borderWidth: 2, borderColor: C.primary, backgroundColor: C.card }}>
        <Text style={[st.p, { flex: 1 }]}>{monthButtonText(value, options)}</Text>
        <Text style={[st.p, { color: C.primary }]}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open ? (
        <View style={{ borderWidth: 2, borderTopWidth: 0, borderColor: C.primary, borderBottomLeftRadius: R.md, borderBottomRightRadius: R.md, overflow: 'hidden' }}>
          <Item id={null} label="সব মাস একসাথে" />
          {options.map((o) => <Item key={o.id} id={o.id} label={o.label} />)}
          <Text style={[st.small, { padding: S.sm }]}>বন্ধনীতে লেখা আছে সেই মাসে কয়টি প্যাকেজ আছে।</Text>
        </View>
      ) : null}
    </View>
  );
}

// Two "special" cards above the list (cheapest, newest), chosen by the app from the packages themselves.
function Featured({ items, onOpen }: { items: { o: PackageRow; why: Badge }[]; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: S.sm }}>
      <Text style={[st.p, { fontWeight: '700' }]} accessibilityRole="header">⭐ বিশেষ অফার</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.xs }}>
        {items.map(({ o, why }) => (
          <Pressable key={o.id} onPress={() => onOpen(o.id)} accessibilityRole="button"
            accessibilityLabel={`বিশেষ অফার, ${BADGE_TEXT[why].replace(/^\S+ /, '')}: ${o.title}। ${fmtTaka(o.price_bdt)} জনপ্রতি। ${toBn(daysOf(o))} দিন। দেখতে চাপুন`}
            style={({ pressed }) => ({ flexGrow: 1, flexBasis: '45%', minWidth: 150, backgroundColor: C.card, borderRadius: R.lg, borderWidth: 2, borderColor: C.gold, padding: S.sm, opacity: pressed ? 0.85 : 1 })}>
            <BadgePill b={why} />
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, lineHeight: 32, marginTop: 2 }}>{fmtTaka(o.price_bdt)}</Text>
            <Text style={[st.p, { fontWeight: '700', color: C.primary }]} numberOfLines={2}>{o.title}</Text>
            <Text style={st.small}>{toBn(daysOf(o))} দিন · দেখুন ›</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Month buttons once there are many packages: each says how many leave that month and the lowest price.
function MonthBar({ months, value, onChange }: { months: { id: string; label: string; count: number; from: number }[]; value: string | null; onChange: (v: string | null) => void }) {
  if (!months.length) return null;
  const Pill = ({ id, text, a11y }: { id: string | null; text: string; a11y: string }) => {
    const on = value === id;
    return (
      <Pressable onPress={() => onChange(id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${a11y}${on ? ', বাছাই করা' : ''}`}
        style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.md, marginRight: S.xs, marginTop: S.xs, borderRadius: R.pill,
          borderWidth: 2, borderColor: C.primary, backgroundColor: on ? C.primary : C.card }}>
        <Text style={[st.p, { color: on ? C.onPrimary : C.primary, fontWeight: '700' }]}>{on ? '✓ ' : ''}{text}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ marginBottom: S.sm }}>
      <Text style={[st.p, { fontWeight: '700' }]} accessibilityRole="header">📅 কোন মাসে যাবেন</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Pill id={null} text="সব মাস" a11y="সব মাসের প্যাকেজ" />
        {months.map((m) => <Pill key={m.id} id={m.id} text={`${m.label} · ${fmtTaka(m.from)} থেকে`} a11y={`${m.label}, ${toBn(m.count)}টি প্যাকেজ, ${fmtTaka(m.from)} থেকে শুরু`} />)}
      </View>
    </View>
  );
}

function HajiOffers({ navigation, route }: { navigation: Nav; route?: Route }) {
  const [kind, setKind] = useState('umrah');
  const [rows, setRows] = useState<PackageRow[] | null>(null);
  const [state, setState] = useState('load');
  const [help, setHelp] = useState<Helpline | null>(null);
  const [mine, setMine] = useState<Res<typeof myInterests>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [q, setQ] = useState(route?.params?.leader || '');
  const [month, setMonth] = useState<string | null>(null);
  const [airport, setAirport] = useState<string | null>(null);
  const [priceText, setPriceText] = useState('');      // typed by the haji, or filled by a quick button
  const typed = parsePrice(priceText);
  const maxPrice = Number.isFinite(typed) ? typed : null;
  const setMaxPrice = (n: number | null) => setPriceText(n ? toBn(n) : '');
  const [showFilters, setShowFilters] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);             // package shown on its own page
  const scroller = React.useRef<ScrollRef | null>(null);
  useEffect(() => { if (route?.params?.leader) { setQ(route.params.leader); setOpenId(null); } }, [route?.params?.leader]);

  const load = useCallback(async (k: string) => {
    setState((x) => (x === 'ok' ? 'ok' : 'load'));
    getHelpline().then(setHelp).catch(() => {});
    try {
      const [r, m] = await Promise.all([listOffers(k), myInterests()]);
      setRows(r); setMine(m); setState('ok');
    } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(kind); }, [kind, load]);
  useEffect(() => navigation?.addListener?.('focus', () => load(kind)), [navigation, kind, load]);
  useEffect(() => {
    if (!openId) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpenId(null); return true; });
    return () => sub.remove();
  }, [openId]);

  const ask = (o: PackageRow) => confirm('আপনাকে ফোন করার অনুরোধ পাঠাবেন?',
    'আপনার নাম ও মোবাইল নম্বর শুধু Travel Adda টিম দেখবে। টিম আপনাকে ফোন করে লিডারের সাথে কথা বলার ব্যবস্থা করবে।',
    'হ্যাঁ, পাঠান', async () => {
      if (busy) return;
      setBusy(o.id); setMsg(null);
      try { await requestCallback(o.id); setMsg({ kind: 'ok', text: 'অনুরোধ পাঠানো হয়েছে। Travel Adda টিম আপনাকে ফোন করবে।' }); await load(kind); }
      catch (e) {
        const { code, message: m } = errInfo(e);
        if (code === '23505') setMsg({ kind: 'info', text: 'এই প্যাকেজের জন্য আপনার অনুরোধ আগেই পাঠানো আছে।' });
        else if (code === '42501' || /row-level security/i.test(m)) setMsg({ kind: 'warn', text: 'অনুরোধ পাঠানো যায়নি। হয়তো প্যাকেজটি আর নেই, অথবা আপনার ১০টি অনুরোধ এখনো খোলা আছে।' });
        else setMsg({ kind: 'bad', text: errText(e) });
      } finally { setBusy(null); }
    });
  const cancel = (r: Res<typeof myInterests>[string]) => confirm('অনুরোধটি বাতিল করবেন?', 'টিম আর এই প্যাকেজের জন্য আপনাকে ফোন করবে না।', 'হ্যাঁ, বাতিল', async () => {
    setBusy(r.offer_id); setMsg(null);
    try { await cancelCallback(r.id); setMsg({ kind: 'ok', text: 'অনুরোধ বাতিল করা হয়েছে।' }); await load(kind); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(null); }
  });
  const callHelp = () => Linking.openURL(`tel:${help ? help.phone : ''}`).catch(() => {});
  const filters = { q, month, airport, maxPrice };
  const shown = filterOffers(rows || [], filters);
  const active = [q.trim() ? 1 : 0, month, airport, maxPrice].filter(Boolean).length;
  const clearAll = () => { setQ(''); setMonth(null); setAirport(null); setMaxPrice(null); };
  const months = monthOptions(rows || []);
  const badges = badgesFor(rows);                                    // over all packages of this kind
  const specials = active ? [] : featured(rows);                      // only on the plain list
  const bar = monthBar(rows);

  // ---- one package on its own page ----
  const open = openId && (rows || []).find((o) => o.id === openId);
  if (open) {
    const r = mine[open.id];
    const req = r && r.status === 'new';
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
        <Pressable onPress={() => setOpenId(null)} style={st.back} accessibilityRole="button" accessibilityLabel="সব প্যাকেজের তালিকায় ফিরে যান"><Text style={st.backT}>‹ সব প্যাকেজ</Text></Pressable>
        {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
        <OfferCard o={open}
          onProfile={open.leader_id ? () => navigation.navigate('Leaders', { id: open.leader_id }) : undefined}
          onMore={open.leader_code ? () => { setQ(open.leader_code); setMonth(null); setAirport(null); setMaxPrice(null); setOpenId(null); } : undefined}>
          <View style={[st.cRow, { paddingTop: S.sm }]}>
            <Text style={st.lbl}>আগ্রহী হলে</Text>
            {help && help.phone ? (
              <>
                <Button title="Travel Adda হেল্পলাইনে ফোন করুন" icon="📞" onPress={callHelp} a11yHint={`ফোনে প্যাকেজ নম্বর ${refOf(open.id)} বলুন`} />
                <Text style={st.small}>ফোনে বলুন: "প্যাকেজ নম্বর {refOf(open.id)}"{help.hours ? ` · সময়: ${help.hours}` : ''}</Text>
              </>
            ) : <Notice kind="info" title="হেল্পলাইন নম্বর শীঘ্রই আসছে" text='এখন "আমাকে ফোন করুন" চাপুন, টিম আপনাকে ফোন করবে।' />}
            {req ? (
              <>
                <Notice kind="ok" title="আপনার অনুরোধ পাঠানো আছে" text={`পাঠিয়েছেন: ${fmtDay(r.created_at)}। Travel Adda টিম আপনাকে ফোন করবে।`} />
                <Button title="অনুরোধ বাতিল করুন" kind="danger" onPress={() => cancel(r)} disabled={!!busy} />
              </>
            ) : (
              <>
                {r && r.status === 'contacted' ? <Text style={st.small}>✅ টিম আগে এই প্যাকেজ নিয়ে আপনার সাথে কথা বলেছে।</Text> : null}
                <Button title="আমাকে ফোন করুন" icon="🙋" kind="secondary" onPress={() => ask(open)} loading={busy === open.id} style={{ marginTop: S.sm }} />
              </>
            )}
          </View>
        </OfferCard>
        <Notice kind="info" title="জেনে রাখুন" text="চুক্তি হওয়ার পর টাকা শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে দিন, লিডারকে সরাসরি নয়। Travel Adda টাকা যাচাই করে লিডারকে দেয়, তাই আপনার টাকা নিরাপদ থাকে।" />
        <Button title="সব প্যাকেজের তালিকায় ফিরে যান" icon="‹" kind="secondary" onPress={() => setOpenId(null)} style={{ marginBottom: S.xl }} />
      </ScrollView>
    );
  }

  // ---- list with search and filters ----
  return (
    <ScrollView ref={scroller} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Text style={st.title} accessibilityRole="header">🎁 অফার ও প্যাকেজ</Text>
      <FundCard onOpen={() => navigation.navigate('Fund')} />
      <Segmented options={[{ id: 'umrah', icon: '🔄', label: 'ওমরাহ' }, { id: 'hajj', icon: '🕋', label: 'হজ' }]} value={kind} onChange={(k) => { setRows(null); setKind(k); setMsg(null); setMonth(null); }} />
      <View style={{ height: S.sm }} />
      <Field label="লিডারের আইডি বা নাম দিয়ে খুঁজুন" hint="যেমন: TL-00004 বা এজেন্সির নাম" value={q} onChangeText={setQ} maxLength={40} autoCorrect={false} />
      <Button title={showFilters ? 'বাছাই লুকান' : active ? `বাছাই করুন (${toBn(active)}টি চালু)` : 'মাস, বিমানবন্দর ও দাম দিয়ে বাছাই করুন'} icon="🔎" kind="secondary"
        onPress={() => setShowFilters((v) => !v)} style={{ marginBottom: S.sm }} />
      {showFilters ? (
        <View style={st.card}>
          {monthFilterFor(kind) ? <MonthDropdown options={months} value={month} onChange={setMonth} /> : null}
          <Pills label="কোন বিমানবন্দর থেকে" options={AIRPORTS_BD.map((a) => ({ id: a.id, label: a.label }))} value={airport} onChange={setAirport} />
          <Field label="সর্বোচ্চ দাম, জনপ্রতি (টাকা)" hint="নিজে লিখুন, যেমন: ১৮০০০০ বা ২.৫ লাখ" value={priceText} onChangeText={setPriceText} keyboardType="default" maxLength={14}
            error={Number.isNaN(typed) ? 'দাম সংখ্যায় লিখুন, যেমন: ১৮০০০০' : undefined} />
          {maxPrice ? <Text style={[st.small, { marginTop: -S.xs, marginBottom: S.xs }]}>{fmtTaka(maxPrice)} বা তার কম দামের প্যাকেজ দেখানো হচ্ছে</Text> : null}
          <Pills label="অথবা এক চাপে বাছুন" options={PRICE_LIMITS.map((p) => ({ id: p, label: `${toBn(p / 100000)} লাখ টাকার মধ্যে` }))} value={maxPrice} onChange={setMaxPrice} />
        </View>
      ) : null}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' || (state === 'ok' && rows === null) ? <ActivityIndicator color={C.primary} style={{ marginTop: S.lg }} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই আসছে" text="যাচাই করা গ্রুপ লিডারদের হজ ও ওমরাহ প্যাকেজ এখানে দেখা যাবে।" /> : null}
      {state === 'err' ? <Notice kind="bad" title="প্যাকেজ আনা যায়নি" text="ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={() => load(kind)} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && rows && rows.length === 0 ? <Notice kind="info" title={`এখন কোনো ${KIND[kind].label} প্যাকেজ নেই`} text="লিডাররা প্যাকেজ দিলে এখানে দেখা যাবে। পরে আবার দেখুন।" /> : null}
      {state === 'ok' && rows && rows.length > 0 ? (
        <Text style={[st.small, { marginVertical: S.xs }]}>{active ? `${toBn(rows.length)}টির মধ্যে ${toBn(shown.length)}টি প্যাকেজ মিলেছে` : `${toBn(rows.length)}টি প্যাকেজ`} · কম দামেরগুলো আগে · সব প্যাকেজ অ্যাডমিন যাচাই করা</Text>
      ) : null}
      {state === 'ok' && rows && rows.length > 0 && shown.length === 0 ? (
        <Notice kind="info" title="এই বাছাইয়ে কোনো প্যাকেজ মেলেনি" text={q.trim() ? 'আইডি ঠিক লিখেছেন কিনা দেখুন, অথবা বাছাই কমিয়ে দেখুন।' : 'বাছাই কমিয়ে আবার দেখুন।'}>
          <Button title="সব বাছাই মুছে দিন" icon="✖️" kind="secondary" onPress={clearAll} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}
      {state === 'ok' ? <MonthBar months={bar} value={month} onChange={setMonth} /> : null}
      {state === 'ok' ? <Featured items={specials} onOpen={(id) => { setMsg(null); setOpenId(id); scroller.current?.scrollTo?.({ y: 0, animated: false }); }} /> : null}
      {specials.length ? <Text style={[st.p, { fontWeight: '700' }]} accessibilityRole="header">সব প্যাকেজ</Text> : null}
      {active && shown.length > 0 ? <Button title="সব বাছাই মুছে সব প্যাকেজ দেখুন" icon="✖️" kind="secondary" onPress={clearAll} style={{ marginBottom: S.sm }} /> : null}
      {state === 'ok' ? shown.map((o) => {
        const r = mine[o.id];
        return <OfferSummary key={o.id} o={o} badges={badges[o.id]} note={r && r.status === 'new' ? '📞 আপনার ফোনের অনুরোধ পাঠানো আছে' : null}
          onOpen={() => { setMsg(null); setOpenId(o.id); scroller.current?.scrollTo?.({ y: 0, animated: false }); }} />;
      }) : null}
      <Notice kind="info" title="জেনে রাখুন" text="চুক্তি হওয়ার পর টাকা শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে দিন, লিডারকে সরাসরি নয়। Travel Adda টাকা যাচাই করে লিডারকে দেয়, তাই আপনার টাকা নিরাপদ থাকে।" />
    </ScrollView>
  );
}
