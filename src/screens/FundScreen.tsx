// Hajj & Umrah help fund (sadaqah only). Three parts on one page with tabs: give, apply, see where the money went.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Switch } from 'react-native';
import ScrollView from '../components/KbScroll';
import { C, S, R, F, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { st, fmtDay, confirm } from './GroupScreen';
import { toBn } from '../lib/phone';
import { fundSummary, donate, myDonations, myConfirmedTotal, applyHelp, myHelpApplication, withdrawHelp, helpErrorText, personLabel,
  kindLabel, helpStatusText, fundPayInfo, recentDates, FUND_RULES, type FundSummary, type HelpForm } from '../lib/fund';
import { PAY_METHODS, PAY_STATUS } from '../lib/payments';
import DistrictPicker from '../components/DistrictPicker';

type Row = Record<string, any>;
type Nav = { navigate: (r: string, p?: object) => void };
type Msg = { kind: 'ok' | 'bad' | 'warn' | 'info'; text: string } | null;
const taka = (n: number): string => `${toBn(Math.round(n).toLocaleString('en-IN'))} টাকা`;

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
      <Text style={[st.small, { width: 40, textAlign: 'right' }]}>{value ? 'হ্যাঁ' : 'না'}</Text>
    </Pressable>
  );
}

// The fund's rules, folded by default; sending a gift or an application means agreeing to them.
function Rules() {
  const [open, setOpen] = useState(false);
  return (
    <View style={[st.card, { borderWidth: 1, borderColor: C.line }]}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ minHeight: TOUCH, justifyContent: 'center' }}>
        <Text style={st.h}>📜 তহবিলের নিয়ম {open ? '▲' : '▼'}</Text>
      </Pressable>
      {open ? FUND_RULES.map((r, i) => <Text key={i} style={[st.p, { marginBottom: S.xs }]}>{toBn(i + 1)}. {r}</Text>) : <Text style={st.small}>জমা দেওয়ার আগে একবার পড়ে নিন (চাপলে খুলবে)।</Text>}
    </View>
  );
}

export default function FundScreen({ navigation }: { navigation: Nav & { addListener?: (e: string, f: () => void) => () => void } }) {
  const [tab, setTab] = useState<'give' | 'apply' | 'report'>('give');
  const [s, setS] = useState<FundSummary | null | undefined>(undefined);
  const load = useCallback(() => { fundSummary().then(setS).catch(() => setS(null)); }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Offers')} style={st.back} accessibilityRole="button" accessibilityLabel="অফার পাতায় ফিরে যান">
        <Text style={st.backT}>‹ অফার ও প্যাকেজ</Text>
      </Pressable>
      <View style={{ backgroundColor: C.goldSoft, borderColor: C.gold, borderWidth: 2, borderRadius: R.lg, padding: S.md, marginBottom: S.md }}>
        <Text style={{ fontSize: F.title, fontWeight: '700', color: C.text }} accessibilityRole="header">🤲 হজ-ওমরাহ সহায়তা তহবিল</Text>
        <Text style={[st.p, { marginTop: S.xs }]}>সামর্থ্যবানদের দানে সামর্থ্যহীন মানুষ আল্লাহর ঘরে যাবেন। সব হিসাব সবার সামনে।</Text>
        {s === undefined ? <ActivityIndicator color={C.primary} style={{ marginTop: S.sm }} /> : null}
        {s ? (
          <View style={{ marginTop: S.sm }}>
            <Text style={{ fontSize: F.hero, fontWeight: '700', color: C.primary }}>{taka(s.collected)}</Text>
            <Text style={st.small}>মোট জমা (Travel Adda যাচাই করেছে)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.md, marginTop: S.sm }}>
              <Text style={st.p}>🤝 দাতা: {toBn(s.donors)} জন</Text>
              <Text style={st.p}>💚 এখন তহবিলে: {taka(s.balance)}</Text>
              <Text style={st.p}>🕋 সফর সম্পন্ন: {toBn(s.travelled)} জন</Text>
            </View>
          </View>
        ) : null}
        {s === null ? <Notice kind="info" title="শীঘ্রই আসছে" text="তহবিলের এই অংশ এখনো চালু হয়নি।" /> : null}
        <Text style={[st.small, { marginTop: S.sm }]}>এটি সদকার তহবিল, যাকাতের নয়।</Text>
      </View>
      {s ? (
        <>
          <Segmented value={tab} onChange={(v: 'give' | 'apply' | 'report') => setTab(v)}
            options={[{ id: 'give', label: 'দান করুন' }, { id: 'apply', label: 'আবেদন' }, { id: 'report', label: 'হিসাব' }]} />
          <View style={{ height: S.sm }} />
          {tab !== 'report' ? <Rules /> : null}
          {tab === 'give' ? <Give onDone={load} /> : tab === 'apply' ? <Apply /> : <Report s={s} />}
        </>
      ) : null}
    </ScrollView>
  );
}

// ---------- give ----------
function Give({ onDone }: { onDone: () => void }) {
  const [info, setInfo] = useState<{ bank: string; bkash: string } | null>(null);
  const [mine, setMine] = useState<Row[] | null>(null);
  const dates = recentDates();
  const [f, setF] = useState({ amount: '', method: 'bkash', ref: '', paidOn: dates[0].ymd, showName: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const loadMine = useCallback(() => { myDonations().then(setMine).catch(() => setMine([])); }, []);
  useEffect(() => { fundPayInfo().then(setInfo).catch(() => setInfo({ bank: '', bkash: '' })); loadMine(); }, [loadMine]);
  const set = (k: string) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const send = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await donate({ amount: f.amount, method: f.method, ref: f.ref, paidOn: f.paidOn, showName: f.showName });
      if (r === 'ok') { setMsg({ kind: 'ok', text: 'জমা দেওয়া হয়েছে। Travel Adda টাকা মিলিয়ে দেখলে মোট জমায় যোগ হবে, আর আপনি নোটিফিকেশন পাবেন। জাযাকাল্লাহু খাইরান।' }); setF((x) => ({ ...x, amount: '', ref: '' })); loadMine(); onDone(); }
      else setMsg({ kind: 'warn', text: helpErrorText({ code: r || '' }) });
    } catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }       // the form keeps what was typed
    finally { setBusy(false); }
  };
  const total = mine ? myConfirmedTotal(mine) : 0;
  return (
    <>
      <View style={st.card}>
        <Text style={st.h}>১. টাকা পাঠান</Text>
        {info === null ? <ActivityIndicator color={C.primary} /> : (
          <>
            {info.bkash ? <Text style={st.p} selectable>📱 বিকাশ/নগদ: {info.bkash}</Text> : null}
            {info.bank ? <Text style={st.p} selectable>🏦 ব্যাংক: {info.bank}</Text> : null}
            {!info.bkash && !info.bank ? <Text style={st.p}>টাকা পাঠানোর নম্বর শীঘ্রই দেওয়া হবে। এখন Travel Adda হেল্পলাইনে যোগাযোগ করুন।</Text> : null}
            <Text style={st.small}>শুধু এই অফিসিয়াল নম্বরে পাঠান। কাউকে হাতে টাকা দেবেন না।</Text>
          </>
        )}
      </View>
      <View style={st.card}>
        <Text style={st.h}>২. পাঠানোর পর এখানে লিখুন</Text>
        <Field label="কত টাকা" hint="যেমন: ৫০০০" value={f.amount} onChangeText={set('amount')} keyboardType="number-pad" maxLength={12} editable={!busy} />
        <Choice label="কীভাবে পাঠিয়েছেন" options={PAY_METHODS.map((m) => ({ id: m.id, label: `${m.icon} ${m.label}` }))} value={f.method} onChange={set('method')} />
        <Field label="লেনদেন নম্বর (TrxID) বা রসিদ নম্বর" hint="যেমন: 9A7B3C2D" value={f.ref} onChangeText={set('ref')} autoCapitalize="characters" autoCorrect={false} maxLength={60} editable={!busy} />
        <DistrictPicker label="কবে পাঠিয়েছেন (তারিখ)" noun="তারিখ" placeholder="তারিখ বাছুন" searchHint="যেমন: ২৫ অক্টোবর"
          options={dates.map((d) => d.label)} value={(dates.find((d) => d.ymd === f.paidOn) || dates[0]).label}
          onChange={(label: string) => { const d = dates.find((x) => x.label === label); if (d) set('paidOn')(d.ymd); }} />
        <Toggle label="আমার নাম দেখানো হোক" hint="না দিলে সবাই শুধু টাকার পরিমাণ দেখবে, নাম গোপন থাকবে" value={f.showName} onChange={set('showName')} />
        {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
        <Text style={[st.small, { marginBottom: S.sm }]}>জমা দিলে আপনি ওপরের "তহবিলের নিয়ম" মেনে নিচ্ছেন।</Text>
        <Button title="দানের তথ্য জমা দিন" icon="💝" onPress={send} loading={busy} />
      </View>
      <View style={st.card}>
        <Text style={st.h}>🧾 আমার দান</Text>
        {mine === null ? <ActivityIndicator color={C.primary} /> : null}
        {mine && !mine.length ? <Text style={st.p}>এখনো কোনো দান নেই।</Text> : null}
        {mine && mine.length ? <Text style={[st.val, { color: C.primary }]}>যাচাই করা মোট: {taka(total)}</Text> : null}
        {(mine || []).map((d) => {
          const ps = (PAY_STATUS as Record<string, { icon: string; label: string }>)[d.status] || { icon: '', label: d.status };
          return <Text key={d.id} style={st.p}>{fmtDay(d.created_at)} · {taka(Number(d.amount))} · {ps.icon} {ps.label}{d.admin_note && d.status === 'rejected' ? ` (${d.admin_note})` : ''}</Text>;
        })}
      </View>
    </>
  );
}

// ---------- apply ----------
const EMPTY: HelpForm = { kind: 'umrah', age: '', district: '', profession: '', reason: '', wentBefore: false, refName: '', refPhone: '', showName: false };
function Apply() {
  const [mine, setMine] = useState<Row | null | undefined>(undefined);
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
      if (r === 'ok') { setMsg({ kind: 'ok', text: 'আবেদন জমা হয়েছে। Travel Adda আপনার দেওয়া পরিচিত মানুষকে ফোন করে যাচাই করবে, তারপর নোটিফিকেশনে জানাবে।' }); setF(EMPTY); load(); }
      else setMsg({ kind: 'warn', text: helpErrorText({ code: r || '' }) });
    } catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }
    finally { setBusy(false); }
  };
  const withdraw = () => confirm('আবেদন ফিরিয়ে নেবেন?', 'পরে আবার নতুন করে আবেদন করতে পারবেন।', 'ফিরিয়ে নিন', async () => {
    try { await withdrawHelp(); load(); } catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }
  });
  if (mine === undefined) return <ActivityIndicator color={C.primary} />;
  const open = mine && ['pending', 'approved', 'funded'].includes(mine.status);
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {mine ? (
        <View style={st.card}>
          <Text style={st.h}>আমার আবেদন · {kindLabel(mine.kind)}</Text>
          <Text style={st.p}>{helpStatusText(mine.status)}</Text>
          {mine.status === 'rejected' && mine.admin_note ? <Text style={st.small}>কারণ: {mine.admin_note}</Text> : null}
          <Text style={st.small}>জমা: {fmtDay(mine.created_at)}</Text>
          {mine.status === 'pending' ? <Button title="আবেদন ফিরিয়ে নিন" icon="↩️" kind="secondary" onPress={withdraw} style={{ marginTop: S.sm }} /> : null}
        </View>
      ) : null}
      {!open ? (
        <View style={st.card}>
          <Text style={st.h}>📝 সাহায্যের আবেদন</Text>
          <Text style={[st.small, { marginBottom: S.sm }]}>নিজের টাকায় হজ বা ওমরাহ করার সামর্থ্য না থাকলে আবেদন করুন। তথ্য গোপন থাকবে; শুধু Travel Adda দেখবে।</Text>
          <Choice label="কোনটি করতে চান" options={[{ id: 'umrah', label: '🕌 ওমরাহ' }, { id: 'hajj', label: '🕋 হজ' }]} value={f.kind} onChange={set('kind')} />
          <Field label="আপনার বয়স" hint="যেমন: ৬৫" value={String(f.age)} onChangeText={set('age')} keyboardType="number-pad" maxLength={3} editable={!busy} />
          <DistrictPicker label="আপনার জেলা" value={f.district || null} onChange={set('district')} />
          <Field label="পেশা" hint="যেমন: কৃষক, দোকানদার, অবসরপ্রাপ্ত" value={f.profession} onChangeText={set('profession')} maxLength={60} editable={!busy} />
          <Field label="কেন সাহায্য দরকার" hint="নিজের ভাষায় অল্প কথায় লিখুন" value={f.reason} onChangeText={set('reason')} multiline maxLength={800} editable={!busy} />
          <Toggle label="আগে কখনো হজ বা ওমরাহ করেছেন?" value={f.wentBefore} onChange={set('wentBefore')} />
          <Text style={st.lbl}>আপনাকে চেনেন এমন একজন (Travel Adda তাঁকে ফোন করে যাচাই করবে)</Text>
          <Field label="তাঁর নাম ও পরিচয়" hint="যেমন: মসজিদের ইমাম, ইউপি সদস্য" value={f.refName} onChangeText={set('refName')} maxLength={60} editable={!busy} />
          <Field label="তাঁর মোবাইল নম্বর" hint="যেমন: 01712345678" value={f.refPhone} onChangeText={set('refPhone')} keyboardType="phone-pad" maxLength={15} editable={!busy} />
          <Toggle label="অনুমোদন পেলে আমার নাম দেখানো যাবে" hint="না দিলে শুধু জেলা আর বয়স দেখাবে, যেমন: নোয়াখালীর ৬৫ বছর বয়সী একজন" value={f.showName} onChange={set('showName')} />
          <Text style={[st.small, { marginBottom: S.sm }]}>জমা দিলে আপনি ওপরের "তহবিলের নিয়ম" মেনে নিচ্ছেন।</Text>
          <Button title="আবেদন জমা দিন" icon="📝" onPress={send} loading={busy} />
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
        <Text style={st.h}>💸 টাকা কোথায় খরচ হলো</Text>
        {!s.spends.length ? <Text style={st.p}>এখনো কোনো খরচ হয়নি।</Text> : null}
        {s.spends.map((x, i) => (
          <Text key={i} style={[st.p, { marginBottom: S.xs }]}>{fmtDay(x.at)} · {taka(x.amount)} · {personLabel(x)} ({kindLabel(x.kind)}) — {x.purpose}</Text>
        ))}
        <Text style={st.small}>মোট খরচ: {taka(s.spent)} · এখন তহবিলে: {taka(s.balance)}</Text>
      </View>
      <View style={st.card}>
        <Text style={st.h}>🤲 যাচাই করা, সাহায্যের অপেক্ষায়</Text>
        {!s.waiting.length ? <Text style={st.p}>এখন কেউ অপেক্ষায় নেই।</Text> : null}
        {s.waiting.map((w, i) => <Text key={i} style={st.p}>• {personLabel(w)} — {kindLabel(w.kind)}{w.status === 'funded' ? ' (টাকা দেওয়া হয়েছে)' : ''}</Text>)}
      </View>
      <View style={st.card}>
        <Text style={st.h}>💝 সাম্প্রতিক দান</Text>
        {!s.recent.length ? <Text style={st.p}>এখনো কোনো দান যাচাই হয়নি।</Text> : null}
        {s.recent.map((d, i) => <Text key={i} style={st.p}>• {d.name || 'একজন দাতা (নাম গোপন)'} — {taka(d.amount)}</Text>)}
      </View>
    </>
  );
}
