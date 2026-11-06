import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { tr } from '../lib/lang';
import { View, Text, Pressable, Linking, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { toBn, normalizeDigits } from '../lib/phone';
import { notReady, telBd } from '../lib/groups';
import { PAY_STATUS, methodLabel, listPayments, reviewPayment, ledger, leaderRates, setLeaderRate, setCommission, addPayout, receiptUrl, payInfo } from '../lib/payments';
import { setSetting } from '../lib/offers';
import { st, errText, confirm, fmtDay, fmtTaka } from './GroupScreen';

import type { Item } from '../lib/types';
type Msg = { kind: 'ok' | 'bad'; text: string } | null;
type Cb = { onDone: (t: string) => void; onFail: (t: string) => void };
const num = (v: unknown): number | null => { const t = normalizeDigits(String(v || '')).replace(/[,\s]/g, ''); return t === '' ? null : Number(t); };

// Admin / staff with the 'payments' permission: check hajis' payments, commission, payouts to leaders.
export default function MoneyTab({ owner }: { owner?: boolean }): JSX.Element {
  const [part, setPart] = useState('pending');
  return (
    <>
      <Segmented value={part} onChange={setPart} options={[{ id: 'pending', icon: '⏳', label: tr('যাচাই', 'Check') }, { id: 'ledger', icon: '📒', label: tr('হিসাব', 'Accounts') }]} />
      <View style={{ height: S.xs }} />
      <Segmented value={part} onChange={setPart} options={[{ id: 'rates', icon: '％', label: tr('কমিশন হার', 'Commission rate') }, ...(owner ? [{ id: 'info', icon: '🏦', label: tr('অ্যাকাউন্ট', 'Account') }] : [])]} />
      <View style={{ height: S.md }} />
      {part === 'pending' ? <Pending /> : part === 'ledger' ? <Ledger /> : part === 'rates' ? <Rates /> : <PayInfo />}
    </>
  );
}

function useData<T>(fn: () => Promise<T[]>) {
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');
  const [rows, setRows] = useState<T[]>([]);
  const load = useCallback(async () => {
    try { setRows(await fn()); setState('ok'); } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, [fn]);
  useEffect(() => { load(); }, [load]);
  const gate = state === 'load' ? <ActivityIndicator color={C.primary} />
    : state === 'soon' ? <Notice kind="info" title={tr("শীঘ্রই চালু হবে", 'Coming soon')} text={tr("টাকার অংশের ডেটাবেস ধাপ (০০৮) এখনো চালানো হয়নি।", 'The database step (008) for the money part has not been run yet.')} />
      : state === 'err' ? <Notice kind="bad" title={tr("তথ্য আনা যায়নি", 'Could not load the information')}><Button title={tr("আবার চেষ্টা করুন", 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null;
  return { state, rows, load, gate };
}

// ---------- Payments waiting for a check ----------
const allPayments = () => listPayments(null);
function Pending() {
  const { state, rows, load, gate } = useData(allPayments);
  const [msg, setMsg] = useState<Msg>(null);
  const open = rows.filter((r) => r.status === 'submitted');
  const done = rows.filter((r) => r.status !== 'submitted').slice(0, 50);
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <Notice kind="info" title={tr("নিশ্চিত করার আগে", 'Before confirming')} text={tr("ব্যাংক বা বিকাশ স্টেটমেন্টে লেনদেন নম্বর, টাকা ও তারিখ মিলিয়ে দেখুন। নিশ্চিত করা টাকা আর বদলানো যায় না।", 'Match the transaction number, amount and date in the bank or bKash statement. A confirmed payment cannot be changed.')} />
          {open.length === 0 ? <Notice kind="ok" title={tr("যাচাইয়ের কিছু বাকি নেই", 'Nothing left to check')} /> : null}
          {open.map((r) => <PayCard key={r.id} r={r} onDone={(t: string) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t: string) => setMsg({ kind: 'bad', text: t })} />)}
          {done.length ? <Text style={[st.h, { marginTop: S.md }]}>{tr('আগের সিদ্ধান্ত', 'Earlier decisions')}</Text> : null}
          {done.map((r) => (
            <View key={r.id} style={st.card}>
              <Text style={st.val}>{fmtTaka(r.amount)} · {r.haji_name} ({r.haji_code})</Text>
              <Text style={st.small}>{PAY_STATUS[r.status as keyof typeof PAY_STATUS]?.icon} {PAY_STATUS[r.status as keyof typeof PAY_STATUS]?.label} · {methodLabel(r.method)} {r.txn_ref} {tr('· চুক্তি', '· Contract')} {r.contract_no}{r.admin_note ? ` · ${r.admin_note}` : ''}</Text>
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

function PayCard({ r, onDone, onFail }: { r: Item<typeof listPayments> } & Cb) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = (ok: boolean) => {
    if (!ok && note.trim().length < 3) { onFail(tr('বাতিলের কারণ নোটে লিখুন (হাজী দেখতে পাবেন)।', 'Write the reason for rejecting in the note (the haji can see it).')); return; }
    confirm(ok ? tr(`${fmtTaka(r.amount)} পাওয়া গেছে বলে নিশ্চিত করবেন?`, `Confirm that ${fmtTaka(r.amount)} was received?`) : tr('জমাটি "মেলেনি" করবেন?', 'Mark the payment as "did not match"?'), ok ? tr('স্টেটমেন্টে মিলিয়ে নিয়েছেন তো? এটা আর ফেরানো যাবে না।', 'Have you matched it in the statement? This cannot be undone.') : tr('হাজী আপনার নোট দেখবেন।', 'The haji will see your note.'),
      ok ? tr('হ্যাঁ, পাওয়া গেছে', 'Yes, received') : tr('হ্যাঁ, মেলেনি', 'Yes, did not match'), async () => {
        setBusy(true);
        try { const res = await reviewPayment(r.id, ok, note.trim()); onDone(res === 'ok' ? (ok ? tr('নিশ্চিত করা হয়েছে।', 'Confirmed.') : tr('মেলেনি হিসেবে চিহ্নিত হয়েছে।', 'Marked as did not match.')) : tr('এই জমার সিদ্ধান্ত আগেই নেওয়া হয়েছে।', 'This payment was already decided.')); }
        catch (e) { onFail(errText(e)); setBusy(false); }
      });
  };
  const openReceipt = async () => { try { await Linking.openURL(await receiptUrl(r.receipt_path)); } catch (e) { onFail(tr('রসিদ খোলা যায়নি।', 'Could not open the receipt.')); } };
  return (
    <View style={[st.card, st.invite]}>
      <Text style={st.gName}>{fmtTaka(r.amount)}</Text>
      <Text style={st.p}>{methodLabel(r.method)} {tr('· লেনদেন নম্বর:', '· Transaction no.:')} <Text selectable style={{ fontWeight: '700' }}>{r.txn_ref}</Text></Text>
      <Text style={st.small}>{tr('পাঠানোর তারিখ', 'Date sent')} {fmtDay(r.paid_on)} {tr('· জমা দিয়েছেন', '· sent by')} {fmtDay(r.created_at)}</Text>
      <View style={st.cRow}><Text style={st.lbl}>{tr('হাজী', 'Haji')}</Text><Text style={st.p}>{r.haji_name} · {r.haji_code}{r.haji_phone ? ` · ${toBn(r.haji_phone)}` : ''}</Text></View>
      <View style={st.cRow}><Text style={st.lbl}>{tr('চুক্তি', 'Contract')}</Text><Text style={st.p}>{r.contract_no} · {r.title} · {fmtTaka(r.price_bdt)} {tr('· লিডার', '· Leader')} {r.leader_name} ({r.leader_code})</Text></View>
      {r.receipt_path ? <Button title={tr("রসিদ দেখুন", 'See receipt')} icon="🧾" kind="secondary" onPress={openReceipt} style={{ marginTop: S.sm }} /> : <Text style={st.small}>{tr('রসিদ দেননি।', 'No receipt given.')}</Text>}
      {r.haji_phone ? <Button title={tr(`হাজীকে ফোন করুন (${toBn(r.haji_phone)})`, `Call the haji (${r.haji_phone})`)} icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(r.haji_phone)}`).catch(() => {})} style={{ marginTop: S.sm }} /> : null}
      <View style={{ marginTop: S.md }}><Field label={tr("নোট (মেলেনি হলে কারণ)", 'Note (reason if it did not match)')} hint={tr("যেমন: এই নম্বরে টাকা আসেনি", 'e.g. no money came to this number')} value={note} onChangeText={setNote} maxLength={500} /></View>
      <Button title={tr("টাকা পাওয়া গেছে", 'Money received')} icon="✅" onPress={() => decide(true)} loading={busy} />
      <Button title={tr("মেলেনি", 'Did not match')} kind="danger" onPress={() => decide(false)} disabled={busy} style={{ marginTop: S.sm }} />
    </View>
  );
}

// ---------- Ledger: per contract ----------
function Ledger() {
  const { state, rows, load, gate } = useData(ledger);
  const [msg, setMsg] = useState<Msg>(null);
  const total = rows.reduce((a, r) => ({ in: a.in + Number(r.paid_in), comm: a.comm + Number(r.commission || 0), due: a.due + Number(r.due_to_leader || 0) }), { in: 0, comm: 0, due: 0 });
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <View style={st.card}>
            <Text style={st.p}>{tr('মোট পাওয়া (নিশ্চিত):', 'Total received (confirmed):')} <Text style={{ fontWeight: '700' }}>{fmtTaka(total.in)}</Text></Text>
            <Text style={st.p}>{tr('মোট কমিশন:', 'Total commission:')} <Text style={{ fontWeight: '700' }}>{fmtTaka(total.comm)}</Text></Text>
            <Text style={st.p}>{tr('লিডারদের মোট পাওনা:', 'Total due to leaders:')} <Text style={{ fontWeight: '700' }}>{fmtTaka(total.due)}</Text></Text>
          </View>
          {rows.length === 0 ? <Notice kind="info" title={tr("এখনো কোনো চালু চুক্তি নেই", 'No active contracts yet')} /> : null}
          {rows.map((r) => <LedgerCard key={r.contract_id} r={r} onDone={(t: string) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t: string) => setMsg({ kind: 'bad', text: t })} />)}
        </>
      ) : null}
    </>
  );
}

function LedgerCard({ r, onDone, onFail }: { r: Item<typeof ledger> } & Cb) {
  const [open, setOpen] = useState(false);
  const [comm, setComm] = useState(r.commission_fixed != null ? String(r.commission_fixed) : '');
  const [payee, setPayee] = useState<'leader' | 'haji'>('leader');
  const [amt, setAmt] = useState('');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const saveComm = () => {
    const v = comm.trim() === '' ? null : num(comm);
    if (v !== null && (!Number.isFinite(v) || v < 0)) { onFail(tr('কমিশন শুধু সংখ্যায় লিখুন, অথবা খালি রাখুন (তখন লিডারের হার অনুযায়ী)।', 'Write the commission in numbers only, or leave it empty (then the leader\'s rate is used).')); return; }
    confirm(tr('কমিশন সংরক্ষণ করবেন?', 'Save the commission?'), v === null ? tr(`লিডারের হার (${toBn(r.rate_pct)}%) অনুযায়ী হিসাব হবে।`, `It will be counted by the leader's rate (${r.rate_pct}%).`) : tr(`এই চুক্তিতে কমিশন ${fmtTaka(v)}।${v === 0 ? ' (পুরো ছাড়)' : ''}`, `The commission for this contract is ${fmtTaka(v)}.${v === 0 ? ' (fully waived)' : ''}`), tr('হ্যাঁ, সংরক্ষণ', 'Yes, save'), async () => {
      setBusy(true);
      try { await setCommission(r.contract_id, v); onDone(tr('কমিশন সংরক্ষণ হয়েছে।', 'Commission saved.')); } catch (e) { onFail(errText(e)); } finally { setBusy(false); }
    });
  };
  const pay = () => {
    const v = num(amt);
    if (v === null || !Number.isFinite(v) || v <= 0) { onFail(tr('কত টাকা পাঠিয়েছেন, সংখ্যায় লিখুন।', 'Write how much was sent, in numbers.')); return; }
    if (ref.trim().length < 3) { onFail(tr('ব্যাংক/বিকাশের লেনদেন নম্বর লিখুন।', 'Write the bank/bKash transaction number.')); return; }
    confirm(payee === 'leader' ? tr(`লিডারকে ${fmtTaka(v)} পাঠানো লিখবেন?`, `Write that ${fmtTaka(v)} was sent to the leader?`) : tr(`হাজীকে ${fmtTaka(v)} ফেরত লিখবেন?`, `Write a refund of ${fmtTaka(v)} to the haji?`), tr('আগে টাকাটা সত্যিই পাঠিয়ে তারপর এখানে লিখুন। এটা আর মোছা যায় না।', 'First really send the money, then write it here. This cannot be deleted.'), tr('হ্যাঁ, লিখুন', 'Yes, write it'), async () => {
      setBusy(true);
      try {
        const res = await addPayout(r.contract_id, payee, v, ref.trim(), note.trim());
        if (res === 'over') onFail(payee === 'leader' ? tr('লিডারের পাওনার চেয়ে বেশি লেখা যায় না।', 'You cannot write more than the leader\'s due.') : tr('জমা টাকার চেয়ে বেশি ফেরত লেখা যায় না।', 'You cannot write a refund larger than the money paid.'));
        else if (res === 'ok') { setAmt(''); setRef(''); setNote(''); onDone(payee === 'leader' ? tr('লিডারকে পাঠানো লেখা হয়েছে।', 'Payment to the leader written.') : tr('হাজীকে ফেরত লেখা হয়েছে।', 'Refund to the haji written.')); }
        else onFail(tr('তথ্য ঠিক নেই।', 'The details are not right.'));
      } catch (e) { onFail(errText(e)); } finally { setBusy(false); }
    });
  };
  const Line = ({ l, v, b }: { l: string; v: string; b?: boolean }) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}><Text style={st.p}>{l}</Text><Text style={[st.p, b && { fontWeight: '700' }]}>{v}</Text></View>;
  return (
    <View style={[st.card, Number(r.due_to_leader) > 0 && { borderWidth: 2, borderColor: C.accent }]}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={tr(`চুক্তি ${r.contract_no}, ${open ? 'লুকান' : 'বিস্তারিত'}`, `Contract ${r.contract_no}, ${open ? 'hide' : 'details'}`)}>
        <Text style={st.val}>{r.contract_no} · {r.haji_name} → {r.leader_name}</Text>
        <Text style={st.small}>{r.title} · {fmtTaka(r.price_bdt)}{r.travel_from ? tr(` · যাত্রা ${fmtDay(r.travel_from)}`, ` · travel ${fmtDay(r.travel_from)}`) : ''} · {open ? '▴' : '▾'}</Text>
      </Pressable>
      <Line l={tr("পাওয়া (নিশ্চিত)", 'Received (confirmed)')} v={fmtTaka(r.paid_in)} />
      {Number(r.pending_in) > 0 ? <Line l={tr("যাচাই বাকি", 'To check')} v={fmtTaka(r.pending_in)} /> : null}
      <Line l={tr(`কমিশন${r.commission_fixed != null ? ' (নির্দিষ্ট)' : ` (${toBn(r.rate_pct)}%)`}`, `Commission${r.commission_fixed != null ? ' (fixed)' : ` (${r.rate_pct}%)`}`)} v={fmtTaka(r.commission || 0)} />
      <Line l={tr("লিডারকে দেওয়া", 'Paid to the leader')} v={fmtTaka(r.paid_to_leader)} />
      {Number(r.refunded) > 0 ? <Line l={tr("হাজীকে ফেরত", 'Refunded to the haji')} v={fmtTaka(r.refunded)} /> : null}
      <Line l={tr("লিডারের পাওনা", 'Leader\'s due')} v={fmtTaka(r.due_to_leader || 0)} b />
      <Line l={tr("হাজীর বাকি", 'Haji still owes')} v={fmtTaka(r.still_to_pay)} />
      {open ? (
        <View style={[st.cRow, { paddingTop: S.sm }]}>
          <Field label={tr("এই চুক্তির কমিশন (টাকা)", 'Commission for this contract (Tk)')} hint={tr("খালি = লিডারের হার, 0 = পুরো ছাড়", 'Empty = leader\'s rate, 0 = fully waived')} value={comm} onChangeText={setComm} keyboardType="numeric" maxLength={12} />
          <Button title={tr("কমিশন সংরক্ষণ", 'Save commission')} icon="💾" kind="secondary" onPress={saveComm} disabled={busy} />
          <Text style={[st.h, { marginTop: S.md }]}>{tr('💸 টাকা পাঠানো লিখুন', '💸 Write a payment sent')}</Text>
          <Segmented value={payee} onChange={setPayee} options={[{ id: 'leader', label: tr('লিডারকে', 'To the leader') }, { id: 'haji', label: tr('হাজীকে ফেরত', 'Refund to the haji') }]} />
          <View style={{ height: S.sm }} />
          <Field label={tr("কত টাকা", 'How much')} value={amt} onChangeText={setAmt} keyboardType="numeric" maxLength={12} />
          <Field label={tr("লেনদেন নম্বর", 'Transaction number')} value={ref} onChangeText={setRef} maxLength={60} autoCapitalize="characters" />
          <Field label={tr("নোট (ইচ্ছা করলে)", 'Note (optional)')} value={note} onChangeText={setNote} maxLength={300} />
          <Button title={tr("লিখে রাখুন", 'Write it down')} icon="✍️" onPress={pay} loading={busy} />
        </View>
      ) : null}
    </View>
  );
}

// ---------- Default commission % per leader ----------
function Rates() {
  const { state, rows, load, gate } = useData(leaderRates);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <Text style={st.small}>{tr('প্রতিটি লিডারের সাধারণ কমিশন হার। কোনো চুক্তিতে আলাদা পরিমাণ দিতে "হিসাব" থেকে দিন।', 'Each leader\'s usual commission rate. To give a different amount for a contract, do it from "Accounts".')}</Text>
          {rows.length === 0 ? <Notice kind="info" title={tr("এখনো কোনো লিডার নেই", 'No leaders yet')} /> : null}
          {rows.map((r) => <RateRow key={r.leader_id} r={r} onDone={(t: string) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t: string) => setMsg({ kind: 'bad', text: t })} />)}
        </>
      ) : null}
    </>
  );
}
function RateRow({ r, onDone, onFail }: { r: Item<typeof leaderRates> } & Cb) {
  const [pct, setPct] = useState(String(r.commission_pct));
  const [note, setNote] = useState(r.note || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const v = num(pct);
    if (v === null || !Number.isFinite(v) || v < 0 || v > 100) { onFail(tr('হার ০ থেকে ১০০-এর মধ্যে লিখুন।', 'Write the rate between 0 and 100.')); return; }
    setBusy(true);
    try { await setLeaderRate(r.leader_id, v, note.trim()); onDone(tr(`${r.full_name}-এর হার ${toBn(v)}% সংরক্ষণ হয়েছে।`, `${r.full_name}'s rate of ${v}% saved.`)); } catch (e) { onFail(errText(e)); } finally { setBusy(false); }
  };
  return (
    <View style={st.card}>
      <Text style={st.val}>{r.full_name} ({r.leader_code})</Text>
      {r.agency_name ? <Text style={st.small}>{r.agency_name}</Text> : null}
      <Field label={tr("কমিশন হার (%)", 'Commission rate (%)')} value={pct} onChangeText={setPct} keyboardType="numeric" maxLength={6} />
      <Field label={tr("নোট (ইচ্ছা করলে)", 'Note (optional)')} hint={tr("যেমন: প্রথম ৫ হাজীতে ছাড়", 'e.g. discount for the first 5 hajis')} value={note} onChangeText={setNote} maxLength={300} />
      <Button title={tr("সংরক্ষণ", 'Save')} icon="💾" kind="secondary" onPress={save} loading={busy} />
    </View>
  );
}

// ---------- Where hajis send money (owner only) ----------
function PayInfo() {
  const [bkash, setBkash] = useState('');
  const [bank, setBank] = useState('');
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { payInfo().then((v) => { setBkash(v.bkash); setBank(v.bank); setState('ok'); }).catch((e) => setState(notReady(e) ? 'soon' : 'err')); }, []);
  const save = () => confirm(tr('অ্যাকাউন্টের তথ্য সংরক্ষণ করবেন?', 'Save the account details?'), tr('সব হাজী এখানেই টাকা পাঠাবেন। নম্বর আরেকবার মিলিয়ে নিন।', 'All hajis will send money here. Check the number once more.'), tr('হ্যাঁ, সংরক্ষণ', 'Yes, save'), async () => {
    setBusy(true); setMsg(null);
    try { await setSetting('pay_bkash', bkash.trim()); await setSetting('pay_bank', bank.trim()); setMsg({ kind: 'ok', text: tr('সংরক্ষণ হয়েছে। হাজীরা চুক্তির পাতায় এই তথ্য দেখবেন।', 'Saved. Hajis will see these details on the contract page.') }); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  });
  if (state === 'load') return <ActivityIndicator color={C.primary} />;
  if (state === 'soon') return <Notice kind="info" title={tr("শীঘ্রই চালু হবে", 'Coming soon')} text={tr("টাকার অংশের ডেটাবেস ধাপ (০০৮) এখনো চালানো হয়নি।", 'The database step (008) for the money part has not been run yet.')} />;
  if (state === 'err') return <Notice kind="bad" title={tr("তথ্য আনা যায়নি", 'Could not load the information')} />;
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Text style={[st.p, { marginBottom: S.md }]}>{tr('হাজীরা কোথায় টাকা পাঠাবেন। শুধু কোম্পানির অফিসিয়াল অ্যাকাউন্ট দিন।', 'Where hajis send money. Give only the company\'s official account.')}</Text>
      <Field label={tr("বিকাশ / নগদ (মার্চেন্ট নম্বর ও নাম)", 'bKash / Nagad (merchant number and name)')} hint={tr("যেমন: বিকাশ মার্চেন্ট 01XXXXXXXXX (Travel Adda), রেফারেন্সে চুক্তি নম্বর লিখুন", 'e.g. bKash merchant 01XXXXXXXXX (Travel Adda), write the contract number as the reference')} value={bkash} onChangeText={setBkash} multiline maxLength={400} />
      <Field label={tr("ব্যাংক অ্যাকাউন্ট", 'Bank account')} hint={tr("অ্যাকাউন্টের নাম, নম্বর, ব্যাংক ও শাখা", 'Account name, number, bank and branch')} value={bank} onChangeText={setBank} multiline maxLength={400} />
      <Button title={tr("সংরক্ষণ করুন", 'Save')} icon="💾" onPress={save} loading={busy} />
    </>
  );
}
