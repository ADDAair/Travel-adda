import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, BackHandler } from 'react-native';
import { C, S, R, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { toBn, normalizeDigits } from '../lib/phone';
import { notReady } from '../lib/groups';
import { INCLUDES, myOffers, createOffer, setOfferActive, myInterestCounts } from '../lib/offers';
import { st, errText, confirm } from './GroupScreen';
import { parseDate } from '../lib/dates';
import { OfferCard } from './OffersScreen';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const statusOf = (o) => (o.hidden_by_admin ? '⛔ অ্যাডমিন লুকিয়ে রেখেছেন' : !o.active ? '🙈 আপনি লুকিয়ে রেখেছেন' : o.return_on < today() ? '⌛ তারিখ পার হয়ে গেছে'
  : o.valid_until && o.valid_until < today() ? '⌛ অফারের শেষ তারিখ পার হয়েছে' : '✅ হাজীরা দেখতে পাচ্ছেন');

// Verified leaders publish packages for the Offers page. A published package cannot be changed, only hidden.
export default function LeaderOffersScreen({ navigation }) {
  const [rows, setRows] = useState(null);
  const [counts, setCounts] = useState({});
  const [state, setState] = useState('load');
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    try { const [r, c] = await Promise.all([myOffers(), myInterestCounts()]); setRows(r); setCounts(c); setState('ok'); }
    catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (o) => confirm(o.active ? 'প্যাকেজটি লুকাবেন?' : 'প্যাকেজটি আবার দেখাবেন?', o.active ? 'হাজীরা আর এটি দেখতে পাবেন না।' : '', o.active ? 'হ্যাঁ, লুকান' : 'হ্যাঁ, দেখান', async () => {
    setBusy(true); setMsg(null);
    try { await setOfferActive(o.id, !o.active); await load(); setMsg({ kind: 'ok', text: o.active ? 'প্যাকেজ লুকানো হয়েছে।' : 'প্যাকেজ আবার দেখানো হচ্ছে।' }); }
    catch (e) { setMsg({ kind: 'bad', text: e?.code === '42501' ? 'একসাথে ২০টির বেশি প্যাকেজ দেখানো যায় না।' : errText(e) }); }
    finally { setBusy(false); }
  });

  if (form) return <OfferForm onDone={(saved) => { setForm(false); if (saved) { setMsg({ kind: 'ok', text: 'প্যাকেজ প্রকাশ হয়েছে। হাজীরা এখন "অফার" পাতায় দেখতে পাবেন।' }); load(); } }} />;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.navigate('Leader')} style={st.back} accessibilityRole="button" accessibilityLabel="লিডার প্যানেলে ফিরে যান"><Text style={st.backT}>‹ লিডার প্যানেল</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">🎁 আমার প্যাকেজ (অফার)</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' ? (
        <>
          <Notice kind="info" title="হাজীরা কীভাবে যোগাযোগ করবেন" text="প্যাকেজে আপনার ফোন নম্বর দেখানো হয় না। আগ্রহী হাজীরা Travel Adda হেল্পলাইনে যোগাযোগ করবেন, টিম আপনার সাথে মিটিংয়ের ব্যবস্থা করবে। এখানে শুধু কতজন আগ্রহী তা দেখবেন।" />
          <Button title="নতুন প্যাকেজ দিন" icon="➕" onPress={() => setForm(true)} style={{ marginBottom: S.md }} />
          {rows && rows.length === 0 ? <Notice kind="info" title="এখনো কোনো প্যাকেজ দেননি" /> : null}
          {(rows || []).map((o) => {
            const c = counts[o.id];
            return (
              <OfferCard key={o.id} o={o}>
                <View style={st.cRow}>
                  <Text style={st.val}>{statusOf(o)}</Text>
                  <Text style={st.p}>🙋 আগ্রহী: {toBn(c ? c.total : 0)} জন{c && c.open ? ` (টিমের ফোনের অপেক্ষায় ${toBn(c.open)} জন)` : ''}</Text>
                  {!o.hidden_by_admin ? <Button title={o.active ? 'প্যাকেজটি লুকান' : 'আবার দেখান'} icon={o.active ? '🙈' : '👁️'} kind="secondary" onPress={() => toggle(o)} disabled={busy} style={{ marginTop: S.sm }} /> : null}
                </View>
              </OfferCard>
            );
          })}
        </>
      ) : null}
    </ScrollView>
  );
}

function Chip({ on, label, icon, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}
      style={{ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.sm, marginRight: S.xs, marginBottom: S.xs,
        borderRadius: R.md, borderWidth: 2, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primarySoft : C.card }}>
      <Text style={st.p}>{on ? '☑️' : '⬜'} {icon} {label}</Text>
    </Pressable>
  );
}

function OfferForm({ onDone }) {
  const [kind, setKind] = useState('umrah');
  const [f, setF] = useState({ title: '', price: '', from: '', to: '', mh: '', md: '', dh: '', dd: '', room: '', notes: '' });
  const [inc, setInc] = useState(new Set(['flight', 'visa']));
  const [err, setErr] = useState({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const num = (v) => { const t = normalizeDigits(v).replace(/[,\s]/g, ''); return t === '' ? null : Number(t); };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onDone(false); return true; });
    return () => sub.remove();
  }, [onDone]);

  const save = () => {
    if (busy) return;
    const e = {};
    const price = num(f.price); const from = parseDate(f.from); const to = parseDate(f.to); const until = parseDate(f.until || '');
    const mDist = num(f.dh); const dDist = num(f.dd); const room = num(f.room);
    if (f.title.trim().length < 2) e.title = 'প্যাকেজের নাম লিখুন।';
    if (!Number.isFinite(price) || price <= 0 || price >= 1e8) e.price = 'জনপ্রতি দাম শুধু সংখ্যায় লিখুন (যেমন: 150000)।';
    if (!from) e.from = 'যাওয়ার তারিখ লিখুন, যেমন: ২০-০১-২০২৭';
    else if (from < today()) e.from = 'যাওয়ার তারিখ আজকের পরে হতে হবে।';
    if (!to) e.to = 'ফেরার তারিখ লিখুন, যেমন: ০৩-০২-২০২৭';
    else if (from && to < from) e.to = 'ফেরার তারিখ যাওয়ার তারিখের পরে হতে হবে।';
    else if (from && (Date.parse(to) - Date.parse(from)) / 86400000 > 120) e.to = 'সফর ১২০ দিনের বেশি হতে পারে না।';
    if (until === null) e.until = 'তারিখ এভাবে লিখুন: ১০-০১-২০২৭';
    else if (until && until < today()) e.until = 'শেষ তারিখ আজ বা পরের কোনো দিন হতে হবে।';
    else if (until && from && until > from) e.until = 'অফারের শেষ তারিখ যাওয়ার তারিখের আগে বা সেদিন হতে হবে।';
    if (mDist !== null && !(Number.isInteger(mDist) && mDist >= 0 && mDist <= 50000)) e.dh = 'দূরত্ব মিটারে লিখুন (যেমন: 500)।';
    if (dDist !== null && !(Number.isInteger(dDist) && dDist >= 0 && dDist <= 50000)) e.dd = 'দূরত্ব মিটারে লিখুন (যেমন: 300)।';
    if (room !== null && !(Number.isInteger(room) && room >= 1 && room <= 10)) e.room = '১ থেকে ১০ এর মধ্যে লিখুন।';
    setErr(e); setFail('');
    if (Object.keys(e).length) { setFail('লাল চিহ্ন দেওয়া ঘরগুলো ঠিক করুন।'); return; }
    confirm('প্যাকেজটি প্রকাশ করবেন?', 'প্রকাশের পর দাম বা তথ্য বদলানো যাবে না, শুধু লুকানো যাবে। আরেকবার মিলিয়ে নিন।', 'হ্যাঁ, প্রকাশ করুন', async () => {
      setBusy(true);
      try {
        await createOffer({
          ...(until ? { valid_until: until } : {}),
          kind, title: f.title.trim(), price_bdt: price, depart_on: from, return_on: to,
          makkah_hotel: f.mh.trim() || null, makkah_distance_m: mDist, madinah_hotel: f.md.trim() || null, madinah_distance_m: dDist,
          room_share: room, includes: INCLUDES.map((x) => x.id).filter((id) => inc.has(id)), notes: f.notes.trim() || null,
        });
        onDone(true);
      } catch (x) {
        setFail(x?.code === '42501' ? 'প্রকাশ করা যায়নি। একসাথে ২০টির বেশি প্যাকেজ দেখানো যায় না; পুরোনো কোনোটি লুকান।' : errText(x));
        setBusy(false);
      }
    });
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => onDone(false)} style={st.back} accessibilityRole="button" accessibilityLabel="প্যাকেজ না দিয়ে ফিরে যান"><Text style={st.backT}>‹ ফিরে যান</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">➕ নতুন প্যাকেজ</Text>
      {fail ? <Notice kind="bad" title={fail} /> : null}
      <Text style={st.lbl}>প্যাকেজের ধরন</Text>
      <Segmented options={[{ id: 'umrah', icon: '🔄', label: 'ওমরাহ' }, { id: 'hajj', icon: '🕋', label: 'হজ' }]} value={kind} onChange={setKind} />
      <View style={{ height: S.md }} />
      <Field label="প্যাকেজের নাম" hint="যেমন: রমজান ওমরাহ ১৫ দিন" value={f.title} onChangeText={set('title')} maxLength={100} error={err.title} />
      <Field label="জনপ্রতি মোট দাম (টাকা)" hint="যেমন: 150000" value={f.price} onChangeText={set('price')} keyboardType="numeric" maxLength={12} error={err.price} />
      <Field label="যাওয়ার তারিখ" hint="দিন-মাস-বছর, যেমন: ২০-০১-২০২৭" value={f.from} onChangeText={set('from')} maxLength={10} error={err.from} />
      <Field label="ফেরার তারিখ" hint="দিন-মাস-বছর, যেমন: ০৩-০২-২০২৭" value={f.to} onChangeText={set('to')} maxLength={10} error={err.to} />
      <Field label="অফার কোন তারিখ পর্যন্ত দেখাবে (ইচ্ছা করলে)" hint="যেমন: ১০-০১-২০২৭। খালি রাখলে যাত্রার আগ পর্যন্ত" value={f.until || ''} onChangeText={set('until')} maxLength={10} error={err.until} />
      <Field label="মক্কার হোটেলের নাম (ইচ্ছা করলে)" value={f.mh} onChangeText={set('mh')} maxLength={100} />
      <Field label="মক্কার হোটেল থেকে হারামের দূরত্ব (মিটার)" hint="যেমন: 500" value={f.dh} onChangeText={set('dh')} keyboardType="numeric" maxLength={6} error={err.dh} />
      <Field label="মদিনার হোটেলের নাম (ইচ্ছা করলে)" value={f.md} onChangeText={set('md')} maxLength={100} />
      <Field label="মদিনার হোটেল থেকে মসজিদে নববীর দূরত্ব (মিটার)" hint="যেমন: 300" value={f.dd} onChangeText={set('dd')} keyboardType="numeric" maxLength={6} error={err.dd} />
      <Field label="এক রুমে কতজন (ইচ্ছা করলে)" hint="যেমন: 4" value={f.room} onChangeText={set('room')} keyboardType="numeric" maxLength={2} error={err.room} />
      <Text style={[st.lbl, { marginBottom: S.xs }]}>প্যাকেজে যা আছে (চাপ দিয়ে বাছুন)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: S.md }}>
        {INCLUDES.map((x) => <Chip key={x.id} on={inc.has(x.id)} icon={x.icon} label={x.label} onPress={() => setInc((s) => { const n = new Set(s); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })} />)}
      </View>
      <Field label="আরও তথ্য (ইচ্ছা করলে)" hint="যেমন: বয়স্কদের জন্য হুইলচেয়ার, মহিলা গাইড আছে" value={f.notes} onChangeText={set('notes')} multiline maxLength={1500} />
      <Button title="প্যাকেজ প্রকাশ করুন" icon="📢" onPress={save} loading={busy} />
    </ScrollView>
  );
}
