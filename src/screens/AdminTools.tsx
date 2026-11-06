// Admin panel part 1 (supabase/022_admin_tools.sql): contracts & disputes, one page per user, rating comments,
// groups & khadems, app settings (forced update, video links). Every action is refused by the server without permission.
import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { tr } from '../lib/lang';
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
import { st, errText, confirm, fmtDay, fmtTaka, fmtWhen } from './GroupScreen';
import { requestChatConsent, adminChatConsents, viewHelpChat, requestResultText, consentStatusText, type AdminConsent, type ChatLine } from '../lib/chatConsent';
import type { Msg } from './navTypes';
import type { ContractDetail, Item, Res, UserDetail } from '../lib/types';

type Coded = { code?: string; message?: string } | null;

const CSTATUS: Record<string, string> = { get sent() { return tr('📩 পাঠানো, উত্তরের অপেক্ষায়', '📩 Sent, waiting for an answer'); }, get accepted() { return tr('✅ চালু', '✅ Active'); }, get declined() { return tr('✖️ হাজী রাজি হননি', '✖️ The haji declined'); }, get withdrawn() { return tr('↩️ লিডার ফিরিয়ে নিয়েছেন', '↩️ The leader withdrew it'); }, get cancelled() { return tr('⛔ বাতিল', '⛔ Cancelled'); }, get completed() { return tr('🏁 শেষ', '🏁 Finished'); } };
const PSTATUS: Record<string, string> = { get submitted() { return tr('⏳ যাচাই বাকি', '⏳ To check'); }, get confirmed() { return tr('✅ নিশ্চিত', '✅ Confirmed'); }, get rejected() { return tr('✖️ বাতিল', '✖️ Rejected'); } };
const errMsg = (e: unknown): string => (notReady(e) ? tr('এই অংশের ডেটাবেস ধাপ (০২২) এখনো চালানো হয়নি।', 'The database step (022) for this part has not been run yet.') : (e as Coded)?.code === 'short' ? tr('কারণ বা নোট অন্তত ৫ অক্ষরে লিখুন।', 'Write the reason or note in at least 5 letters.') : errText(e));
const Row = ({ l, v }: { l: string; v: unknown }) => (v || v === 0 ? <View style={st.cRow}><Text style={st.lbl}>{l}</Text><Text style={st.p} selectable>{String(v)}</Text></View> : null);

function Search({ label, hint, onSearch, busy, initial = '' }: { label: string; hint?: string; onSearch: (q: string) => void; busy: boolean; initial?: string }): JSX.Element {
  const [q, setQ] = useState(initial);
  return (
    <>
      <Field label={label} hint={hint} value={q} onChangeText={setQ} autoCapitalize="characters" autoCorrect={false} />
      <Button title={tr("খুঁজুন", 'Search')} icon="🔎" onPress={() => onSearch(q)} loading={busy} style={{ marginBottom: S.md }} />
    </>
  );
}

// ---------- 1) Contracts & disputes ----------
export function ContractsTab(): JSX.Element {
  const [rows, setRows] = useState<Res<typeof findContracts> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const search = async (q: string) => {
    setBusy(true); setMsg(null);
    try { setRows(await findContracts(q)); } catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); } finally { setBusy(false); }
  };
  useEffect(() => { search(''); }, []);
  if (open) return <ContractPage id={open} onBack={() => setOpen(null)} />;
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>{tr('হাজী ও লিডারের মধ্যে ঝামেলা হলে চুক্তি খুঁজে শর্ত, টাকার হিসাব, অভিযোগ এক পাতায় দেখুন আর নোট রাখুন।', 'If there is trouble between a haji and a leader, find the contract and see the terms, the money account and complaints on one page, and keep notes.')}</Text>
      <Search label={tr("চুক্তি নম্বর, হাজী বা লিডারের আইডি, অথবা নাম", 'Contract number, haji\'s or leader\'s ID, or name')} hint={tr("যেমন: TC-000012 বা TA-00042", 'e.g. TC-000012 or TA-00042')} onSearch={search} busy={busy} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null && !msg ? <ActivityIndicator color={C.primary} /> : null}
      {rows && rows.length === 0 ? <Notice kind="info" title={tr("কোনো চুক্তি পাওয়া যায়নি", 'No contract found')} /> : null}
      {(rows || []).map((c) => (
        <Pressable key={c.id} onPress={() => setOpen(c.id)} style={st.card} accessibilityRole="button" accessibilityLabel={tr(`চুক্তি ${c.contract_no}, ${c.haji_name} ও ${c.leader_name}। খুলতে চাপুন`, `Contract ${c.contract_no}, ${c.haji_name} and ${c.leader_name}. Tap to open`)}>
          <Text style={st.val}>{c.contract_no} · {CSTATUS[c.status] || c.status}</Text>
          <Text style={st.p}>{c.title} · {fmtTaka(c.price_bdt)}</Text>
          <Text style={st.small}>🕋 {c.haji_name} ({c.haji_code}) · 🧭 {c.leader_name} ({c.leader_code})</Text>
          <Text style={st.small}>{tr('জমা নিশ্চিত:', 'Payment confirmed:')} {fmtTaka(c.paid_confirmed)}{Number(c.paid_waiting) > 0 ? tr(` · যাচাই বাকি: ${fmtTaka(c.paid_waiting)}`, ` · to check: ${fmtTaka(c.paid_waiting)}`) : ''}</Text>
          {c.open_complaints ? <Text style={[st.small, { color: C.bad, fontWeight: '700' }]}>{tr('🚩 যাচাই বাকি অভিযোগ:', '🚩 Complaints to check:')} {toBn(c.open_complaints)}{tr('টি', '')}</Text> : null}
          <Text style={[st.p, { color: C.primary, fontWeight: '700' }]}>{tr('বিস্তারিত দেখুন ›', 'See details ›')}</Text>
        </Pressable>
      ))}
    </>
  );
}

function ContractPage({ id, onBack }: { id: string; onBack: () => void }): JSX.Element {
  const [d, setD] = useState<ContractDetail | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => { try { setD(await contractDetail(id)); } catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); } }, [id]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await addContractNote(id, note); setNote(''); setMsg({ kind: 'ok', text: tr('নোট রাখা হয়েছে (কাজের রেকর্ডেও আছে)।', 'Note kept (it is in the work log too).') }); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); }       // the typed note stays
    finally { setBusy(false); }
  };
  return (
    <>
      <Button title={tr("সব চুক্তির তালিকায় ফিরে যান", 'Back to the list of all contracts')} icon="‹" kind="secondary" onPress={onBack} style={{ marginBottom: S.md }} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {!d ? <ActivityIndicator color={C.primary} /> : (
        <>
          <View style={st.card}>
            <Text style={st.gName}>{d.contract_no}</Text>
            <Text style={st.val}>{CSTATUS[d.status] || d.status}</Text>
            <Row l={tr("হাজী", 'Haji')} v={`${d.haji_name} (${d.haji_code})`} />
            <Row l={tr("লিডার", 'Leader')} v={`${d.leader_name} (${d.leader_code})${d.agency_name ? ` · ${d.agency_name}` : ''}`} />
            <Row l={tr("প্যাকেজ", 'Package')} v={`${d.title} · ${fmtTaka(d.price_bdt)}`} />
            <Row l={tr("যাত্রা", 'Travel')} v={d.travel_from ? tr(`${fmtDay(d.travel_from)} থেকে ${d.travel_to ? fmtDay(d.travel_to) : ''}`, `${fmtDay(d.travel_from)} to ${d.travel_to ? fmtDay(d.travel_to) : ''}`) : ''} />
            <Row l={tr("যা অন্তর্ভুক্ত", 'Included')} v={d.includes} />
            <Row l={tr("যা নেই", 'Not included')} v={d.excludes} />
            <Row l={tr("বাতিল ও টাকা ফেরতের নিয়ম", 'Cancellation and refund rules')} v={d.refund_policy} />
            <Row l={tr("অন্যান্য শর্ত", 'Other terms')} v={d.extra_terms} />
            <Row l={tr("বাতিলের কারণ", 'Reason for cancelling')} v={d.cancel_reason} />
          </View>
          <View style={st.card}>
            <Text style={st.h}>{tr('💳 টাকা জমা', '💳 Payments')}</Text>
            {(d.payments || []).length === 0 ? <Text style={st.p}>{tr('কোনো টাকা জমা নেই।', 'No payments.')}</Text> : null}
            {(d.payments || []).map((p, i) => <Text key={i} style={st.p}>{fmtTaka(p.amount)} · {p.method} · {p.txn_ref} · {PSTATUS[p.status] || p.status}{p.admin_note ? tr(` · নোট: ${p.admin_note}`, ` · Note: ${p.admin_note}`) : ''}</Text>)}
            <Text style={[st.h, { marginTop: S.sm }]}>{tr('↗️ দেওয়া টাকা (লিডার / ফেরত)', '↗️ Money paid out (leader / refund)')}</Text>
            {(d.payouts || []).length === 0 ? <Text style={st.p}>{tr('এখনো কিছু দেওয়া হয়নি।', 'Nothing paid out yet.')}</Text> : null}
            {(d.payouts || []).map((p, i) => <Text key={i} style={st.p}>{p.payee === 'haji' ? tr('↩️ হাজীকে ফেরত', '↩️ Refund to haji') : tr('🧭 লিডারকে', '🧭 To the leader')} · {fmtTaka(p.amount)} · {p.txn_ref}{p.note ? ` · ${p.note}` : ''}</Text>)}
          </View>
          <View style={st.card}>
            <Text style={st.h}>{tr('🚩 অভিযোগ ও রেটিং', '🚩 Complaints and ratings')}</Text>
            {(d.complaints || []).length === 0 ? <Text style={st.p}>{tr('কোনো অভিযোগ নেই।', 'No complaints.')}</Text> : null}
            {(d.complaints || []).map((m, i) => <Text key={i} style={st.p}>[{m.status === 'pending' ? tr('যাচাই বাকি', 'To check') : m.status === 'verified' ? tr('যাচাই হয়েছে', 'Verified') : tr('বাতিল', 'Rejected')}] {m.body}</Text>)}
            {d.rating ? <Text style={st.p}>⭐ {toBn(d.rating.stars)}{d.rating.comment ? ` · "${d.rating.comment}"` : ''}{d.rating.hidden ? tr(' (লুকানো)', ' (hidden)') : ''}</Text> : null}
          </View>
          <View style={st.card}>
            <Text style={st.h}>{tr('📝 অ্যাডমিনের নোট', '📝 Admin\'s notes')}</Text>
            {(d.notes || []).map((n, i) => <Text key={i} style={st.p}>{fmtDay(n.created_at)} · {n.author || tr('অ্যাডমিন', 'Admin')}: {n.note}</Text>)}
            <Field label={tr("নতুন নোট", 'New note')} hint={tr("যেমন: দুই পক্ষের সাথে কথা হয়েছে, লিডার হোটেল বদলাবেন", 'e.g. talked to both sides, the leader will change the hotel')} value={note} onChangeText={setNote} multiline maxLength={1000} editable={!busy} />
            <Button title={tr("নোট রাখুন", 'Keep note')} icon="📝" onPress={save} loading={busy} />
          </View>
          <ChatConsentBox contractId={id} />
        </>
      )}
    </>
  );
}

// Help chat of this haji with this leader: only after the haji agrees in the app; every reading is logged.
const ROLE: Record<string, string> = { get haji() { return tr('🕋 হাজী', '🕋 Haji'); }, get leader() { return tr('🧭 লিডার', '🧭 Leader'); }, get khadem() { return tr('🤝 খাদেম', '🤝 Khadem'); } };
function ChatConsentBox({ contractId }: { contractId: string }): JSX.Element {
  const [rows, setRows] = useState<AdminConsent[] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [chat, setChat] = useState<ChatLine[] | null>(null);
  const load = useCallback(async () => {
    try { setRows(await adminChatConsents(contractId)); } catch (e) { setRows([]); if (notReady(e)) setMsg({ kind: 'info', text: tr('এই অংশের ডেটাবেস ধাপ (০২৪) এখনো চালানো হয়নি।', 'The database step (024) for this part has not been run yet.') }); }
  }, [contractId]);
  useEffect(() => { load(); }, [load]);
  const ask = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const r = await requestChatConsent(contractId, reason); setMsg({ kind: r === 'sent' ? 'ok' : 'info', text: requestResultText(r) }); if (r === 'sent') setReason(''); await load(); }
    catch (e) { setMsg({ kind: 'bad', text: (e as Coded)?.code === 'reason' ? tr('কেন দেখতে চান, অন্তত ৫ অক্ষরে লিখুন (হাজী এটা দেখবেন)।', 'Write why you want to see it, in at least 5 letters (the haji will see this).') : errMsg(e) }); }
    finally { setBusy(false); }
  };
  const view = async (k: AdminConsent) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { setChat(await viewHelpChat(k.id)); } catch (e) { setMsg({ kind: 'bad', text: tr('অনুমতি নেই বা মেয়াদ শেষ। আবার অনুমতি চাইতে হবে।', 'No permission or it has expired. You need to ask for permission again.') }); await load(); }
    finally { setBusy(false); }
  };
  const active = (rows || []).find((k) => k.active);
  const waiting = (rows || []).some((k) => k.status === 'asked');
  return (
    <View style={st.card}>
      <Text style={st.h}>{tr('💬 হাজী ও লিডারের প্রশ্ন-উত্তর', '💬 Questions and answers between haji and leader')}</Text>
      <Text style={st.p}>{tr('হাজীর অনুমতি ছাড়া দেখা যায় না। অনুমতি ৭ দিন থাকে, হাজী যেকোনো সময় ফিরিয়ে নিতে পারেন। প্রতিবার দেখা কাজের রেকর্ডে লেখা থাকে।', 'They cannot be seen without the haji\'s permission. The permission lasts 7 days and the haji can take it back at any time. Every viewing is written in the work log.')}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {(rows || []).slice(0, 3).map((k) => <Text key={k.id} style={st.small}>{fmtDay(k.created_at)} · {consentStatusText(k)} {tr('· কারণ:', '· Reason:')} {k.reason}</Text>)}
      {active ? (
        <Button title={chat ? tr('আবার লোড করুন', 'Load again') : tr('প্রশ্ন-উত্তর দেখুন', 'See questions and answers')} icon="💬" onPress={() => view(active)} loading={busy} style={{ marginTop: S.sm }} />
      ) : rows && !waiting ? (
        <>
          <Field label={tr("কেন দেখতে চান (হাজী এটা দেখবেন)", 'Why you want to see them (the haji will see this)')} hint={tr("যেমন: হোটেল নিয়ে অভিযোগ যাচাই", 'e.g. checking a complaint about the hotel')} value={reason} onChangeText={setReason} maxLength={300} editable={!busy} />
          <Button title={tr("হাজীর কাছে অনুমতি চান", 'Ask the haji for permission')} icon="🔐" onPress={ask} loading={busy} />
        </>
      ) : null}
      {chat && active ? (
        <View style={{ marginTop: S.md }}>
          {chat.length === 0 ? <Text style={st.p}>{tr('এই লিডারের দলে হাজীর কোনো প্রশ্ন-উত্তর নেই।', 'There are no questions and answers from the haji in this leader\'s group.')}</Text> : null}
          {chat.map((m, i) => (
            <Text key={i} style={[st.p, { marginBottom: S.sm }]} selectable>
              <Text style={{ fontWeight: '700' }}>{ROLE[m.sender_role] || m.sender_role} {m.sender_name}</Text> · {fmtWhen(m.created_at)}{'\n'}{m.body}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------- 2) One user, everything ----------
export function UserPage({ id, onBack }: { id: string; onBack: () => void }): JSX.Element {
  const [d, setD] = useState<UserDetail | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => { try { setD(await userDetail(id)); } catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); } }, [id]);
  useEffect(() => { load(); }, [load]);
  const listed = d && d.leader ? d.leader.listed : true;
  const toggleListed = () => confirm(listed ? tr('এই লিডারকে তালিকা থেকে লুকাবেন?', 'Hide this leader from the list?') : tr('এই লিডারকে আবার তালিকায় দেখাবেন?', 'Show this leader in the list again?'),
    listed ? tr('অ্যাকাউন্ট চালু থাকবে, কিন্তু লিডার তালিকা ও অফার পাতায় দেখা যাবে না।', 'The account stays on, but the leader is not seen in the leader list or the offers page.') : '', listed ? tr('হ্যাঁ, লুকান', 'Yes, hide') : tr('হ্যাঁ, দেখান', 'Yes, show'), async () => {
      setBusy(true); setMsg(null);
      try { await setLeaderListed(id, !listed, reason); setReason(''); setMsg({ kind: 'ok', text: listed ? tr('তালিকা থেকে লুকানো হয়েছে।', 'Hidden from the list.') : tr('আবার তালিকায় দেখানো হচ্ছে।', 'Shown in the list again.') }); await load(); }
      catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); }
      finally { setBusy(false); }
    });
  const List = <T,>({ title, items, render }: { title: string; items?: T[] | null; render: (x: T) => string }) => (
    <View style={st.card}>
      <Text style={st.h}>{title}: {toBn((items || []).length)}{tr('টি', '')}</Text>
      {(items || []).map((x: T, i: number) => <Text key={i} style={st.p}>{render(x)}</Text>)}
    </View>
  );
  return (
    <>
      <Button title={tr("খোঁজার পাতায় ফিরে যান", 'Back to the search page')} icon="‹" kind="secondary" onPress={onBack} style={{ marginBottom: S.md }} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {!d ? <ActivityIndicator color={C.primary} /> : (
        <>
          <View style={st.card}>
            <Text style={st.gName}>{d.full_name}</Text>
            <Text style={st.val}>{d.code} · {d.account_type === 'leader' ? tr('লিডার অ্যাকাউন্ট', 'Leader account') : tr('হাজী অ্যাকাউন্ট', 'Haji account')} · {d.status === 'active' ? tr('✅ চালু', '✅ On') : tr('⛔ বন্ধ', '⛔ Stopped')}</Text>
            <Row l={tr("মোবাইল", 'Mobile')} v={d.phone ? toBn(d.phone) : ''} />
            <Row l={tr("ইমেইল", 'Email')} v={d.email} />
            <Row l={tr("যাচাই", 'Checked')} v={d.verified ? tr('✅ যাচাই করা', '✅ Checked') : tr('⏳ যাচাই হয়নি', '⏳ Not checked')} />
            <Row l={tr("যোগদান", 'Joined')} v={fmtDay(d.created_at)} />
            <Text style={st.small}>{tr('🔒 এই ব্যক্তির কাগজপত্র (পাসপোর্ট, ভিসা) গোপন থাকে, এখানে দেখানো হয় না। এই পাতা দেখা কাজের রেকর্ডে থাকে।', '🔒 This person\'s documents (passport, visa) stay private and are not shown here. Viewing this page is written in the work log.')}</Text>
          </View>
          {d.leader ? (
            <View style={st.card}>
              <Text style={st.h}>{tr('🧭 লিডার', '🧭 Leader')}</Text>
              <Row l={tr("এজেন্সি", 'Agency')} v={d.leader.agency} />
              <Row l={tr("জেলা", 'District')} v={d.leader.district} />
              <Text style={st.val}>{listed ? tr('👁️ লিডার তালিকা ও অফার পাতায় দেখা যাচ্ছে', '👁️ Seen in the leader list and the offers page') : tr('🙈 তালিকা থেকে লুকানো', '🙈 Hidden from the list')}</Text>
              <Field label={tr("কারণ", 'Reason')} hint={tr("যেমন: পরীক্ষার লিডার / কিছুদিন কাজ করবেন না", 'e.g. test leader / will not work for a while')} value={reason} onChangeText={setReason} maxLength={300} editable={!busy} />
              <Button title={listed ? tr('তালিকা থেকে লুকান', 'Hide from the list') : tr('আবার তালিকায় দেখান', 'Show in the list again')} icon={listed ? '🙈' : '👁️'} kind="secondary" onPress={toggleListed} loading={busy} />
            </View>
          ) : null}
          <List title={tr("📄 চুক্তি", '📄 Contracts')} items={d.contracts} render={(c) => tr(`${c.contract_no} · ${CSTATUS[c.status] || c.status} · ${c.title} · ${fmtTaka(c.price_bdt)} · ${c.as === 'haji' ? 'লিডার' : 'হাজী'}: ${c.other}`, `${c.contract_no} · ${CSTATUS[c.status] || c.status} · ${c.title} · ${fmtTaka(c.price_bdt)} · ${c.as === 'haji' ? 'Leader' : 'Haji'}: ${c.other}`)} />
          <List title={tr("💳 টাকা জমা", '💳 Payments')} items={d.payments} render={(p) => `${fmtTaka(p.amount)} · ${p.txn_ref} · ${PSTATUS[p.status] || p.status}`} />
          <List title={tr("🚩 তাঁর করা অভিযোগ", '🚩 Complaints they made')} items={d.complaints_by} render={(m) => `[${m.status}] ${m.body}`} />
          <List title={tr("🚩 তাঁর বিরুদ্ধে অভিযোগ", '🚩 Complaints against them')} items={d.complaints_against} render={(m) => `[${m.status}] ${m.body}`} />
          <List title={tr("📮 তাঁর বিরুদ্ধে রিপোর্ট", '📮 Reports against them')} items={d.reports_against} render={(r) => tr(`${r.reason}${r.details ? `: ${r.details}` : ''} (${r.status === 'new' ? 'নতুন' : 'দেখা হয়েছে'})`, `${r.reason}${r.details ? `: ${r.details}` : ''} (${r.status === 'new' ? 'new' : 'seen'})`)} />
          <List title={tr("👥 যে দলে আছেন", '👥 Groups they are in')} items={d.groups} render={(g) => `${g.name} (${g.status})`} />
          <List title={tr("🧭 যে দল চালান", '🧭 Groups they run')} items={d.leads_groups} render={(g) => tr(`${g.name}${g.active ? '' : ' (বন্ধ)'}`, `${g.name}${g.active ? '' : ' (closed)'}`)} />
          <List title={tr("🤝 যে দলের খাদেম", '🤝 Groups where they are a khadem')} items={d.khadem_of} render={(g) => g.name} />
        </>
      )}
    </>
  );
}

// ---------- 4) Rating comments ----------
export function RatingsTab(): JSX.Element {
  const [rows, setRows] = useState<Res<typeof listRatings> | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const search = async (q: string) => { setMsg(null); try { setRows(await listRatings(q)); } catch (e) { setRows([]); setMsg({ kind: 'bad', text: errMsg(e) }); } };
  useEffect(() => { search(''); }, []);
  const act = (r: Item<typeof listRatings>) => confirm(r.comment_hidden ? tr('মন্তব্যটি আবার দেখাবেন?', 'Show the comment again?') : tr('মন্তব্যটি লুকাবেন?', 'Hide the comment?'), tr('তারা (রেটিং) গণনায় থাকবে, শুধু লেখাটা লুকাবে।', 'The stars (rating) stay counted; only the text is hidden.'), r.comment_hidden ? tr('হ্যাঁ, দেখান', 'Yes, show') : tr('হ্যাঁ, লুকান', 'Yes, hide'), async () => {
    setBusy(true); setMsg(null);
    try { await hideRating(r.contract_id, !r.comment_hidden, reason[r.contract_id]); setMsg({ kind: 'ok', text: r.comment_hidden ? tr('আবার দেখানো হচ্ছে।', 'Being shown again.') : tr('লুকানো হয়েছে।', 'Hidden.') }); await search(''); }
    catch (e) { setMsg({ kind: 'bad', text: errMsg(e) }); }
    finally { setBusy(false); }
  });
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>{tr('হাজীদের রেটিংয়ের মন্তব্য। গালি, মিথ্যা বা ব্যক্তিগত তথ্য থাকলে লুকান। তারা গণনায় থাকবে।', 'Hajis\' rating comments. Hide them if they have abuse, lies or personal information. The stars stay counted.')}</Text>
      <Search label={tr("লিডারের আইডি বা নাম (ইচ্ছা করলে)", 'Leader\'s ID or name (optional)')} hint={tr("যেমন: TL-00004", 'e.g. TL-00004')} onSearch={search} busy={busy} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && rows.length === 0 ? <Notice kind="info" title={tr("কোনো মন্তব্য নেই", 'No comments')} /> : null}
      {(rows || []).map((r) => (
        <View key={r.contract_id} style={[st.card, r.comment_hidden && { borderWidth: 2, borderColor: C.line }]}>
          <Text style={st.small}>{r.contract_no} · 🧭 {r.leader_name} ({r.leader_code}) · 🕋 {r.haji_name}</Text>
          <Text style={st.val}>{'⭐'.repeat(r.stars)} {r.counted ? '' : tr('(টাকা যাচাই বাকি, এখনো গণনায় নেই)', '(payment not checked yet, not counted yet)')}</Text>
          <Text style={[st.p, r.comment_hidden && { color: C.muted }]}>"{r.comment}"</Text>
          {r.comment_hidden ? <Text style={st.small}>{tr('🙈 লুকানো · কারণ:', '🙈 Hidden · reason:')} {r.hidden_reason}</Text> : null}
          <Field label={tr("কারণ", 'Reason')} hint={tr("অন্তত ৫ অক্ষর", 'At least 5 letters')} value={reason[r.contract_id] || ''} onChangeText={(v: string) => setReason((x) => ({ ...x, [r.contract_id]: v }))} maxLength={300} editable={!busy} />
          <Button title={r.comment_hidden ? tr('আবার দেখান', 'Show again') : tr('মন্তব্য লুকান', 'Hide comment')} icon={r.comment_hidden ? '👁️' : '🙈'} kind={r.comment_hidden ? 'secondary' : 'danger'} onPress={() => act(r)} disabled={busy} />
        </View>
      ))}
    </>
  );
}

// ---------- 8) Groups & khadems ----------
export function GroupsTab(): JSX.Element {
  const [rows, setRows] = useState<Res<typeof adminGroups> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const search = async (q: string) => { setBusy(true); setMsg(null); try { setRows(await adminGroups(q)); } catch (e) { setRows([]); setMsg({ kind: 'bad', text: errMsg(e) }); } finally { setBusy(false); } };
  useEffect(() => { search(''); }, []);
  return (
    <>
      <Search label={tr("লিডারের আইডি, নাম বা দলের নাম (ইচ্ছা করলে)", 'Leader\'s ID, name or group name (optional)')} hint={tr("যেমন: TL-00004", 'e.g. TL-00004')} onSearch={search} busy={busy} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      {rows && rows.length === 0 ? <Notice kind="info" title={tr("কোনো দল পাওয়া যায়নি", 'No group found')} /> : null}
      {(rows || []).map((g) => (
        <View key={g.id} style={st.card}>
          <Text style={st.val}>{g.name}{g.season ? ` · ${g.season}` : ''}{g.active ? '' : tr(' (বন্ধ)', ' (closed)')}</Text>
          <Text style={st.small}>🧭 {g.leader_name} ({g.leader_code}{tr(') · তৈরি:', ') · made:')} {fmtDay(g.created_at)}</Text>
          <Text style={st.p}>{tr('👥 হাজী:', '👥 Hajis:')} {toBn(g.members)} {tr('জন', '')}{g.invited ? tr(` · আমন্ত্রিত: ${toBn(g.invited)}`, ` · invited: ${g.invited}`) : ''} {tr('· 🤝 খাদেম:', '· 🤝 Khadems:')} {toBn(g.khadems)} {tr('জন', '')}</Text>
          <Text style={[st.p, g.waiting_questions ? { color: C.warn, fontWeight: '700' } : null]}>{tr('💬 উত্তর বাকি প্রশ্ন:', '💬 Questions not answered:')} {toBn(g.waiting_questions)}{tr('টি', '')}</Text>
        </View>
      ))}
      <Text style={st.small}>{tr('🔒 হাজীদের প্রশ্নের লেখা এখানে দেখানো হয় না, শুধু সংখ্যা।', '🔒 The text of hajis\' questions is not shown here, only the numbers.')}</Text>
    </>
  );
}

// ---------- 6) forced update + 5) video links (owner only) ----------
export function AppSettingsBox(): JSX.Element {
  const [minV, setMinV] = useState('');
  const [store, setStore] = useState('');
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    supabase.from('app_settings').select('key,value').then((r) => {
      const h: Record<string, string> = Object.fromEntries((r.data || []).map((x) => [x.key, x.value || '']));
      setMinV(h.min_app_version || ''); setStore(h.store_url || '');
    });
    supabase.from('app_videos').select('route,url').then((r) => setVideos(Object.fromEntries((r.data || []).map((x) => [x.route, x.url]))));
  }, []);
  const run = async (fn: () => Promise<unknown>, ok: string) => { if (busy) return; setBusy(true); setMsg(null); try { await fn(); setMsg({ kind: 'ok', text: ok }); } catch (e) { setMsg({ kind: 'bad', text: /bad url/.test((e as Coded)?.message || '') ? tr('লিংক https:// দিয়ে শুরু হতে হবে।', 'The link must start with https://.') : /bad version/.test((e as Coded)?.message || '') ? tr('সংস্করণ এভাবে লিখুন: 0.2.0', 'Write the version like this: 0.2.0') : errMsg(e) }); } finally { setBusy(false); } };
  const topics: Record<string, { title: string }> = mergeVideos(VIDEO_TOPICS, []);
  return (
    <>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <View style={[st.card, { marginTop: S.lg }]}>
        <Text style={st.h}>{tr('⬆️ বাধ্যতামূলক আপডেট', '⬆️ Required update')}</Text>
        <Text style={st.small}>{tr('এই অ্যাপের সংস্করণ:', 'This app\'s version:')} {APP_VERSION}{tr('। এর চেয়ে পুরোনো অ্যাপ খুললে "নতুন সংস্করণ নিন" পাতা দেখাবে। খালি রাখলে কিছু হবে না। অ্যাডমিন সব সময় চালিয়ে যেতে পারবেন।', '. Opening an app older than this shows the "Get the new version" page. Leave it empty for nothing to happen. The admin can always continue.')}</Text>
        <Field label={tr("সর্বনিম্ন সংস্করণ", 'Lowest version')} hint={tr("যেমন: 0.2.0", 'e.g. 0.2.0')} value={minV} onChangeText={setMinV} maxLength={11} autoCapitalize="none" />
        <Field label={tr("নতুন অ্যাপের লিংক (Play Store)", 'Link to the new app (Play Store)')} hint="https://play.google.com/..." value={store} onChangeText={setStore} maxLength={400} autoCapitalize="none" />
        <Button title={tr("সংরক্ষণ করুন", 'Save')} icon="💾" loading={busy} onPress={() => confirm(tr('বাধ্যতামূলক আপডেট সংরক্ষণ করবেন?', 'Save the required update?'), minV ? tr(`${minV}-এর চেয়ে পুরোনো অ্যাপ আর চলবে না।`, `Apps older than ${minV} will no longer work.`) : tr('বাধ্যতামূলক আপডেট বন্ধ থাকবে।', 'The required update will stay off.'), tr('হ্যাঁ, সংরক্ষণ', 'Yes, save'), () =>
          run(async () => { await setSetting('store_url', store.trim()); await setSetting('min_app_version', minV.trim()); }, tr('সংরক্ষণ হয়েছে।', 'Saved.')))} />
      </View>
      <View style={st.card}>
        <Text style={st.h}>{tr('🎬 ভিডিও লিংক', '🎬 Video links')}</Text>
        <Text style={st.small}>{tr('প্রতিটি পাতার "▶️ ভিডিও দেখুন" বোতামের লিংক। https:// দিয়ে শুরু হতে হবে। খালি রাখলে "শীঘ্রই আসছে" দেখাবে।', 'The link for each page\'s "▶️ Watch video" button. It must start with https://. Leave it empty to show "Coming soon".')}</Text>
        {Object.entries(topics).map(([route, t]) => (
          <View key={route} style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: S.sm }}>
            <Field label={t.title} hint="https://..." value={videos[route] || ''} onChangeText={(v: string) => setVideos((x) => ({ ...x, [route]: v }))} maxLength={500} autoCapitalize="none" autoCorrect={false} />
            <Button title={tr("এই ভিডিও সংরক্ষণ করুন", 'Save this video')} kind="secondary" disabled={busy} onPress={() => run(() => setVideo(route, videos[route] || ''), (videos[route] || '').trim() ? tr('ভিডিও লিংক বসানো হয়েছে।', 'Video link set.') : tr('লিংক সরানো হয়েছে, এখন "শীঘ্রই আসছে" দেখাবে।', 'Link removed; it now shows "Coming soon".'))} style={{ marginBottom: S.sm }} />
          </View>
        ))}
      </View>
    </>
  );
}
