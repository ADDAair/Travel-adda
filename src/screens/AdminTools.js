// Admin panel part 1 (supabase/022_admin_tools.sql): contracts & disputes, one page per user, rating comments,
// groups & khadems, app settings (forced update, video links). Every action is refused by the server without permission.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice } from '../components/ui';
import { toBn } from '../lib/phone';
import { notReady } from '../lib/groups';
import { supabase } from '../lib/supabase';
import { findContracts, contractDetail, addContractNote, userDetail, listRatings, hideRating, setLeaderListed, setVideo, adminGroups } from '../lib/admin';
import { setSetting } from '../lib/offers';
import { VIDEO_TOPICS, mergeVideos } from '../content/videos';
import { APP_VERSION } from '../lib/appVersion';
import { st, errText, confirm, fmtDay, fmtTaka } from './GroupScreen';

const CSTATUS = { sent: '📩 পাঠানো, উত্তরের অপেক্ষায়', accepted: '✅ চালু', declined: '✖️ হাজী রাজি হননি', withdrawn: '↩️ লিডার ফিরিয়ে নিয়েছেন', cancelled: '⛔ বাতিল', completed: '🏁 শেষ' };
const PSTATUS = { submitted: '⏳ যাচাই বাকি', confirmed: '✅ নিশ্চিত', rejected: '✖️ বাতিল' };
const errMsg = (e) => (notReady(e) ? 'এই অংশের ডেটাবেস ধাপ (০২২) এখনো চালানো হয়নি।' : e && e.code === 'short' ? 'কারণ বা নোট অন্তত ৫ অক্ষরে লিখুন।' : errText(e));
const Row = ({ l, v }) => (v || v === 0 ? <View style={st.cRow}><Text style={st.lbl}>{l}</Text><Text style={st.p} selectable>{v}</Text></View> : null);

function Search({ label, hint, onSearch, busy, initial = '' }) {
  const [q, setQ] = useState(initial);
  return (
    <>
      <Field label={label} hint={hint} value={q} onChangeText={setQ} autoCapitalize="characters" autoCorrect={false} />
      <Button title="খুঁজুন" icon="🔎" onPress={() => onSearch(q)} loading={busy} style={{ marginBottom: S.md }} />
    </>
  );
}

// ---------- 1) Contracts & disputes ----------
export function ContractsTab() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const search = async (q) => {
    setBusy(true); setMsg(null);
    try { setRows(await findContracts(q)); } catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); } finally { setBusy(false); }
  };
  useEffect(() => { search(''); }, []);
  if (open) return <ContractPage id={open} onBack={() => setOpen(null)} />;
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>হাজী ও লিডারের মধ্যে ঝামেলা হলে চুক্তি খুঁজে শর্ত, টাকার হিসাব, অভিযোগ এক পাতায় দেখুন আর নোট রাখুন।</Text>
      <Search label="চুক্তি নম্বর, হাজী বা লিডারের আইডি, অথবা নাম" hint="যেমন: TC-000012 বা TA-00042" onSearch={search} busy={busy} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null && !msg ? <ActivityIndicator color={C.primary} /> : null}
      {rows && rows.length === 0 ? <Notice kind="info" title="কোনো চুক্তি পাওয়া যায়নি" /> : null}
      {(rows || []).map((c) => (
        <Pressable key={c.id} onPress={() => setOpen(c.id)} style={st.card} accessibilityRole="button" accessibilityLabel={`চুক্তি ${c.contract_no}, ${c.haji_name} ও ${c.leader_name}। খুলতে চাপুন`}>
          <Text style={st.val}>{c.contract_no} · {CSTATUS[c.status] || c.status}</Text>
          <Text style={st.p}>{c.title} · {fmtTaka(c.price_bdt)}</Text>
          <Text style={st.small}>🕋 {c.haji_name} ({c.haji_code}) · 🧭 {c.leader_name} ({c.leader_code})</Text>
          <Text style={st.small}>জমা নিশ্চিত: {fmtTaka(c.paid_confirmed)}{Number(c.paid_waiting) > 0 ? ` · যাচাই বাকি: ${fmtTaka(c.paid_waiting)}` : ''}</Text>
          {c.open_complaints ? <Text style={[st.small, { color: C.bad, fontWeight: '700' }]}>🚩 যাচাই বাকি অভিযোগ: {toBn(c.open_complaints)}টি</Text> : null}
          <Text style={[st.p, { color: C.primary, fontWeight: '700' }]}>বিস্তারিত দেখুন ›</Text>
        </Pressable>
      ))}
    </>
  );
}

function ContractPage({ id, onBack }) {
  const [d, setD] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => { try { setD(await contractDetail(id)); } catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); } }, [id]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await addContractNote(id, note); setNote(''); setMsg({ kind: 'ok', text: 'নোট রাখা হয়েছে (কাজের রেকর্ডেও আছে)।' }); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); }       // the typed note stays
    finally { setBusy(false); }
  };
  return (
    <>
      <Button title="সব চুক্তির তালিকায় ফিরে যান" icon="‹" kind="secondary" onPress={onBack} style={{ marginBottom: S.md }} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {!d ? <ActivityIndicator color={C.primary} /> : (
        <>
          <View style={st.card}>
            <Text style={st.gName}>{d.contract_no}</Text>
            <Text style={st.val}>{CSTATUS[d.status] || d.status}</Text>
            <Row l="হাজী" v={`${d.haji_name} (${d.haji_code})`} />
            <Row l="লিডার" v={`${d.leader_name} (${d.leader_code})${d.agency_name ? ` · ${d.agency_name}` : ''}`} />
            <Row l="প্যাকেজ" v={`${d.title} · ${fmtTaka(d.price_bdt)}`} />
            <Row l="যাত্রা" v={d.travel_from ? `${fmtDay(d.travel_from)} থেকে ${d.travel_to ? fmtDay(d.travel_to) : ''}` : ''} />
            <Row l="যা অন্তর্ভুক্ত" v={d.includes} />
            <Row l="যা নেই" v={d.excludes} />
            <Row l="বাতিল ও টাকা ফেরতের নিয়ম" v={d.refund_policy} />
            <Row l="অন্যান্য শর্ত" v={d.extra_terms} />
            <Row l="বাতিলের কারণ" v={d.cancel_reason} />
          </View>
          <View style={st.card}>
            <Text style={st.h}>💳 টাকা জমা</Text>
            {(d.payments || []).length === 0 ? <Text style={st.p}>কোনো টাকা জমা নেই।</Text> : null}
            {(d.payments || []).map((p, i) => <Text key={i} style={st.p}>{fmtTaka(p.amount)} · {p.method} · {p.txn_ref} · {PSTATUS[p.status] || p.status}{p.admin_note ? ` · নোট: ${p.admin_note}` : ''}</Text>)}
            <Text style={[st.h, { marginTop: S.sm }]}>↗️ দেওয়া টাকা (লিডার / ফেরত)</Text>
            {(d.payouts || []).length === 0 ? <Text style={st.p}>এখনো কিছু দেওয়া হয়নি।</Text> : null}
            {(d.payouts || []).map((p, i) => <Text key={i} style={st.p}>{p.payee === 'haji' ? '↩️ হাজীকে ফেরত' : '🧭 লিডারকে'} · {fmtTaka(p.amount)} · {p.txn_ref}{p.note ? ` · ${p.note}` : ''}</Text>)}
          </View>
          <View style={st.card}>
            <Text style={st.h}>🚩 অভিযোগ ও রেটিং</Text>
            {(d.complaints || []).length === 0 ? <Text style={st.p}>কোনো অভিযোগ নেই।</Text> : null}
            {(d.complaints || []).map((m, i) => <Text key={i} style={st.p}>[{m.status === 'pending' ? 'যাচাই বাকি' : m.status === 'verified' ? 'যাচাই হয়েছে' : 'বাতিল'}] {m.body}</Text>)}
            {d.rating ? <Text style={st.p}>⭐ {toBn(d.rating.stars)}{d.rating.comment ? ` · "${d.rating.comment}"` : ''}{d.rating.hidden ? ' (লুকানো)' : ''}</Text> : null}
          </View>
          <View style={st.card}>
            <Text style={st.h}>📝 অ্যাডমিনের নোট</Text>
            {(d.notes || []).map((n, i) => <Text key={i} style={st.p}>{fmtDay(n.created_at)} · {n.author || 'অ্যাডমিন'}: {n.note}</Text>)}
            <Field label="নতুন নোট" hint="যেমন: দুই পক্ষের সাথে কথা হয়েছে, লিডার হোটেল বদলাবেন" value={note} onChangeText={setNote} multiline maxLength={1000} editable={!busy} />
            <Button title="নোট রাখুন" icon="📝" onPress={save} loading={busy} />
          </View>
        </>
      )}
    </>
  );
}

// ---------- 2) One user, everything ----------
export function UserPage({ id, onBack }) {
  const [d, setD] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => { try { setD(await userDetail(id)); } catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); } }, [id]);
  useEffect(() => { load(); }, [load]);
  const listed = d && d.leader ? d.leader.listed : true;
  const toggleListed = () => confirm(listed ? 'এই লিডারকে তালিকা থেকে লুকাবেন?' : 'এই লিডারকে আবার তালিকায় দেখাবেন?',
    listed ? 'অ্যাকাউন্ট চালু থাকবে, কিন্তু লিডার তালিকা ও অফার পাতায় দেখা যাবে না।' : '', listed ? 'হ্যাঁ, লুকান' : 'হ্যাঁ, দেখান', async () => {
      setBusy(true); setMsg(null);
      try { await setLeaderListed(id, !listed, reason); setReason(''); setMsg({ kind: 'ok', text: listed ? 'তালিকা থেকে লুকানো হয়েছে।' : 'আবার তালিকায় দেখানো হচ্ছে।' }); await load(); }
      catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); }
      finally { setBusy(false); }
    });
  const List = ({ title, items, render }) => (
    <View style={st.card}>
      <Text style={st.h}>{title}: {toBn((items || []).length)}টি</Text>
      {(items || []).map((x, i) => <Text key={i} style={st.p}>{render(x)}</Text>)}
    </View>
  );
  return (
    <>
      <Button title="খোঁজার পাতায় ফিরে যান" icon="‹" kind="secondary" onPress={onBack} style={{ marginBottom: S.md }} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {!d ? <ActivityIndicator color={C.primary} /> : (
        <>
          <View style={st.card}>
            <Text style={st.gName}>{d.full_name}</Text>
            <Text style={st.val}>{d.code} · {d.account_type === 'leader' ? 'লিডার অ্যাকাউন্ট' : 'হাজী অ্যাকাউন্ট'} · {d.status === 'active' ? '✅ চালু' : '⛔ বন্ধ'}</Text>
            <Row l="মোবাইল" v={d.phone ? toBn(d.phone) : ''} />
            <Row l="ইমেইল" v={d.email} />
            <Row l="যাচাই" v={d.verified ? '✅ যাচাই করা' : '⏳ যাচাই হয়নি'} />
            <Row l="যোগদান" v={fmtDay(d.created_at)} />
            <Text style={st.small}>🔒 এই ব্যক্তির কাগজপত্র (পাসপোর্ট, ভিসা) গোপন থাকে, এখানে দেখানো হয় না। এই পাতা দেখা কাজের রেকর্ডে থাকে।</Text>
          </View>
          {d.leader ? (
            <View style={st.card}>
              <Text style={st.h}>🧭 লিডার</Text>
              <Row l="এজেন্সি" v={d.leader.agency} />
              <Row l="জেলা" v={d.leader.district} />
              <Text style={st.val}>{listed ? '👁️ লিডার তালিকা ও অফার পাতায় দেখা যাচ্ছে' : '🙈 তালিকা থেকে লুকানো'}</Text>
              <Field label="কারণ" hint="যেমন: পরীক্ষার লিডার / কিছুদিন কাজ করবেন না" value={reason} onChangeText={setReason} maxLength={300} editable={!busy} />
              <Button title={listed ? 'তালিকা থেকে লুকান' : 'আবার তালিকায় দেখান'} icon={listed ? '🙈' : '👁️'} kind="secondary" onPress={toggleListed} loading={busy} />
            </View>
          ) : null}
          <List title="📄 চুক্তি" items={d.contracts} render={(c) => `${c.contract_no} · ${CSTATUS[c.status] || c.status} · ${c.title} · ${fmtTaka(c.price_bdt)} · ${c.as === 'haji' ? 'লিডার' : 'হাজী'}: ${c.other}`} />
          <List title="💳 টাকা জমা" items={d.payments} render={(p) => `${fmtTaka(p.amount)} · ${p.txn_ref} · ${PSTATUS[p.status] || p.status}`} />
          <List title="🚩 তাঁর করা অভিযোগ" items={d.complaints_by} render={(m) => `[${m.status}] ${m.body}`} />
          <List title="🚩 তাঁর বিরুদ্ধে অভিযোগ" items={d.complaints_against} render={(m) => `[${m.status}] ${m.body}`} />
          <List title="📮 তাঁর বিরুদ্ধে রিপোর্ট" items={d.reports_against} render={(r) => `${r.reason}${r.details ? `: ${r.details}` : ''} (${r.status === 'new' ? 'নতুন' : 'দেখা হয়েছে'})`} />
          <List title="👥 যে দলে আছেন" items={d.groups} render={(g) => `${g.name} (${g.status})`} />
          <List title="🧭 যে দল চালান" items={d.leads_groups} render={(g) => `${g.name}${g.active ? '' : ' (বন্ধ)'}`} />
          <List title="🤝 যে দলের খাদেম" items={d.khadem_of} render={(g) => g.name} />
        </>
      )}
    </>
  );
}

// ---------- 4) Rating comments ----------
export function RatingsTab() {
  const [rows, setRows] = useState(null);
  const [reason, setReason] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const search = async (q) => { setMsg(null); try { setRows(await listRatings(q)); } catch (e) { setRows([]); setMsg({ kind: 'bad', text: errMsg(e) }); } };
  useEffect(() => { search(''); }, []);
  const act = (r) => confirm(r.comment_hidden ? 'মন্তব্যটি আবার দেখাবেন?' : 'মন্তব্যটি লুকাবেন?', 'তারা (রেটিং) গণনায় থাকবে, শুধু লেখাটা লুকাবে।', r.comment_hidden ? 'হ্যাঁ, দেখান' : 'হ্যাঁ, লুকান', async () => {
    setBusy(true); setMsg(null);
    try { await hideRating(r.contract_id, !r.comment_hidden, reason[r.contract_id]); setMsg({ kind: 'ok', text: r.comment_hidden ? 'আবার দেখানো হচ্ছে।' : 'লুকানো হয়েছে।' }); await search(''); }
    catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); }
    finally { setBusy(false); }
  });
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>হাজীদের রেটিংয়ের মন্তব্য। গালি, মিথ্যা বা ব্যক্তিগত তথ্য থাকলে লুকান। তারা গণনায় থাকবে।</Text>
      <Search label="লিডারের আইডি বা নাম (ইচ্ছা করলে)" hint="যেমন: TL-00004" onSearch={search} busy={busy} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && rows.length === 0 ? <Notice kind="info" title="কোনো মন্তব্য নেই" /> : null}
      {(rows || []).map((r) => (
        <View key={r.contract_id} style={[st.card, r.comment_hidden && { borderWidth: 2, borderColor: C.line }]}>
          <Text style={st.small}>{r.contract_no} · 🧭 {r.leader_name} ({r.leader_code}) · 🕋 {r.haji_name}</Text>
          <Text style={st.val}>{'⭐'.repeat(r.stars)} {r.counted ? '' : '(টাকা যাচাই বাকি, এখনো গণনায় নেই)'}</Text>
          <Text style={[st.p, r.comment_hidden && { color: C.muted }]}>"{r.comment}"</Text>
          {r.comment_hidden ? <Text style={st.small}>🙈 লুকানো · কারণ: {r.hidden_reason}</Text> : null}
          <Field label="কারণ" hint="অন্তত ৫ অক্ষর" value={reason[r.contract_id] || ''} onChangeText={(v) => setReason((x) => ({ ...x, [r.contract_id]: v }))} maxLength={300} editable={!busy} />
          <Button title={r.comment_hidden ? 'আবার দেখান' : 'মন্তব্য লুকান'} icon={r.comment_hidden ? '👁️' : '🙈'} kind={r.comment_hidden ? 'secondary' : 'danger'} onPress={() => act(r)} disabled={busy} />
        </View>
      ))}
    </>
  );
}

// ---------- 8) Groups & khadems ----------
export function GroupsTab() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const search = async (q) => { setBusy(true); setMsg(null); try { setRows(await adminGroups(q)); } catch (e) { setRows([]); setMsg({ kind: 'bad', text: errMsg(e) }); } finally { setBusy(false); } };
  useEffect(() => { search(''); }, []);
  return (
    <>
      <Search label="লিডারের আইডি, নাম বা দলের নাম (ইচ্ছা করলে)" hint="যেমন: TL-00004" onSearch={search} busy={busy} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && rows.length === 0 ? <Notice kind="info" title="কোনো দল পাওয়া যায়নি" /> : null}
      {(rows || []).map((g) => (
        <View key={g.id} style={st.card}>
          <Text style={st.val}>{g.name}{g.season ? ` · ${g.season}` : ''}{g.active ? '' : ' (বন্ধ)'}</Text>
          <Text style={st.small}>🧭 {g.leader_name} ({g.leader_code}) · তৈরি: {fmtDay(g.created_at)}</Text>
          <Text style={st.p}>👥 হাজী: {toBn(g.members)} জন{g.invited ? ` · আমন্ত্রিত: ${toBn(g.invited)}` : ''} · 🤝 খাদেম: {toBn(g.khadems)} জন</Text>
          <Text style={[st.p, g.waiting_questions ? { color: C.warn, fontWeight: '700' } : null]}>💬 উত্তর বাকি প্রশ্ন: {toBn(g.waiting_questions)}টি</Text>
        </View>
      ))}
      <Text style={st.small}>🔒 হাজীদের প্রশ্নের লেখা এখানে দেখানো হয় না, শুধু সংখ্যা।</Text>
    </>
  );
}

// ---------- 6) forced update + 5) video links (owner only) ----------
export function AppSettingsBox() {
  const [minV, setMinV] = useState('');
  const [store, setStore] = useState('');
  const [videos, setVideos] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    supabase.from('app_settings').select('key,value').then((r) => {
      const h = Object.fromEntries((r.data || []).map((x) => [x.key, x.value]));
      setMinV(h.min_app_version || ''); setStore(h.store_url || '');
    });
    supabase.from('app_videos').select('route,url').then((r) => setVideos(Object.fromEntries((r.data || []).map((x) => [x.route, x.url]))));
  }, []);
  const run = async (fn, ok) => { if (busy) return; setBusy(true); setMsg(null); try { await fn(); setMsg({ kind: 'ok', text: ok }); } catch (e) { setMsg({ kind: 'bad', text: /bad url/.test(e?.message || '') ? 'লিংক https:// দিয়ে শুরু হতে হবে।' : /bad version/.test(e?.message || '') ? 'সংস্করণ এভাবে লিখুন: 0.2.0' : errMsg(e) }); } finally { setBusy(false); } };
  const topics = mergeVideos(VIDEO_TOPICS, []);
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <View style={[st.card, { marginTop: S.lg }]}>
        <Text style={st.h}>⬆️ বাধ্যতামূলক আপডেট</Text>
        <Text style={st.small}>এই অ্যাপের সংস্করণ: {APP_VERSION}। এর চেয়ে পুরোনো অ্যাপ খুললে "নতুন সংস্করণ নিন" পাতা দেখাবে। খালি রাখলে কিছু হবে না। অ্যাডমিন সব সময় চালিয়ে যেতে পারবেন।</Text>
        <Field label="সর্বনিম্ন সংস্করণ" hint="যেমন: 0.2.0" value={minV} onChangeText={setMinV} maxLength={11} autoCapitalize="none" />
        <Field label="নতুন অ্যাপের লিংক (Play Store)" hint="https://play.google.com/..." value={store} onChangeText={setStore} maxLength={400} autoCapitalize="none" />
        <Button title="সংরক্ষণ করুন" icon="💾" loading={busy} onPress={() => confirm('বাধ্যতামূলক আপডেট সংরক্ষণ করবেন?', minV ? `${minV}-এর চেয়ে পুরোনো অ্যাপ আর চলবে না।` : 'বাধ্যতামূলক আপডেট বন্ধ থাকবে।', 'হ্যাঁ, সংরক্ষণ', () =>
          run(async () => { await setSetting('store_url', store.trim()); await setSetting('min_app_version', minV.trim()); }, 'সংরক্ষণ হয়েছে।'))} />
      </View>
      <View style={st.card}>
        <Text style={st.h}>🎬 ভিডিও লিংক</Text>
        <Text style={st.small}>প্রতিটি পাতার "▶️ ভিডিও দেখুন" বোতামের লিংক। https:// দিয়ে শুরু হতে হবে। খালি রাখলে "শীঘ্রই আসছে" দেখাবে।</Text>
        {Object.entries(topics).map(([route, t]) => (
          <View key={route} style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: S.sm }}>
            <Field label={t.title} hint="https://..." value={videos[route] || ''} onChangeText={(v) => setVideos((x) => ({ ...x, [route]: v }))} maxLength={500} autoCapitalize="none" autoCorrect={false} />
            <Button title="এই ভিডিও সংরক্ষণ করুন" kind="secondary" disabled={busy} onPress={() => run(() => setVideo(route, videos[route] || ''), (videos[route] || '').trim() ? 'ভিডিও লিংক বসানো হয়েছে।' : 'লিংক সরানো হয়েছে, এখন "শীঘ্রই আসছে" দেখাবে।')} style={{ marginBottom: S.sm }} />
          </View>
        ))}
      </View>
    </>
  );
}
