import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator, BackHandler } from 'react-native';
import { tr } from '../lib/lang';
import ScrollView from '../components/KbScroll';
import { C, S } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { ContractDetails, ReasonBox, ReportBlock } from '../components/market';
import { toBn, normalizeDigits } from '../lib/phone';
import { notReady, telBd } from '../lib/groups';
import { parseDate } from '../lib/dates';
import { INCLUDES, myOffers } from '../lib/offers';
import { leaderContracts, sendContract, withdrawContract, cancelContract, completeContract, leaderReferralList, leaderDecideReferral } from '../lib/market';
import { shareContractPdf } from '../lib/contractPdf';
import { contractMoney, type ContractMoney } from '../lib/payments';
import { st, confirm, errText, fmtDay, fmtTaka } from './GroupScreen';
import type { Msg, Nav } from './navTypes';

import type { LeaderContract as LeaderContractRow, OwnPackage, Res } from '../lib/types';
type M = NonNullable<Msg>;
type Act = (fn: () => Promise<unknown>, ok: (r: unknown) => Msg) => Promise<void>;

const SEND_RESULT: Record<string, M> = {
  sent: { kind: 'ok', text: tr('চুক্তির অনুরোধ পাঠানো হয়েছে। হাজী অ্যাপে পড়ে রাজি হলে চুক্তি চালু হবে।', 'Contract request sent. The contract starts when the haji reads and accepts it in the app.') },
  bad_code: { kind: 'bad', text: tr('এই আইডিতে কোনো হাজী পাওয়া যায়নি। আইডি দেখে আবার লিখুন (যেমন TA-00123)।', 'No haji found with this ID. Check the ID and write it again (e.g. TA-00123).') },
  blocked: { kind: 'bad', text: tr('এই হাজীকে চুক্তি পাঠানো যাবে না।', 'A contract cannot be sent to this haji.') },
  referred_other: { kind: 'warn', text: tr('এই হাজী অন্য একজন লিডারের রেফারেল কোডে যুক্ত আছেন।', 'This haji is linked to another leader\'s referral code.') },
  haji_busy: { kind: 'warn', text: tr('এই হাজীর আরেকটি চুক্তি চালু আছে।', 'This haji has another active contract.') },
  already_sent: { kind: 'info', text: tr('এই হাজীকে আপনার একটি অনুরোধ আগে থেকেই পাঠানো আছে।', 'You have already sent a request to this haji.') },
  too_many: { kind: 'warn', text: tr('আজ আর অনুরোধ পাঠানো যাবে না। কাল আবার চেষ্টা করুন।', 'No more requests can be sent today. Try again tomorrow.') },
};

// Leader: send a contract to one haji ID, follow the answers, cancel with a reason, finish, PDF; confirm referred hajis.
export default function LeaderContractsScreen({ navigation }: { navigation: Nav }): JSX.Element {
  const [tab, setTab] = useState('contracts');
  const [rows, setRows] = useState<LeaderContractRow[]>([]);
  const [refs, setRefs] = useState<Res<typeof leaderReferralList>>([]);
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    try { const [c, r] = await Promise.all([leaderContracts(), leaderReferralList()]); setRows(c); setRefs(r); setState('ok'); }
    catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const act: Act = async (fn, ok) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg(ok(r)); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };

  if (form) return <SendForm onDone={(m: Msg) => { setForm(false); if (m) { setMsg(m); load(); } }} />;
  const pendingRefs = refs.filter((r) => r.status === 'pending');

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => navigation.navigate('Leader')} style={st.back} accessibilityRole="button" accessibilityLabel={tr('লিডার প্যানেলে ফিরে যান', 'Back to the leader panel')}><Text style={st.backT}>{tr('‹ লিডার প্যানেল', '‹ Leader panel')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('📜 চুক্তি ও হাজী', '📜 Contracts and hajis')}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'load' ? <ActivityIndicator color={C.primary} /> : null}
      {state === 'soon' ? <Notice kind="info" title={tr('শীঘ্রই চালু হবে', 'Coming soon')} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('তথ্য আনা যায়নি', 'Could not load the information')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {state === 'ok' ? (
        <>
          <Segmented value={tab} onChange={setTab} options={[
            { id: 'contracts', icon: '📜', label: tr('চুক্তি', 'Contracts') },
            { id: 'refs', icon: '🔑', label: pendingRefs.length ? tr(`রেফারেল (${toBn(pendingRefs.length)})`, `Referrals (${pendingRefs.length})`) : tr('রেফারেল', 'Referrals'), a11y: tr('রেফারেল কোডে আসা হাজী', 'Hajis who came with your referral code') },
          ]} />
          <View style={{ height: S.md }} />
          {tab === 'contracts' ? (
            <>
              <Button title={tr('নতুন চুক্তির অনুরোধ পাঠান', 'Send a new contract request')} icon="✍️" onPress={() => setForm(true)} style={{ marginBottom: S.md }} />
              {rows.length === 0 ? <Notice kind="info" title={tr('এখনো কোনো চুক্তি নেই', 'No contracts yet')} text={tr('হাজীর আইডি (যেমন TA-00123) দিয়ে চুক্তির অনুরোধ পাঠান। হাজী অ্যাপে পড়ে রাজি হলে চুক্তি চালু হবে।', 'Send a contract request with the haji\'s ID (e.g. TA-00123). The contract starts when the haji reads and accepts it in the app.')} /> : null}
              {rows.map((c) => <LeaderContract key={c.id} c={c} busy={busy} act={act} setMsg={setMsg} />)}
            </>
          ) : (
            <>
              <Text style={[st.small, { marginBottom: S.sm }]}>{tr('আপনার লিডার আইডি (রেফারেল কোড) দিয়ে যাঁরা নিবন্ধন করেছেন। নিশ্চিত করলে তাঁরা "আমার লিডার" হিসেবে আপনাকে দেখবেন।', 'People who registered with your leader ID (referral code). Once you confirm, they will see you as "My leader".')}</Text>
              {refs.length === 0 ? <Notice kind="info" title={tr('এখনো কেউ আপনার রেফারেল কোড দেননি', 'Nobody has used your referral code yet')} /> : null}
              {refs.map((r) => (
                <View key={r.haji_id} style={st.card}>
                  <Text style={st.val}>{r.full_name}</Text>
                  <Text style={st.small}>{r.haji_code} · {fmtDay(r.created_at)}{r.cancel_requested ? tr(' · হাজী বাতিলের অনুরোধ করেছেন', ' · the haji asked to cancel') : ''}</Text>
                  {r.status === 'pending' ? (
                    <>
                      <Button title={tr('নিশ্চিত করুন, আমার হাজী', 'Confirm, my haji')} icon="✅" onPress={() => act(() => leaderDecideReferral(r.haji_id, true), () => ({ kind: 'ok', text: tr('নিশ্চিত করা হয়েছে।', 'Confirmed.') }))} loading={busy} style={{ marginTop: S.sm }} />
                      <Button title={tr('আমার হাজী নন', 'Not my haji')} kind="secondary" onPress={() => confirm(tr('এই হাজীকে চেনেন না?', 'You do not know this haji?'), tr('তিনি তখন অন্য লিডার বেছে নিতে পারবেন।', 'They can then choose another leader.'), tr('হ্যাঁ, চিনি না', 'Yes, I do not know them'), () => act(() => leaderDecideReferral(r.haji_id, false), () => ({ kind: 'ok', text: tr('জানানো হয়েছে।', 'Done.') })))} disabled={busy} style={{ marginTop: S.sm }} />
                    </>
                  ) : <Text style={st.p}>{tr('✅ নিশ্চিত করা হয়েছে', '✅ Confirmed')}</Text>}
                </View>
              ))}
            </>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function LeaderContract({ c, busy, act, setMsg }: { c: LeaderContractRow; busy: boolean; act: Act; setMsg: (m: Msg) => void }): JSX.Element {
  const [cancel, setCancel] = useState(false);
  const [open, setOpen] = useState(c.status === 'accepted' || c.status === 'sent');
  const [pdf, setPdf] = useState(false);
  return (
    <View style={[st.card, c.status === 'accepted' && { borderWidth: 2, borderColor: C.ok }, c.status === 'sent' && st.invite]}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button">
        <Text style={st.small}>{open ? tr('▴ লুকান', '▴ Hide') : tr('▾ বিস্তারিত', '▾ Details')}</Text>
      </Pressable>
      {open ? <ContractDetails c={c} who="leader" /> : <Text style={st.val}>{c.title} · {c.haji_name} ({c.haji_code}) · {c.status === 'declined' ? '✖️' : c.status === 'cancelled' ? '⛔' : c.status === 'completed' ? '🏁' : '↩️'}</Text>}
      {c.status === 'accepted' && c.haji_phone ? <Button title={tr(`হাজীকে ফোন করুন (${toBn(c.haji_phone)})`, `Call the haji (${c.haji_phone})`)} icon="📞" onPress={() => Linking.openURL(`tel:${telBd(c.haji_phone)}`).catch(() => {})} style={{ marginTop: S.sm }} /> : null}
      {open && ['accepted', 'completed', 'cancelled'].includes(c.status) ? <LeaderMoney contractId={c.id} /> : null}
      {c.status === 'sent' ? <Button title={tr('অনুরোধ ফিরিয়ে নিন', 'Withdraw request')} kind="secondary" onPress={() => confirm(tr('অনুরোধটি ফিরিয়ে নেবেন?', 'Withdraw the request?'), '', tr('হ্যাঁ', 'Yes'), () => act(() => withdrawContract(c.id), () => ({ kind: 'ok', text: tr('অনুরোধ ফিরিয়ে নেওয়া হয়েছে।', 'Request withdrawn.') })))} disabled={busy} style={{ marginTop: S.sm }} /> : null}
      {['accepted', 'completed', 'cancelled'].includes(c.status) ? (
        <Button title={tr('চুক্তির PDF নিন', 'Get the contract PDF')} icon="📄" kind="secondary" loading={pdf} style={{ marginTop: S.sm }}
          onPress={async () => { setPdf(true); try { await shareContractPdf(c); } catch (e) { setMsg({ kind: 'bad', text: tr('PDF তৈরি করা যায়নি।', 'Could not make the PDF.') }); } finally { setPdf(false); } }} />
      ) : null}
      {c.status === 'accepted' ? (
        <>
          <Button title={tr('সফর শেষ, চুক্তি সম্পন্ন', 'Trip over, contract completed')} icon="🏁" kind="secondary" onPress={() => confirm(tr('চুক্তি সম্পন্ন হিসেবে চিহ্নিত করবেন?', 'Mark the contract as completed?'), tr('সফর শেষ হলে এটি করুন। এরপর আর বাতিল করা যাবে না।', 'Do this when the trip is over. After this it cannot be cancelled.'), tr('হ্যাঁ, সম্পন্ন', 'Yes, completed'), () => act(() => completeContract(c.id), () => ({ kind: 'ok', text: tr('চুক্তি সম্পন্ন হিসেবে চিহ্নিত হয়েছে।', 'The contract is marked as completed.') })))} disabled={busy} style={{ marginTop: S.sm }} />
          {cancel ? (
            <ReasonBox title={tr('চুক্তি বাতিল', 'Cancel the contract')} hint={tr('কেন বাতিল করছেন, পরিষ্কার করে লিখুন', 'Write clearly why you are cancelling')} button={tr('চুক্তি বাতিল করুন', 'Cancel the contract')} busy={busy} onClose={() => setCancel(false)}
              onSubmit={(reason: string) => act(() => cancelContract(c.id, reason), (r) => { setCancel(false); return r === 'ok' ? { kind: 'ok', text: tr('চুক্তি বাতিল হয়েছে।', 'The contract is cancelled.') } : { kind: 'warn', text: tr('চুক্তিটি আর চালু নেই।', 'The contract is no longer active.') }; })} />
          ) : <Pressable onPress={() => setCancel(true)} style={st.leave} accessibilityRole="button"><Text style={st.leaveT}>{tr('চুক্তি বাতিল করুন', 'Cancel the contract')}</Text></Pressable>}
        </>
      ) : null}
      {open && c.haji_id ? <ReportBlock targetId={c.haji_id} targetName={c.haji_name} /> : null}
    </View>
  );
}

// Money for one contract as the leader sees it: what Travel Adda received, its commission, what was paid to the leader.
function LeaderMoney({ contractId }: { contractId: string }): JSX.Element | null {
  const [m, setM] = useState<ContractMoney | null>(null);
  useEffect(() => { contractMoney(contractId).then(setM).catch(() => setM(null)); }, [contractId]);
  if (!m) return null;     // step 008 not run yet or no internet
  const L = ({ l, v, b }: { l: string; v: string; b?: boolean }) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}><Text style={st.p}>{l}</Text><Text style={[st.p, b && { fontWeight: '700' }]}>{v}</Text></View>;
  return (
    <View style={[st.cRow, { paddingTop: S.sm }]}>
      <Text style={st.h}>{tr('💳 টাকার হিসাব', '💳 Money')}</Text>
      <Text style={st.small}>{tr('হাজী টাকা দেন Travel Adda-কে। Travel Adda যাচাই করে কমিশন রেখে বাকি টাকা আপনাকে পাঠায়।', 'The haji pays Travel Adda. Travel Adda checks it, keeps the commission and sends you the rest.')}</Text>
      <L l={tr('Travel Adda পেয়েছে (নিশ্চিত)', 'Travel Adda received (confirmed)')} v={fmtTaka(m.paid_in)} />
      {Number(m.pending_in) > 0 ? <L l={tr('যাচাই চলছে', 'Being checked')} v={fmtTaka(m.pending_in)} /> : null}
      <L l={tr('কমিশন', 'Commission')} v={fmtTaka(m.commission || 0)} />
      <L l={tr('আপনাকে পাঠানো হয়েছে', 'Sent to you')} v={fmtTaka(m.paid_to_leader)} />
      {Number(m.refunded) > 0 ? <L l={tr('হাজীকে ফেরত', 'Refunded to the haji')} v={fmtTaka(m.refunded)} /> : null}
      <L l={tr('আপনার পাওনা', 'Due to you')} v={fmtTaka(m.due_to_leader || 0)} b />
      <L l={tr('হাজীর বাকি', 'Still due from the haji')} v={fmtTaka(m.still_to_pay)} />
    </View>
  );
}

function SendForm({ onDone }: { onDone: (m: Msg) => void }): JSX.Element {
  const [f, setF] = useState({ hajiCode: '', title: '', price: '', includes: '', excludes: '', from: '', to: '', refund: '', extra: '' });
  const [kind, setKind] = useState('umrah');
  const [offers, setOffers] = useState<OwnPackage[]>([]);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [fail, setFail] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => { myOffers().then((r) => setOffers(r.filter((o) => o.active && !o.hidden_by_admin))).catch(() => {}); }, []);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { onDone(null); return true; }); return () => sub.remove(); }, [onDone]);

  const fromOffer = (o: OwnPackage) => {
    setOfferId(o.id); setKind(o.kind);
    const inc = INCLUDES.filter((x) => (o.includes || []).includes(x.id)).map((x) => x.label);
    const exc = INCLUDES.filter((x) => !(o.includes || []).includes(x.id)).map((x) => x.label);
    const hotel = [o.makkah_hotel && tr(`মক্কার হোটেল: ${o.makkah_hotel}${o.makkah_distance_m != null ? ` (হারাম থেকে ${o.makkah_distance_m} মিটার)` : ''}`, `Makkah hotel: ${o.makkah_hotel}${o.makkah_distance_m != null ? ` (${o.makkah_distance_m} m from the Haram)` : ''}`),
      o.madinah_hotel && tr(`মদিনার হোটেল: ${o.madinah_hotel}${o.madinah_distance_m != null ? ` (${o.madinah_distance_m} মিটার)` : ''}`, `Madinah hotel: ${o.madinah_hotel}${o.madinah_distance_m != null ? ` (${o.madinah_distance_m} m)` : ''}`)].filter(Boolean).join('\n');
    setF((x) => ({ ...x, title: o.title, price: String(Number(o.price_bdt)), includes: [inc.join(', '), hotel, o.notes].filter(Boolean).join('\n'), excludes: exc.join(', '),
      from: o.depart_on.split('-').reverse().join('-'), to: o.return_on.split('-').reverse().join('-') }));
  };

  const send = () => {
    if (busy) return;
    const e: Record<string, string> = {};
    const code = f.hajiCode.trim().toUpperCase().replace(/\s/g, '').replace(/^TA(\d)/, 'TA-$1');
    const price = Number(normalizeDigits(f.price).replace(/[,\s]/g, ''));
    const from = parseDate(f.from); const to = parseDate(f.to);
    if (!/^TA-\d{1,8}$/.test(code)) e.hajiCode = tr('হাজীর আইডি লিখুন, যেমন TA-00123।', 'Write the haji\'s ID, e.g. TA-00123.');
    if (f.title.trim().length < 2) e.title = tr('প্যাকেজের নাম লিখুন।', 'Write the package name.');
    if (!Number.isFinite(price) || price <= 0 || price >= 1e8) e.price = tr('জনপ্রতি দাম শুধু সংখ্যায় লিখুন।', 'Write the price per person in numbers only.');
    if (f.includes.trim().length < 2) e.includes = tr('কী কী থাকছে লিখুন।', 'Write what is included.');
    if (f.refund.trim().length < 2) e.refund = tr('বাতিল করলে টাকা ফেরতের নিয়ম লিখুন।', 'Write the refund rules for cancellation.');
    if (from === null) e.from = tr('তারিখ এভাবে লিখুন: ২০-০১-২০২৭', 'Write the date like this: 20-01-2027');
    if (to === null) e.to = tr('তারিখ এভাবে লিখুন: ০৩-০২-২০২৭', 'Write the date like this: 03-02-2027');
    if (from && to && to < from) e.to = tr('ফেরার তারিখ যাওয়ার পরে হতে হবে।', 'The return date must be after the departure date.');
    setErr(e); setFail(null);
    if (Object.keys(e).length) { setFail({ kind: 'bad', text: tr('লাল চিহ্ন দেওয়া ঘরগুলো ঠিক করুন।', 'Fix the boxes marked in red.') }); return; }
    confirm(tr(`${code} আইডির হাজীকে চুক্তি পাঠাবেন?`, `Send the contract to the haji with ID ${code}?`), tr('পাঠানোর পর শর্ত বদলানো যাবে না। হাজী রাজি হওয়ার আগে চাইলে অনুরোধ ফিরিয়ে নিতে পারবেন।', 'After sending, the terms cannot be changed. You can withdraw the request before the haji accepts.'), tr('হ্যাঁ, পাঠান', 'Yes, send'), async () => {
      setBusy(true);
      try {
        const r = await sendContract({ hajiCode: code, kind, title: f.title, price, includes: f.includes, excludes: f.excludes, from: from || null, to: to || null, refund: f.refund, extra: f.extra, offerId });
        const m: M = SEND_RESULT[r || ''] || { kind: 'bad', text: tr('পাঠানো যায়নি।', 'Could not send.') };
        if (r === 'sent') onDone(m); else { setFail(m); setBusy(false); }   // form keeps what was typed
      } catch (x) { setFail({ kind: 'bad', text: errText(x) }); setBusy(false); }
    });
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => onDone(null)} style={st.back} accessibilityRole="button" accessibilityLabel={tr('না পাঠিয়ে ফিরে যান', 'Go back without sending')}><Text style={st.backT}>{tr('‹ ফিরে যান', '‹ Back')}</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('✍️ চুক্তির অনুরোধ', '✍️ Contract request')}</Text>
      {fail ? <Notice kind={fail.kind} title={fail.text} /> : null}
      <Field label={tr('হাজীর আইডি', 'Haji\'s ID')} hint={tr('যেমন: TA-00123 (হাজীর অ্যাপের হোমে লেখা থাকে)', 'e.g. TA-00123 (shown on the Home of the haji\'s app)')} value={f.hajiCode} onChangeText={(v: string) => set('hajiCode')(v.toUpperCase())} maxLength={12} autoCapitalize="characters" error={err.hajiCode} />
      {offers.length ? (
        <View style={st.card}>
          <Text style={st.h}>{tr('আমার প্যাকেজ থেকে ভরুন (ইচ্ছা করলে)', 'Fill from my packages (optional)')}</Text>
          {offers.map((o) => <Button key={o.id} title={`${offerId === o.id ? '✅ ' : ''}${o.title}`} kind="secondary" onPress={() => fromOffer(o)} style={{ marginTop: S.xs }} />)}
        </View>
      ) : null}
      <Text style={st.lbl}>{tr('ধরন', 'Kind')}</Text>
      <Segmented options={[{ id: 'umrah', icon: '🔄', label: tr('ওমরাহ', 'Umrah') }, { id: 'hajj', icon: '🕋', label: tr('হজ', 'Hajj') }]} value={kind} onChange={setKind} />
      <View style={{ height: S.md }} />
      <Field label={tr('প্যাকেজের নাম', 'Package name')} value={f.title} onChangeText={set('title')} maxLength={120} error={err.title} />
      <Field label={tr('জনপ্রতি মোট দাম (টাকা)', 'Total price per person (Tk)')} hint={tr('যেমন: 150000', 'e.g. 150000')} value={f.price} onChangeText={set('price')} keyboardType="numeric" maxLength={12} error={err.price} />
      <Field label={tr('যাওয়ার তারিখ (ইচ্ছা করলে)', 'Departure date (optional)')} hint={tr('দিন-মাস-বছর', 'day-month-year')} value={f.from} onChangeText={set('from')} maxLength={10} error={err.from} />
      <Field label={tr('ফেরার তারিখ (ইচ্ছা করলে)', 'Return date (optional)')} hint={tr('দিন-মাস-বছর', 'day-month-year')} value={f.to} onChangeText={set('to')} maxLength={10} error={err.to} />
      <Field label={tr('যা অন্তর্ভুক্ত', 'Included')} value={f.includes} onChangeText={set('includes')} multiline maxLength={3000} error={err.includes} />
      <Field label={tr('যা অন্তর্ভুক্ত নয় (ইচ্ছা করলে)', 'Not included (optional)')} value={f.excludes} onChangeText={set('excludes')} multiline maxLength={3000} />
      <Field label={tr('বাতিল ও টাকা ফেরতের নিয়ম', 'Cancellation and refund rules')} value={f.refund} onChangeText={set('refund')} multiline maxLength={3000} error={err.refund} />
      <Field label={tr('অন্যান্য শর্ত (ইচ্ছা করলে)', 'Other terms (optional)')} hint={tr('যেমন: কিস্তিতে টাকা দেওয়ার নিয়ম', 'e.g. rules for paying in instalments')} value={f.extra} onChangeText={set('extra')} multiline maxLength={3000} />
      <Button title={tr('চুক্তির অনুরোধ পাঠান', 'Send contract request')} icon="📨" onPress={send} loading={busy} />
    </ScrollView>
  );
}
