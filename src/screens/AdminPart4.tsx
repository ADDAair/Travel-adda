// Admin part 4 (supabase/026_admin_part4.sql): money alerts, service costs for own leaders, notifications to one part,
// SOS record, and the work record filtered by staff member.
import React, { useCallback, useEffect, useState, type DependencyList, type JSX } from 'react';
import { tr, monthName } from '../lib/lang';
import { View, Text, Pressable, ActivityIndicator, Linking } from 'react-native';
import { C, S, R, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import { notReady, telBd } from '../lib/groups';
import { moneyAlerts, alertText, SERVICE_KINDS, serviceKindLabel, addServiceCost, serviceResultText, deleteServiceCost, serviceCosts, leaderBalance, contractChoices,
  type LeaderBalance, type LedgerRow, type ServiceCost } from '../lib/adminMoney';
import { ledger, leaderRates } from '../lib/payments';
import { auditSearch, auditActors, listAudit, adminGroups, segmentSize, notifySegment, monthOk } from '../lib/admin';
import { supabase } from '../lib/supabase';
import { st, errText, confirm, fmtDay, fmtTaka, fmtWhen } from './GroupScreen';
import type { Msg } from './navTypes';
import type { Item, Loose, Res, RpcRow } from '../lib/types';

type Rate = Item<typeof leaderRates>;
type AuditLine = Loose<Item<typeof listAudit> & Item<typeof auditSearch>>;   // old and new record lists

type Coded = { code?: string } | null;

const soon = (): string => tr('এই অংশের ডেটাবেস ধাপ (০২৬) এখনো চালানো হয়নি।', 'The database step (026) for this part has not been run yet.');
const errMsg = (e: unknown): string => (notReady(e) ? soon() : errText(e));

// One full-width row per choice: long Bengali names wrap instead of being cut (side-by-side chips cut them on
// some Android phones). Selection = border + background + a tick; the text style itself never changes.
function Pills({ options, value, onChange, label }: { options: readonly { id: string; label: string }[]; value: string; onChange: (v: string) => void; label?: string }): JSX.Element {
  return (
    <View style={{ marginBottom: S.md }}>
      {label ? <Text style={st.lbl}>{label}</Text> : null}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
            style={{ minHeight: TOUCH, width: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: S.xs,
              marginTop: S.xs, borderRadius: R.md, borderWidth: 2, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primarySoft : C.card }}>
            <Text style={[st.p, { width: 28, color: C.primary }]} importantForAccessibility="no">{on ? '✓' : ''}</Text>
            <Text style={[st.p, { flex: 1, color: C.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function useLoad<T>(fn: () => Promise<T[]>, deps: DependencyList = []) {
  const [data, setData] = useState<T[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    try { setData(await fn()); } catch (e) { setData([]); setErr(errMsg(e)); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { data, err, load };
}

// ---------- 1) money alerts ----------
export function MoneyAlertsTab(): JSX.Element {
  const { data, err } = useLoad(moneyAlerts);
  const groups = ['haji_due', 'leader_due', 'not_closed'].map((k) => ({ k, rows: (data || []).filter((r) => r.kind === k) }));
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>{tr('যাত্রা ৩০ দিনের মধ্যে অথচ হাজীর টাকা বাকি; যাত্রা ৭ দিনের মধ্যে অথচ লিডারকে দেওয়া বাকি; সফর শেষ অথচ হিসাব খোলা — এগুলো এখানে দেখাবে। টাকা দিতে "টাকা ও কমিশন" অংশে যান।', 'Shown here: travel within 30 days but the haji still owes money; travel within 7 days but the leader is not paid yet; journey over but the accounts are still open. To pay, go to "Money and commission".')}</Text>
      {err ? <Notice kind="info" title={err} /> : null}
      {data === null ? <ActivityIndicator color={C.primary} /> : null}
      {data && !err && !data.length ? <Notice kind="ok" title={tr("✅ কোনো বকেয়া নেই", '✅ Nothing owed')} /> : null}
      {groups.filter((g) => g.rows.length).map((g) => (
        <View key={g.k}>
          <Text style={[st.h, { marginTop: S.md }]}>{alertText(g.k)} ({toBn(g.rows.length)}{tr('টি)', ')')}</Text>
          {g.rows.map((r) => (
            <View key={`${g.k}-${r.contract_id}`} style={st.card}>
              <Text style={st.val}>{r.contract_no} · {fmtTaka(r.amount)}</Text>
              <Text style={st.small}>🕋 {r.haji_name} ({r.haji_code}) · 🧭 {r.leader_name} ({r.leader_code})</Text>
              <Text style={st.small}>{tr('যাত্রা:', 'Travel:')} {r.travel_from ? fmtDay(r.travel_from) : '—'}{r.travel_to ? tr(` · ফেরা: ${fmtDay(r.travel_to)}`, ` · return: ${fmtDay(r.travel_to)}`) : ''}</Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

// ---------- 2) service costs for own leaders ----------
export function ServiceCostsTab(): JSX.Element {
  const { data: leaders, err } = useLoad<Rate>(async () => (await leaderRates()).filter((l) => /travel\s*adda/i.test(String(l.agency_name || ''))));
  const [open, setOpen] = useState<Rate | null>(null);
  if (open) return <LeaderCosts leader={open} onBack={() => setOpen(null)} />;
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>{tr('Travel Adda-র নিজস্ব লিডারকে ভিসা, টিকিট, হোটেল ইত্যাদি দিলে তার খরচ এখানে লিখুন। লিডারকে টাকা দেওয়ার সময় এটা কেটে রাখা হবে। খরচের তালিকা লিডার দেখেন না, শুধু মোট পাওনা দেখেন।', 'When Travel Adda gives its own leader a visa, tickets, hotel and so on, write the cost here. It is kept back when paying the leader. The leader does not see the list of costs, only the total due.')}</Text>
      {err ? <Notice kind="info" title={err} /> : null}
      {leaders === null ? <ActivityIndicator color={C.primary} /> : null}
      {leaders && !err && !leaders.length ? <Notice kind="info" title={tr("এখনো কোনো নিজস্ব লিডার নেই", 'No own leaders yet')} /> : null}
      {(leaders || []).map((l) => (
        <Pressable key={l.leader_id} onPress={() => setOpen(l)} style={st.card} accessibilityRole="button" accessibilityLabel={tr(`${l.full_name}, ${l.leader_code}। খুলতে চাপুন`, `${l.full_name}, ${l.leader_code}. Tap to open`)}>
          <Text style={st.val}>🤝 {l.full_name} ({l.leader_code})</Text>
          <Text style={st.small}>{tr('কমিশন:', 'Commission:')} {toBn(Number(l.commission_pct))}%</Text>
          <Text style={[st.p, { color: C.primary }]}>{tr('খরচ ও পাওনা দেখুন ›', 'See costs and dues ›')}</Text>
        </Pressable>
      ))}
    </>
  );
}

function LeaderCosts({ leader, onBack }: { leader: Rate; onBack: () => void }): JSX.Element {
  const id: string = leader.leader_id;
  const [bal, setBal] = useState<LeaderBalance | null>(null);
  const [rows, setRows] = useState<ServiceCost[] | null>(null);
  const [contracts, setContracts] = useState<LedgerRow[]>([]);
  const [form, setForm] = useState({ contract: '', kind: 'visa', amount: '', note: '' });
  const [forWho, setForWho] = useState<'group' | 'haji'>('group');        // 'group' | 'haji'
  const [find, setFind] = useState('');
  const [del, setDel] = useState<{ id: string; reason: string } | null>(null);             // { id, reason }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    try {
      const [b, r, l] = await Promise.all([leaderBalance(id), serviceCosts(id), ledger()]);
      setBal(b); setRows(r); setContracts(l as LedgerRow[]);
    } catch (e) { setRows([]); setMsg({ kind: 'bad', text: errMsg(e) }); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const set = (k: 'contract' | 'kind' | 'amount' | 'note') => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const add = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    if (forWho === 'haji' && !form.contract) { setMsg({ kind: 'warn', text: tr('কোন হাজীর খরচ, তালিকা থেকে বাছুন।', 'Choose from the list whose cost it is.') }); setBusy(false); return; }
    try {
      const r = await addServiceCost(id, forWho === 'haji' ? form.contract : '', form.kind, form.amount, form.note);
      setMsg({ kind: r === 'ok' ? 'ok' : 'warn', text: serviceResultText(r) });
      if (r === 'ok') { setForm((f) => ({ ...f, amount: '', note: '' })); await load(); }
    } catch (e) {
      setMsg({ kind: 'bad', text: (e as Coded)?.code === 'amount' ? tr('টাকার পরিমাণ সংখ্যায় লিখুন।', 'Write the amount in numbers.') : (e as Coded)?.code === 'note' ? tr('কী খরচ, ছোট করে লিখুন (যেমন: ৪০ জনের গ্রুপ টিকিট)।', 'Write briefly what the cost is (e.g. group ticket for 40 people).') : errMsg(e) });
    }                                                // the typed form stays
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy || !del) return;
    setBusy(true); setMsg(null);
    try { await deleteServiceCost(del.id, del.reason); setDel(null); setMsg({ kind: 'ok', text: tr('খরচটি মুছে ফেলা হয়েছে (কাজের রেকর্ডে লেখা আছে)।', 'The cost was deleted (it is written in the work log).') }); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Coded)?.code === 'reason' ? tr('কেন মুছছেন, অন্তত ৫ অক্ষরে লিখুন।', 'Write why you are deleting it, in at least 5 letters.') : errMsg(e) }); }
    finally { setBusy(false); }
  };
  const allHajis = contractChoices(contracts, id);
  const hajis = contractChoices(contracts, id, find).slice(0, 20);
  return (
    <>
      <Button title={tr("নিজস্ব লিডারের তালিকায় ফিরে যান", 'Back to the list of own leaders')} icon="‹" kind="secondary" onPress={onBack} style={{ marginBottom: S.md }} />
      <Text style={st.gName}>🤝 {leader.full_name} ({leader.leader_code})</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {bal ? (
        <View style={st.card}>
          <Text style={st.p}>{tr('চুক্তিগুলো থেকে পাওনা (চুক্তির খরচ বাদে):', 'Due from contracts (before contract costs):')} {fmtTaka(bal.due_total)}</Text>
          <Text style={st.p}>{tr('পুরো দলের খরচ: −', 'Costs for the whole group: −')} {fmtTaka(bal.group_costs)}</Text>
          <Text style={[st.val, { color: bal.net < 0 ? C.bad : C.ok }]}>{tr('এখন দেওয়া যাবে:', 'Can be paid now:')} {fmtTaka(bal.net)}</Text>
          {bal.net < 0 ? <Text style={[st.small, { color: C.bad }]}>{tr('⚠️ খরচ পাওনার চেয়ে বেশি। লিডারের কাছে Travel Adda টাকা পাবে।', '⚠️ The costs are more than the due. Travel Adda is owed money by the leader.')}</Text> : null}
        </View>
      ) : <ActivityIndicator color={C.primary} />}
      <View style={st.card}>
        <Text style={st.h}>{tr('➕ নতুন খরচ লিখুন', '➕ Write a new cost')}</Text>
        <Text style={st.lbl}>{tr('কার জন্য', 'For whom')}</Text>
        <Segmented value={forWho} onChange={(v: 'group' | 'haji') => { setForWho(v); set('contract')(''); }} options={[{ id: 'group', label: tr('👥 পুরো দল', '👥 The whole group') }, { id: 'haji', label: tr('🕋 একজন হাজী', '🕋 One haji') }]} />
        {forWho === 'haji' ? (
          allHajis.length ? (
            <>
              {allHajis.length > 5 ? <Field label={tr("হাজীর নাম, আইডি বা চুক্তি নম্বর দিয়ে খুঁজুন", 'Search by the haji\'s name, ID or contract number')} hint={tr("যেমন: TA-00012", 'e.g. TA-00012')} value={find} onChangeText={setFind} autoCorrect={false} /> : null}
              {hajis.length ? <Pills label={tr(`কোন হাজী (${toBn(allHajis.length)} জন)`, `Which haji (${allHajis.length})`)} options={hajis} value={form.contract} onChange={set('contract')} />
                : <Text style={[st.p, { marginBottom: S.md }]}>{tr('এই নামে কোনো হাজী পাওয়া যায়নি।', 'No haji found with this name.')}</Text>}
            </>
          ) : <Notice kind="info" title={tr("এই লিডারের কোনো চালু চুক্তি নেই", 'This leader has no active contracts')} text={tr("একজন হাজীর খরচ লিখতে হাজীর সাথে লিডারের চুক্তি চালু থাকতে হয়। তা না হলে খরচটি পুরো দলের নামে লিখুন।", 'To write a cost for one haji, the haji\'s contract with the leader must be active. Otherwise write the cost for the whole group.')} />
        ) : null}
        <Pills label={tr("কিসের খরচ", 'What the cost is for')} options={SERVICE_KINDS.map((k) => ({ id: k.id, label: `${k.icon} ${k.label}` }))} value={form.kind} onChange={set('kind')} />
        <Field label={tr("টাকা", 'Tk')} hint={tr("যেমন: ২৫০০০", 'e.g. 25000')} value={form.amount} onChangeText={set('amount')} keyboardType="number-pad" editable={!busy} />
        <Field label={tr("বিবরণ", 'Details')} hint={tr("যেমন: ৪০ জনের গ্রুপ টিকিট, বিমান BG-035", 'e.g. group ticket for 40 people, flight BG-035')} value={form.note} onChangeText={set('note')} maxLength={300} editable={!busy} />
        <Button title={tr("খরচ লিখুন", 'Write cost')} icon="💾" onPress={add} loading={busy} />
      </View>
      <Text style={[st.h, { marginTop: S.sm }]}>{tr('🧾 লেখা খরচ', '🧾 Costs written')}</Text>
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && !rows.length ? <Text style={st.p}>{tr('এখনো কোনো খরচ লেখা হয়নি।', 'No costs written yet.')}</Text> : null}
      {(rows || []).map((r) => (
        <View key={r.id} style={st.card}>
          <Text style={st.val}>{serviceKindLabel(r.kind)} · {fmtTaka(r.amount)}</Text>
          <Text style={st.small}>{r.contract_no ? `${r.contract_no} · ${r.haji_name}` : tr('👥 পুরো দল', '👥 The whole group')} · {fmtDay(r.created_at)}{r.created_by_name ? ` · ${r.created_by_name}` : ''}</Text>
          <Text style={st.p}>{r.note}</Text>
          {del && del.id === r.id ? (
            <>
              <Field label={tr("কেন মুছছেন", 'Why you are deleting it')} hint={tr("যেমন: দুবার লেখা হয়েছিল", 'e.g. it was written twice')} value={del.reason} onChangeText={(v: string) => setDel({ id: r.id, reason: v })} maxLength={200} editable={!busy} />
              <Button title={tr("হ্যাঁ, মুছে ফেলুন", 'Yes, delete')} icon="🗑️" kind="danger" onPress={() => confirm(tr('খরচটি মুছবেন?', 'Delete the cost?'), tr('লিডারের পাওনা আবার বেড়ে যাবে।', 'The leader\'s due will go up again.'), tr('মুছুন', 'Delete'), remove)} loading={busy} />
              <Button title={tr("বাতিল", 'Cancel')} kind="secondary" onPress={() => setDel(null)} disabled={busy} style={{ marginTop: S.xs }} />
            </>
          ) : <Button title={tr("ভুল হলে মুছুন", 'Delete if wrong')} icon="🗑️" kind="secondary" onPress={() => setDel({ id: r.id, reason: '' })} disabled={busy} style={{ marginTop: S.xs }} />}
        </View>
      ))}
    </>
  );
}

// ---------- 4) notifications to one part ----------
function nextMonths(n = 12): { id: string; label: string }[] {
  const d = new Date(); const out: { id: string; label: string }[] = [];
  for (let i = 0; i < n; i += 1) {
    const y = d.getFullYear(); const m = d.getMonth() + i; const yy = y + Math.floor(m / 12); const mm = (m % 12) + 1;
    out.push({ id: `${yy}-${String(mm).padStart(2, '0')}`, label: `${monthName(mm - 1)} ${toBn(yy)}` });
  }
  return out;
}
export function SegmentNotifyBox(): JSX.Element {
  const [kind, setKind] = useState('group');
  const [value, setValue] = useState('');
  const [groups, setGroups] = useState<Res<typeof adminGroups> | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { adminGroups(null).then(setGroups).catch(() => setGroups([])); }, []);
  useEffect(() => {
    setSize(null);
    const ok = kind === 'group' ? !!value : kind === 'month' ? monthOk(value) : String(value).trim().length >= 2;
    if (!ok) return undefined;
    const t = setTimeout(() => { segmentSize(kind, kind === 'district' ? value.trim() : value).then(setSize).catch((e) => setMsg(notReady(e) ? { kind: 'info', text: soon() } : null)); }, 400);
    return () => clearTimeout(t);
  }, [kind, value]);
  const send = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const n = await notifySegment(kind, kind === 'district' ? value.trim() : value, title, body); setMsg({ kind: 'ok', text: tr(`✅ ${toBn(n)} জনকে পাঠানো হয়েছে।`, `✅ Sent to ${n} people.`) }); setTitle(''); setBody(''); }
    catch (e) {
      setMsg({ kind: 'bad', text: (e as Coded)?.code === 'title' ? tr('শিরোনাম লিখুন (অন্তত ২ অক্ষর)।', 'Write a title (at least 2 letters).') : (e as Coded)?.code === 'too_many' ? tr('এক ঘণ্টায় ২০টির বেশি পাঠানো যায় না। একটু পরে চেষ্টা করুন।', 'No more than 20 can be sent in an hour. Try a little later.') : errMsg(e) });
    }
    finally { setBusy(false); }
  };
  const ask = () => confirm(tr(`${toBn(size || 0)} জনকে পাঠাবেন?`, `Send to ${size || 0} people?`), title.trim(), tr('হ্যাঁ, পাঠান', 'Yes, send'), send);
  return (
    <View style={st.card}>
      <Text style={st.h}>{tr('🎯 নির্দিষ্ট অংশকে নোটিফিকেশন', '🎯 Notification to a chosen segment')}</Text>
      <Segmented value={kind} onChange={(v: string) => { setKind(v); setValue(''); setMsg(null); }}
        options={[{ id: 'group', label: tr('একটি দল', 'A group') }, { id: 'month', label: tr('যাত্রার মাস', 'Travel month') }, { id: 'district', label: tr('জেলার লিডার', 'Leaders of a district') }]} />
      {kind === 'group' ? (
        groups === null ? <ActivityIndicator color={C.primary} />
          : groups.length ? <Pills label={tr("কোন দল (দলের সদস্য হাজীরা পাবেন)", 'Which group (the group\'s hajis will get it)')} options={groups.slice(0, 40).map((g) => ({ id: g.id, label: `${g.name} · ${g.leader_name || ''}` }))} value={value} onChange={setValue} />
            : <Text style={st.p}>{tr('কোনো দল নেই।', 'No groups.')}</Text>
      ) : null}
      {kind === 'month' ? <Pills label={tr("যে মাসে যাত্রা (চালু চুক্তির হাজীরা পাবেন)", 'Travel month (hajis with active contracts get it)')} options={nextMonths()} value={value} onChange={setValue} /> : null}
      {kind === 'district' ? <Field label={tr("জেলার নাম (ওই জেলার লিডাররা পাবেন)", 'District name (that district\'s leaders get it)')} hint={tr("যেমন: ঢাকা", 'e.g. Dhaka')} value={value} onChangeText={setValue} /> : null}
      {size !== null ? <Text style={[st.p, { marginBottom: S.sm }]}>{tr('👥 পাবেন:', '👥 Will get it:')} {toBn(size)} {tr('জন', '')}</Text> : null}
      <Field label={tr("শিরোনাম", 'Title')} hint={tr("যেমন: কাল সকাল ৮টায় বাস ছাড়বে", 'e.g. the bus leaves at 8am tomorrow')} value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
      <Field label={tr("বিস্তারিত (ইচ্ছা হলে)", 'Details (optional)')} value={body} onChangeText={setBody} multiline maxLength={1000} editable={!busy} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Button title={tr("পাঠান", 'Send')} icon="📣" onPress={ask} loading={busy} disabled={!size || title.trim().length < 2} />
    </View>
  );
}

// ---------- 5) SOS record ----------
export function SosTab(): JSX.Element {
  const [days, setDays] = useState(7);
  const { data, err } = useLoad<RpcRow<'admin_sos_list'>>(async () => {
    const r = await supabase.rpc('admin_sos_list', { p_days: days });
    if (r.error) throw r.error;
    return r.data || [];
  }, [days]);
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>{tr('হাজী অ্যাপের "জরুরি" পাতা থেকে জরুরি নম্বরে ফোন করলে এখানে আসে। অবস্থান আসে শুধু হাজী আগে রাজি হলে।', 'These come here when a haji calls an emergency number from the app\'s "SOS" page. The location comes only if the haji agreed earlier.')}</Text>
      <Segmented value={String(days)} onChange={(v: string) => setDays(Number(v))} options={[{ id: '1', label: tr('আজ', 'Today') }, { id: '7', label: tr('৭ দিন', '7 days') }, { id: '30', label: tr('৩০ দিন', '30 days') }]} />
      {err ? <Notice kind="info" title={err} /> : null}
      {data === null ? <ActivityIndicator color={C.primary} /> : null}
      {data && !err && !data.length ? <Notice kind="ok" title={tr("এই সময়ে কোনো জরুরি ফোন হয়নি", 'No emergency calls in this time')} /> : null}
      {(data || []).map((e) => (
        <View key={e.id} style={st.card}>
          <Text style={st.val}>🆘 {e.full_name} ({e.code})</Text>
          <Text style={st.p}>{fmtWhen(e.at)} · {e.number} ({e.label})</Text>
          {e.lat != null ? (
            <Button title={tr(`ম্যাপে অবস্থান দেখুন${e.accuracy ? ` (প্রায় ${toBn(Math.round(e.accuracy))} মিটার)` : ''}`, `See the location on the map${e.accuracy ? ` (about ${Math.round(e.accuracy)} m)` : ''}`)} icon="🗺️" kind="secondary"
              onPress={() => Linking.openURL(`https://maps.google.com/?q=${e.lat},${e.lng}`).catch(() => {})} style={{ marginTop: S.xs }} />
          ) : <Text style={st.small}>{tr('অবস্থান পাঠানো হয়নি।', 'Location was not sent.')}</Text>}
          {e.phone ? <Button title={tr("হাজীকে ফোন করুন", 'Call the haji')} icon="📞" onPress={() => Linking.openURL(`tel:${telBd(e.phone)}`).catch(() => {})} style={{ marginTop: S.xs }} /> : null}
        </View>
      ))}
    </>
  );
}

// ---------- 3) work record by staff member ----------
export function AuditSearchTab({ actionText }: { actionText: (a: string) => string }): JSX.Element {
  const [actors, setActors] = useState<Res<typeof auditActors> | null>(null);
  const [who, setWho] = useState('');
  const [days, setDays] = useState(30);
  const [old, setOld] = useState(false);                // step 026 not run: the old list
  useEffect(() => { auditActors().then(setActors).catch((e) => { setActors([]); if (notReady(e)) setOld(true); }); }, []);
  const { data, err } = useLoad<AuditLine>(async () => (old ? await listAudit() : await auditSearch(who || null, null, days)) as AuditLine[], [who, days, old]);
  return (
    <>
      <Text style={st.small}>{tr('অ্যাডমিন ও স্টাফ কে কবে কী করেছেন, তার রেকর্ড। এটা কেউ মুছতে বা বদলাতে পারেন না।', 'A record of what the admin and staff did and when. Nobody can delete or change it.')}</Text>
      {!old && actors && actors.length ? (
        <Pills label={tr("কার কাজ", 'Whose work')} options={[{ id: '', label: tr('সবার', 'Everyone') }, ...actors.map((a) => ({ id: a.actor_id, label: `${a.actor_name || '—'} (${toBn(Number(a.n))})` }))]} value={who} onChange={setWho} />
      ) : null}
      {!old ? <Segmented value={String(days)} onChange={(v: string) => setDays(Number(v))} options={[{ id: '7', label: tr('৭ দিন', '7 days') }, { id: '30', label: tr('৩০ দিন', '30 days') }, { id: '365', label: tr('১ বছর', '1 year') }]} /> : null}
      {err ? <Notice kind="bad" title={err} /> : null}
      {data === null ? <ActivityIndicator color={C.primary} /> : null}
      {data && !err && !data.length ? <Notice kind="info" title={tr("এই সময়ে কোনো রেকর্ড নেই", 'No records in this time')} /> : null}
      {(data || []).map((a) => (
        <View key={a.id} style={st.card}>
          <Text style={st.small}>{fmtWhen(a.at)} · {a.actor_name || '—'}</Text>
          <Text style={st.val}>{actionText(a.action || '')}{a.target_name ? ` · ${a.target_name} (${a.target_code})` : ''}</Text>
          {a.detail ? <Text style={st.small}>{a.detail}</Text> : null}
        </View>
      ))}
    </>
  );
}
