import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator } from 'react-native';
import { C, S, R, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { toBn, normalizeDigits } from '../lib/phone';
import { notReady, telBd } from '../lib/groups';
import { PAY_STATUS, methodLabel, listPayments, reviewPayment, ledger, leaderRates, setLeaderRate, setCommission, addPayout, receiptUrl, payInfo } from '../lib/payments';
import { setSetting } from '../lib/offers';
import { st, errText, confirm, fmtDay, fmtTaka } from './GroupScreen';

const num = (v) => { const t = normalizeDigits(String(v || '')).replace(/[,\s]/g, ''); return t === '' ? null : Number(t); };

// Admin / staff with the 'payments' permission: check hajis' payments, commission, payouts to leaders.
export default function MoneyTab({ owner }) {
  const [part, setPart] = useState('pending');
  return (
    <>
      <Segmented value={part} onChange={setPart} options={[{ id: 'pending', icon: '⏳', label: 'যাচাই' }, { id: 'ledger', icon: '📒', label: 'হিসাব' }]} />
      <View style={{ height: S.xs }} />
      <Segmented value={part} onChange={setPart} options={[{ id: 'rates', icon: '％', label: 'কমিশন হার' }, ...(owner ? [{ id: 'info', icon: '🏦', label: 'অ্যাকাউন্ট' }] : [])]} />
      <View style={{ height: S.md }} />
      {part === 'pending' ? <Pending /> : part === 'ledger' ? <Ledger /> : part === 'rates' ? <Rates /> : <PayInfo />}
    </>
  );
}

function useData(fn) {
  const [state, setState] = useState('load');
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    try { setRows(await fn()); setState('ok'); } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, [fn]);
  useEffect(() => { load(); }, [load]);
  const gate = state === 'load' ? <ActivityIndicator color={C.primary} />
    : state === 'soon' ? <Notice kind="info" title="শীঘ্রই চালু হবে" text="টাকার অংশের ডেটাবেস ধাপ (০০৮) এখনো চালানো হয়নি।" />
      : state === 'err' ? <Notice kind="bad" title="তথ্য আনা যায়নি"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null;
  return { state, rows, load, gate };
}

// ---------- Payments waiting for a check ----------
const allPayments = () => listPayments(null);
function Pending() {
  const { state, rows, load, gate } = useData(allPayments);
  const [msg, setMsg] = useState(null);
  const open = rows.filter((r) => r.status === 'submitted');
  const done = rows.filter((r) => r.status !== 'submitted').slice(0, 50);
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <Notice kind="info" title="নিশ্চিত করার আগে" text="ব্যাংক বা বিকাশ স্টেটমেন্টে লেনদেন নম্বর, টাকা ও তারিখ মিলিয়ে দেখুন। নিশ্চিত করা টাকা আর বদলানো যায় না।" />
          {open.length === 0 ? <Notice kind="ok" title="যাচাইয়ের কিছু বাকি নেই" /> : null}
          {open.map((r) => <PayCard key={r.id} r={r} onDone={(t) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t) => setMsg({ kind: 'bad', text: t })} />)}
          {done.length ? <Text style={[st.h, { marginTop: S.md }]}>আগের সিদ্ধান্ত</Text> : null}
          {done.map((r) => (
            <View key={r.id} style={st.card}>
              <Text style={st.val}>{fmtTaka(r.amount)} · {r.haji_name} ({r.haji_code})</Text>
              <Text style={st.small}>{PAY_STATUS[r.status]?.icon} {PAY_STATUS[r.status]?.label} · {methodLabel(r.method)} {r.txn_ref} · চুক্তি {r.contract_no}{r.admin_note ? ` · ${r.admin_note}` : ''}</Text>
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

function PayCard({ r, onDone, onFail }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = (ok) => {
    if (!ok && note.trim().length < 3) { onFail('বাতিলের কারণ নোটে লিখুন (হাজী দেখতে পাবেন)।'); return; }
    confirm(ok ? `${fmtTaka(r.amount)} পাওয়া গেছে বলে নিশ্চিত করবেন?` : 'জমাটি "মেলেনি" করবেন?', ok ? 'স্টেটমেন্টে মিলিয়ে নিয়েছেন তো? এটা আর ফেরানো যাবে না।' : 'হাজী আপনার নোট দেখবেন।',
      ok ? 'হ্যাঁ, পাওয়া গেছে' : 'হ্যাঁ, মেলেনি', async () => {
        setBusy(true);
        try { const res = await reviewPayment(r.id, ok, note.trim()); onDone(res === 'ok' ? (ok ? 'নিশ্চিত করা হয়েছে।' : 'মেলেনি হিসেবে চিহ্নিত হয়েছে।') : 'এই জমার সিদ্ধান্ত আগেই নেওয়া হয়েছে।'); }
        catch (e) { onFail(errText(e)); setBusy(false); }
      });
  };
  const openReceipt = async () => { try { await Linking.openURL(await receiptUrl(r.receipt_path)); } catch (e) { onFail('রসিদ খোলা যায়নি।'); } };
  return (
    <View style={[st.card, st.invite]}>
      <Text style={st.gName}>{fmtTaka(r.amount)}</Text>
      <Text style={st.p}>{methodLabel(r.method)} · লেনদেন নম্বর: <Text selectable style={{ fontWeight: '700' }}>{r.txn_ref}</Text></Text>
      <Text style={st.small}>পাঠানোর তারিখ {fmtDay(r.paid_on)} · জমা দিয়েছেন {fmtDay(r.created_at)}</Text>
      <View style={st.cRow}><Text style={st.lbl}>হাজী</Text><Text style={st.p}>{r.haji_name} · {r.haji_code}{r.haji_phone ? ` · ${toBn(r.haji_phone)}` : ''}</Text></View>
      <View style={st.cRow}><Text style={st.lbl}>চুক্তি</Text><Text style={st.p}>{r.contract_no} · {r.title} · {fmtTaka(r.price_bdt)} · লিডার {r.leader_name} ({r.leader_code})</Text></View>
      {r.receipt_path ? <Button title="রসিদ দেখুন" icon="🧾" kind="secondary" onPress={openReceipt} style={{ marginTop: S.sm }} /> : <Text style={st.small}>রসিদ দেননি।</Text>}
      {r.haji_phone ? <Button title={`হাজীকে ফোন করুন (${toBn(r.haji_phone)})`} icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(r.haji_phone)}`).catch(() => {})} style={{ marginTop: S.sm }} /> : null}
      <View style={{ marginTop: S.md }}><Field label="নোট (মেলেনি হলে কারণ)" hint="যেমন: এই নম্বরে টাকা আসেনি" value={note} onChangeText={setNote} maxLength={500} /></View>
      <Button title="টাকা পাওয়া গেছে" icon="✅" onPress={() => decide(true)} loading={busy} />
      <Button title="মেলেনি" kind="danger" onPress={() => decide(false)} disabled={busy} style={{ marginTop: S.sm }} />
    </View>
  );
}

// ---------- Ledger: per contract ----------
function Ledger() {
  const { state, rows, load, gate } = useData(ledger);
  const [msg, setMsg] = useState(null);
  const total = rows.reduce((a, r) => ({ in: a.in + Number(r.paid_in), comm: a.comm + Number(r.commission || 0), due: a.due + Number(r.due_to_leader || 0) }), { in: 0, comm: 0, due: 0 });
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <View style={st.card}>
            <Text style={st.p}>মোট পাওয়া (নিশ্চিত): <Text style={{ fontWeight: '700' }}>{fmtTaka(total.in)}</Text></Text>
            <Text style={st.p}>মোট কমিশন: <Text style={{ fontWeight: '700' }}>{fmtTaka(total.comm)}</Text></Text>
            <Text style={st.p}>লিডারদের মোট পাওনা: <Text style={{ fontWeight: '700' }}>{fmtTaka(total.due)}</Text></Text>
          </View>
          {rows.length === 0 ? <Notice kind="info" title="এখনো কোনো চালু চুক্তি নেই" /> : null}
          {rows.map((r) => <LedgerCard key={r.contract_id} r={r} onDone={(t) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t) => setMsg({ kind: 'bad', text: t })} />)}
        </>
      ) : null}
    </>
  );
}

function LedgerCard({ r, onDone, onFail }) {
  const [open, setOpen] = useState(false);
  const [comm, setComm] = useState(r.commission_fixed != null ? String(r.commission_fixed) : '');
  const [payee, setPayee] = useState('leader');
  const [amt, setAmt] = useState('');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const saveComm = () => {
    const v = comm.trim() === '' ? null : num(comm);
    if (v !== null && (!Number.isFinite(v) || v < 0)) { onFail('কমিশন শুধু সংখ্যায় লিখুন, অথবা খালি রাখুন (তখন লিডারের হার অনুযায়ী)।'); return; }
    confirm('কমিশন সংরক্ষণ করবেন?', v === null ? `লিডারের হার (${toBn(r.rate_pct)}%) অনুযায়ী হিসাব হবে।` : `এই চুক্তিতে কমিশন ${fmtTaka(v)}।${v === 0 ? ' (পুরো ছাড়)' : ''}`, 'হ্যাঁ, সংরক্ষণ', async () => {
      setBusy(true);
      try { await setCommission(r.contract_id, v); onDone('কমিশন সংরক্ষণ হয়েছে।'); } catch (e) { onFail(errText(e)); } finally { setBusy(false); }
    });
  };
  const pay = () => {
    const v = num(amt);
    if (!Number.isFinite(v) || v <= 0) { onFail('কত টাকা পাঠিয়েছেন, সংখ্যায় লিখুন।'); return; }
    if (ref.trim().length < 3) { onFail('ব্যাংক/বিকাশের লেনদেন নম্বর লিখুন।'); return; }
    confirm(payee === 'leader' ? `লিডারকে ${fmtTaka(v)} পাঠানো লিখবেন?` : `হাজীকে ${fmtTaka(v)} ফেরত লিখবেন?`, 'আগে টাকাটা সত্যিই পাঠিয়ে তারপর এখানে লিখুন। এটা আর মোছা যায় না।', 'হ্যাঁ, লিখুন', async () => {
      setBusy(true);
      try {
        const res = await addPayout(r.contract_id, payee, v, ref.trim(), note.trim());
        if (res === 'over') onFail(payee === 'leader' ? 'লিডারের পাওনার চেয়ে বেশি লেখা যায় না।' : 'জমা টাকার চেয়ে বেশি ফেরত লেখা যায় না।');
        else if (res === 'ok') { setAmt(''); setRef(''); setNote(''); onDone(payee === 'leader' ? 'লিডারকে পাঠানো লেখা হয়েছে।' : 'হাজীকে ফেরত লেখা হয়েছে।'); }
        else onFail('তথ্য ঠিক নেই।');
      } catch (e) { onFail(errText(e)); } finally { setBusy(false); }
    });
  };
  const Row = ({ l, v, b }) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}><Text style={st.p}>{l}</Text><Text style={[st.p, b && { fontWeight: '700' }]}>{v}</Text></View>;
  return (
    <View style={[st.card, Number(r.due_to_leader) > 0 && { borderWidth: 2, borderColor: C.accent }]}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={`চুক্তি ${r.contract_no}, ${open ? 'লুকান' : 'বিস্তারিত'}`}>
        <Text style={st.val}>{r.contract_no} · {r.haji_name} → {r.leader_name}</Text>
        <Text style={st.small}>{r.title} · {fmtTaka(r.price_bdt)}{r.travel_from ? ` · যাত্রা ${fmtDay(r.travel_from)}` : ''} · {open ? '▴' : '▾'}</Text>
      </Pressable>
      <Row l="পাওয়া (নিশ্চিত)" v={fmtTaka(r.paid_in)} />
      {Number(r.pending_in) > 0 ? <Row l="যাচাই বাকি" v={fmtTaka(r.pending_in)} /> : null}
      <Row l={`কমিশন${r.commission_fixed != null ? ' (নির্দিষ্ট)' : ` (${toBn(r.rate_pct)}%)`}`} v={fmtTaka(r.commission || 0)} />
      <Row l="লিডারকে দেওয়া" v={fmtTaka(r.paid_to_leader)} />
      {Number(r.refunded) > 0 ? <Row l="হাজীকে ফেরত" v={fmtTaka(r.refunded)} /> : null}
      <Row l="লিডারের পাওনা" v={fmtTaka(r.due_to_leader || 0)} b />
      <Row l="হাজীর বাকি" v={fmtTaka(r.still_to_pay)} />
      {open ? (
        <View style={[st.cRow, { paddingTop: S.sm }]}>
          <Field label="এই চুক্তির কমিশন (টাকা)" hint="খালি = লিডারের হার, 0 = পুরো ছাড়" value={comm} onChangeText={setComm} keyboardType="numeric" maxLength={12} />
          <Button title="কমিশন সংরক্ষণ" icon="💾" kind="secondary" onPress={saveComm} disabled={busy} />
          <Text style={[st.h, { marginTop: S.md }]}>💸 টাকা পাঠানো লিখুন</Text>
          <Segmented value={payee} onChange={setPayee} options={[{ id: 'leader', label: 'লিডারকে' }, { id: 'haji', label: 'হাজীকে ফেরত' }]} />
          <View style={{ height: S.sm }} />
          <Field label="কত টাকা" value={amt} onChangeText={setAmt} keyboardType="numeric" maxLength={12} />
          <Field label="লেনদেন নম্বর" value={ref} onChangeText={setRef} maxLength={60} autoCapitalize="characters" />
          <Field label="নোট (ইচ্ছা করলে)" value={note} onChangeText={setNote} maxLength={300} />
          <Button title="লিখে রাখুন" icon="✍️" onPress={pay} loading={busy} />
        </View>
      ) : null}
    </View>
  );
}

// ---------- Default commission % per leader ----------
function Rates() {
  const { state, rows, load, gate } = useData(leaderRates);
  const [msg, setMsg] = useState(null);
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {gate}
      {state === 'ok' ? (
        <>
          <Text style={st.small}>প্রতিটি লিডারের সাধারণ কমিশন হার। কোনো চুক্তিতে আলাদা পরিমাণ দিতে "হিসাব" থেকে দিন।</Text>
          {rows.length === 0 ? <Notice kind="info" title="এখনো কোনো লিডার নেই" /> : null}
          {rows.map((r) => <RateRow key={r.leader_id} r={r} onDone={(t) => { setMsg({ kind: 'ok', text: t }); load(); }} onFail={(t) => setMsg({ kind: 'bad', text: t })} />)}
        </>
      ) : null}
    </>
  );
}
function RateRow({ r, onDone, onFail }) {
  const [pct, setPct] = useState(String(r.commission_pct));
  const [note, setNote] = useState(r.note || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const v = num(pct);
    if (!Number.isFinite(v) || v < 0 || v > 100) { onFail('হার ০ থেকে ১০০-এর মধ্যে লিখুন।'); return; }
    setBusy(true);
    try { await setLeaderRate(r.leader_id, v, note.trim()); onDone(`${r.full_name}-এর হার ${toBn(v)}% সংরক্ষণ হয়েছে।`); } catch (e) { onFail(errText(e)); } finally { setBusy(false); }
  };
  return (
    <View style={st.card}>
      <Text style={st.val}>{r.full_name} ({r.leader_code})</Text>
      {r.agency_name ? <Text style={st.small}>{r.agency_name}</Text> : null}
      <Field label="কমিশন হার (%)" value={pct} onChangeText={setPct} keyboardType="numeric" maxLength={6} />
      <Field label="নোট (ইচ্ছা করলে)" hint="যেমন: প্রথম ৫ হাজীতে ছাড়" value={note} onChangeText={setNote} maxLength={300} />
      <Button title="সংরক্ষণ" icon="💾" kind="secondary" onPress={save} loading={busy} />
    </View>
  );
}

// ---------- Where hajis send money (owner only) ----------
function PayInfo() {
  const [bkash, setBkash] = useState('');
  const [bank, setBank] = useState('');
  const [state, setState] = useState('load');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { payInfo().then((v) => { setBkash(v.bkash); setBank(v.bank); setState('ok'); }).catch((e) => setState(notReady(e) ? 'soon' : 'err')); }, []);
  const save = () => confirm('অ্যাকাউন্টের তথ্য সংরক্ষণ করবেন?', 'সব হাজী এখানেই টাকা পাঠাবেন। নম্বর আরেকবার মিলিয়ে নিন।', 'হ্যাঁ, সংরক্ষণ', async () => {
    setBusy(true); setMsg(null);
    try { await setSetting('pay_bkash', bkash.trim()); await setSetting('pay_bank', bank.trim()); setMsg({ kind: 'ok', text: 'সংরক্ষণ হয়েছে। হাজীরা চুক্তির পাতায় এই তথ্য দেখবেন।' }); }
    catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  });
  if (state === 'load') return <ActivityIndicator color={C.primary} />;
  if (state === 'soon') return <Notice kind="info" title="শীঘ্রই চালু হবে" text="টাকার অংশের ডেটাবেস ধাপ (০০৮) এখনো চালানো হয়নি।" />;
  if (state === 'err') return <Notice kind="bad" title="তথ্য আনা যায়নি" />;
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Text style={[st.p, { marginBottom: S.md }]}>হাজীরা কোথায় টাকা পাঠাবেন। শুধু কোম্পানির অফিসিয়াল অ্যাকাউন্ট দিন।</Text>
      <Field label="বিকাশ / নগদ (মার্চেন্ট নম্বর ও নাম)" hint="যেমন: বিকাশ মার্চেন্ট 01XXXXXXXXX (Travel Adda), রেফারেন্সে চুক্তি নম্বর লিখুন" value={bkash} onChangeText={setBkash} multiline maxLength={400} />
      <Field label="ব্যাংক অ্যাকাউন্ট" hint="অ্যাকাউন্টের নাম, নম্বর, ব্যাংক ও শাখা" value={bank} onChangeText={setBank} multiline maxLength={400} />
      <Button title="সংরক্ষণ করুন" icon="💾" onPress={save} loading={busy} />
    </>
  );
}
