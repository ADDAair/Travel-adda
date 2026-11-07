import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Linking, ActivityIndicator, Pressable, BackHandler } from 'react-native';
import ScrollView from '../components/KbScroll';
import { C, S, R, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { notReady } from '../lib/groups';
import { KIND, refOf, type Helpline, getHelpline, listOffers, myInterests, requestCallback, cancelCallback } from '../lib/offers';
import { st, errText, confirm, fmtDay, fmtTaka, fmtWhen } from './GroupScreen';
import { withCopy } from '../lib/offlineStore';
import { OfflineNote } from '../components/OfflineNote';
import { useMe, isLeaderAccount } from '../lib/me';
import LeaderOffersScreen from './LeaderOffersScreen';

import { OfferCard, OfferSummary, BadgePill } from '../components/OfferCard';
import { badgesFor, featured, monthBar, BADGE_TEXT, type Badge } from '../lib/offerList';
import { tr, lbl } from '../lib/lang';
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
  useEffect(() => { navigation?.setOptions?.({ title: leader ? tr('আমার প্যাকেজ', 'My packages') : tr('অফার ও প্যাকেজ', 'Offers and packages') }); }, [leader, navigation]);
  if (!leader) return <HajiOffers navigation={navigation} route={route} />;
  if (!me || me.role !== 'leader') return <PendingLeader navigation={navigation} />;
  return <LeaderOffersScreen navigation={navigation} inTab />;
}

// Leader account not approved yet: packages can be added after the admin's approval.
function PendingLeader({ navigation }: { navigation: Nav }) {
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Text style={st.title} accessibilityRole="header">{tr('🎁 আমার প্যাকেজ', '🎁 My packages')}</Text>
      <Notice kind="info" title={tr('অনুমোদনের পর প্যাকেজ দিতে পারবেন', 'You can add packages after approval')} text={tr('অ্যাডমিন আপনার লাইসেন্স যাচাই করে অনুমোদন দিলে এখানে ওমরাহ ও হজ প্যাকেজ যোগ করতে পারবেন। হাজীরা তখন "অফার" পাতায় আপনার প্যাকেজ দেখবেন।', 'Once the admin checks your licence and approves, you can add Umrah and Hajj packages here. Hajis will then see them on the "Offers" page.')} />
      <Button title={tr('লিডার নিবন্ধনের অবস্থা দেখুন', 'See your leader registration status')} icon="🧭" onPress={() => navigation.navigate('LeaderApply')} />
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
              accessibilityLabel={`${label}: ${o.label}${on ? tr(', বাছাই করা, বাদ দিতে আবার চাপুন', ', chosen, tap again to remove') : ''}`}
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

// One button that says what is chosen; tapping it opens the list (owner request: dropdowns, not rows of buttons).
function Dropdown<T extends string | number>({ label, name, icon, options, value, onChange, allText, noneText, valueText, note }:
  { label: string; name: string; icon: string; options: { id: T; label: string }[]; value: T | null; onChange: (v: T | null) => void;
    allText: string; noneText: string; valueText?: string; note?: string }) {
  const [open, setOpen] = useState(false);
  const pick = (id: T | null) => { onChange(id); setOpen(false); };
  const cur = valueText || (value == null ? noneText : (options.find((o) => o.id === value) || { label: String(value) }).label);
  const Item = ({ id, text }: { id: T | null; text: string }) => {
    const on = value === id;
    return (
      <Pressable onPress={() => pick(id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${text}${on ? tr(', বাছাই করা', ', chosen') : ''}`}
        style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.md, borderTopWidth: 1, borderColor: C.line, backgroundColor: on ? C.primarySoft : C.card }}>
        <Text style={st.p}>{on ? '✓ ' : '   '}{text}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ marginBottom: S.md }}>
      <Text style={[st.small, { fontWeight: '700' }]}>{label}</Text>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={tr(`${name}: ${cur}। ${open ? 'তালিকা বন্ধ করতে' : 'অন্যটি বাছতে'} চাপুন`, `${name}: ${cur}. Tap to ${open ? 'close the list' : 'choose another'}`)}
        style={{ minHeight: TOUCH + 8, flexDirection: 'row', alignItems: 'center', marginTop: S.xs, paddingHorizontal: S.md, borderRadius: R.md, borderWidth: 2, borderColor: C.primary, backgroundColor: C.card }}>
        <Text style={[st.p, { flex: 1 }]}>{icon} {cur}</Text>
        <Text style={[st.p, { color: C.primary }]}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open ? (
        <View style={{ borderWidth: 2, borderTopWidth: 0, borderColor: C.primary, borderBottomLeftRadius: R.md, borderBottomRightRadius: R.md, overflow: 'hidden' }}>
          <Item id={null} text={allText} />
          {options.map((o) => <Item key={String(o.id)} id={o.id} text={o.label} />)}
          {note ? <Text style={[st.small, { padding: S.sm }]}>{note}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

// Umrah month inside the filters (every month of the coming year, with counts).
function MonthDropdown({ options, value, onChange }: { options: { id: string; label: string }[]; value: string | null; onChange: (v: string | null) => void }) {
  return <Dropdown label={tr('কোন মাসে যাবেন', 'Which month will you go')} name={tr('মাস', 'Month')} icon="📅" options={options} value={value} onChange={onChange} allText={tr('সব মাস একসাথে', 'All months together')} noneText={tr('সব মাস', 'All months')}
    note={tr('বন্ধনীতে লেখা আছে সেই মাসে কয়টি প্যাকেজ আছে।', 'The number in brackets is how many packages leave that month.')} />;
}

// Two "special" cards above the list (cheapest, newest), chosen by the app from the packages themselves.
function Featured({ items, onOpen }: { items: { o: PackageRow; why: Badge }[]; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: S.sm }}>
      <Text style={[st.p, { fontWeight: '700' }]} accessibilityRole="header">{tr('⭐ বিশেষ অফার', '⭐ Special offers')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.xs }}>
        {items.map(({ o, why }) => (
          <Pressable key={o.id} onPress={() => onOpen(o.id)} accessibilityRole="button"
            accessibilityLabel={tr(`বিশেষ অফার, ${BADGE_TEXT[why].replace(/^\S+ /, '')}: ${o.title}। ${fmtTaka(o.price_bdt)} জনপ্রতি। ${toBn(daysOf(o))} দিন। দেখতে চাপুন`, `Special offer, ${BADGE_TEXT[why].replace(/^\S+ /, '')}: ${o.title}. ${fmtTaka(o.price_bdt)} per person. ${daysOf(o)} days. Tap to see`)}
            style={({ pressed }) => ({ flexGrow: 1, flexBasis: '45%', minWidth: 150, backgroundColor: C.card, borderRadius: R.lg, borderWidth: 2, borderColor: C.gold, padding: S.sm, opacity: pressed ? 0.85 : 1 })}>
            <BadgePill b={why} />
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, lineHeight: 32, marginTop: 2 }}>{fmtTaka(o.price_bdt)}</Text>
            <Text style={[st.p, { fontWeight: '700', color: C.primary }]} numberOfLines={2}>{o.title}</Text>
            <Text style={st.small}>{tr(`${toBn(daysOf(o))} দিন · দেখুন ›`, `${daysOf(o)} days · See ›`)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Month choice above the list once there are many packages: only months that have packages, each with its lowest price.
function MonthBar({ months, value, onChange }: { months: { id: string; label: string; count: number; from: number }[]; value: string | null; onChange: (v: string | null) => void }) {
  if (!months.length) return null;
  return <Dropdown label={tr('📅 কোন মাসে যাবেন', '📅 Which month will you go')} name={tr('মাস', 'Month')} icon="📅" value={value} onChange={onChange} allText={tr('সব মাস একসাথে', 'All months together')} noneText={tr('সব মাস', 'All months')}
    options={months.map((m) => ({ id: m.id, label: tr(`${m.label} · ${fmtTaka(m.from)} থেকে (${toBn(m.count)}টি)`, `${m.label} · from ${fmtTaka(m.from)} (${m.count})`) }))} />;
}

function HajiOffers({ navigation, route }: { navigation: Nav; route?: Route }) {
  const [kind, setKind] = useState('umrah');
  const [rows, setRows] = useState<PackageRow[] | null>(null);
  const [state, setState] = useState('load');
  const [help, setHelp] = useState<Helpline | null>(null);
  const [mine, setMine] = useState<Res<typeof myInterests>>({});
  const [offAt, setOffAt] = useState<number | null>(null);   // showing the list saved on this phone (no internet)
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
      const x = await withCopy(`offers.${k}`, () => Promise.all([listOffers(k), myInterests()]));   // offline step 2
      const [r, m] = x.data;
      setRows(r); setMine(m); setOffAt(x.offline ? x.at : null); setState('ok');
    } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(kind); }, [kind, load]);
  useEffect(() => navigation?.addListener?.('focus', () => load(kind)), [navigation, kind, load]);
  useEffect(() => {
    if (!openId) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpenId(null); return true; });
    return () => sub.remove();
  }, [openId]);

  const ask = (o: PackageRow) => confirm(tr('আপনাকে ফোন করার অনুরোধ পাঠাবেন?', 'Send a request to call you?'),
    tr('আপনার নাম ও মোবাইল নম্বর শুধু Travel Adda টিম দেখবে। টিম আপনাকে ফোন করে লিডারের সাথে কথা বলার ব্যবস্থা করবে।', 'Only the Travel Adda team will see your name and mobile number. The team will call you and arrange a talk with the leader.'),
    tr('হ্যাঁ, পাঠান', 'Yes, send'), async () => {
      if (busy) return;
      setBusy(o.id); setMsg(null);
      try { await requestCallback(o.id); setMsg({ kind: 'ok', text: tr('অনুরোধ পাঠানো হয়েছে। Travel Adda টিম আপনাকে ফোন করবে।', 'Request sent. The Travel Adda team will call you.') }); await load(kind); }
      catch (e) {
        const { code, message: m } = errInfo(e);
        if (code === '23505') setMsg({ kind: 'info', text: tr('এই প্যাকেজের জন্য আপনার অনুরোধ আগেই পাঠানো আছে।', 'Your request for this package was already sent.') });
        else if (code === '42501' || /row-level security/i.test(m)) setMsg({ kind: 'warn', text: tr('অনুরোধ পাঠানো যায়নি। হয়তো প্যাকেজটি আর নেই, অথবা আপনার ১০টি অনুরোধ এখনো খোলা আছে।', 'The request could not be sent. Maybe the package is gone, or you already have 10 open requests.') });
        else setMsg({ kind: 'bad', text: errText(e) });
      } finally { setBusy(null); }
    });
  const cancel = (r: Res<typeof myInterests>[string]) => confirm(tr('অনুরোধটি বাতিল করবেন?', 'Cancel this request?'), tr('টিম আর এই প্যাকেজের জন্য আপনাকে ফোন করবে না।', 'The team will not call you about this package.'), tr('হ্যাঁ, বাতিল', 'Yes, cancel'), async () => {
    setBusy(r.offer_id); setMsg(null);
    try { await cancelCallback(r.id); setMsg({ kind: 'ok', text: tr('অনুরোধ বাতিল করা হয়েছে।', 'Request cancelled.') }); await load(kind); }
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
        <Pressable onPress={() => setOpenId(null)} style={st.back} accessibilityRole="button" accessibilityLabel={tr('সব প্যাকেজের তালিকায় ফিরে যান', 'Back to the list of all packages')}><Text style={st.backT}>{tr('‹ সব প্যাকেজ', '‹ All packages')}</Text></Pressable>
        {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
        <OfferCard o={open}
          onProfile={open.leader_id ? () => navigation.navigate('Leaders', { id: open.leader_id }) : undefined}
          onMore={open.leader_code ? () => { setQ(open.leader_code); setMonth(null); setAirport(null); setMaxPrice(null); setOpenId(null); } : undefined}>
          <View style={[st.cRow, { paddingTop: S.sm }]}>
            <Text style={st.lbl}>{tr('আগ্রহী হলে', 'If you are interested')}</Text>
            {help && help.phone ? (
              <>
                <Button title={tr('Travel Adda হেল্পলাইনে ফোন করুন', 'Call the Travel Adda helpline')} icon="📞" onPress={callHelp} a11yHint={tr(`ফোনে প্যাকেজ নম্বর ${refOf(open.id)} বলুন`, `Say package number ${refOf(open.id)} on the phone`)} />
                <Text style={st.small}>{tr(`ফোনে বলুন: "প্যাকেজ নম্বর ${refOf(open.id)}"`, `On the phone say: "package number ${refOf(open.id)}"`)}{help.hours ? ` · ${tr('সময়', 'hours')}: ${help.hours}` : ''}</Text>
              </>
            ) : <Notice kind="info" title={tr('হেল্পলাইন নম্বর শীঘ্রই আসছে', 'Helpline number coming soon')} text={tr('এখন "আমাকে ফোন করুন" চাপুন, টিম আপনাকে ফোন করবে।', 'For now tap "Call me" and the team will call you.')} />}
            {req ? (
              <>
                <Notice kind="ok" title={tr('আপনার অনুরোধ পাঠানো আছে', 'Your request has been sent')} text={tr(`পাঠিয়েছেন: ${fmtDay(r.created_at)}। Travel Adda টিম আপনাকে ফোন করবে।`, `Sent: ${fmtDay(r.created_at)}. The Travel Adda team will call you.`)} />
                <Button title={tr('অনুরোধ বাতিল করুন', 'Cancel the request')} kind="danger" onPress={() => cancel(r)} disabled={!!busy} />
              </>
            ) : (
              <>
                {r && r.status === 'contacted' ? <Text style={st.small}>{tr('✅ টিম আগে এই প্যাকেজ নিয়ে আপনার সাথে কথা বলেছে।', '✅ The team has already talked with you about this package.')}</Text> : null}
                <Button title={tr('আমাকে ফোন করুন', 'Call me')} icon="🙋" kind="secondary" onPress={() => ask(open)} loading={busy === open.id} style={{ marginTop: S.sm }} />
              </>
            )}
          </View>
        </OfferCard>
        <Notice kind="info" title={tr('জেনে রাখুন', 'Good to know')} text={tr('চুক্তি হওয়ার পর টাকা শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে দিন, লিডারকে সরাসরি নয়। Travel Adda টাকা যাচাই করে লিডারকে দেয়, তাই আপনার টাকা নিরাপদ থাকে।', 'After the contract, pay only into Travel Adda\'s official account, never to the leader directly. Travel Adda checks the money and passes it to the leader, so your money stays safe.')} />
        <Button title={tr('সব প্যাকেজের তালিকায় ফিরে যান', 'Back to the list of all packages')} icon="‹" kind="secondary" onPress={() => setOpenId(null)} style={{ marginBottom: S.xl }} />
      </ScrollView>
    );
  }

  // ---- list with search and filters ----
  return (
    <ScrollView ref={scroller} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Text style={st.title} accessibilityRole="header">{tr('🎁 অফার ও প্যাকেজ', '🎁 Offers and packages')}</Text>
      <FundCard onOpen={() => navigation.navigate('Fund')} />
      <Segmented options={[{ id: 'umrah', icon: '🔄', label: tr('ওমরাহ', 'Umrah') }, { id: 'hajj', icon: '🕋', label: tr('হজ', 'Hajj') }]} value={kind} onChange={(k) => { setRows(null); setKind(k); setMsg(null); setMonth(null); }} />
      <View style={{ height: S.sm }} />
      <Field label={tr('লিডারের আইডি বা নাম দিয়ে খুঁজুন', 'Search by leader ID or name')} hint={tr('যেমন: TL-00004 বা এজেন্সির নাম', 'e.g. TL-00004 or the agency name')} value={q} onChangeText={setQ} maxLength={40} autoCorrect={false} />
      <Button title={showFilters ? tr('বাছাই লুকান', 'Hide filters') : active ? tr(`বাছাই করুন (${toBn(active)}টি চালু)`, `Filter (${active} on)`) : tr('মাস, বিমানবন্দর ও দাম দিয়ে বাছাই করুন', 'Filter by month, airport and price')} icon="🔎" kind="secondary"
        onPress={() => setShowFilters((v) => !v)} style={{ marginBottom: S.sm }} />
      {showFilters ? (
        <View style={st.card}>
          {monthFilterFor(kind) && !bar.length ? <MonthDropdown options={months} value={month} onChange={setMonth} /> : null}
          <Pills label={tr('কোন বিমানবন্দর থেকে', 'From which airport')} options={AIRPORTS_BD.map((a) => ({ id: a.id, label: lbl(a) }))} value={airport} onChange={setAirport} />
          <Field label={tr('সর্বোচ্চ দাম, জনপ্রতি (টাকা)', 'Highest price per person (taka)')} hint={tr('নিজে লিখুন, যেমন: ১৮০০০০ বা ২.৫ লাখ', 'Type it, e.g. 180000 or 2.5 lakh')} value={priceText} onChangeText={setPriceText} keyboardType="default" maxLength={14}
            error={Number.isNaN(typed) ? tr('দাম সংখ্যায় লিখুন, যেমন: ১৮০০০০', 'Write the price in numbers, e.g. 180000') : undefined} />
          {maxPrice ? <Text style={[st.small, { marginTop: -S.xs, marginBottom: S.xs }]}>{tr(`${fmtTaka(maxPrice)} বা তার কম দামের প্যাকেজ দেখানো হচ্ছে`, `Showing packages of ${fmtTaka(maxPrice)} or less`)}</Text> : null}
          <Dropdown label={tr('অথবা এক চাপে বাছুন', 'Or choose with one tap')} name={tr('দামের সীমা', 'Price limit')} icon="💰" value={maxPrice && PRICE_LIMITS.includes(maxPrice) ? maxPrice : null} onChange={setMaxPrice}
            allText={tr('দামের কোনো সীমা নেই', 'No price limit')} noneText={tr('দামের সীমা নেই', 'No price limit')} valueText={maxPrice && !PRICE_LIMITS.includes(maxPrice) ? tr(`${fmtTaka(maxPrice)} (নিজে লেখা)`, `${fmtTaka(maxPrice)} (typed)`) : undefined}
            options={PRICE_LIMITS.map((p) => ({ id: p, label: tr(`${toBn(p / 100000)} লাখ টাকার মধ্যে`, `Up to ${p / 100000} lakh taka`) }))} />
        </View>
      ) : null}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'ok' && offAt ? <OfflineNote when={fmtWhen(offAt)} /> : null}
      {state === 'load' || (state === 'ok' && rows === null) ? <ActivityIndicator color={C.primary} style={{ marginTop: S.lg }} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই আসছে', 'Coming soon')} text={tr('যাচাই করা গ্রুপ লিডারদের হজ ও ওমরাহ প্যাকেজ এখানে দেখা যাবে।', 'Hajj and Umrah packages from verified group leaders will be shown here.')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('প্যাকেজ আনা যায়নি', 'Could not get the packages')} text={tr('ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'Check the internet connection and try again.')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={() => load(kind)} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' && rows && rows.length === 0 ? <Notice kind="info" title={tr(`এখন কোনো ${KIND[kind].label} প্যাকেজ নেই`, `No ${KIND[kind].label} packages now`)} text={tr('লিডাররা প্যাকেজ দিলে এখানে দেখা যাবে। পরে আবার দেখুন।', 'Packages will show here when leaders add them. Check again later.')} /> : null}
      {state === 'ok' && rows && rows.length > 0 ? (
        <Text style={[st.small, { marginVertical: S.xs }]}>{active ? tr(`${toBn(rows.length)}টির মধ্যে ${toBn(shown.length)}টি প্যাকেজ মিলেছে`, `${shown.length} of ${rows.length} packages match`) : tr(`${toBn(rows.length)}টি প্যাকেজ`, `${rows.length} package${rows.length === 1 ? '' : 's'}`)} · {tr('কম দামেরগুলো আগে · সব প্যাকেজ অ্যাডমিন যাচাই করা', 'cheapest first · all packages checked by the admin')}</Text>
      ) : null}
      {state === 'ok' && rows && rows.length > 0 && shown.length === 0 ? (
        <Notice kind="info" title={tr('এই বাছাইয়ে কোনো প্যাকেজ মেলেনি', 'No package matches these filters')} text={q.trim() ? tr('আইডি ঠিক লিখেছেন কিনা দেখুন, অথবা বাছাই কমিয়ে দেখুন।', 'Check the ID, or use fewer filters.') : tr('বাছাই কমিয়ে আবার দেখুন।', 'Use fewer filters and look again.')}>
          <Button title={tr('সব বাছাই মুছে দিন', 'Clear all filters')} icon="✖️" kind="secondary" onPress={clearAll} style={{ marginTop: S.sm }} />
        </Notice>
      ) : null}
      {state === 'ok' ? <MonthBar months={bar} value={month} onChange={setMonth} /> : null}
      {state === 'ok' ? <Featured items={specials} onOpen={(id) => { setMsg(null); setOpenId(id); scroller.current?.scrollTo?.({ y: 0, animated: false }); }} /> : null}
      {specials.length ? <Text style={[st.p, { fontWeight: '700' }]} accessibilityRole="header">{tr('সব প্যাকেজ', 'All packages')}</Text> : null}
      {active && shown.length > 0 ? <Button title={tr('সব বাছাই মুছে সব প্যাকেজ দেখুন', 'Clear filters and see all packages')} icon="✖️" kind="secondary" onPress={clearAll} style={{ marginBottom: S.sm }} /> : null}
      {state === 'ok' ? shown.map((o) => {
        const r = mine[o.id];
        return <OfferSummary key={o.id} o={o} badges={badges[o.id]} note={r && r.status === 'new' ? tr('📞 আপনার ফোনের অনুরোধ পাঠানো আছে', '📞 Your call request has been sent') : null}
          onOpen={() => { setMsg(null); setOpenId(o.id); scroller.current?.scrollTo?.({ y: 0, animated: false }); }} />;
      }) : null}
      <Notice kind="info" title={tr('জেনে রাখুন', 'Good to know')} text={tr('চুক্তি হওয়ার পর টাকা শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে দিন, লিডারকে সরাসরি নয়। Travel Adda টাকা যাচাই করে লিডারকে দেয়, তাই আপনার টাকা নিরাপদ থাকে।', 'After the contract, pay only into Travel Adda\'s official account, never to the leader directly. Travel Adda checks the money and passes it to the leader, so your money stays safe.')} />
    </ScrollView>
  );
}
