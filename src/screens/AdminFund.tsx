// Admin: help fund — applications (admin / staff with "users"), donations to confirm and spending (staff with "payments").
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Linking, Pressable } from 'react-native';
import { C, S, R, F, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { st, fmtDay, confirm } from './GroupScreen';
import { toBn } from '../lib/phone';
import { telBd } from '../lib/groups';
import { helpApplications, decideHelp, helpTravelled, fundDonations, reviewDonation, spendFund, helpErrorText, kindLabel, helpStatusText,
  fundSummary } from '../lib/fund';
import { methodLabel } from '../lib/payments';
import { setSetting } from '../lib/offers';
import { supabase } from '../lib/supabase';

type Row = Record<string, any>;
type Msg = { kind: 'ok' | 'bad' | 'warn' | 'info'; text: string } | null;
const taka = (n: unknown): string => `${toBn(Math.round(Number(n || 0)).toLocaleString('en-IN'))} টাকা`;
const errOf = (e: unknown): string => ((e as { code?: string })?.code === 'reason' ? 'কারণ অন্তত ৫ অক্ষরে লিখুন।' : helpErrorText(e));

export default function FundTab({ perms }: { perms: string[] }) {
  const canApps = perms.includes('admin') || perms.includes('users');
  const canMoney = perms.includes('admin') || perms.includes('payments');
  const tabs = [canApps ? { id: 'apps', icon: '📝', label: 'আবেদন' } : null, canMoney ? { id: 'gifts', icon: '💝', label: 'দান যাচাই' } : null,
    canMoney ? { id: 'spend', icon: '💸', label: 'খরচ' } : null, perms.includes('admin') ? { id: 'acct', icon: '🏦', label: 'অ্যাকাউন্ট' } : null].filter(Boolean) as { id: string; icon: string; label: string }[];
  const [tab, setTab] = useState(tabs[0] ? tabs[0].id : '');
  return (
    <>
      <Text style={[st.small, { marginBottom: S.sm }]}>সদকার তহবিল। আবেদনকারীর দেওয়া পরিচিত মানুষকে ফোন করে যাচাই করুন। প্রতিটি সিদ্ধান্ত ও খরচ কাজের রেকর্ডে থাকে, আর খরচ সবাই (নাম ছাড়া) দেখেন।</Text>
      {tabs.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }} accessibilityRole="tablist">
          {tabs.map((t) => {
            const on = tab === t.id;
            // Icon above the word, so even a long word has the full width. Only the border and background change when
            // chosen (never the text style: on some Android phones the label is cut when its style changes).
            return (
              <Pressable key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}
                style={{ width: '48.5%', minHeight: TOUCH + 28, marginBottom: S.xs, paddingVertical: S.xs, alignItems: 'center', justifyContent: 'center',
                  borderRadius: R.md, borderWidth: on ? 3 : 2, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primarySoft : C.card }}>
                <Text style={{ fontSize: 26 }} importantForAccessibility="no">{t.icon}</Text>
                <Text style={{ fontSize: F.body, fontWeight: '700', color: C.text, textAlign: 'center' }}>{t.label}</Text>
                <View style={{ height: 4, width: 40, borderRadius: 2, marginTop: 2, backgroundColor: on ? C.accent : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={{ height: S.sm }} />
      {tab === 'apps' ? <Apps /> : tab === 'gifts' ? <Gifts /> : tab === 'spend' ? <Spend /> : tab === 'acct' ? <Account /> : null}
    </>
  );
}

function Apps() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(() => { setRows(null); helpApplications(status).then(setRows).catch((e) => { setRows([]); setMsg({ kind: 'bad', text: helpErrorText(e) }); }); }, [status]);
  useEffect(() => { load(); }, [load]);
  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(id); setMsg(null);
    try { const r = await fn(); setMsg(r === 'ok' ? { kind: 'ok', text: ok } : { kind: 'info', text: 'এটি আগেই সিদ্ধান্ত হয়ে গেছে।' }); load(); }
    catch (e) { setMsg({ kind: 'bad', text: errOf(e) }); }
    finally { setBusy(null); }
  };
  return (
    <>
      <Segmented value={status} onChange={setStatus} options={[{ id: 'pending', label: 'যাচাই বাকি' }, { id: 'approved', label: 'অনুমোদিত' }, { id: 'funded', label: 'টাকা দেওয়া' }]} />
      <View style={{ height: S.sm }} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && !rows.length ? <Notice kind="ok" title="এখানে কোনো আবেদন নেই" /> : null}
      {(rows || []).map((a) => (
        <View key={a.id} style={st.card}>
          <Text style={st.val}>{a.full_name} ({a.code}) · {kindLabel(a.kind)}</Text>
          <Text style={st.p}>বয়স {toBn(a.age)} · {a.district} · {a.profession}{a.went_before ? ' · আগে গিয়েছেন' : ''}</Text>
          <Text style={st.p}>কারণ: {a.reason}</Text>
          <Text style={st.p}>পরিচিত: {a.reference_name} · {a.reference_phone}</Text>
          <Text style={st.small}>{helpStatusText(a.status)} · জমা {fmtDay(a.created_at)}{Number(a.spent) ? ` · দেওয়া হয়েছে ${taka(a.spent)}` : ''}{a.show_name ? ' · নাম দেখাতে রাজি' : ' · নাম গোপন'}</Text>
          <Button title="পরিচিত মানুষকে ফোন করুন" icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(a.reference_phone)}`).catch(() => {})} style={{ marginTop: S.sm }} />
          {a.phone ? <Button title="আবেদনকারীকে ফোন করুন" icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(a.phone)}`).catch(() => {})} style={{ marginTop: S.xs }} /> : null}
          {a.status === 'pending' ? (
            <>
              <Field label="নোট / বাতিলের কারণ (আবেদনকারী বাতিলের কারণ দেখবেন)" value={note[a.id] || ''} onChangeText={(v: string) => setNote((n) => ({ ...n, [a.id]: v }))} maxLength={300} editable={busy !== a.id} />
              <Button title="যাচাই হয়েছে, অনুমোদন দিন" icon="✅" loading={busy === a.id}
                onPress={() => confirm('অনুমোদন দেবেন?', 'অনুমোদিত তালিকায় যাবে (নাম গোপন থাকলে শুধু জেলা ও বয়স দেখাবে)।', 'হ্যাঁ, অনুমোদন', () => act(a.id, () => decideHelp(a.id, 'approve', note[a.id]), 'অনুমোদন দেওয়া হয়েছে।'))} />
              <Button title="বাতিল করুন" icon="✖️" kind="danger" disabled={busy === a.id} style={{ marginTop: S.xs }}
                onPress={() => act(a.id, () => decideHelp(a.id, 'reject', note[a.id]), 'বাতিল করা হয়েছে।')} />
            </>
          ) : null}
          {a.status === 'funded' ? (
            <Button title="সফর সম্পন্ন হয়েছে" icon="🕋" kind="secondary" loading={busy === a.id} style={{ marginTop: S.xs }}
              onPress={() => confirm('সফর সম্পন্ন হয়েছে লিখবেন?', 'মোট "সফর সম্পন্ন" সংখ্যায় যোগ হবে।', 'হ্যাঁ', () => act(a.id, () => helpTravelled(a.id), 'সফর সম্পন্ন লেখা হয়েছে।'))} />
          ) : null}
        </View>
      ))}
    </>
  );
}

function Gifts() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(() => { setRows(null); fundDonations('submitted').then(setRows).catch((e) => { setRows([]); setMsg({ kind: 'bad', text: helpErrorText(e) }); }); }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (id: string, ok: boolean) => {
    if (busy) return;
    setBusy(id); setMsg(null);
    try { const r = await reviewDonation(id, ok, note[id]); setMsg(r === 'ok' ? { kind: 'ok', text: ok ? 'নিশ্চিত হয়েছে। মোট জমায় যোগ হয়েছে।' : 'বাতিল করা হয়েছে।' } : { kind: 'info', text: 'এটি আগেই যাচাই হয়ে গেছে।' }); load(); }
    catch (e) { setMsg({ kind: 'bad', text: errOf(e) }); }
    finally { setBusy(null); }
  };
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && !rows.length ? <Notice kind="ok" title="যাচাই বাকি কোনো দান নেই" /> : null}
      {(rows || []).map((d) => (
        <View key={d.id} style={st.card}>
          <Text style={st.val}>{taka(d.amount)} · {methodLabel(d.method)}</Text>
          <Text style={st.p} selectable>লেনদেন নম্বর: {d.txn_ref} · তারিখ: {fmtDay(d.paid_on)}</Text>
          <Text style={st.small}>দাতা: {d.donor_name || '—'} ({d.donor_code || '—'}) · {d.show_name ? 'নাম দেখাতে রাজি' : 'নাম গোপন'}</Text>
          <Text style={[st.small, { marginBottom: S.sm }]}>অ্যাকাউন্টে টাকা এসেছে কিনা মিলিয়ে তারপর নিশ্চিত করুন।</Text>
          <Button title="টাকা পেয়েছি, নিশ্চিত করুন" icon="✅" loading={busy === d.id} onPress={() => act(d.id, true)} />
          <Field label="না মিললে কারণ" value={note[d.id] || ''} onChangeText={(v: string) => setNote((n) => ({ ...n, [d.id]: v }))} maxLength={300} editable={busy !== d.id} />
          <Button title="মেলেনি, বাতিল করুন" icon="✖️" kind="danger" disabled={busy === d.id} onPress={() => act(d.id, false)} />
        </View>
      ))}
    </>
  );
}

function Spend() {
  const [bal, setBal] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pick, setPick] = useState('');
  const [f, setF] = useState({ amount: '', purpose: '', ref: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    try {
      const [s, a, b] = await Promise.all([fundSummary(), helpApplications('approved'), helpApplications('funded')]);
      setBal(s ? s.balance : 0); setRows([...a, ...b]);
    } catch (e) { setRows([]); setMsg({ kind: 'bad', text: helpErrorText(e) }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const cur = (rows || []).find((r) => r.id === pick);
  const send = async () => {
    if (busy || !cur) return;
    setBusy(true); setMsg(null);
    try { await spendFund(cur.id, f.amount, f.purpose, f.ref); setMsg({ kind: 'ok', text: 'খরচ লেখা হয়েছে। সবাই হিসাবে দেখতে পাবেন (নাম গোপন থাকলে নাম ছাড়া)।' }); setF({ amount: '', purpose: '', ref: '' }); setPick(''); load(); }
    catch (e) { setMsg({ kind: 'bad', text: errOf(e) }); }      // the form keeps what was typed
    finally { setBusy(false); }
  };
  return (
    <>
      <Notice kind="info" title={bal === null ? 'তহবিলের হিসাব আনা হচ্ছে…' : `এখন তহবিলে: ${taka(bal)}`} text="এর বেশি খরচ লেখা যাবে না।" />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && !rows.length ? <Text style={st.p}>কোনো অনুমোদিত আবেদন নেই।</Text> : null}
      {(rows || []).map((a) => (
        <Button key={a.id} title={`${pick === a.id ? '✓ ' : ''}${a.full_name} · ${kindLabel(a.kind)} · ${a.district}${Number(a.spent) ? ` · দেওয়া ${taka(a.spent)}` : ''}`}
          kind={pick === a.id ? 'primary' : 'secondary'} onPress={() => setPick(a.id)} style={{ marginBottom: S.xs }} />
      ))}
      {cur ? (
        <View style={st.card}>
          <Text style={st.h}>{cur.full_name}-এর জন্য খরচ</Text>
          <Field label="কত টাকা" value={f.amount} onChangeText={(v: string) => setF((x) => ({ ...x, amount: v }))} keyboardType="number-pad" maxLength={12} editable={!busy} />
          <Field label="কী কাজে (সবাই দেখবেন)" hint="যেমন: ওমরাহ প্যাকেজ, ভিসা ফি" value={f.purpose} onChangeText={(v: string) => setF((x) => ({ ...x, purpose: v }))} maxLength={200} editable={!busy} />
          <Field label="লেনদেন / রসিদ নম্বর (শুধু অ্যাডমিন দেখবেন)" value={f.ref} onChangeText={(v: string) => setF((x) => ({ ...x, ref: v }))} maxLength={60} editable={!busy} />
          <Button title="খরচ লিখুন" icon="💸" loading={busy} onPress={() => confirm('খরচ লিখবেন?', 'এটি পরে মোছা যাবে না; ভুল হলে উল্টো হিসাব অ্যাডমিনকে জানাতে হবে।', 'হ্যাঁ, লিখুন', send)} />
        </View>
      ) : null}
    </>
  );
}

// The fund's own account (optional). Empty = donors see Travel Adda's normal payment account.
function Account() {
  const [v, setV] = useState<{ bkash: string; bank: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    supabase.from('app_settings').select('key,value').in('key', ['fund_bkash', 'fund_bank']).then((r: { data: Row[] | null }) => {
      const m: Record<string, string> = Object.fromEntries((r.data || []).map((x) => [x.key, x.value]));
      setV({ bkash: m.fund_bkash || '', bank: m.fund_bank || '' });
    }, () => setV({ bkash: '', bank: '' }));
  }, []);
  if (!v) return <ActivityIndicator color={C.primary} />;
  const save = () => confirm('তহবিলের অ্যাকাউন্ট সংরক্ষণ করবেন?', 'সব দাতা এখানে টাকা পাঠাবেন। নম্বর আরেকবার মিলিয়ে নিন।', 'হ্যাঁ, সংরক্ষণ', async () => {
    setBusy(true); setMsg(null);
    try { await setSetting('fund_bkash', v.bkash.trim()); await setSetting('fund_bank', v.bank.trim()); setMsg({ kind: 'ok', text: 'সংরক্ষণ হয়েছে।' }); }
    catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }
    finally { setBusy(false); }
  });
  return (
    <>
      <Text style={[st.p, { marginBottom: S.md }]}>তহবিলের টাকা আলাদা অ্যাকাউন্টে রাখা ভালো (হিসাব পরিষ্কার থাকে)। খালি রাখলে দাতারা প্যাকেজের সাধারণ অ্যাকাউন্টই দেখবেন।</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Field label="বিকাশ / নগদ (তহবিল)" value={v.bkash} onChangeText={(x: string) => setV({ ...v, bkash: x })} multiline maxLength={400} editable={!busy} />
      <Field label="ব্যাংক অ্যাকাউন্ট (তহবিল)" value={v.bank} onChangeText={(x: string) => setV({ ...v, bank: x })} multiline maxLength={400} editable={!busy} />
      <Button title="সংরক্ষণ করুন" icon="💾" onPress={save} loading={busy} />
    </>
  );
}
