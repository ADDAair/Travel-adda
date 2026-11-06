import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { View, Text, Pressable, ActivityIndicator, BackHandler } from 'react-native';
import { tr } from '../lib/lang';
import ScrollView from '../components/KbScroll';
import { C, S, R, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { toBn, normalizeDigits } from '../lib/phone';
import { notReady } from '../lib/groups';
import { INCLUDES, includesFor, cleanIncludes, myOffers, createOffer, updateOffer, setOfferActive, myInterestCounts, canEditOffer, reviewLabel, reviewOf, offerErrorText, offerReviewReady, setOfferSeats } from '../lib/offers';
import { seatsLine, SEATS_FRESH_DAYS } from '../lib/offerList';
import { st, errText, confirm } from './GroupScreen';
import { parseDate } from '../lib/dates';
import { OfferCard, OfferSummary } from '../components/OfferCard';
import FundCard from '../components/FundCard';
import { AIRPORTS_BD, AIRPORTS_SA, CITIES, checkRoute, routeRow, hasRoute, type RouteForm } from '../lib/offerRoute';
import type { Msg, Nav } from './navTypes';
import type { OwnPackage, Res } from '../lib/types';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const statusOf = (o: OwnPackage): string => (o.hidden_by_admin ? tr('⛔ অ্যাডমিন লুকিয়ে রেখেছেন', '⛔ Hidden by the admin') : reviewLabel(o) ? String(reviewLabel(o)) : !o.active ? tr('🙈 আপনি লুকিয়ে রেখেছেন', '🙈 Hidden by you') : o.return_on < today() ? tr('⌛ তারিখ পার হয়ে গেছে', '⌛ The date has passed')
  : o.valid_until && o.valid_until < today() ? tr('⌛ অফারের শেষ তারিখ পার হয়েছে', '⌛ The offer\'s last date has passed') : tr('✅ অনুমোদিত, হাজীরা দেখতে পাচ্ছেন', '✅ Approved, hajis can see it'));
const dateIn = (iso: string | null | undefined): string => (iso ? toBn(String(iso).split('-').reverse().join('-')) : '');

// Verified leaders send packages for the Offers page. The admin checks each one first (step 019); until it is approved
// the leader can change it. After approval it cannot be changed (no bait-and-switch), only hidden.
export default function LeaderOffersScreen({ navigation, inTab }: { navigation: Nav; inTab?: boolean }): JSX.Element {
  const [rows, setRows] = useState<OwnPackage[] | null>(null);
  const [counts, setCounts] = useState<Res<typeof myInterestCounts>>({});
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');
  const [form, setForm] = useState<'new' | OwnPackage | null>(null);              // null | 'new' | the package being changed
  const [reviewOn, setReviewOn] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);           // package shown on its own page
  useEffect(() => {
    if (!openId) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpenId(null); return true; });
    return () => sub.remove();
  }, [openId]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    try { const [r, c, on] = await Promise.all([myOffers(), myInterestCounts(), offerReviewReady()]); setRows(r); setCounts(c); setReviewOn(on); setState('ok'); }
    catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (o: OwnPackage) => confirm(o.active ? tr('প্যাকেজটি লুকাবেন?', 'Hide the package?') : tr('প্যাকেজটি আবার দেখাবেন?', 'Show the package again?'), o.active ? tr('হাজীরা আর এটি দেখতে পাবেন না।', 'Hajis will no longer see it.') : '', o.active ? tr('হ্যাঁ, লুকান', 'Yes, hide') : tr('হ্যাঁ, দেখান', 'Yes, show'), async () => {
    setBusy(true); setMsg(null);
    try { await setOfferActive(o.id, !o.active); await load(); setMsg({ kind: 'ok', text: o.active ? tr('প্যাকেজ লুকানো হয়েছে।', 'Package hidden.') : tr('প্যাকেজ আবার দেখানো হচ্ছে।', 'The package is shown again.') }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string } | null)?.code === '42501' ? tr('একসাথে ২০টির বেশি প্যাকেজ দেখানো যায় না।', 'No more than 20 packages can be shown at once.') : errText(e) }); }
    finally { setBusy(false); }
  });

  if (form) {
    const editing = form !== 'new' ? form : null;
    return <OfferForm initial={editing} reviewOn={reviewOn} onDone={(saved: boolean) => {
      setForm(null);
      if (saved) {
        setMsg({ kind: 'ok', text: editing ? tr('বদল সংরক্ষণ হয়েছে। অ্যাডমিন আবার দেখে অনুমোদন দেবেন।', 'Changes saved. The admin will look again and approve.')
          : reviewOn ? tr('প্যাকেজ জমা হয়েছে। অ্যাডমিন দেখে অনুমোদন দিলে হাজীরা "অফার" পাতায় দেখবেন। তার আগ পর্যন্ত চাইলে বদলাতে পারবেন।', 'Package sent. When the admin approves it, hajis will see it on the "Offers" page. Until then you can change it.')
            : tr('প্যাকেজ প্রকাশ হয়েছে। হাজীরা এখন "অফার" পাতায় দেখতে পাবেন।', 'Package published. Hajis can now see it on the "Offers" page.') });
        load();
      }
    }} />;
  }

  const actions = (o: OwnPackage) => {
    const c = counts[o.id];
    return (
      <View style={st.cRow}>
        <Text style={st.val}>{statusOf(o)}</Text>
        {canEditOffer(o) ? <Button title={tr('প্যাকেজটি বদলান', 'Change the package')} icon="✏️" onPress={() => { setMsg(null); setForm(o); }} disabled={busy} style={{ marginTop: S.sm }} /> : null}
        {o.return_on >= today() ? <SeatsBox o={o} onSaved={load} /> : null}
        <Text style={st.p}>{tr(`🙋 আগ্রহী: ${toBn(c ? c.total : 0)} জন`, `🙋 Interested: ${c ? c.total : 0}`)}{c && c.open ? tr(` (টিমের ফোনের অপেক্ষায় ${toBn(c.open)} জন)`, ` (${c.open} waiting for the team's call)`) : ''}</Text>
        {!o.hidden_by_admin ? <Button title={o.active ? tr('প্যাকেজটি লুকান', 'Hide the package') : tr('আবার দেখান', 'Show again')} icon={o.active ? '🙈' : '👁️'} kind="secondary" onPress={() => toggle(o)} disabled={busy} style={{ marginTop: S.sm }} /> : null}
      </View>
    );
  };
  const opened = openId && (rows || []).find((x) => x.id === openId);
  if (opened) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
        <Pressable onPress={() => setOpenId(null)} style={st.back} accessibilityRole="button" accessibilityLabel={tr('আমার সব প্যাকেজের তালিকায় ফিরে যান', 'Back to the list of all my packages')}><Text style={st.backT}>{tr('‹ আমার সব প্যাকেজ', '‹ All my packages')}</Text></Pressable>
        {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
        <Text style={[st.small, { marginBottom: S.sm }]}>{tr('হাজীরা প্যাকেজটি ঠিক এভাবেই দেখবেন।', 'Hajis will see the package exactly like this.')}</Text>
        <OfferCard o={opened}>{actions(opened)}</OfferCard>
        <Button title={tr('আমার সব প্যাকেজের তালিকায় ফিরে যান', 'Back to the list of all my packages')} icon="‹" kind="secondary" onPress={() => setOpenId(null)} style={{ marginBottom: S.xl }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {!inTab ? <Pressable onPress={() => navigation.navigate('Leader')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('লিডার প্যানেলে ফিরে যান', 'Back to the leader panel')}><Text style={st.backT}>{tr('‹ লিডার প্যানেল', '‹ Leader panel')}</Text></Pressable> : null}
      <FundCard onOpen={() => navigation.navigate('Fund')} />
      <Text style={st.title} accessibilityRole="header">{tr('🎁 আমার প্যাকেজ (অফার)', '🎁 My packages (offers)')}</Text>
      {state === 'ok' ? <Text style={[st.small, { marginBottom: S.sm }]}>{tr('ওমরাহ ও হজ প্যাকেজ এখান থেকে দিন। যেগুলো দিয়েছেন সেগুলো নিচে দেখবেন, চাইলে লুকাতে পারবেন।', 'Add Umrah and Hajj packages here. You will see the ones you added below, and can hide them.')}</Text> : null}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই চালু হবে', 'Coming soon')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('তথ্য আনা যায়নি', 'Could not load the information')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' ? (
        <>
          <Notice kind="info" title={tr('হাজীরা কীভাবে যোগাযোগ করবেন', 'How hajis will contact you')} text={tr('প্যাকেজে আপনার ফোন নম্বর দেখানো হয় না। আগ্রহী হাজীরা Travel Adda হেল্পলাইনে যোগাযোগ করবেন, টিম আপনার সাথে মিটিংয়ের ব্যবস্থা করবে। এখানে শুধু কতজন আগ্রহী তা দেখবেন।', 'Your phone number is not shown in the package. Interested hajis contact the Travel Adda helpline and the team arranges a meeting with you. Here you only see how many are interested.')} />
          <Button title={tr('নতুন প্যাকেজ দিন', 'Add a new package')} icon="➕" onPress={() => { setMsg(null); setForm('new'); }} style={{ marginBottom: S.md }} />
          {rows && rows.length === 0 ? <Notice kind="info" title={tr('এখনো কোনো প্যাকেজ দেননি', 'You have not added any packages yet')} /> : null}
          {(rows || []).map((o) => (
            <OfferSummary key={o.id} o={o} note={statusOf(o)} noteColor={o.review === 'pending' || o.review === 'rejected' ? C.warn : !o.active || o.hidden_by_admin ? C.muted : C.ok}
              onOpen={() => { setMsg(null); setOpenId(o.id); }} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

// 034: "⏳ আসন বাকি" — the leader says how many seats are left. Hajis see it for 14 days, then he says it again.
function SeatsBox({ o, onSaved }: { o: OwnPackage; onSaved: () => Promise<void> | void }): JSX.Element {
  const [text, setText] = useState(o.seats_left != null ? toBn(o.seats_left) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const now = seatsLine(o);
  const save = async (clear: boolean) => {
    if (busy) return;
    const t = normalizeDigits(text).trim();
    const n = clear ? null : Number(t);
    if (!clear && (!/^\d{1,3}$/.test(t) || (n as number) > 500)) { setMsg({ kind: 'bad', text: tr('০ থেকে ৫০০-এর মধ্যে একটি সংখ্যা লিখুন।', 'Write a number from 0 to 500.') }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await setOfferSeats(o.id, n);
      if (r === 'ok') { setMsg({ kind: 'ok', text: clear ? tr('আসন সংখ্যা মুছে দেওয়া হয়েছে।', 'The seat number has been cleared.') : n === 0 ? tr('জানানো হয়েছে: সব আসন শেষ।', 'Done: all seats taken.') : tr(`জানানো হয়েছে: ${toBn(n)}টি আসন বাকি।`, `Done: ${n} seat${n === 1 ? '' : 's'} left.`) }); if (clear) setText(''); await onSaved(); }
      else if (r === 'bad_value') setMsg({ kind: 'bad', text: tr('০ থেকে ৫০০-এর মধ্যে একটি সংখ্যা লিখুন।', 'Write a number from 0 to 500.') });
      else if (r === 'not_found') setMsg({ kind: 'warn', text: tr('এই প্যাকেজে আসন জানানো যায় না। হয়তো যাত্রার তারিখ পার হয়ে গেছে।', 'Seats cannot be set for this package. Maybe the travel date has passed.') });
      else setMsg({ kind: 'bad', text: tr('জানানো যায়নি। আবার চেষ্টা করুন।', 'Could not save it. Try again.') });
    } catch (e) { setMsg({ kind: notReady(e) ? 'info' : 'bad', text: notReady(e) ? tr('আসন জানানো শীঘ্রই চালু হবে।', 'Setting seats is coming soon.') : errText(e) }); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ marginTop: S.sm, paddingTop: S.sm, borderTopWidth: 1, borderColor: C.line }}>
      <Text style={st.lbl}>{tr('💺 আসন কয়টি বাকি', '💺 How many seats are left')}</Text>
      <Text style={st.p}>{now || (o.seats_left != null ? tr(`${toBn(SEATS_FRESH_DAYS)} দিনের বেশি আগে জানিয়েছিলেন, তাই হাজীরা এখন দেখছেন না। আবার জানান।`, `You said it more than ${SEATS_FRESH_DAYS} days ago, so hajis no longer see it. Say it again.`) : tr('এখনো জানাননি।', 'Not given yet.'))}</Text>
      <Text style={st.small}>{tr(`১০টি বা কম বাকি থাকলে হাজীরা "⏳ আসন বাকি" ব্যাজ দেখবেন। ০ লিখলে "আসন শেষ" দেখাবে। সংখ্যা ${toBn(SEATS_FRESH_DAYS)} দিন দেখানো হয়।`, `With 10 or fewer left, hajis see the "⏳ Seats left" badge. Writing 0 shows "Full". The number is shown for ${SEATS_FRESH_DAYS} days.`)}</Text>
      <Field label={tr('এখন কয়টি আসন বাকি আছে', 'How many seats are left now')} hint={tr('যেমন: ৫', 'e.g. 5')} value={text} onChangeText={setText} keyboardType="number-pad" maxLength={3} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Button title={tr('আসন সংখ্যা জানান', 'Save seat number')} icon="💺" onPress={() => save(false)} loading={busy} disabled={busy} />
      {o.seats_left != null ? <Button title={tr('আসন সংখ্যা মুছুন', 'Clear seat number')} icon="✖️" kind="secondary" onPress={() => save(true)} disabled={busy} style={{ marginTop: S.sm }} /> : null}
    </View>
  );
}

function Chip({ on, label, icon, onPress }: { on: boolean; label: string; icon: string; onPress: () => void }): JSX.Element {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}
      style={{ minHeight: TOUCH, width: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: S.xs, marginBottom: S.xs,
        borderRadius: R.md, borderWidth: 2, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primarySoft : C.card }}>
      <Text style={[st.p, { marginRight: S.sm }]}>{on ? '☑️' : '⬜'}</Text>
      <Text style={[st.p, { marginRight: S.sm }]}>{icon}</Text>
      <Text style={[st.p, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

// One choice from a short list, shown as big buttons. The error is said in words under it.
type Opt = { id: string; icon?: string; label: string; full?: string };
function Choice({ label, options, value, onChange, error }: { label: string; options: readonly Opt[]; value: string; onChange: (v: string) => void; error?: string }): JSX.Element {
  return (
    <View style={{ marginBottom: S.md }}>
      <Text style={st.lbl}>{label}</Text>
      <Segmented options={options.map((x) => ({ id: x.id, icon: x.icon, label: x.label, a11y: x.full || x.label }))} value={value} onChange={onChange} />
      {error ? <Text style={[st.small, { color: C.bad, fontWeight: '700', marginTop: 4 }]}>⚠️ {error}</Text> : null}
    </View>
  );
}

type OfferFields = { title: string; price: string; from: string; to: string; until?: string; mh: string; md: string; dh: string; dd: string; room: string; notes: string };
function OfferForm({ onDone, initial, reviewOn }: { onDone: (saved: boolean) => void; initial: OwnPackage | null; reviewOn: boolean }): JSX.Element {
  const o = initial;
  const [kind, setKindRaw] = useState<string>(o ? o.kind : 'umrah');
  const [f, setF] = useState<OfferFields>(o ? {
    title: o.title || '', price: o.price_bdt != null ? String(Math.round(Number(o.price_bdt))) : '', from: dateIn(o.depart_on), to: dateIn(o.return_on),
    until: dateIn(o.valid_until), mh: o.makkah_hotel || '', md: o.madinah_hotel || '', dh: o.makkah_distance_m != null ? String(o.makkah_distance_m) : '',
    dd: o.madinah_distance_m != null ? String(o.madinah_distance_m) : '', room: o.room_share != null ? String(o.room_share) : '', notes: o.notes || '',
  } : { title: '', price: '', from: '', to: '', mh: '', md: '', dh: '', dd: '', room: '', notes: '' });
  const [inc, setInc] = useState<Set<string>>(new Set<string>(o ? o.includes || [] : ['flight', 'visa']));
  type RouteText = { from: string; arrive: string; first: string; mk: string; md: string; back: string; to: string; airline: string };
  const [rt, setRt] = useState<RouteText>(o && hasRoute(o) ? { from: o.from_airport || '', arrive: o.arrive_at || '', first: o.first_city || '', mk: toBn(o.makkah_nights), md: toBn(o.madinah_nights),
    back: o.return_from || '', to: o.return_to || '', airline: o.airline || '' } : { from: 'DAC', arrive: 'JED', first: 'makkah', mk: '', md: '', back: '', to: 'DAC', airline: '' });
  const setR = (k: keyof RouteText) => (v: string) => setRt((x) => ({ ...x, [k]: v }));
  // umrah has no qurbani: switching to umrah removes it from the choices and from what was ticked
  const setKind = (k: string) => { setKindRaw(k); setInc((x) => new Set(cleanIncludes(k, [...x]))); };
  const [err, setErr] = useState<Record<string, string>>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof OfferFields) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const num = (v: string): number | null => { const t = normalizeDigits(v).replace(/[,\s]/g, ''); return t === '' ? null : Number(t); };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onDone(false); return true; });
    return () => sub.remove();
  }, [onDone]);

  const save = () => {
    if (busy) return;
    const e: Record<string, string> = {};
    const price = num(f.price); const from = parseDate(f.from); const to = parseDate(f.to); const until = parseDate(f.until || '');
    const mDist = num(f.dh); const dDist = num(f.dd); const room = num(f.room);
    if (f.title.trim().length < 2) e.title = tr('প্যাকেজের নাম লিখুন।', 'Write the package name.');
    if (price === null || !Number.isFinite(price) || price <= 0 || price >= 1e8) e.price = tr('জনপ্রতি দাম শুধু সংখ্যায় লিখুন (যেমন: 150000)।', 'Write the price per person in numbers only (e.g. 150000).');
    if (!from) e.from = tr('যাওয়ার তারিখ লিখুন, যেমন: ২০-০১-২০২৭', 'Write the departure date, e.g. 20-01-2027');
    else if (from < today()) e.from = tr('যাওয়ার তারিখ আজকের পরে হতে হবে।', 'The departure date must be after today.');
    if (!to) e.to = tr('ফেরার তারিখ লিখুন, যেমন: ০৩-০২-২০২৭', 'Write the return date, e.g. 03-02-2027');
    else if (from && to < from) e.to = tr('ফেরার তারিখ যাওয়ার তারিখের পরে হতে হবে।', 'The return date must be after the departure date.');
    else if (from && (Date.parse(to) - Date.parse(from)) / 86400000 > 120) e.to = tr('সফর ১২০ দিনের বেশি হতে পারে না।', 'The trip cannot be longer than 120 days.');
    if (until === null) e.until = tr('তারিখ এভাবে লিখুন: ১০-০১-২০২৭', 'Write the date like this: 10-01-2027');
    else if (until && until < today()) e.until = tr('শেষ তারিখ আজ বা পরের কোনো দিন হতে হবে।', 'The last date must be today or later.');
    else if (until && from && until > from) e.until = tr('অফারের শেষ তারিখ যাওয়ার তারিখের আগে বা সেদিন হতে হবে।', 'The offer\'s last date must be on or before the departure date.');
    if (mDist !== null && !(Number.isInteger(mDist) && mDist >= 0 && mDist <= 50000)) e.dh = tr('দূরত্ব মিটারে লিখুন (যেমন: 500)।', 'Write the distance in metres (e.g. 500).');
    if (dDist !== null && !(Number.isInteger(dDist) && dDist >= 0 && dDist <= 50000)) e.dd = tr('দূরত্ব মিটারে লিখুন (যেমন: 300)।', 'Write the distance in metres (e.g. 300).');
    if (room !== null && !(Number.isInteger(room) && room >= 1 && room <= 10)) e.room = tr('১ থেকে ১০ এর মধ্যে লিখুন।', 'Write a number from 1 to 10.');
    const days = from && to && to >= from ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 : 0;
    const re = checkRoute(rt as RouteForm, days);
    Object.keys(re).forEach((k) => { e[`r_${k}`] = re[k]; });
    setErr(e); setFail('');
    if (Object.keys(e).length) { setFail(tr('লাল চিহ্ন দেওয়া ঘরগুলো ঠিক করুন।', 'Fix the boxes marked in red.')); return; }
    if (price === null || !from || !to) return;   // already reported above; this only tells the type checker
    const ask = o ? [tr('বদলগুলো সংরক্ষণ করবেন?', 'Save the changes?'), tr('অ্যাডমিন আবার দেখে অনুমোদন দেবেন। অনুমোদনের পর আর বদলানো যাবে না।', 'The admin will look again and approve. After approval it cannot be changed.'), tr('হ্যাঁ, সংরক্ষণ করুন', 'Yes, save')]
      : reviewOn ? [tr('প্যাকেজটি জমা দেবেন?', 'Send the package?'), tr('অ্যাডমিন দেখে অনুমোদন দিলে হাজীরা দেখবেন। অনুমোদনের আগ পর্যন্ত বদলাতে পারবেন, পরে আর পারবেন না।', 'Hajis see it once the admin approves. You can change it until approval, not after.'), tr('হ্যাঁ, জমা দিন', 'Yes, send')]
        : [tr('প্যাকেজটি প্রকাশ করবেন?', 'Publish the package?'), tr('প্রকাশের পর দাম বা তথ্য বদলানো যাবে না, শুধু লুকানো যাবে। আরেকবার মিলিয়ে নিন।', 'After publishing, the price or details cannot be changed, only hidden. Check once more.'), tr('হ্যাঁ, প্রকাশ করুন', 'Yes, publish')];
    confirm(ask[0], ask[1], ask[2], async () => {
      setBusy(true);
      const row = {
        kind, title: f.title.trim(), price_bdt: price, depart_on: from, return_on: to,
        makkah_hotel: f.mh.trim() || null, makkah_distance_m: mDist, madinah_hotel: f.md.trim() || null, madinah_distance_m: dDist,
        room_share: room, includes: cleanIncludes(kind, INCLUDES.map((x) => x.id).filter((id) => inc.has(id))), notes: f.notes.trim() || null,
        ...routeRow(rt as RouteForm),
      };
      try {
        if (o) await updateOffer(o.id, { ...row, valid_until: until || null });
        else await createOffer({ ...(until ? { valid_until: until } : {}), ...row });
        onDone(true);
      } catch (err0) {
        const x = err0 as { code?: string; message?: string } | null;
        setFail(x?.code === '42501' ? tr('জমা দেওয়া যায়নি। একসাথে ২০টির বেশি প্যাকেজ রাখা যায় না; পুরোনো কোনোটি লুকান।', 'Could not send. No more than 20 packages at once; hide an old one.') : offerErrorText(x) || errText(x));
        setBusy(false);       // what was typed stays in the form
      }
    });
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => onDone(false)} style={st.back} accessibilityRole="button" accessibilityLabel={o ? tr('না বদলে ফিরে যান', 'Go back without changing') : tr('প্যাকেজ না দিয়ে ফিরে যান', 'Go back without adding the package')}><Text style={st.backT}>{tr('‹ ফিরে যান', '‹ Back')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{o ? tr('✏️ প্যাকেজ বদলান', '✏️ Change package') : tr('➕ নতুন প্যাকেজ', '➕ New package')}</Text>
      {o && reviewOf(o) === 'rejected' && o.review_note ? <Notice kind="warn" title={tr('অ্যাডমিন যা ঠিক করতে বলেছেন', 'What the admin asked you to fix')} text={o.review_note} /> : null}
      {fail ? <Notice kind="bad" title={fail} /> : null}
      <Text style={st.lbl}>{tr('প্যাকেজের ধরন', 'Kind of package')}</Text>
      <Segmented options={[{ id: 'umrah', icon: '🔄', label: tr('ওমরাহ', 'Umrah') }, { id: 'hajj', icon: '🕋', label: tr('হজ', 'Hajj') }]} value={kind} onChange={setKind} />
      <View style={{ height: S.md }} />
      <Field label={tr('প্যাকেজের নাম', 'Package name')} hint={tr('যেমন: রমজান ওমরাহ ১৫ দিন', 'e.g. Ramadan Umrah 15 days')} value={f.title} onChangeText={set('title')} maxLength={100} error={err.title} />
      <Field label={tr('জনপ্রতি মোট দাম (টাকা)', 'Total price per person (Tk)')} hint={tr('যেমন: 150000', 'e.g. 150000')} value={f.price} onChangeText={set('price')} keyboardType="numeric" maxLength={12} error={err.price} />
      <Field label={tr('যাওয়ার তারিখ', 'Departure date')} hint={tr('দিন-মাস-বছর, যেমন: ২০-০১-২০২৭', 'day-month-year, e.g. 20-01-2027')} value={f.from} onChangeText={set('from')} maxLength={10} error={err.from} />
      <Field label={tr('ফেরার তারিখ', 'Return date')} hint={tr('দিন-মাস-বছর, যেমন: ০৩-০২-২০২৭', 'day-month-year, e.g. 03-02-2027')} value={f.to} onChangeText={set('to')} maxLength={10} error={err.to} />
      <Field label={tr('অফার কোন তারিখ পর্যন্ত দেখাবে (ইচ্ছা করলে)', 'Show the offer until which date (optional)')} hint={tr('যেমন: ১০-০১-২০২৭। খালি রাখলে যাত্রার আগ পর্যন্ত', 'e.g. 10-01-2027. If empty, until departure')} value={f.until || ''} onChangeText={set('until')} maxLength={10} error={err.until} />
      <Text style={[st.h, { marginTop: S.md }]}>{tr('✈️ যাত্রাপথ', '✈️ Route')}</Text>
      <Text style={[st.small, { marginBottom: S.sm }]}>{tr('হাজীরা প্যাকেজে ধাপে ধাপে দেখবেন: কোথা থেকে যাত্রা, কোথায় কত রাত, কোথা দিয়ে ফেরা।', 'Hajis will see it step by step in the package: where you leave from, how many nights where, and the way back.')}</Text>
      <Choice label={tr('দেশের কোন বিমানবন্দর থেকে যাত্রা', 'Departure airport at home')} options={AIRPORTS_BD} value={rt.from} onChange={setR('from')} error={err.r_from} />
      <Choice label={tr('সৌদিতে কোথায় নামবেন', 'Arrival in Saudi Arabia')} options={AIRPORTS_SA} value={rt.arrive} onChange={setR('arrive')} error={err.r_arrive} />
      <Choice label={tr('আগে কোন শহরে থাকবেন', 'Which city first')} options={CITIES} value={rt.first} onChange={setR('first')} error={err.r_first} />
      <Field label={tr('মক্কায় কত রাত', 'Nights in Makkah')} hint={tr('যেমন: ৭', 'e.g. 7')} value={rt.mk} onChangeText={setR('mk')} keyboardType="numeric" maxLength={2} error={err.r_mk} />
      <Field label={tr('মদিনায় কত রাত (না থাকলে ০)', 'Nights in Madinah (0 if none)')} hint={tr('যেমন: ৫', 'e.g. 5')} value={rt.md} onChangeText={setR('md')} keyboardType="numeric" maxLength={2} error={err.r_md} />
      <Choice label={tr('সৌদির কোন বিমানবন্দর থেকে ফিরবেন', 'Return airport in Saudi Arabia')} options={AIRPORTS_SA} value={rt.back} onChange={setR('back')} error={err.r_back} />
      <Choice label={tr('দেশের কোন বিমানবন্দরে ফিরবেন', 'Arrival airport at home')} options={AIRPORTS_BD} value={rt.to} onChange={setR('to')} error={err.r_to} />
      <Field label={tr('বিমান কোম্পানি (ইচ্ছা করলে)', 'Airline (optional)')} hint={tr('যেমন: বিমান বাংলাদেশ, সৌদিয়া', 'e.g. Biman Bangladesh, Saudia')} value={rt.airline} onChangeText={setR('airline')} maxLength={60} />
      <Text style={[st.h, { marginTop: S.md }]}>{tr('🏨 হোটেল', '🏨 Hotels')}</Text>
      <Field label={tr('মক্কার হোটেলের নাম (ইচ্ছা করলে)', 'Makkah hotel name (optional)')} value={f.mh} onChangeText={set('mh')} maxLength={100} />
      <Field label={tr('মক্কার হোটেল থেকে হারামের দূরত্ব (মিটার)', 'Distance from the Makkah hotel to the Haram (metres)')} hint={tr('যেমন: 500', 'e.g. 500')} value={f.dh} onChangeText={set('dh')} keyboardType="numeric" maxLength={6} error={err.dh} />
      <Field label={tr('মদিনার হোটেলের নাম (ইচ্ছা করলে)', 'Madinah hotel name (optional)')} value={f.md} onChangeText={set('md')} maxLength={100} />
      <Field label={tr('মদিনার হোটেল থেকে মসজিদে নববীর দূরত্ব (মিটার)', 'Distance from the Madinah hotel to Masjid an-Nabawi (metres)')} hint={tr('যেমন: 300', 'e.g. 300')} value={f.dd} onChangeText={set('dd')} keyboardType="numeric" maxLength={6} error={err.dd} />
      <Field label={tr('এক রুমে কতজন (ইচ্ছা করলে)', 'People per room (optional)')} hint={tr('যেমন: 4', 'e.g. 4')} value={f.room} onChangeText={set('room')} keyboardType="numeric" maxLength={2} error={err.room} />
      <Text style={[st.lbl, { marginBottom: S.xs }]}>{tr('প্যাকেজে যা আছে (চাপ দিয়ে বাছুন)', 'What the package includes (tap to choose)')}</Text>
      <View style={{ marginBottom: S.md }}>
        {includesFor(kind).map((x) => <Chip key={x.id} on={inc.has(x.id)} icon={x.icon} label={x.label} onPress={() => setInc((s) => { const n = new Set(s); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })} />)}
      </View>
      <Field label={tr('আরও তথ্য (ইচ্ছা করলে)', 'More information (optional)')} hint={tr('যেমন: বয়স্কদের জন্য হুইলচেয়ার, মহিলা গাইড আছে', 'e.g. wheelchairs for the elderly, women guides available')} value={f.notes} onChangeText={set('notes')} multiline maxLength={1500} />
      <Button title={o ? tr('বদল সংরক্ষণ করুন', 'Save changes') : reviewOn ? tr('অনুমোদনের জন্য জমা দিন', 'Send for approval') : tr('প্যাকেজ প্রকাশ করুন', 'Publish the package')} icon={o ? '💾' : '📢'} onPress={save} loading={busy} />
      <Text style={[st.small, { marginTop: S.sm, marginBottom: S.xl }]}>{reviewOn ? tr('অ্যাডমিন অনুমোদন দেওয়ার আগ পর্যন্ত হাজীরা প্যাকেজটি দেখবেন না।', 'Hajis will not see the package until the admin approves it.') : ''}</Text>
    </ScrollView>
  );
}
