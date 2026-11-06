// Hajj & Umrah help fund (sadaqah only). Three parts on one page with tabs: give, apply, see where the money went.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Switch } from 'react-native';
import ScrollView from '../components/KbScroll';
import { C, S, R, F, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { st, fmtDay, confirm } from './GroupScreen';
import { toBn } from '../lib/phone';
import { tr, takaText } from '../lib/lang';
import { fundSummary, donate, myDonations, myConfirmedTotal, applyHelp, myHelpApplication, withdrawHelp, helpErrorText, personLabel,
  kindLabel, helpStatusText, fundPayInfo, fundTabs, recentDates, fundRules, donateAccess, donateAccessText, requestDonateAccess, requestAccessText,
  type FundSummary, type HelpForm, type DonateAccess } from '../lib/fund';
import { PAY_METHODS, PAY_STATUS } from '../lib/payments';
import DistrictPicker from '../components/DistrictPicker';
import { useMe } from '../lib/me';

type Nav = { navigate: (r: string, p?: object) => void };
type Msg = { kind: 'ok' | 'bad' | 'warn' | 'info'; text: string } | null;
const taka = (n: number): string => takaText(Math.round(n));

function Choice({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ marginBottom: S.md }}>
      <Text style={st.lbl}>{label}</Text>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
            style={{ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, marginTop: S.xs, borderRadius: R.md, borderWidth: 2,
              borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primarySoft : C.card }}>
            <Text style={[st.p, { width: 28, color: C.primary }]} importantForAccessibility="no">{on ? '✓' : ''}</Text>
            <Text style={[st.p, { flex: 1 }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={`${label}${hint ? `। ${hint}` : ''}`}
      style={{ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', marginBottom: S.md }}>
      <View style={{ flex: 1, paddingRight: S.sm }}>
        <Text style={st.p}>{label}</Text>
        {hint ? <Text style={st.small}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} importantForAccessibility="no" />
      <Text style={[st.small, { width: 40, textAlign: 'right' }]}>{value ? tr('হ্যাঁ', 'Yes') : tr('না', 'No')}</Text>
    </Pressable>
  );
}

// The fund's rules, folded by default; sending a gift or an application means agreeing to them.
function Rules() {
  const [open, setOpen] = useState(false);
  return (
    <View style={[st.card, { borderWidth: 1, borderColor: C.line }]}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ minHeight: TOUCH, justifyContent: 'center' }}>
        <Text style={st.h}>📜 {tr('তহবিলের নিয়ম', 'Fund rules')} {open ? '▲' : '▼'}</Text>
      </Pressable>
      {open ? fundRules().map((r, i) => <Text key={i} style={[st.p, { marginBottom: S.xs }]}>{toBn(i + 1)}. {r}</Text>) : <Text style={st.small}>{tr('জমা দেওয়ার আগে একবার পড়ে নিন (চাপলে খুলবে)।', 'Read once before giving (tap to open).')}</Text>}
    </View>
  );
}

export default function FundScreen({ navigation }: { navigation: Nav & { addListener?: (e: string, f: () => void) => () => void } }) {
  const [tab, setTab] = useState<'give' | 'apply' | 'report'>('give');
  const { me } = useMe();
  const tabs = fundTabs(me);
  const shown = tabs.some((t) => t.id === tab) ? tab : 'give';   // a leader never lands on "apply"
  const [s, setS] = useState<FundSummary | null | undefined>(undefined);
  const load = useCallback(() => { fundSummary().then(setS).catch(() => setS(null)); }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Offers')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('অফার পাতায় ফিরে যান', 'Back to the offers page')}>
        <Text style={st.backT}>{tr('‹ অফার ও প্যাকেজ', '‹ Offers and packages')}</Text>
      </Pressable>
      <View style={{ backgroundColor: C.goldSoft, borderColor: C.gold, borderWidth: 2, borderRadius: R.lg, padding: S.md, marginBottom: S.md }}>
        <Text style={{ fontSize: F.title, fontWeight: '700', color: C.text }} accessibilityRole="header">{tr('🤲 হজ-ওমরাহ সহায়তা তহবিল', '🤲 Hajj-Umrah help fund')}</Text>
        <Text style={[st.p, { marginTop: S.xs }]}>{tr('সামর্থ্যবানদের দানে সামর্থ্যহীন মানুষ আল্লাহর ঘরে যাবেন। সব হিসাব সবার সামনে।', 'With gifts from those who can, people who cannot afford it will go to the House of Allah. All accounts are open to everyone.')}</Text>
        {s === undefined ? <ActivityIndicator color={C.primary} style={{ marginTop: S.sm }} /> : null}
        {s ? (
          <View style={{ marginTop: S.sm }}>
            <Text style={{ fontSize: F.hero, fontWeight: '700', color: C.primary }}>{taka(s.collected)}</Text>
            <Text style={st.small}>{tr('মোট জমা (Travel Adda যাচাই করেছে)', 'Total received (checked by Travel Adda)')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.md, marginTop: S.sm }}>
              <Text style={st.p}>{tr(`🤝 দাতা: ${toBn(s.donors)} জন`, `🤝 Donors: ${s.donors}`)}</Text>
              <Text style={st.p}>{tr('💚 এখন তহবিলে', '💚 In the fund now')}: {taka(s.balance)}</Text>
              <Text style={st.p}>{tr(`🕋 সফর সম্পন্ন: ${toBn(s.travelled)} জন`, `🕋 Journeys completed: ${s.travelled}`)}</Text>
            </View>
          </View>
        ) : null}
        {s === null ? <Notice kind="info" title={tr('শীঘ্রই আসছে', 'Coming soon')} text={tr('তহবিলের এই অংশ এখনো চালু হয়নি।', 'This part of the fund is not on yet.')} /> : null}
        <Text style={[st.small, { marginTop: S.sm }]}>{tr('এটি সদকার তহবিল, যাকাতের নয়।', 'This is a sadaqah fund, not a zakat fund.')}</Text>
      </View>
      {s ? (
        <>
          <Segmented value={shown} onChange={(v: 'give' | 'apply' | 'report') => setTab(v)} options={tabs} />
          <View style={{ height: S.sm }} />
          {shown !== 'report' ? <Rules /> : null}
          {shown === 'give' ? <Give onDone={load} /> : shown === 'apply' ? <Apply /> : <Report s={s} />}
        </>
      ) : null}
    </ScrollView>
  );
}

// ---------- give ----------
// Giving needs Travel Adda's permission (028). Without it the form is hidden and one button asks for permission.
function Give({ onDone }: { onDone: () => void }) {
  const [access, setAccess] = useState<DonateAccess | null | undefined>(undefined);   // undefined = loading, null = could not load
  const [asking, setAsking] = useState(false);
  const [askMsg, setAskMsg] = useState<Msg>(null);
  const loadAccess = useCallback(() => { setAccess(undefined); donateAccess().then(setAccess).catch(() => setAccess(null)); }, []);
  useEffect(() => { loadAccess(); }, [loadAccess]);
  const ask = async () => {
    if (asking) return;
    setAsking(true); setAskMsg(null);
    try {
      const r = await requestDonateAccess();
      setAskMsg({ kind: r === 'requested' || r === 'already' || r === 'allowed' ? 'ok' : 'warn', text: requestAccessText(r) });
      donateAccess().then(setAccess).catch(() => {});
    } catch (e) { setAskMsg({ kind: 'bad', text: helpErrorText(e) }); }
    finally { setAsking(false); }
  };
  if (access === undefined) return <View style={st.card}><ActivityIndicator color={C.primary} accessibilityLabel={tr('অনুমতি দেখা হচ্ছে', 'Checking permission')} /></View>;
  if (access === null) return (
    <View style={st.card}>
      <Notice kind="bad" title={tr('তথ্য আনা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।', 'Could not load the information. Check the internet and try again.')} />
      <Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={loadAccess} />
    </View>
  );
  const m = donateAccessText(access);
  if (!m) return <GiveForm onDone={onDone} onNotAllowed={loadAccess} />;
  return (
    <>
      <View style={[st.card, { borderWidth: 2, borderColor: C.gold }]}>
        <Text style={st.h} accessibilityRole="header">{m.icon} {m.title}</Text>
        <Text style={[st.p, { marginBottom: S.sm }]}>{m.body}</Text>
        {askMsg ? <Notice kind={askMsg.kind} title={askMsg.text} /> : null}
        {m.canAsk ? <Button title={tr('অনুমতি চাই', 'Ask for permission')} icon="🙋" onPress={ask} loading={asking} /> : null}
      </View>
      <MyGifts />
    </>
  );
}

function MyGifts({ reload = 0 }: { reload?: number }) {
  const [mine, setMine] = useState<Awaited<ReturnType<typeof myDonations>> | null>(null);
  useEffect(() => { myDonations().then(setMine).catch(() => setMine([])); }, [reload]);
  if (mine && !mine.length) return null;
  const total = mine ? myConfirmedTotal(mine) : 0;
  return (
    <View style={st.card}>
      <Text style={st.h}>{tr('🧾 আমার দান', '🧾 My gifts')}</Text>
      {mine === null ? <ActivityIndicator color={C.primary} /> : null}
      {mine && mine.length ? <Text style={[st.val, { color: C.primary }]}>{tr('যাচাই করা মোট', 'Checked total')}: {taka(total)}</Text> : null}
      {(mine || []).map((d) => {
        const ps = (PAY_STATUS as Record<string, { icon: string; label: string }>)[d.status] || { icon: '', label: d.status };
        return <Text key={d.id} style={st.p}>{fmtDay(d.created_at)} · {taka(Number(d.amount))} · {ps.icon} {ps.label}{d.admin_note && d.status === 'rejected' ? ` (${d.admin_note})` : ''}</Text>;
      })}
    </View>
  );
}

function GiveForm({ onDone, onNotAllowed }: { onDone: () => void; onNotAllowed: () => void }) {
  const [info, setInfo] = useState<{ bank: string; bkash: string } | null>(null);
  const [reload, setReload] = useState(0);
  const dates = recentDates();
  const [f, setF] = useState({ amount: '', method: 'bkash', ref: '', paidOn: dates[0].ymd, showName: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { fundPayInfo().then(setInfo).catch(() => setInfo({ bank: '', bkash: '' })); }, []);
  const set = (k: string) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const send = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await donate({ amount: f.amount, method: f.method, ref: f.ref, paidOn: f.paidOn, showName: f.showName });
      if (r === 'ok') { setMsg({ kind: 'ok', text: tr('জমা দেওয়া হয়েছে। Travel Adda টাকা মিলিয়ে দেখলে মোট জমায় যোগ হবে, আর আপনি নোটিফিকেশন পাবেন। জাযাকাল্লাহু খাইরান।', 'Sent. When Travel Adda checks the money, it is added to the total and you get a notification. JazakAllahu khairan.') }); setF((x) => ({ ...x, amount: '', ref: '' })); setReload((n) => n + 1); onDone(); }
      else setMsg({ kind: 'warn', text: helpErrorText({ code: r || '' }) });
    } catch (e) {
      if ((e as { code?: string }).code === 'not_allowed') { onNotAllowed(); return; }   // permission was turned off meanwhile
      setMsg({ kind: 'bad', text: helpErrorText(e) });                                 // the form keeps what was typed
    }
    finally { setBusy(false); }
  };
  return (
    <>
      <View style={st.card}>
        <Text style={st.h}>{tr('১. টাকা পাঠান', '1. Send the money')}</Text>
        {info === null ? <ActivityIndicator color={C.primary} /> : (
          <>
            {info.bkash ? <Text style={st.p} selectable>📱 {tr('বিকাশ/নগদ', 'bKash/Nagad')}: {info.bkash}</Text> : null}
            {info.bank ? <Text style={st.p} selectable>🏦 {tr('ব্যাংক', 'Bank')}: {info.bank}</Text> : null}
            {!info.bkash && !info.bank ? <Text style={st.p}>{tr('টাকা পাঠানোর নম্বর শীঘ্রই দেওয়া হবে। এখন Travel Adda হেল্পলাইনে যোগাযোগ করুন।', 'The number to send money to will be given soon. For now contact the Travel Adda helpline.')}</Text> : null}
            <Text style={st.small}>{tr('শুধু এই অফিসিয়াল নম্বরে পাঠান। কাউকে হাতে টাকা দেবেন না।', 'Send only to this official number. Do not give money to anyone by hand.')}</Text>
          </>
        )}
      </View>
      <View style={st.card}>
        <Text style={st.h}>{tr('২. পাঠানোর পর এখানে লিখুন', '2. After sending, write it here')}</Text>
        <Field label={tr('কত টাকা', 'How much')} hint={tr('যেমন: ৫০০০', 'e.g. 5000')} value={f.amount} onChangeText={set('amount')} keyboardType="number-pad" maxLength={12} editable={!busy} />
        <Choice label={tr('কীভাবে পাঠিয়েছেন', 'How did you send it')} options={PAY_METHODS.map((m) => ({ id: m.id, label: `${m.icon} ${m.label}` }))} value={f.method} onChange={set('method')} />
        <Field label={tr('লেনদেন নম্বর (TrxID) বা রসিদ নম্বর', 'Transaction number (TrxID) or receipt number')} hint={tr('যেমন: 9A7B3C2D', 'e.g. 9A7B3C2D')} value={f.ref} onChangeText={set('ref')} autoCapitalize="characters" autoCorrect={false} maxLength={60} editable={!busy} />
        <DistrictPicker label={tr('কবে পাঠিয়েছেন (তারিখ)', 'When did you send it (date)')} noun={tr('তারিখ', 'date')} placeholder={tr('তারিখ বাছুন', 'Choose the date')} searchHint={tr('যেমন: ২৫ অক্টোবর', 'e.g. 25 October')}
          options={dates.map((d) => d.label)} value={(dates.find((d) => d.ymd === f.paidOn) || dates[0]).label}
          onChange={(label: string) => { const d = dates.find((x) => x.label === label); if (d) set('paidOn')(d.ymd); }} />
        <Toggle label={tr('আমার নাম দেখানো হোক', 'Show my name')} hint={tr('না দিলে সবাই শুধু টাকার পরিমাণ দেখবে, নাম গোপন থাকবে', 'If not, everyone sees only the amount; your name stays hidden')} value={f.showName} onChange={set('showName')} />
        {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
        <Text style={[st.small, { marginBottom: S.sm }]}>{tr('জমা দিলে আপনি ওপরের "তহবিলের নিয়ম" মেনে নিচ্ছেন।', 'By sending you accept the "Fund rules" above.')}</Text>
        <Button title={tr('দানের তথ্য জমা দিন', 'Send gift details')} icon="💝" onPress={send} loading={busy} />
      </View>
      <MyGifts reload={reload} />
    </>
  );
}

// ---------- apply ----------
const EMPTY: HelpForm = { kind: 'umrah', age: '', district: '', profession: '', reason: '', wentBefore: false, refName: '', refPhone: '', showName: false };
function Apply() {
  const [mine, setMine] = useState<Awaited<ReturnType<typeof myHelpApplication>> | undefined>(undefined);
  const [f, setF] = useState<HelpForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(() => { myHelpApplication().then(setMine).catch(() => setMine(null)); }, []);
  useEffect(() => { load(); }, [load]);
  const set = (k: keyof HelpForm) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const send = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await applyHelp(f);
      if (r === 'ok') { setMsg({ kind: 'ok', text: tr('আবেদন জমা হয়েছে। Travel Adda আপনার দেওয়া পরিচিত মানুষকে ফোন করে যাচাই করবে, তারপর নোটিফিকেশনে জানাবে।', 'Application sent. Travel Adda will call the person you named to check, then tell you by notification.') }); setF(EMPTY); load(); }
      else setMsg({ kind: 'warn', text: helpErrorText({ code: r || '' }) });
    } catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }
    finally { setBusy(false); }
  };
  const withdraw = () => confirm(tr('আবেদন ফিরিয়ে নেবেন?', 'Withdraw the application?'), tr('পরে আবার নতুন করে আবেদন করতে পারবেন।', 'You can apply again later.'), tr('ফিরিয়ে নিন', 'Withdraw'), async () => {
    try { await withdrawHelp(); load(); } catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }
  });
  if (mine === undefined) return <ActivityIndicator color={C.primary} />;
  const open = mine && ['pending', 'approved', 'funded'].includes(mine.status);
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {mine ? (
        <View style={st.card}>
          <Text style={st.h}>{tr('আমার আবেদন', 'My application')} · {kindLabel(mine.kind)}</Text>
          <Text style={st.p}>{helpStatusText(mine.status)}</Text>
          {mine.status === 'rejected' && mine.admin_note ? <Text style={st.small}>{tr('কারণ', 'Reason')}: {mine.admin_note}</Text> : null}
          <Text style={st.small}>{tr('জমা', 'Sent')}: {fmtDay(mine.created_at)}</Text>
          {mine.status === 'pending' ? <Button title={tr('আবেদন ফিরিয়ে নিন', 'Withdraw application')} icon="↩️" kind="secondary" onPress={withdraw} style={{ marginTop: S.sm }} /> : null}
        </View>
      ) : null}
      {!open ? (
        <View style={st.card}>
          <Text style={st.h}>{tr('📝 সাহায্যের আবেদন', '📝 Apply for help')}</Text>
          <Text style={[st.small, { marginBottom: S.sm }]}>{tr('নিজের টাকায় হজ বা ওমরাহ করার সামর্থ্য না থাকলে আবেদন করুন। তথ্য গোপন থাকবে; শুধু Travel Adda দেখবে।', 'Apply if you cannot afford Hajj or Umrah with your own money. Your details stay private; only Travel Adda sees them.')}</Text>
          <Choice label={tr('কোনটি করতে চান', 'Which one do you want to do')} options={[{ id: 'umrah', label: tr('🕌 ওমরাহ', '🕌 Umrah') }, { id: 'hajj', label: tr('🕋 হজ', '🕋 Hajj') }]} value={f.kind} onChange={set('kind')} />
          <Field label={tr('আপনার বয়স', 'Your age')} hint={tr('যেমন: ৬৫', 'e.g. 65')} value={String(f.age)} onChangeText={set('age')} keyboardType="number-pad" maxLength={3} editable={!busy} />
          <DistrictPicker label={tr('আপনার জেলা', 'Your district')} value={f.district || null} onChange={set('district')} />
          <Field label={tr('পেশা', 'Profession')} hint={tr('যেমন: কৃষক, দোকানদার, অবসরপ্রাপ্ত', 'e.g. farmer, shopkeeper, retired')} value={f.profession} onChangeText={set('profession')} maxLength={60} editable={!busy} />
          <Field label={tr('কেন সাহায্য দরকার', 'Why help is needed')} hint={tr('নিজের ভাষায় অল্প কথায় লিখুন', 'Write briefly in your own words')} value={f.reason} onChangeText={set('reason')} multiline maxLength={800} editable={!busy} />
          <Toggle label={tr('আগে কখনো হজ বা ওমরাহ করেছেন?', 'Have you done Hajj or Umrah before?')} value={f.wentBefore} onChange={set('wentBefore')} />
          <Text style={st.lbl}>{tr('আপনাকে চেনেন এমন একজন (Travel Adda তাঁকে ফোন করে যাচাই করবে)', 'Someone who knows you (Travel Adda will call them to check)')}</Text>
          <Field label={tr('তাঁর নাম ও পরিচয়', 'Their name and who they are')} hint={tr('যেমন: মসজিদের ইমাম, ইউপি সদস্য', 'e.g. mosque imam, union council member')} value={f.refName} onChangeText={set('refName')} maxLength={60} editable={!busy} />
          <Field label={tr('তাঁর মোবাইল নম্বর', 'Their mobile number')} hint={tr('যেমন: 01712345678', 'e.g. 01712345678')} value={f.refPhone} onChangeText={set('refPhone')} keyboardType="phone-pad" maxLength={15} editable={!busy} />
          <Toggle label={tr('অনুমোদন পেলে আমার নাম দেখানো যাবে', 'My name may be shown once approved')} hint={tr('না দিলে শুধু জেলা আর বয়স দেখাবে, যেমন: নোয়াখালীর ৬৫ বছর বয়সী একজন', 'If not, only district and age show, e.g. a 65-year-old from Noakhali')} value={f.showName} onChange={set('showName')} />
          <Text style={[st.small, { marginBottom: S.sm }]}>{tr('জমা দিলে আপনি ওপরের "তহবিলের নিয়ম" মেনে নিচ্ছেন।', 'By sending you accept the "Fund rules" above.')}</Text>
          <Button title={tr('আবেদন জমা দিন', 'Send application')} icon="📝" onPress={send} loading={busy} />
        </View>
      ) : null}
    </>
  );
}

// ---------- report (everyone sees) ----------
function Report({ s }: { s: FundSummary }) {
  return (
    <>
      <View style={st.card}>
        <Text style={st.h}>{tr('💸 টাকা কোথায় খরচ হলো', '💸 Where the money was spent')}</Text>
        {!s.spends.length ? <Text style={st.p}>{tr('এখনো কোনো খরচ হয়নি।', 'Nothing spent yet.')}</Text> : null}
        {s.spends.map((x, i) => (
          <Text key={i} style={[st.p, { marginBottom: S.xs }]}>{fmtDay(x.at)} · {taka(x.amount)} · {personLabel(x)} ({kindLabel(x.kind)}) — {x.purpose}</Text>
        ))}
        <Text style={st.small}>{tr('মোট খরচ', 'Total spent')}: {taka(s.spent)} · {tr('এখন তহবিলে', 'In the fund now')}: {taka(s.balance)}</Text>
      </View>
      <View style={st.card}>
        <Text style={st.h}>{tr('🤲 যাচাই করা, সাহায্যের অপেক্ষায়', '🤲 Checked, waiting for help')}</Text>
        {!s.waiting.length ? <Text style={st.p}>{tr('এখন কেউ অপেক্ষায় নেই।', 'Nobody is waiting now.')}</Text> : null}
        {s.waiting.map((w, i) => <Text key={i} style={st.p}>• {personLabel(w)} — {kindLabel(w.kind)}{w.status === 'funded' ? tr(' (টাকা দেওয়া হয়েছে)', ' (money given)') : ''}</Text>)}
      </View>
      <View style={st.card}>
        <Text style={st.h}>{tr('💝 সাম্প্রতিক দান', '💝 Recent gifts')}</Text>
        {!s.recent.length ? <Text style={st.p}>{tr('এখনো কোনো দান যাচাই হয়নি।', 'No gift has been checked yet.')}</Text> : null}
        {s.recent.map((d, i) => <Text key={i} style={st.p}>• {d.name || tr('একজন দাতা (নাম গোপন)', 'A donor (name hidden)')} — {taka(d.amount)}</Text>)}
      </View>
    </>
  );
}
