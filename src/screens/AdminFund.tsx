// Admin: help fund — applications (admin / staff with "users"), donations to confirm, who may give (028) and spending
// (staff with "payments").
import React, { useCallback, useEffect, useState } from 'react';
import { tr } from '../lib/lang';
import { View, Text, ActivityIndicator, Linking, Pressable } from 'react-native';
import { C, S, R, F, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { st, fmtDay, confirm } from './GroupScreen';
import { toBn } from '../lib/phone';
import { telBd } from '../lib/groups';
import { helpApplications, decideHelp, helpTravelled, fundDonations, reviewDonation, spendFund, helpErrorText, kindLabel, helpStatusText,
  fundSummary, DONATE_MODES, setDonateMode, donorAccess, setDonorAccess, accessStatusText, type DonateMode } from '../lib/fund';
import { methodLabel } from '../lib/payments';
import { setSetting } from '../lib/offers';
import { supabase } from '../lib/supabase';

import type { Res, Item } from '../lib/types';
type Setting = { key: string; value: string | null };
type Msg = { kind: 'ok' | 'bad' | 'warn' | 'info'; text: string } | null;
const taka = (n: unknown): string => tr(`${toBn(Math.round(Number(n || 0)).toLocaleString('en-IN'))} টাকা`, `Tk ${toBn(Math.round(Number(n || 0)).toLocaleString('en-IN'))}`);
const errOf = (e: unknown): string => ((e as { code?: string })?.code === 'reason' ? tr('কারণ অন্তত ৫ অক্ষরে লিখুন।', 'Write the reason in at least 5 letters.') : helpErrorText(e));

export default function FundTab({ perms }: { perms: string[] }) {
  const canApps = perms.includes('admin') || perms.includes('users');
  const canMoney = perms.includes('admin') || perms.includes('payments');
  const tabs = [canApps ? { id: 'apps', icon: '📝', label: tr('আবেদন', 'Applications') } : null, canMoney ? { id: 'gifts', icon: '💝', label: tr('দান যাচাই', 'Check gifts') } : null,
    canMoney ? { id: 'access', icon: '🔐', label: tr('দানের অনুমতি', 'Gift permission') } : null, canMoney ? { id: 'spend', icon: '💸', label: tr('খরচ', 'Spending') } : null, perms.includes('admin') ? { id: 'acct', icon: '🏦', label: tr('অ্যাকাউন্ট', 'Account') } : null].filter(Boolean) as { id: string; icon: string; label: string }[];
  const [tab, setTab] = useState(tabs[0] ? tabs[0].id : '');
  return (
    <>
      <Text style={[st.small, { marginBottom: S.sm }]}>{tr('সদকার তহবিল। আবেদনকারীর দেওয়া পরিচিত মানুষকে ফোন করে যাচাই করুন। প্রতিটি সিদ্ধান্ত ও খরচ কাজের রেকর্ডে থাকে, আর খরচ সবাই (নাম ছাড়া) দেখেন।', 'Sadaqah fund. Check by phoning the known person the applicant gave. Every decision and spending is kept in the work log, and everyone can see the spending (without names).')}</Text>
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
      {tab === 'apps' ? <Apps /> : tab === 'gifts' ? <Gifts /> : tab === 'access' ? <Access isAdmin={perms.includes('admin')} /> : tab === 'spend' ? <Spend /> : tab === 'acct' ? <Account /> : null}
    </>
  );
}

function Apps() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<Res<typeof helpApplications> | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(() => { setRows(null); helpApplications(status).then(setRows).catch((e) => { setRows([]); setMsg({ kind: 'bad', text: helpErrorText(e) }); }); }, [status]);
  useEffect(() => { load(); }, [load]);
  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(id); setMsg(null);
    try { const r = await fn(); setMsg(r === 'ok' ? { kind: 'ok', text: ok } : { kind: 'info', text: tr('এটি আগেই সিদ্ধান্ত হয়ে গেছে।', 'This was already decided.') }); load(); }
    catch (e) { setMsg({ kind: 'bad', text: errOf(e) }); }
    finally { setBusy(null); }
  };
  return (
    <>
      <Segmented value={status} onChange={setStatus} options={[{ id: 'pending', label: tr('যাচাই বাকি', 'To check') }, { id: 'approved', label: tr('অনুমোদিত', 'Approved') }, { id: 'funded', label: tr('টাকা দেওয়া', 'Money given') }]} />
      <View style={{ height: S.sm }} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && !rows.length ? <Notice kind="ok" title={tr("এখানে কোনো আবেদন নেই", 'No applications here')} /> : null}
      {(rows || []).map((a) => (
        <View key={a.id} style={st.card}>
          <Text style={st.val}>{a.full_name} ({a.code}) · {kindLabel(a.kind)}</Text>
          <Text style={st.p}>{tr('বয়স', 'Age')} {toBn(a.age)} · {a.district} · {a.profession}{a.went_before ? tr(' · আগে গিয়েছেন', ' · has gone before') : ''}</Text>
          <Text style={st.p}>{tr('কারণ:', 'Reason:')} {a.reason}</Text>
          <Text style={st.p}>{tr('পরিচিত:', 'Known person:')} {a.reference_name} · {a.reference_phone}</Text>
          <Text style={st.small}>{helpStatusText(a.status)} {tr('· জমা', ' · sent')} {fmtDay(a.created_at)}{Number(a.spent) ? tr(` · দেওয়া হয়েছে ${taka(a.spent)}`, ` · given ${taka(a.spent)}`) : ''}{a.show_name ? tr(' · নাম দেখাতে রাজি', ' · agrees to show name') : tr(' · নাম গোপন', ' · name hidden')}</Text>
          <Button title={tr("পরিচিত মানুষকে ফোন করুন", 'Call the known person')} icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(a.reference_phone)}`).catch(() => {})} style={{ marginTop: S.sm }} />
          {a.phone ? <Button title={tr("আবেদনকারীকে ফোন করুন", 'Call the applicant')} icon="📞" kind="secondary" onPress={() => Linking.openURL(`tel:${telBd(a.phone)}`).catch(() => {})} style={{ marginTop: S.xs }} /> : null}
          {a.status === 'pending' ? (
            <>
              <Field label={tr("নোট / বাতিলের কারণ (আবেদনকারী বাতিলের কারণ দেখবেন)", 'Note / reason for rejecting (the applicant will see the reason)')} value={note[a.id] || ''} onChangeText={(v: string) => setNote((n) => ({ ...n, [a.id]: v }))} maxLength={300} editable={busy !== a.id} />
              <Button title={tr("যাচাই হয়েছে, অনুমোদন দিন", 'Checked, approve')} icon="✅" loading={busy === a.id}
                onPress={() => confirm(tr('অনুমোদন দেবেন?', 'Approve?'), tr('অনুমোদিত তালিকায় যাবে (নাম গোপন থাকলে শুধু জেলা ও বয়স দেখাবে)।', 'It will go to the approved list (if the name is hidden, only district and age are shown).'), tr('হ্যাঁ, অনুমোদন', 'Yes, approve'), () => act(a.id, () => decideHelp(a.id, 'approve', note[a.id]), tr('অনুমোদন দেওয়া হয়েছে।', 'Approved.')))} />
              <Button title={tr("বাতিল করুন", 'Reject')} icon="✖️" kind="danger" disabled={busy === a.id} style={{ marginTop: S.xs }}
                onPress={() => act(a.id, () => decideHelp(a.id, 'reject', note[a.id]), tr('বাতিল করা হয়েছে।', 'Rejected.'))} />
            </>
          ) : null}
          {a.status === 'funded' ? (
            <Button title={tr("সফর সম্পন্ন হয়েছে", 'Journey completed')} icon="🕋" kind="secondary" loading={busy === a.id} style={{ marginTop: S.xs }}
              onPress={() => confirm(tr('সফর সম্পন্ন হয়েছে লিখবেন?', 'Mark the journey as completed?'), tr('মোট "সফর সম্পন্ন" সংখ্যায় যোগ হবে।', 'It will be added to the total "journeys completed".'), tr('হ্যাঁ', 'Yes'), () => act(a.id, () => helpTravelled(a.id), tr('সফর সম্পন্ন লেখা হয়েছে।', 'Journey marked as completed.')))} />
          ) : null}
        </View>
      ))}
    </>
  );
}

function Gifts() {
  const [rows, setRows] = useState<Res<typeof fundDonations> | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(() => { setRows(null); fundDonations('submitted').then(setRows).catch((e) => { setRows([]); setMsg({ kind: 'bad', text: helpErrorText(e) }); }); }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (id: string, ok: boolean) => {
    if (busy) return;
    setBusy(id); setMsg(null);
    try { const r = await reviewDonation(id, ok, note[id]); setMsg(r === 'ok' ? { kind: 'ok', text: ok ? tr('নিশ্চিত হয়েছে। মোট জমায় যোগ হয়েছে।', 'Confirmed. Added to the total received.') : tr('বাতিল করা হয়েছে।', 'Rejected.') } : { kind: 'info', text: tr('এটি আগেই যাচাই হয়ে গেছে।', 'This was already checked.') }); load(); }
    catch (e) { setMsg({ kind: 'bad', text: errOf(e) }); }
    finally { setBusy(null); }
  };
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && !rows.length ? <Notice kind="ok" title={tr("যাচাই বাকি কোনো দান নেই", 'No gifts to check')} /> : null}
      {(rows || []).map((d) => (
        <View key={d.id} style={st.card}>
          <Text style={st.val}>{taka(d.amount)} · {methodLabel(d.method)}</Text>
          <Text style={st.p} selectable>{tr('লেনদেন নম্বর:', 'Transaction number:')} {d.txn_ref} {tr('· তারিখ:', ' · date:')} {fmtDay(d.paid_on)}</Text>
          <Text style={st.small}>{tr('দাতা:', 'Giver:')} {d.donor_name || '—'} ({d.donor_code || '—'}) · {d.show_name ? tr('নাম দেখাতে রাজি', 'Agrees to show name') : tr('নাম গোপন', 'Name hidden')}</Text>
          <Text style={[st.small, { marginBottom: S.sm }]}>{tr('অ্যাকাউন্টে টাকা এসেছে কিনা মিলিয়ে তারপর নিশ্চিত করুন।', 'Match that the money came into the account, then confirm.')}</Text>
          <Button title={tr("টাকা পেয়েছি, নিশ্চিত করুন", 'Money received, confirm')} icon="✅" loading={busy === d.id} onPress={() => act(d.id, true)} />
          <Field label={tr("না মিললে কারণ", 'Reason if it did not match')} value={note[d.id] || ''} onChangeText={(v: string) => setNote((n) => ({ ...n, [d.id]: v }))} maxLength={300} editable={busy !== d.id} />
          <Button title={tr("মেলেনি, বাতিল করুন", 'Did not match, reject')} icon="✖️" kind="danger" disabled={busy === d.id} onPress={() => act(d.id, false)} />
        </View>
      ))}
    </>
  );
}

function Spend() {
  const [bal, setBal] = useState<number | null>(null);
  const [rows, setRows] = useState<Res<typeof helpApplications> | null>(null);
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
    try { await spendFund(cur.id, f.amount, f.purpose, f.ref); setMsg({ kind: 'ok', text: tr('খরচ লেখা হয়েছে। সবাই হিসাবে দেখতে পাবেন (নাম গোপন থাকলে নাম ছাড়া)।', 'Spending written. Everyone can see it in the accounts (without the name if it is hidden).') }); setF({ amount: '', purpose: '', ref: '' }); setPick(''); load(); }
    catch (e) { setMsg({ kind: 'bad', text: errOf(e) }); }      // the form keeps what was typed
    finally { setBusy(false); }
  };
  return (
    <>
      <Notice kind="info" title={bal === null ? tr('তহবিলের হিসাব আনা হচ্ছে…', 'Loading the fund\'s accounts…') : tr(`এখন তহবিলে: ${taka(bal)}`, `In the fund now: ${taka(bal)}`)} text={tr("এর বেশি খরচ লেখা যাবে না।", 'You cannot write spending larger than this.')} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && !rows.length ? <Text style={st.p}>{tr('কোনো অনুমোদিত আবেদন নেই।', 'No approved applications.')}</Text> : null}
      {(rows || []).map((a) => (
        <Button key={a.id} title={tr(`${pick === a.id ? '✓ ' : ''}${a.full_name} · ${kindLabel(a.kind)} · ${a.district}${Number(a.spent) ? ` · দেওয়া ${taka(a.spent)}` : ''}`, `${pick === a.id ? '✓ ' : ''}${a.full_name} · ${kindLabel(a.kind)} · ${a.district}${Number(a.spent) ? ` · given ${taka(a.spent)}` : ''}`)}
          kind={pick === a.id ? 'primary' : 'secondary'} onPress={() => setPick(a.id)} style={{ marginBottom: S.xs }} />
      ))}
      {cur ? (
        <View style={st.card}>
          <Text style={st.h}>{tr(`${cur.full_name}-এর জন্য খরচ`, `Spending for ${cur.full_name}`)}</Text>
          <Field label={tr("কত টাকা", 'How much (Tk)')} value={f.amount} onChangeText={(v: string) => setF((x) => ({ ...x, amount: v }))} keyboardType="number-pad" maxLength={12} editable={!busy} />
          <Field label={tr("কী কাজে (সবাই দেখবেন)", 'What it is for (everyone will see)')} hint={tr("যেমন: ওমরাহ প্যাকেজ, ভিসা ফি", 'e.g. Umrah package, visa fee')} value={f.purpose} onChangeText={(v: string) => setF((x) => ({ ...x, purpose: v }))} maxLength={200} editable={!busy} />
          <Field label={tr("লেনদেন / রসিদ নম্বর (শুধু অ্যাডমিন দেখবেন)", 'Transaction / receipt number (only the admin sees it)')} value={f.ref} onChangeText={(v: string) => setF((x) => ({ ...x, ref: v }))} maxLength={60} editable={!busy} />
          <Button title={tr("খরচ লিখুন", 'Write spending')} icon="💸" loading={busy} onPress={() => confirm(tr('খরচ লিখবেন?', 'Write the spending?'), tr('এটি পরে মোছা যাবে না; ভুল হলে উল্টো হিসাব অ্যাডমিনকে জানাতে হবে।', 'This cannot be deleted later; if wrong, tell the admin to write a reverse entry.'), tr('হ্যাঁ, লিখুন', 'Yes, write it'), send)} />
        </View>
      ) : null}
    </>
  );
}

// Who may give (028). The rule for everyone (admin only) and one person at a time: search an ID, phone or name.
function Access({ isAdmin }: { isAdmin: boolean }) {
  const [mode, setMode] = useState<DonateMode | null>(null);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Res<typeof donorAccess> | null>(null);
  const [searched, setSearched] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const loadMode = useCallback(() => {
    supabase.from('app_settings').select('key,value').eq('key', 'fund_donate_mode').then((r: { data: Setting[] | null }) => {
      const v = (r.data || [])[0]?.value;
      setMode(DONATE_MODES.find((m) => m.key === v)?.key || 'approved');
    }, () => setMode('approved'));
  }, []);
  const load = useCallback(async (query: string) => {
    setRows(null);
    try { setRows(await donorAccess(query)); setSearched(query.trim()); }
    catch (e) { setRows([]); setMsg({ kind: 'bad', text: helpErrorText(e) }); }
  }, []);
  useEffect(() => { loadMode(); load(''); }, [loadMode, load]);
  const pickMode = (m: (typeof DONATE_MODES)[number]) => {
    if (busy || m.key === mode) return;
    confirm(tr(`"${m.label}" করবেন?`, `Do "${m.label}"?`), m.hint, tr('হ্যাঁ, করুন', 'Yes, do it'), async () => {
      setBusy('mode'); setMsg(null);
      try { await setDonateMode(m.key); setMode(m.key); setMsg({ kind: 'ok', text: tr(`নিয়ম বদলেছে: ${m.label}`, `Rule changed: ${m.label}`) }); }
      catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }
      finally { setBusy(null); }
    });
  };
  const setOne = async (r: Item<typeof donorAccess>, status: 'allowed' | 'blocked' | null, ok: string) => {
    if (busy) return;
    setBusy(r.user_id); setMsg(null);
    try { await setDonorAccess(r.user_id, status); setMsg({ kind: 'ok', text: `${r.full_name}: ${ok}` }); await load(searched); }
    catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }
    finally { setBusy(null); }
  };
  const block = (r: Item<typeof donorAccess>) => confirm(tr(`${r.full_name}-এর দান বন্ধ করবেন?`, `Stop gifts from ${r.full_name}?`), tr('"সবার জন্য খোলা" থাকলেও এই আইডি দান করতে পারবে না।', 'This ID cannot give even when it is "open to everyone".'), tr('হ্যাঁ, বন্ধ করুন', 'Yes, stop'),
    () => setOne(r, 'blocked', tr('দান বন্ধ করা হয়েছে।', 'Gifts stopped.')));
  return (
    <>
      <View style={st.card}>
        <Text style={st.h}>{tr('সবার জন্য নিয়ম', 'Rule for everyone')}</Text>
        {mode === null ? <ActivityIndicator color={C.primary} /> : DONATE_MODES.map((m) => {
          const on = m.key === mode;
          return (
            <Pressable key={m.key} onPress={() => (isAdmin ? pickMode(m) : null)} disabled={!isAdmin || busy !== null} accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: !isAdmin }} accessibilityLabel={`${m.label}। ${m.hint}`}
              style={{ minHeight: TOUCH + 8, flexDirection: 'row', alignItems: 'center', padding: S.sm, marginTop: S.xs, borderRadius: R.md,
                borderWidth: on ? 3 : 2, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primarySoft : C.card }}>
              <Text style={[st.p, { width: 30, color: C.primary }]} importantForAccessibility="no">{on ? '✓' : ''}</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.val}>{m.icon} {m.label}</Text>
                <Text style={st.small}>{m.hint}</Text>
              </View>
            </Pressable>
          );
        })}
        {!isAdmin ? <Text style={[st.small, { marginTop: S.xs }]}>{tr('এই নিয়ম শুধু অ্যাডমিন বদলাতে পারেন।', 'Only the admin can change this rule.')}</Text> : null}
        {busy === 'mode' ? <ActivityIndicator color={C.primary} style={{ marginTop: S.xs }} /> : null}
      </View>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <View style={st.card}>
        <Text style={st.h}>{tr('একজনকে চালু বা বন্ধ করুন', 'Turn one person on or off')}</Text>
        <Field label={tr("আইডি, মোবাইল নম্বর বা নাম", 'ID, mobile number or name')} hint={tr("যেমন: TA-00012, শুধু ১২, বা 01712345678", 'e.g. TA-00012, just 12, or 01712345678')} value={q} onChangeText={setQ} autoCorrect={false} maxLength={60}
          returnKeyType="search" onSubmitEditing={() => load(q)} />
        <Button title={tr("খুঁজুন", 'Search')} icon="🔍" kind="secondary" onPress={() => load(q)} disabled={rows === null} />
        {searched ? <Button title={tr("অনুরোধের তালিকায় ফিরুন", 'Back to the list of requests')} icon="↩️" kind="secondary" onPress={() => { setQ(''); load(''); }} style={{ marginTop: S.xs }} /> : null}
      </View>
      <Text style={[st.h, { marginBottom: S.xs }]}>{searched ? tr(`"${searched}" খোঁজার ফল`, `Results for "${searched}"`) : tr('অনুমতি চেয়েছেন / চালু / বন্ধ', 'Asked for permission / on / off')}</Text>
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && !rows.length ? <Notice kind="info" title={searched ? tr('কাউকে পাওয়া যায়নি। আইডি বা নম্বর আবার দেখুন।', 'Nobody found. Check the ID or number again.') : tr('এখনো কেউ অনুমতি চাননি।', 'Nobody has asked for permission yet.')} /> : null}
      {(rows || []).map((r) => (
        <View key={r.user_id} style={st.card}>
          <Text style={st.val}>{r.full_name || '—'} ({r.haji_code || '—'})</Text>
          {r.phone ? <Text style={st.p} selectable>{r.phone}</Text> : null}
          <Text style={[st.p, { marginBottom: S.sm }]}>{accessStatusText(r.status)}{r.requested_at && r.status === 'requested' ? ` · ${fmtDay(r.requested_at)}` : ''}</Text>
          {r.status !== 'allowed' ? <Button title={tr("দান চালু করুন", 'Turn gifts on')} icon="✅" loading={busy === r.user_id} disabled={busy !== null && busy !== r.user_id}
            onPress={() => setOne(r, 'allowed', tr('দান চালু হয়েছে। তিনি নোটিফিকেশন পাবেন।', 'Gifts turned on. They will get a notification.'))} /> : null}
          {r.status === 'requested' ? <Button title={tr("এখন না", 'Not now')} icon="↩️" kind="secondary" disabled={busy !== null} style={{ marginTop: S.xs }}
            onPress={() => setOne(r, null, tr('অনুরোধ সরানো হয়েছে।', 'Request removed.'))} /> : null}
          {r.status !== 'blocked' ? <Button title={tr("দান বন্ধ করুন", 'Turn gifts off')} icon="🚫" kind="danger" disabled={busy !== null} style={{ marginTop: S.xs }} onPress={() => block(r)} /> : null}
        </View>
      ))}
    </>
  );
}

// The fund's own account (optional). Empty = donors see Travel Adda's normal payment account.
function Account() {
  const [v, setV] = useState<{ bkash: string; bank: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    supabase.from('app_settings').select('key,value').in('key', ['fund_bkash', 'fund_bank']).then((r: { data: Setting[] | null }) => {
      const m: Record<string, string> = Object.fromEntries((r.data || []).map((x) => [x.key, x.value || '']));
      setV({ bkash: m.fund_bkash || '', bank: m.fund_bank || '' });
    }, () => setV({ bkash: '', bank: '' }));
  }, []);
  if (!v) return <ActivityIndicator color={C.primary} />;
  const save = () => confirm(tr('তহবিলের অ্যাকাউন্ট সংরক্ষণ করবেন?', 'Save the fund\'s account?'), tr('সব দাতা এখানে টাকা পাঠাবেন। নম্বর আরেকবার মিলিয়ে নিন।', 'All givers will send money here. Check the number once more.'), tr('হ্যাঁ, সংরক্ষণ', 'Yes, save'), async () => {
    setBusy(true); setMsg(null);
    try { await setSetting('fund_bkash', v.bkash.trim()); await setSetting('fund_bank', v.bank.trim()); setMsg({ kind: 'ok', text: tr('সংরক্ষণ হয়েছে।', 'Saved.') }); }
    catch (e) { setMsg({ kind: 'bad', text: helpErrorText(e) }); }
    finally { setBusy(false); }
  });
  return (
    <>
      <Text style={[st.p, { marginBottom: S.md }]}>{tr('তহবিলের টাকা আলাদা অ্যাকাউন্টে রাখা ভালো (হিসাব পরিষ্কার থাকে)। খালি রাখলে দাতারা প্যাকেজের সাধারণ অ্যাকাউন্টই দেখবেন।', 'It is better to keep fund money in a separate account (the accounts stay clear). If left empty, givers will see the package\'s usual account.')}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Field label={tr("বিকাশ / নগদ (তহবিল)", 'bKash / Nagad (fund)')} value={v.bkash} onChangeText={(x: string) => setV({ ...v, bkash: x })} multiline maxLength={400} editable={!busy} />
      <Field label={tr("ব্যাংক অ্যাকাউন্ট (তহবিল)", 'Bank account (fund)')} value={v.bank} onChangeText={(x: string) => setV({ ...v, bank: x })} multiline maxLength={400} editable={!busy} />
      <Button title={tr("সংরক্ষণ করুন", 'Save')} icon="💾" onPress={save} loading={busy} />
    </>
  );
}
