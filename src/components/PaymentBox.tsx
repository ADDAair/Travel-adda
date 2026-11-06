import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { View, Text, Pressable, Modal, type ViewStyle } from 'react-native';
import { tr } from '../lib/lang';
import { withCopy } from '../lib/offlineStore';
import { OfflineNote } from './OfflineNote';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C, S, R, TOUCH } from '../theme';
import { Button, Field, Notice } from './ui';
import { normalizeDigits } from '../lib/phone';
import { notReady } from '../lib/groups';
import { parseDate, todayYMD, ymdToInput } from '../lib/dates';
import { PAY_METHODS, PAY_STATUS, methodLabel, payInfo, myPayments, contractMoney, submitPayment,
  type ContractMoney, type MyPayment, type PayInfo, type PayMethod } from '../lib/payments';
import { DocCamera } from '../screens/DocsScreen';
import { st, confirm, errText, fmtDay, fmtTaka, fmtWhen } from '../screens/GroupScreen';

// Haji: pay Travel Adda (never the leader directly), record the payment with a receipt, and follow its status.
type Contract = { id: string };   // a contract (only its id is needed here)
type Msg = { kind: 'ok' | 'bad'; text: string } | null;
type File = { uri: string; kind: 'image' | 'pdf'; name: string };

export default function PaymentBox({ contract }: { contract: Contract }): JSX.Element | null {
  const [money, setMoney] = useState<ContractMoney | null>(null);
  const [rows, setRows] = useState<MyPayment[]>([]);
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [state, setState] = useState<'load' | 'ok' | 'soon' | 'err'>('load');
  const [form, setForm] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [offAt, setOffAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    payInfo().then(setInfo).catch(() => setInfo(null));
    try {
      const x = await withCopy(`pay.${contract.id}`, () => Promise.all([contractMoney(contract.id), myPayments(contract.id)]));
      const [m, p] = x.data;
      setMoney(m); setRows(p); setOffAt(x.offline ? x.at : null); setState('ok');
    } catch (e) { setState(notReady(e) ? 'soon' : 'err'); }
  }, [contract.id]);
  useEffect(() => { load(); }, [load]);

  if (state === 'soon') return null;      // database step 008 not run yet: nothing to show
  return (
    <View style={[st.cRow, { paddingTop: S.sm, marginTop: S.md }]}>
      <Text style={st.h}>{tr('💳 টাকা জমা', '💳 Payments')}</Text>
      {offAt ? <OfflineNote when={fmtWhen(offAt)} /> : null}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {state === 'err' ? <Notice kind="bad" title={tr('টাকার হিসাব আনা যায়নি', 'Could not load the money details')} text={tr('ইন্টারনেট দেখে আবার চেষ্টা করুন।', 'Check the internet and try again.')}><Button title={tr('আবার চেষ্টা করুন', 'Try again')} icon="🔄" kind="secondary" onPress={load} style={{ marginTop: S.sm }} /></Notice> : null}
      {money ? (
        <View style={p.sum}>
          <Line l={tr('প্যাকেজের মোট দাম', 'Total package price')} v={fmtTaka(money.price_bdt)} />
          <Line l={tr('✅ Travel Adda পেয়েছে', '✅ Travel Adda received')} v={fmtTaka(money.paid_in)} strong />
          {Number(money.pending_in) > 0 ? <Line l={tr('⏳ যাচাই চলছে', '⏳ Being checked')} v={fmtTaka(money.pending_in)} /> : null}
          <Line l={tr('বাকি', 'Still to pay')} v={fmtTaka(money.still_to_pay)} strong />
        </View>
      ) : null}
      <Notice kind="warn" title={tr('টাকা শুধু Travel Adda-র অফিসিয়াল অ্যাকাউন্টে দিন', 'Pay only into Travel Adda\'s official account')} text={tr('লিডার বা অন্য কাউকে হাতে বা নিজের নম্বরে টাকা দেবেন না। Travel Adda টাকা পেয়ে যাচাই করে লিডারকে দেবে, তাই আপনার টাকা নিরাপদ থাকে।', 'Do not give money by hand or to a personal number of the leader or anyone else. Travel Adda checks the money and then pays the leader, so your money stays safe.')} />
      {info && (info.bkash || info.bank) ? (
        <View style={p.info}>
          {info.bkash ? <Text style={st.p} selectable>📱 {info.bkash}</Text> : null}
          {info.bank ? <Text style={st.p} selectable>🏦 {info.bank}</Text> : null}
        </View>
      ) : <Notice kind="info" title={tr('অ্যাকাউন্ট নম্বর শীঘ্রই দেওয়া হবে', 'The account number will be given soon')} text={tr('এখন টাকা পাঠানোর আগে Travel Adda হেল্পলাইনে জেনে নিন।', 'For now, ask the Travel Adda helpline before sending money.')} />}
      {form ? <PayForm contract={contract} onClose={() => setForm(false)} onSaved={() => { setForm(false); setMsg({ kind: 'ok', text: tr('জমা দেওয়া হয়েছে। Travel Adda অ্যাকাউন্ট মিলিয়ে নিশ্চিত করবে।', 'Sent. Travel Adda will check its account and confirm.') }); load(); }} />
        : <Button title={tr('টাকা পাঠিয়েছি, তথ্য দিন', 'I have paid, give the details')} icon="🧾" onPress={() => { setMsg(null); setForm(true); }} style={{ marginTop: S.sm }} />}
      {rows.length ? <Text style={[st.lbl, { marginTop: S.md }]}>{tr('আমার জমা', 'My payments')}</Text> : null}
      {rows.map((r) => (
        <View key={r.id} style={st.cRow}>
          <Text style={st.val}>{fmtTaka(r.amount)} · {methodLabel(r.method)}</Text>
          <Text style={st.small}>{PAY_STATUS[r.status]?.icon} {PAY_STATUS[r.status]?.label} · {tr('লেনদেন নম্বর', 'Transaction no.')} {r.txn_ref} · {fmtDay(r.paid_on)}</Text>
          {r.status === 'rejected' && r.admin_note ? <Text style={st.small}>{tr('কারণ', 'Reason')}: {r.admin_note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const Line = ({ l, v, strong }: { l: string; v: string; strong?: boolean }) => (
  <View style={p.line}><Text style={st.p}>{l}</Text><Text style={[st.p, strong && { fontWeight: '700' }]}>{v}</Text></View>
);

function PayForm({ contract, onClose, onSaved }: { contract: Contract; onClose: () => void; onSaved: () => void }): JSX.Element {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('bkash');
  const [ref, setRef] = useState('');
  const [day, setDay] = useState(ymdToInput(todayYMD()));
  const [file, setFile] = useState<File | null>(null);
  const [cam, setCam] = useState(false);
  const [err, setErr] = useState<Partial<Record<'amount' | 'ref' | 'day', string>>>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets || !r.assets[0]) return;
      const a = r.assets[0];
      const pdf = a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.name || '');
      if (pdf && a.size && a.size > 5 * 1024 * 1024) { setFail(tr('ফাইলটি ৫ এমবির বেশি বড়।', 'The file is larger than 5 MB.')); return; }
      setFile({ uri: a.uri, kind: pdf ? 'pdf' : 'image', name: a.name || tr('রসিদ', 'Receipt') });
    } catch (e) { setFail(tr('ফাইল খোলা যায়নি।', 'Could not open the file.')); }
  };
  const save = () => {
    if (busy) return;
    const e: Partial<Record<'amount' | 'ref' | 'day', string>> = {};
    const amt = Number(normalizeDigits(amount).replace(/[,\s]/g, ''));
    const paidOn = parseDate(day, 2020);
    if (!Number.isFinite(amt) || amt <= 0 || amt >= 1e8) e.amount = tr('কত টাকা পাঠিয়েছেন, শুধু সংখ্যায় লিখুন।', 'Write how much you sent, in numbers only.');
    if (ref.trim().length < 3) e.ref = tr('লেনদেন নম্বর (TrxID) বা রসিদ নম্বর লিখুন।', 'Write the transaction number (TrxID) or receipt number.');
    if (!paidOn || paidOn > todayYMD()) e.day = tr('যে তারিখে পাঠিয়েছেন, লিখুন (আজ বা আগের দিন)।', 'Write the date you sent it (today or earlier).');
    setErr(e); setFail('');
    if (Object.keys(e).length) return;
    confirm(tr(`${fmtTaka(amt)} জমার তথ্য পাঠাবেন?`, `Send the details of the ${fmtTaka(amt)} payment?`), tr('Travel Adda অ্যাকাউন্টের সাথে মিলিয়ে নিশ্চিত করবে। ভুল তথ্য দেবেন না।', 'Travel Adda will check it against its account and confirm. Do not give wrong details.'), tr('হ্যাঁ, পাঠান', 'Yes, send'), async () => {
      setBusy(true);
      try { await submitPayment({ contractId: contract.id, amount: amt, method, ref, paidOn: paidOn as string, file }); onSaved(); }
      catch (err0) {
        const x = err0 as { code?: string; message?: string } | null;
        const m = String(x?.message || '');
        setFail(x?.code === 'too-big' ? tr('রসিদের ফাইল ৫ এমবির বেশি বড়।', 'The receipt file is larger than 5 MB.')
          : x?.code === '23505' ? tr('এই লেনদেন নম্বর আগেই জমা দেওয়া হয়েছে।', 'This transaction number has already been sent.')
            : x?.code === '42501' || /row-level security/i.test(m) ? tr('জমা দেওয়া যায়নি। চুক্তিটি এখন চালু আছে কি না দেখুন, বা আজ অনেকবার জমা দেওয়া হয়েছে।', 'Could not send. Check that the contract is active, or too many were sent today.')
              : errText(x));      // everything typed stays
        setBusy(false);
      }
    });
  };

  if (cam) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setCam(false)}>
        <SafeAreaProvider><DocCamera onCancel={() => setCam(false)} onUse={(uri: string) => { setCam(false); setFile({ uri, kind: 'image', name: tr('ক্যামেরার ছবি', 'Camera photo') }); }} /></SafeAreaProvider>
      </Modal>
    );
  }
  return (
    <View style={p.form}>
      {fail ? <Notice kind="bad" title={fail} /> : null}
      <Field label={tr('কত টাকা পাঠিয়েছেন', 'How much did you send')} hint={tr('যেমন: 50000', 'e.g. 50000')} value={amount} onChangeText={setAmount} keyboardType="numeric" maxLength={12} error={err.amount} />
      <Text style={[st.lbl, { marginBottom: S.xs }]}>{tr('কীভাবে পাঠিয়েছেন', 'How did you send it')}</Text>
      <View style={p.chips}>
        {PAY_METHODS.map((m) => (
          <Pressable key={m.id} onPress={() => setMethod(m.id)} style={[p.chip, method === m.id && p.chipOn]}
            accessibilityRole="radio" accessibilityState={{ selected: method === m.id }} accessibilityLabel={m.label}>
            <Text style={st.p}>{method === m.id ? '🔘' : '⚪'} {m.icon} {m.label}</Text>
          </Pressable>
        ))}
      </View>
      <Field label={tr('লেনদেন নম্বর (TrxID) বা রসিদ নম্বর', 'Transaction number (TrxID) or receipt number')} hint={tr('যেমন: 9A7B6C5D4E', 'e.g. 9A7B6C5D4E')} value={ref} onChangeText={setRef} maxLength={60} autoCapitalize="characters" autoCorrect={false} error={err.ref} />
      <Field label={tr('কবে পাঠিয়েছেন', 'When did you send it')} hint={tr('দিন-মাস-বছর', 'day-month-year')} value={day} onChangeText={setDay} maxLength={10} error={err.day} />
      <Text style={st.lbl}>{tr('রসিদ বা স্ক্রিনশট (ইচ্ছা করলে, দিলে যাচাই দ্রুত হয়)', 'Receipt or screenshot (optional; it makes checking faster)')}</Text>
      {file ? (
        <>
          <Notice kind="ok" title={tr(`যুক্ত হয়েছে: ${file.kind === 'pdf' ? '📕' : '🖼️'} ${file.name}`, `Added: ${file.kind === 'pdf' ? '📕' : '🖼️'} ${file.name}`)} />
          <Button title={tr('রসিদ সরিয়ে দিন', 'Remove the receipt')} kind="danger" onPress={() => setFile(null)} disabled={busy} />
        </>
      ) : (
        <>
          <Button title={tr('ক্যামেরায় রসিদের ছবি তুলুন', 'Take a photo of the receipt')} icon="📷" kind="secondary" onPress={() => setCam(true)} disabled={busy} style={{ marginTop: S.xs }} />
          <Button title={tr('ফোন থেকে স্ক্রিনশট বা ফাইল বাছুন', 'Choose a screenshot or file from the phone')} icon="📁" kind="secondary" onPress={pick} disabled={busy} style={{ marginTop: S.sm }} />
        </>
      )}
      <Button title={tr('জমার তথ্য পাঠান', 'Send payment details')} icon="📨" onPress={save} loading={busy} style={{ marginTop: S.md }} />
      <Button title={tr('বাতিল', 'Cancel')} kind="secondary" onPress={onClose} disabled={busy} style={{ marginTop: S.sm }} />
    </View>
  );
}

const p: Record<string, ViewStyle> = {
  sum: { backgroundColor: C.okSoft, borderRadius: R.md, padding: S.sm, marginBottom: S.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', paddingVertical: 2 },
  info: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.sm, marginBottom: S.sm },
  form: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.sm, marginTop: S.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: S.md },
  chip: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.sm, marginRight: S.xs, marginBottom: S.xs, borderRadius: R.md, borderWidth: 2, borderColor: C.line, backgroundColor: C.card },
  chipOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
};
