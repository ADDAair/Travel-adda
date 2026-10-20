import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, ActivityIndicator, BackHandler } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { ContractDetails, ReasonBox, ReportBlock } from '../components/market';
import { toBn, normalizeDigits } from '../lib/phone';
import { notReady, telBd } from '../lib/groups';
import { parseDate } from '../lib/dates';
import { INCLUDES, myOffers } from '../lib/offers';
import { leaderContracts, sendContract, withdrawContract, cancelContract, completeContract, leaderReferralList, leaderDecideReferral } from '../lib/market';
import { shareContractPdf } from '../lib/contractPdf';
import { contractMoney } from '../lib/payments';
import { st, confirm, errText, fmtDay, fmtTaka } from './GroupScreen';

const SEND_RESULT = {
  sent: { kind: 'ok', text: 'চুক্তির অনুরোধ পাঠানো হয়েছে। হাজী অ্যাপে পড়ে রাজি হলে চুক্তি চালু হবে।' },
  bad_code: { kind: 'bad', text: 'এই আইডিতে কোনো হাজী পাওয়া যায়নি। আইডি দেখে আবার লিখুন (যেমন TA-00123)।' },
  blocked: { kind: 'bad', text: 'এই হাজীকে চুক্তি পাঠানো যাবে না।' },
  referred_other: { kind: 'warn', text: 'এই হাজী অন্য একজন লিডারের রেফারেল কোডে যুক্ত আছেন।' },
  haji_busy: { kind: 'warn', text: 'এই হাজীর আরেকটি চুক্তি চালু আছে।' },
  already_sent: { kind: 'info', text: 'এই হাজীকে আপনার একটি অনুরোধ আগে থেকেই পাঠানো আছে।' },
  too_many: { kind: 'warn', text: 'আজ আর অনুরোধ পাঠানো যাবে না। কাল আবার চেষ্টা করুন।' },
};

// Leader: send a contract to one haji ID, follow the answers, cancel with a reason, finish, PDF; confirm referred hajis.
export default function LeaderContractsScreen({ navigation }) {
  const [tab, setTab] = useState('contracts');
  const [rows, setRows] = useState(null);
  const [refs, setRefs] = useState([]);
  const [state, setState] = useState('load');
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try { const [c, r] = await Promise.all([leaderContracts(), leaderReferralList()]); setRows(c); setRefs(r); setState('ok'); }
    catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const act = async (fn, ok) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg(ok(r)); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };

  if (form) return <SendForm onDone={(m) => { setForm(false); if (m) { setMsg(m); load(); } }} />;
  const pendingRefs = refs.filter((r) => r.status === 'pending');

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Leader')} style={st.back} accessibilityRole="button" accessibilityLabel="লিডার প্যানেলে ফিরে যান"><Text style={st.backT}>‹ লিডার প্যানেল</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">📜 চুক্তি ও হাজী</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" /> : null}
      {state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' ? (
        <>
          <Segmented value={tab} onChange={setTab} options={[
            { id: 'contracts', icon: '📜', label: 'চুক্তি' },
            { id: 'refs', icon: '🔑', label: pendingRefs.length ? `রেফারেল (${toBn(pendingRefs.length)})` : 'রেফারেল', a11y: 'রেফারেল কোডে আসা হাজী' },
          ]} />
          <View style={{ height: S.md }} />
          {tab === 'contracts' ? (
            <>
              <Button title="নতুন চুক্তির অনুরোধ পাঠান" icon="✍️" onPress={() => setForm(true)} style={{ marginBottom: S.md }} />
              {rows.length === 0 ? <Notice kind="info" title="এখনো কোনো চুক্তি নেই" text="হাজীর আইডি (যেমন TA-00123) দিয়ে চুক্তির অনুরোধ পাঠান। হাজী অ্যাপে পড়ে রাজি হলে চুক্তি চালু হবে।" /> : null}
              {rows.map((c) => <LeaderContract key={c.id} c={c} busy={busy} act={act} setMsg={setMsg} />)}
            </>
          ) : (
            <>
              <Text style={[st.small, { marginBottom: S.sm }]}>আপনার লিডার আইডি (রেফারেল কোড) দিয়ে যাঁরা নিবন্ধন করেছেন। নিশ্চিত করলে তাঁরা "আমার লিডার" হিসেবে আপনাকে দেখবেন।</Text>
              {refs.length === 0 ? <Notice kind="info" title="এখনো কেউ আপনার রেফারেল কোড দেননি" /> : null}
              {refs.map((r) => (
                <View key={r.haji_id} style={st.card}>
                  <Text style={st.val}>{r.full_name}</Text>
                  <Text style={st.small}>{r.haji_code} · {fmtDay(r.created_at)}{r.cancel_requested ? ' · হাজী বাতিলের অনুরোধ করেছেন' : ''}</Text>
                  {r.status === 'pending' ? (
                    <>
                      <Button title="নিশ্চিত করুন, আমার হাজী" icon="✅" onPress={() => act(() => leaderDecideReferral(r.haji_id, true), () => ({ kind: 'ok', text: 'নিশ্চিত করা হয়েছে।' }))} loading={busy} style={{ marginTop: S.sm }} />
                      <Button title="আমার হাজী নন" kind="secondary" onPress={() => confirm('এই হাজীকে চেনেন না?', 'তিনি তখন অন্য লিডার বেছে নিতে পারবেন।', 'হ্যাঁ, চিনি না', () => act(() => leaderDecideReferral(r.haji_id, false), () => ({ kind: 'ok', text: 'জানানো হয়েছে।' })))} disabled={busy} style={{ marginTop: S.sm }} />
                    </>
                  ) : <Text style={st.p}>✅ নিশ্চিত করা হয়েছে</Text>}
                </View>
              ))}
            </>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function LeaderContract({ c, busy, act, setMsg }) {
  const [cancel, setCancel] = useState(false);
  const [open, setOpen] = useState(c.status === 'accepted' || c.status === 'sent');
  const [pdf, setPdf] = useState(false);
  return (
    <View style={[st.card, c.status === 'accepted' && { borderWidth: 2, borderColor: C.ok }, c.status === 'sent' && st.invite]}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button">
        <Text style={st.small}>{open ? '▴ লুকান' : '▾ বিস্তারিত'}</Text>
      </Pressable>
      {open ? <ContractDetails c={c} who="leader" /> : <Text style={st.val}>{c.title} · {c.haji_name} ({c.haji_code}) · {c.status === 'declined' ? '✖️' : c.status === 'cancelled' ? '⛔' : c.status === 'completed' ? '🏁' : '↩️'}</Text>}
      {c.status === 'accepted' && c.haji_phone ? <Button title={`হাজীকে ফোন করুন (${toBn(c.haji_phone)})`} icon="📞" onPress={() => Linking.openURL(`tel:${telBd(c.haji_phone)}`).catch(() => {})} style={{ marginTop: S.sm }} /> : null}
      {open && ['accepted', 'completed', 'cancelled'].includes(c.status) ? <LeaderMoney contractId={c.id} /> : null}
      {c.status === 'sent' ? <Button title="অনুরোধ ফিরিয়ে নিন" kind="secondary" onPress={() => confirm('অনুরোধটি ফিরিয়ে নেবেন?', '', 'হ্যাঁ', () => act(() => withdrawContract(c.id), () => ({ kind: 'ok', text: 'অনুরোধ ফিরিয়ে নেওয়া হয়েছে।' })))} disabled={busy} style={{ marginTop: S.sm }} /> : null}
      {['accepted', 'completed', 'cancelled'].includes(c.status) ? (
        <Button title="চুক্তির PDF নিন" icon="📄" kind="secondary" loading={pdf} style={{ marginTop: S.sm }}
          onPress={async () => { setPdf(true); try { await shareContractPdf(c); } catch (e) { setMsg({ kind: 'bad', text: 'PDF তৈরি করা যায়নি।' }); } finally { setPdf(false); } }} />
      ) : null}
      {c.status === 'accepted' ? (
        <>
          <Button title="সফর শেষ, চুক্তি সম্পন্ন" icon="🏁" kind="secondary" onPress={() => confirm('চুক্তি সম্পন্ন হিসেবে চিহ্নিত করবেন?', 'সফর শেষ হলে এটি করুন। এরপর আর বাতিল করা যাবে না।', 'হ্যাঁ, সম্পন্ন', () => act(() => completeContract(c.id), () => ({ kind: 'ok', text: 'চুক্তি সম্পন্ন হিসেবে চিহ্নিত হয়েছে।' })))} disabled={busy} style={{ marginTop: S.sm }} />
          {cancel ? (
            <ReasonBox title="চুক্তি বাতিল" hint="কেন বাতিল করছেন, পরিষ্কার করে লিখুন" button="চুক্তি বাতিল করুন" busy={busy} onClose={() => setCancel(false)}
              onSubmit={(reason) => act(() => cancelContract(c.id, reason), (r) => { setCancel(false); return r === 'ok' ? { kind: 'ok', text: 'চুক্তি বাতিল হয়েছে।' } : { kind: 'warn', text: 'চুক্তিটি আর চালু নেই।' }; })} />
          ) : <Pressable onPress={() => setCancel(true)} style={st.leave} accessibilityRole="button"><Text style={st.leaveT}>চুক্তি বাতিল করুন</Text></Pressable>}
        </>
      ) : null}
      {open && c.haji_id ? <ReportBlock targetId={c.haji_id} targetName={c.haji_name} /> : null}
    </View>
  );
}

// Money for one contract as the leader sees it: what Travel Adda received, its commission, what was paid to the leader.
function LeaderMoney({ contractId }) {
  const [m, setM] = useState(null);
  useEffect(() => { contractMoney(contractId).then(setM).catch(() => setM(null)); }, [contractId]);
  if (!m) return null;     // step 008 not run yet or no internet
  const L = ({ l, v, b }) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}><Text style={st.p}>{l}</Text><Text style={[st.p, b && { fontWeight: '700' }]}>{v}</Text></View>;
  return (
    <View style={[st.cRow, { paddingTop: S.sm }]}>
      <Text style={st.h}>💳 টাকার হিসাব</Text>
      <Text style={st.small}>হাজী টাকা দেন Travel Adda-কে। Travel Adda যাচাই করে কমিশন রেখে বাকি টাকা আপনাকে পাঠায়।</Text>
      <L l="Travel Adda পেয়েছে (নিশ্চিত)" v={fmtTaka(m.paid_in)} />
      {Number(m.pending_in) > 0 ? <L l="যাচাই চলছে" v={fmtTaka(m.pending_in)} /> : null}
      <L l="কমিশন" v={fmtTaka(m.commission || 0)} />
      <L l="আপনাকে পাঠানো হয়েছে" v={fmtTaka(m.paid_to_leader)} />
      {Number(m.refunded) > 0 ? <L l="হাজীকে ফেরত" v={fmtTaka(m.refunded)} /> : null}
      <L l="আপনার পাওনা" v={fmtTaka(m.due_to_leader || 0)} b />
      <L l="হাজীর বাকি" v={fmtTaka(m.still_to_pay)} />
    </View>
  );
}

function SendForm({ onDone }) {
  const [f, setF] = useState({ hajiCode: '', title: '', price: '', includes: '', excludes: '', from: '', to: '', refund: '', extra: '' });
  const [kind, setKind] = useState('umrah');
  const [offers, setOffers] = useState([]);
  const [offerId, setOfferId] = useState(null);
  const [err, setErr] = useState({});
  const [fail, setFail] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => { myOffers().then((r) => setOffers(r.filter((o) => o.active && !o.hidden_by_admin))).catch(() => {}); }, []);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { onDone(null); return true; }); return () => sub.remove(); }, [onDone]);

  const fromOffer = (o) => {
    setOfferId(o.id); setKind(o.kind);
    const inc = INCLUDES.filter((x) => (o.includes || []).includes(x.id)).map((x) => x.label);
    const exc = INCLUDES.filter((x) => !(o.includes || []).includes(x.id)).map((x) => x.label);
    const hotel = [o.makkah_hotel && `মক্কার হোটেল: ${o.makkah_hotel}${o.makkah_distance_m != null ? ` (হারাম থেকে ${o.makkah_distance_m} মিটার)` : ''}`,
      o.madinah_hotel && `মদিনার হোটেল: ${o.madinah_hotel}${o.madinah_distance_m != null ? ` (${o.madinah_distance_m} মিটার)` : ''}`].filter(Boolean).join('\n');
    setF((x) => ({ ...x, title: o.title, price: String(Number(o.price_bdt)), includes: [inc.join(', '), hotel, o.notes].filter(Boolean).join('\n'), excludes: exc.join(', '),
      from: o.depart_on.split('-').reverse().join('-'), to: o.return_on.split('-').reverse().join('-') }));
  };

  const send = () => {
    if (busy) return;
    const e = {};
    const code = f.hajiCode.trim().toUpperCase().replace(/\s/g, '').replace(/^TA(\d)/, 'TA-$1');
    const price = Number(normalizeDigits(f.price).replace(/[,\s]/g, ''));
    const from = parseDate(f.from); const to = parseDate(f.to);
    if (!/^TA-\d{1,8}$/.test(code)) e.hajiCode = 'হাজীর আইডি লিখুন, যেমন TA-00123।';
    if (f.title.trim().length < 2) e.title = 'প্যাকেজের নাম লিখুন।';
    if (!Number.isFinite(price) || price <= 0 || price >= 1e8) e.price = 'জনপ্রতি দাম শুধু সংখ্যায় লিখুন।';
    if (f.includes.trim().length < 2) e.includes = 'কী কী থাকছে লিখুন।';
    if (f.refund.trim().length < 2) e.refund = 'বাতিল করলে টাকা ফেরতের নিয়ম লিখুন।';
    if (from === null) e.from = 'তারিখ এভাবে লিখুন: ২০-০১-২০২৭';
    if (to === null) e.to = 'তারিখ এভাবে লিখুন: ০৩-০২-২০২৭';
    if (from && to && to < from) e.to = 'ফেরার তারিখ যাওয়ার পরে হতে হবে।';
    setErr(e); setFail(null);
    if (Object.keys(e).length) { setFail({ kind: 'bad', text: 'লাল চিহ্ন দেওয়া ঘরগুলো ঠিক করুন।' }); return; }
    confirm(`${code} আইডির হাজীকে চুক্তি পাঠাবেন?`, 'পাঠানোর পর শর্ত বদলানো যাবে না। হাজী রাজি হওয়ার আগে চাইলে অনুরোধ ফিরিয়ে নিতে পারবেন।', 'হ্যাঁ, পাঠান', async () => {
      setBusy(true);
      try {
        const r = await sendContract({ hajiCode: code, kind, title: f.title, price, includes: f.includes, excludes: f.excludes, from: from || null, to: to || null, refund: f.refund, extra: f.extra, offerId });
        const m = SEND_RESULT[r] || { kind: 'bad', text: 'পাঠানো যায়নি।' };
        if (r === 'sent') onDone(m); else { setFail(m); setBusy(false); }   // form keeps what was typed
      } catch (x) { setFail({ kind: 'bad', text: errText(x) }); setBusy(false); }
    });
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => onDone(null)} style={st.back} accessibilityRole="button" accessibilityLabel="না পাঠিয়ে ফিরে যান"><Text style={st.backT}>‹ ফিরে যান</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">✍️ চুক্তির অনুরোধ</Text>
      {fail ? <Notice kind={fail.kind} title={fail.text} /> : null}
      <Field label="হাজীর আইডি" hint="যেমন: TA-00123 (হাজীর অ্যাপের হোমে লেখা থাকে)" value={f.hajiCode} onChangeText={(v) => set('hajiCode')(v.toUpperCase())} maxLength={12} autoCapitalize="characters" error={err.hajiCode} />
      {offers.length ? (
        <View style={st.card}>
          <Text style={st.h}>আমার প্যাকেজ থেকে ভরুন (ইচ্ছা করলে)</Text>
          {offers.map((o) => <Button key={o.id} title={`${offerId === o.id ? '✅ ' : ''}${o.title}`} kind="secondary" onPress={() => fromOffer(o)} style={{ marginTop: S.xs }} />)}
        </View>
      ) : null}
      <Text style={st.lbl}>ধরন</Text>
      <Segmented options={[{ id: 'umrah', icon: '🔄', label: 'ওমরাহ' }, { id: 'hajj', icon: '🕋', label: 'হজ' }]} value={kind} onChange={setKind} />
      <View style={{ height: S.md }} />
      <Field label="প্যাকেজের নাম" value={f.title} onChangeText={set('title')} maxLength={120} error={err.title} />
      <Field label="জনপ্রতি মোট দাম (টাকা)" hint="যেমন: 150000" value={f.price} onChangeText={set('price')} keyboardType="numeric" maxLength={12} error={err.price} />
      <Field label="যাওয়ার তারিখ (ইচ্ছা করলে)" hint="দিন-মাস-বছর" value={f.from} onChangeText={set('from')} maxLength={10} error={err.from} />
      <Field label="ফেরার তারিখ (ইচ্ছা করলে)" hint="দিন-মাস-বছর" value={f.to} onChangeText={set('to')} maxLength={10} error={err.to} />
      <Field label="যা অন্তর্ভুক্ত" value={f.includes} onChangeText={set('includes')} multiline maxLength={3000} error={err.includes} />
      <Field label="যা অন্তর্ভুক্ত নয় (ইচ্ছা করলে)" value={f.excludes} onChangeText={set('excludes')} multiline maxLength={3000} />
      <Field label="বাতিল ও টাকা ফেরতের নিয়ম" value={f.refund} onChangeText={set('refund')} multiline maxLength={3000} error={err.refund} />
      <Field label="অন্যান্য শর্ত (ইচ্ছা করলে)" hint="যেমন: কিস্তিতে টাকা দেওয়ার নিয়ম" value={f.extra} onChangeText={set('extra')} multiline maxLength={3000} />
      <Button title="চুক্তির অনুরোধ পাঠান" icon="📨" onPress={send} loading={busy} />
    </ScrollView>
  );
}
