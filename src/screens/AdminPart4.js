// Admin part 4 (supabase/026_admin_part4.sql): money alerts, service costs for own leaders, notifications to one part,
// SOS record, and the work record filtered by staff member.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking } from 'react-native';
import { C, S, R, TOUCH } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { toBn } from '../lib/phone';
import { notReady, telBd } from '../lib/groups';
import { moneyAlerts, alertText, SERVICE_KINDS, serviceKindLabel, addServiceCost, serviceResultText, deleteServiceCost, serviceCosts, leaderBalance, contractChoices } from '../lib/adminMoney';
import { ledger, leaderRates } from '../lib/payments';
import { auditSearch, auditActors, listAudit, adminGroups, segmentSize, notifySegment, monthOk } from '../lib/admin';
import { supabase } from '../lib/supabase';
import { st, errText, confirm, fmtDay, fmtTaka, fmtWhen } from './GroupScreen';

const SOON = 'এই অংশের ডেটাবেস ধাপ (০২৬) এখনো চালানো হয়নি।';
const errMsg = (e) => (notReady(e) ? SOON : errText(e));

// One full-width row per choice: long Bengali names wrap instead of being cut (side-by-side chips cut them on
// some Android phones). Selection = border + background + a tick; the text style itself never changes.
function Pills({ options, value, onChange, label }) {
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

function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    setErr(null);
    try { setData(await fn()); } catch (e) { setData([]); setErr(errMsg(e)); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { data, err, load };
}

// ---------- 1) money alerts ----------
export function MoneyAlertsTab() {
  const { data, err } = useLoad(moneyAlerts);
  const groups = ['haji_due', 'leader_due', 'not_closed'].map((k) => ({ k, rows: (data || []).filter((r) => r.kind === k) }));
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>যাত্রা ৩০ দিনের মধ্যে অথচ হাজীর টাকা বাকি; যাত্রা ৭ দিনের মধ্যে অথচ লিডারকে দেওয়া বাকি; সফর শেষ অথচ হিসাব খোলা — এগুলো এখানে দেখাবে। টাকা দিতে "টাকা ও কমিশন" অংশে যান।</Text>
      {err ? <Notice kind="info" title={err} /> : null}
      {data === null ? <ActivityIndicator color={C.primary} /> : null}
      {data && !err && !data.length ? <Notice kind="ok" title="✅ কোনো বকেয়া নেই" /> : null}
      {groups.filter((g) => g.rows.length).map((g) => (
        <View key={g.k}>
          <Text style={[st.h, { marginTop: S.md }]}>{alertText(g.k)} ({toBn(g.rows.length)}টি)</Text>
          {g.rows.map((r) => (
            <View key={`${g.k}-${r.contract_id}`} style={st.card}>
              <Text style={st.val}>{r.contract_no} · {fmtTaka(r.amount)}</Text>
              <Text style={st.small}>🕋 {r.haji_name} ({r.haji_code}) · 🧭 {r.leader_name} ({r.leader_code})</Text>
              <Text style={st.small}>যাত্রা: {r.travel_from ? fmtDay(r.travel_from) : '—'}{r.travel_to ? ` · ফেরা: ${fmtDay(r.travel_to)}` : ''}</Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

// ---------- 2) service costs for own leaders ----------
export function ServiceCostsTab() {
  const { data: leaders, err } = useLoad(async () => (await leaderRates()).filter((l) => /travel\s*adda/i.test(String(l.agency_name || ''))));
  const [open, setOpen] = useState(null);
  if (open) return <LeaderCosts leader={open} onBack={() => setOpen(null)} />;
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>Travel Adda-র নিজস্ব লিডারকে ভিসা, টিকিট, হোটেল ইত্যাদি দিলে তার খরচ এখানে লিখুন। লিডারকে টাকা দেওয়ার সময় এটা কেটে রাখা হবে। খরচের তালিকা লিডার দেখেন না, শুধু মোট পাওনা দেখেন।</Text>
      {err ? <Notice kind="info" title={err} /> : null}
      {leaders === null ? <ActivityIndicator color={C.primary} /> : null}
      {leaders && !err && !leaders.length ? <Notice kind="info" title="এখনো কোনো নিজস্ব লিডার নেই" /> : null}
      {(leaders || []).map((l) => (
        <Pressable key={l.leader_id} onPress={() => setOpen(l)} style={st.card} accessibilityRole="button" accessibilityLabel={`${l.full_name}, ${l.leader_code}। খুলতে চাপুন`}>
          <Text style={st.val}>🤝 {l.full_name} ({l.leader_code})</Text>
          <Text style={st.small}>কমিশন: {toBn(Number(l.commission_pct))}%</Text>
          <Text style={[st.p, { color: C.primary }]}>খরচ ও পাওনা দেখুন ›</Text>
        </Pressable>
      ))}
    </>
  );
}

function LeaderCosts({ leader, onBack }) {
  const id = leader.leader_id;
  const [bal, setBal] = useState(null);
  const [rows, setRows] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [form, setForm] = useState({ contract: '', kind: 'visa', amount: '', note: '' });
  const [forWho, setForWho] = useState('group');        // 'group' | 'haji'
  const [find, setFind] = useState('');
  const [del, setDel] = useState(null);             // { id, reason }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    try {
      const [b, r, l] = await Promise.all([leaderBalance(id), serviceCosts(id), ledger()]);
      setBal(b); setRows(r); setContracts(l);
    } catch (e) { setRows([]); setMsg({ kind: 'bad', text: errMsg(e) }); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const add = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    if (forWho === 'haji' && !form.contract) { setMsg({ kind: 'warn', text: 'কোন হাজীর খরচ, তালিকা থেকে বাছুন।' }); setBusy(false); return; }
    try {
      const r = await addServiceCost(id, forWho === 'haji' ? form.contract : '', form.kind, form.amount, form.note);
      setMsg({ kind: r === 'ok' ? 'ok' : 'warn', text: serviceResultText(r) });
      if (r === 'ok') { setForm((f) => ({ ...f, amount: '', note: '' })); await load(); }
    } catch (e) {
      setMsg({ kind: 'bad', text: e.code === 'amount' ? 'টাকার পরিমাণ সংখ্যায় লিখুন।' : e.code === 'note' ? 'কী খরচ, ছোট করে লিখুন (যেমন: ৪০ জনের গ্রুপ টিকিট)।' : errMsg(e) });
    }                                                // the typed form stays
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await deleteServiceCost(del.id, del.reason); setDel(null); setMsg({ kind: 'ok', text: 'খরচটি মুছে ফেলা হয়েছে (কাজের রেকর্ডে লেখা আছে)।' }); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: e.code === 'reason' ? 'কেন মুছছেন, অন্তত ৫ অক্ষরে লিখুন।' : errMsg(e) }); }
    finally { setBusy(false); }
  };
  const allHajis = contractChoices(contracts, id);
  const hajis = contractChoices(contracts, id, find).slice(0, 20);
  return (
    <>
      <Button title="নিজস্ব লিডারের তালিকায় ফিরে যান" icon="‹" kind="secondary" onPress={onBack} style={{ marginBottom: S.md }} />
      <Text style={st.gName}>🤝 {leader.full_name} ({leader.leader_code})</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {bal ? (
        <View style={st.card}>
          <Text style={st.p}>চুক্তিগুলো থেকে পাওনা (চুক্তির খরচ বাদে): {fmtTaka(bal.due_total)}</Text>
          <Text style={st.p}>পুরো দলের খরচ: − {fmtTaka(bal.group_costs)}</Text>
          <Text style={[st.val, { color: bal.net < 0 ? C.bad : C.ok }]}>এখন দেওয়া যাবে: {fmtTaka(bal.net)}</Text>
          {bal.net < 0 ? <Text style={[st.small, { color: C.bad }]}>⚠️ খরচ পাওনার চেয়ে বেশি। লিডারের কাছে Travel Adda টাকা পাবে।</Text> : null}
        </View>
      ) : <ActivityIndicator color={C.primary} />}
      <View style={st.card}>
        <Text style={st.h}>➕ নতুন খরচ লিখুন</Text>
        <Text style={st.lbl}>কার জন্য</Text>
        <Segmented value={forWho} onChange={(v) => { setForWho(v); set('contract')(''); }} options={[{ id: 'group', label: '👥 পুরো দল' }, { id: 'haji', label: '🕋 একজন হাজী' }]} />
        {forWho === 'haji' ? (
          allHajis.length ? (
            <>
              {allHajis.length > 5 ? <Field label="হাজীর নাম, আইডি বা চুক্তি নম্বর দিয়ে খুঁজুন" hint="যেমন: TA-00012" value={find} onChangeText={setFind} autoCorrect={false} /> : null}
              {hajis.length ? <Pills label={`কোন হাজী (${toBn(allHajis.length)} জন)`} options={hajis} value={form.contract} onChange={set('contract')} />
                : <Text style={[st.p, { marginBottom: S.md }]}>এই নামে কোনো হাজী পাওয়া যায়নি।</Text>}
            </>
          ) : <Notice kind="info" title="এই লিডারের কোনো চালু চুক্তি নেই" text="একজন হাজীর খরচ লিখতে হাজীর সাথে লিডারের চুক্তি চালু থাকতে হয়। তা না হলে খরচটি পুরো দলের নামে লিখুন।" />
        ) : null}
        <Pills label="কিসের খরচ" options={SERVICE_KINDS.map((k) => ({ id: k.id, label: `${k.icon} ${k.label}` }))} value={form.kind} onChange={set('kind')} />
        <Field label="টাকা" hint="যেমন: ২৫০০০" value={form.amount} onChangeText={set('amount')} keyboardType="number-pad" editable={!busy} />
        <Field label="বিবরণ" hint="যেমন: ৪০ জনের গ্রুপ টিকিট, বিমান BG-035" value={form.note} onChangeText={set('note')} maxLength={300} editable={!busy} />
        <Button title="খরচ লিখুন" icon="💾" onPress={add} loading={busy} />
      </View>
      <Text style={[st.h, { marginTop: S.sm }]}>🧾 লেখা খরচ</Text>
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && !rows.length ? <Text style={st.p}>এখনো কোনো খরচ লেখা হয়নি।</Text> : null}
      {(rows || []).map((r) => (
        <View key={r.id} style={st.card}>
          <Text style={st.val}>{serviceKindLabel(r.kind)} · {fmtTaka(r.amount)}</Text>
          <Text style={st.small}>{r.contract_no ? `${r.contract_no} · ${r.haji_name}` : '👥 পুরো দল'} · {fmtDay(r.created_at)}{r.created_by_name ? ` · ${r.created_by_name}` : ''}</Text>
          <Text style={st.p}>{r.note}</Text>
          {del && del.id === r.id ? (
            <>
              <Field label="কেন মুছছেন" hint="যেমন: দুবার লেখা হয়েছিল" value={del.reason} onChangeText={(v) => setDel({ id: r.id, reason: v })} maxLength={200} editable={!busy} />
              <Button title="হ্যাঁ, মুছে ফেলুন" icon="🗑️" kind="danger" onPress={() => confirm('খরচটি মুছবেন?', 'লিডারের পাওনা আবার বেড়ে যাবে।', 'মুছুন', remove)} loading={busy} />
              <Button title="বাতিল" kind="secondary" onPress={() => setDel(null)} disabled={busy} style={{ marginTop: S.xs }} />
            </>
          ) : <Button title="ভুল হলে মুছুন" icon="🗑️" kind="secondary" onPress={() => setDel({ id: r.id, reason: '' })} disabled={busy} style={{ marginTop: S.xs }} />}
        </View>
      ))}
    </>
  );
}

// ---------- 4) notifications to one part ----------
const BN_MONTH = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
function nextMonths(n = 12) {
  const d = new Date(); const out = [];
  for (let i = 0; i < n; i += 1) {
    const y = d.getFullYear(); const m = d.getMonth() + i; const yy = y + Math.floor(m / 12); const mm = (m % 12) + 1;
    out.push({ id: `${yy}-${String(mm).padStart(2, '0')}`, label: `${BN_MONTH[mm - 1]} ${toBn(yy)}` });
  }
  return out;
}
export function SegmentNotifyBox() {
  const [kind, setKind] = useState('group');
  const [value, setValue] = useState('');
  const [groups, setGroups] = useState(null);
  const [size, setSize] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { adminGroups(null).then(setGroups).catch(() => setGroups([])); }, []);
  useEffect(() => {
    setSize(null);
    const ok = kind === 'group' ? !!value : kind === 'month' ? monthOk(value) : String(value).trim().length >= 2;
    if (!ok) return undefined;
    const t = setTimeout(() => { segmentSize(kind, kind === 'district' ? value.trim() : value).then(setSize).catch((e) => setMsg(notReady(e) ? { kind: 'info', text: SOON } : null)); }, 400);
    return () => clearTimeout(t);
  }, [kind, value]);
  const send = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const n = await notifySegment(kind, kind === 'district' ? value.trim() : value, title, body); setMsg({ kind: 'ok', text: `✅ ${toBn(n)} জনকে পাঠানো হয়েছে।` }); setTitle(''); setBody(''); }
    catch (e) {
      setMsg({ kind: 'bad', text: e.code === 'title' ? 'শিরোনাম লিখুন (অন্তত ২ অক্ষর)।' : e.code === 'too_many' ? 'এক ঘণ্টায় ২০টির বেশি পাঠানো যায় না। একটু পরে চেষ্টা করুন।' : errMsg(e) });
    }
    finally { setBusy(false); }
  };
  const ask = () => confirm(`${toBn(size || 0)} জনকে পাঠাবেন?`, title.trim(), 'হ্যাঁ, পাঠান', send);
  return (
    <View style={st.card}>
      <Text style={st.h}>🎯 নির্দিষ্ট অংশকে নোটিফিকেশন</Text>
      <Segmented value={kind} onChange={(v) => { setKind(v); setValue(''); setMsg(null); }}
        options={[{ id: 'group', label: 'একটি দল' }, { id: 'month', label: 'যাত্রার মাস' }, { id: 'district', label: 'জেলার লিডার' }]} />
      {kind === 'group' ? (
        groups === null ? <ActivityIndicator color={C.primary} />
          : groups.length ? <Pills label="কোন দল (দলের সদস্য হাজীরা পাবেন)" options={groups.slice(0, 40).map((g) => ({ id: g.id, label: `${g.name} · ${g.leader_name || ''}` }))} value={value} onChange={setValue} />
            : <Text style={st.p}>কোনো দল নেই।</Text>
      ) : null}
      {kind === 'month' ? <Pills label="যে মাসে যাত্রা (চালু চুক্তির হাজীরা পাবেন)" options={nextMonths()} value={value} onChange={setValue} /> : null}
      {kind === 'district' ? <Field label="জেলার নাম (ওই জেলার লিডাররা পাবেন)" hint="যেমন: ঢাকা" value={value} onChangeText={setValue} /> : null}
      {size !== null ? <Text style={[st.p, { marginBottom: S.sm }]}>👥 পাবেন: {toBn(size)} জন</Text> : null}
      <Field label="শিরোনাম" hint="যেমন: কাল সকাল ৮টায় বাস ছাড়বে" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
      <Field label="বিস্তারিত (ইচ্ছা হলে)" value={body} onChangeText={setBody} multiline maxLength={1000} editable={!busy} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Button title="পাঠান" icon="📣" onPress={ask} loading={busy} disabled={!size || title.trim().length < 2} />
    </View>
  );
}

// ---------- 5) SOS record ----------
export function SosTab() {
  const [days, setDays] = useState(7);
  const { data, err } = useLoad(async () => {
    const r = await supabase.rpc('admin_sos_list', { p_days: days });
    if (r.error) throw r.error;
    return r.data || [];
  }, [days]);
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>হাজী অ্যাপের "জরুরি" পাতা থেকে জরুরি নম্বরে ফোন করলে এখানে আসে। অবস্থান আসে শুধু হাজী আগে রাজি হলে।</Text>
      <Segmented value={String(days)} onChange={(v) => setDays(Number(v))} options={[{ id: '1', label: 'আজ' }, { id: '7', label: '৭ দিন' }, { id: '30', label: '৩০ দিন' }]} />
      {err ? <Notice kind="info" title={err} /> : null}
      {data === null ? <ActivityIndicator color={C.primary} /> : null}
      {data && !err && !data.length ? <Notice kind="ok" title="এই সময়ে কোনো জরুরি ফোন হয়নি" /> : null}
      {(data || []).map((e) => (
        <View key={e.id} style={st.card}>
          <Text style={st.val}>🆘 {e.full_name} ({e.code})</Text>
          <Text style={st.p}>{fmtWhen(e.at)} · {e.number} ({e.label})</Text>
          {e.lat != null ? (
            <Button title={`ম্যাপে অবস্থান দেখুন${e.accuracy ? ` (প্রায় ${toBn(Math.round(e.accuracy))} মিটার)` : ''}`} icon="🗺️" kind="secondary"
              onPress={() => Linking.openURL(`https://maps.google.com/?q=${e.lat},${e.lng}`).catch(() => {})} style={{ marginTop: S.xs }} />
          ) : <Text style={st.small}>অবস্থান পাঠানো হয়নি।</Text>}
          {e.phone ? <Button title="হাজীকে ফোন করুন" icon="📞" onPress={() => Linking.openURL(`tel:${telBd(e.phone)}`).catch(() => {})} style={{ marginTop: S.xs }} /> : null}
        </View>
      ))}
    </>
  );
}

// ---------- 3) work record by staff member ----------
export function AuditSearchTab({ actionText }) {
  const [actors, setActors] = useState(null);
  const [who, setWho] = useState('');
  const [days, setDays] = useState(30);
  const [old, setOld] = useState(false);                // step 026 not run: the old list
  useEffect(() => { auditActors().then(setActors).catch((e) => { setActors([]); if (notReady(e)) setOld(true); }); }, []);
  const { data, err } = useLoad(() => (old ? listAudit() : auditSearch(who || null, null, days)), [who, days, old]);
  return (
    <>
      <Text style={st.small}>অ্যাডমিন ও স্টাফ কে কবে কী করেছেন, তার রেকর্ড। এটা কেউ মুছতে বা বদলাতে পারেন না।</Text>
      {!old && actors && actors.length ? (
        <Pills label="কার কাজ" options={[{ id: '', label: 'সবার' }, ...actors.map((a) => ({ id: a.actor_id, label: `${a.actor_name || '—'} (${toBn(Number(a.n))})` }))]} value={who} onChange={setWho} />
      ) : null}
      {!old ? <Segmented value={String(days)} onChange={(v) => setDays(Number(v))} options={[{ id: '7', label: '৭ দিন' }, { id: '30', label: '৩০ দিন' }, { id: '365', label: '১ বছর' }]} /> : null}
      {err ? <Notice kind="bad" title={err} /> : null}
      {data === null ? <ActivityIndicator color={C.primary} /> : null}
      {data && !err && !data.length ? <Notice kind="info" title="এই সময়ে কোনো রেকর্ড নেই" /> : null}
      {(data || []).map((a) => (
        <View key={a.id} style={st.card}>
          <Text style={st.small}>{fmtWhen(a.at)} · {a.actor_name || '—'}</Text>
          <Text style={st.val}>{actionText(a.action)}{a.target_name ? ` · ${a.target_name} (${a.target_code})` : ''}</Text>
          {a.detail ? <Text style={st.small}>{a.detail}</Text> : null}
        </View>
      ))}
    </>
  );
}
