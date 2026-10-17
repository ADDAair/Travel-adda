import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C, S, R, TOUCH } from '../theme';
import { Button, Field, Notice } from './ui';
import { normalizeDigits } from '../lib/phone';
import { notReady } from '../lib/groups';
import { parseDate, todayYMD, ymdToInput } from '../lib/dates';
import { PAY_METHODS, PAY_STATUS, methodLabel, payInfo, myPayments, contractMoney, submitPayment } from '../lib/payments';
import { DocCamera } from '../screens/DocsScreen';
import { st, confirm, errText, fmtDay, fmtTaka } from '../screens/GroupScreen';

// Haji: pay Travel Adda (never the leader directly), record the payment with a receipt, and follow its status.
export default function PaymentBox({ contract }) {
  const [money, setMoney] = useState(null);
  const [rows, setRows] = useState([]);
  const [info, setInfo] = useState(null);
  const [state, setState] = useState('load');   // load | ok | soon | err
  const [form, setForm] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    payInfo().then(setInfo).catch(() => setInfo(null));
    try {
      const [m, p] = await Promise.all([contractMoney(contract.id), myPayments(contract.id)]);
      setMoney(m); setRows(p); setState('ok');
    } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, [contract.id]);
  useEffect(() => { load(); }, [load]);

  if (state === 'soon') return null;      // database step 008 not run yet: nothing to show
  return (
    <View style={[st.cRow, { paddingTop: S.sm, marginTop: S.md }]}>
      <Text style={st.h}>💳 টাকা জমা</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'err' ? <Notice kind="bad" title="টাকার হিসাব আনা যায়নি" text="ইন্টারনেট দেখে আবার চেষ্টা করুন।"><Button title="আবার চেষ্টা করুন" icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {money ? (
        <View style={p.sum}>
          <Line l="প্যাকেজের মোট দাম" v={fmtTaka(money.price_bdt)} />
          <Line l="✅ Travel Adda পেয়েছে" v={fmtTaka(money.paid_in)} strong />
          {Number(money.pending_in) > 0 ? <Line l="⏳ যাচাই চলছে" v={fmtTaka(money.pending_in)} /> : null}
          <Line l="বাকি" v={fmtTaka(money.still_to_pay)} strong />
        </View>
      ) : null}
      <Notice kind="warn" title="টাকা শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে দিন" text="লিডার বা অন্য কাউকে হাতে বা নিজের নম্বরে টাকা দেবেন না। Travel Adda টাকা পেয়ে যাচাই করে লিডারকে দেবে, তাই আপনার টাকা নিরাপদ থাকে।" />
      {info && (info.bkash || info.bank) ? (
        <View style={p.info}>
          {info.bkash ? <Text style={st.p} selectable>📱 {info.bkash}</Text> : null}
          {info.bank ? <Text style={st.p} selectable>🏦 {info.bank}</Text> : null}
        </View>
      ) : <Notice kind="info" title="অ্যাকাউন্ট নম্বর শীঘ্রই দেওয়া হবে" text="এখন টাকা পাঠানোর আগে Travel Adda হেল্পলাইনে জেনে নিন।" />}
      {form ? <PayForm contract={contract} onClose={() => setForm(false)} onSaved={() => { setForm(false); setMsg({ kind: 'ok', text: 'জমা দেওয়া হয়েছে। Travel Adda অ্যাকাউন্ট মিলিয়ে নিশ্চিত করবে।' }); load(); }} />
        : <Button title="টাকা পাঠিয়েছি, তথ্য দিন" icon="🧾" onPress={() => { setMsg(null); setForm(true); }} style={{ marginTop: S.sm }} />}
      {rows.length ? <Text style={[st.lbl, { marginTop: S.md }]}>আমার জমা</Text> : null}
      {rows.map((r) => (
        <View key={r.id} style={st.cRow}>
          <Text style={st.val}>{fmtTaka(r.amount)} · {methodLabel(r.method)}</Text>
          <Text style={st.small}>{PAY_STATUS[r.status]?.icon} {PAY_STATUS[r.status]?.label} · লেনদেন নম্বর {r.txn_ref} · {fmtDay(r.paid_on)}</Text>
          {r.status === 'rejected' && r.admin_note ? <Text style={st.small}>কারণ: {r.admin_note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const Line = ({ l, v, strong }) => (
  <View style={p.line}><Text style={st.p}>{l}</Text><Text style={[st.p, strong && { fontWeight: '700' }]}>{v}</Text></View>
);

function PayForm({ contract, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bkash');
  const [ref, setRef] = useState('');
  const [day, setDay] = useState(ymdToInput(todayYMD()));
  const [file, setFile] = useState(null);
  const [cam, setCam] = useState(false);
  const [err, setErr] = useState({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets || !r.assets[0]) return;
      const a = r.assets[0];
      const pdf = a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.name || '');
      if (pdf && a.size && a.size > 5 * 1024 * 1024) { setFail('ফাইলটি ৫ এমবির বেশি বড়।'); return; }
      setFile({ uri: a.uri, kind: pdf ? 'pdf' : 'image', name: a.name || 'রসিদ' });
    } catch (e) { setFail('ফাইল খোলা যায়নি।'); }
  };
  const save = () => {
    if (busy) return;
    const e = {};
    const amt = Number(normalizeDigits(amount).replace(/[,\s]/g, ''));
    const paidOn = parseDate(day, 2020);
    if (!Number.isFinite(amt) || amt <= 0 || amt >= 1e8) e.amount = 'কত টাকা পাঠিয়েছেন, শুধু সংখ্যায় লিখুন।';
    if (ref.trim().length < 3) e.ref = 'লেনদেন নম্বর (TrxID) বা রসিদ নম্বর লিখুন।';
    if (!paidOn || paidOn > todayYMD()) e.day = 'যে তারিখে পাঠিয়েছেন, লিখুন (আজ বা আগের দিন)।';
    setErr(e); setFail('');
    if (Object.keys(e).length) return;
    confirm(`${fmtTaka(amt)} জমার তথ্য পাঠাবেন?`, 'Travel Adda অ্যাকাউন্টের সাথে মিলিয়ে নিশ্চিত করবে। ভুল তথ্য দেবেন না।', 'হ্যাঁ, পাঠান', async () => {
      setBusy(true);
      try { await submitPayment({ contractId: contract.id, amount: amt, method, ref, paidOn, file }); onSaved(); }
      catch (x) {
        const m = String(x?.message || '');
        setFail(x?.code === 'too-big' ? 'রসিদের ফাইল ৫ এমবির বেশি বড়।'
          : x?.code === '23505' ? 'এই লেনদেন নম্বর আগেই জমা দেওয়া হয়েছে।'
            : x?.code === '42501' || /row-level security/i.test(m) ? 'জমা দেওয়া যায়নি। চুক্তিটি এখন চালু আছে কি না দেখুন, বা আজ অনেকবার জমা দেওয়া হয়েছে।'
              : errText(x));      // everything typed stays
        setBusy(false);
      }
    });
  };

  if (cam) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setCam(false)}>
        <SafeAreaProvider><DocCamera onCancel={() => setCam(false)} onUse={(uri) => { setCam(false); setFile({ uri, kind: 'image', name: 'ক্যামেরার ছবি' }); }} /></SafeAreaProvider>
      </Modal>
    );
  }
  return (
    <View style={p.form}>
      {fail ? <Notice kind="bad" title={fail} /> : null}
      <Field label="কত টাকা পাঠিয়েছেন" hint="যেমন: 50000" value={amount} onChangeText={setAmount} keyboardType="numeric" maxLength={12} error={err.amount} />
      <Text style={[st.lbl, { marginBottom: S.xs }]}>কীভাবে পাঠিয়েছেন</Text>
      <View style={p.chips}>
        {PAY_METHODS.map((m) => (
          <Pressable key={m.id} onPress={() => setMethod(m.id)} style={[p.chip, method === m.id && p.chipOn]}
            accessibilityRole="radio" accessibilityState={{ selected: method === m.id }} accessibilityLabel={m.label}>
            <Text style={st.p}>{method === m.id ? '🔘' : '⚪'} {m.icon} {m.label}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="লেনদেন নম্বর (TrxID) বা রসিদ নম্বর" hint="যেমন: 9A7B6C5D4E" value={ref} onChangeText={setRef} maxLength={60} autoCapitalize="characters" autoCorrect={false} error={err.ref} />
      <Field label="কবে পাঠিয়েছেন" hint="দিন-মাস-বছর" value={day} onChangeText={setDay} maxLength={10} error={err.day} />
      <Text style={st.lbl}>রসিদ বা স্ক্রিনশট (ইচ্ছা করলে, দিলে যাচাই দ্রুত হয়)</Text>
      {file ? (
        <>
          <Notice kind="ok" title={`যুক্ত হয়েছে: ${file.kind === 'pdf' ? '📕' : '🖼️'} ${file.name}`} />
          <Button title="রসিদ সরিয়ে দিন" kind="danger" onPress={() => setFile(null)} disabled={busy} />
        </>
      ) : (
        <>
          <Button title="ক্যামেরায় রসিদের ছবি তুলুন" icon="📷" kind="secondary" onPress={() => setCam(true)} disabled={busy} style={{ marginTop: S.xs }} />
          <Button title="ফোন থেকে স্ক্রিনশট বা ফাইল বাছুন" icon="📁" kind="secondary" onPress={pick} disabled={busy} style={{ marginTop: S.sm }} />
        </>
      )}
      <Button title="জমার তথ্য পাঠান" icon="📨" onPress={save} loading={busy} style={{ marginTop: S.md }} />
      <Button title="বাতিল" kind="secondary" onPress={onClose} disabled={busy} style={{ marginTop: S.sm }} />
    </View>
  );
}

const p = {
  sum: { backgroundColor: C.okSoft, borderRadius: R.md, padding: S.sm, marginBottom: S.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', paddingVertical: 2 },
  info: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.sm, marginBottom: S.sm },
  form: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.sm, marginTop: S.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: S.md },
  chip: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.sm, marginRight: S.xs, marginBottom: S.xs, borderRadius: R.md, borderWidth: 2, borderColor: C.line, backgroundColor: C.card },
  chipOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
};
