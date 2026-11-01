import React, { useEffect, useState, type JSX } from 'react';
import { View, Text, Pressable } from 'react-native';
import { C, F, S, R, TOUCH } from '../theme';
import { Button, Field, Notice } from './ui';
import { toBn } from '../lib/phone';
import { CONTRACT_STATUS, REPORT_REASONS, isBlocked, block, unblock, report } from '../lib/market';
import { st, fmtDay, fmtTaka, confirm, errText } from '../screens/GroupScreen';
import type { Row, Msg } from '../screens/navTypes';

// Full contract text, the same for haji and leader.
export function ContractDetails({ c, who = 'haji' }: { c: Row; who?: 'haji' | 'leader' }): JSX.Element {
  const s = CONTRACT_STATUS[c.status] || { icon: '', label: c.status };
  const Line = ({ l, v }: { l: string; v?: string | null }) => (v ? <View style={st.cRow}><Text style={st.lbl}>{l}</Text><Text style={st.p} selectable>{v}</Text></View> : null);
  return (
    <View>
      <Text style={st.small}>চুক্তি নম্বর {c.contract_no} · {c.kind === 'hajj' ? '🕋 হজ' : '🔄 ওমরাহ'}</Text>
      <Text style={st.gName}>{c.title}</Text>
      <Text style={[st.val, { marginTop: S.xs }]}>{s.icon} {s.label}</Text>
      {who === 'haji' ? <Line l="লিডার" v={`${c.leader_name || ''} (${c.leader_code || ''})${c.agency_name ? ` · ${c.agency_name}` : ''}`} />
        : <Line l="হাজী" v={`${c.haji_name || ''} (${c.haji_code || ''})`} />}
      <Line l="জনপ্রতি মোট দাম" v={fmtTaka(c.price_bdt)} />
      <Line l="যাত্রা" v={c.travel_from ? `${fmtDay(c.travel_from)}${c.travel_to ? ` থেকে ${fmtDay(c.travel_to)}` : ''}` : ''} />
      <Line l="যা অন্তর্ভুক্ত" v={c.includes} />
      <Line l="যা অন্তর্ভুক্ত নয়" v={c.excludes} />
      <Line l="বাতিল ও টাকা ফেরতের নিয়ম" v={c.refund_policy} />
      <Line l="অন্যান্য শর্ত" v={c.extra_terms} />
      <Line l="পাঠানো হয়েছে" v={fmtDay(c.created_at)} />
      {c.status === 'accepted' || c.status === 'completed' || c.status === 'cancelled' ? <Line l="হাজী সম্মতি দিয়েছেন" v={fmtDay(c.responded_at)} /> : null}
      {c.status === 'cancelled' ? <Line l={`বাতিল করেছেন ${c.cancelled_by_me ? 'আপনি' : (who === 'haji' ? 'লিডার' : 'হাজী')} (${fmtDay(c.cancelled_at)})`} v={`কারণ: ${c.cancel_reason || ''}`} /> : null}
      {c.status === 'completed' ? <Line l="সম্পন্ন" v={fmtDay(c.completed_at)} /> : null}
    </View>
  );
}

// Asks for a written reason before a serious step (cancel a contract, cancel a referral...).
export function ReasonBox({ title, hint, button, min = 10, onSubmit, onClose, busy }: {
  title: string; hint?: string; button: string; min?: number; onSubmit: (reason: string) => void; onClose: () => void; busy?: boolean;
}): JSX.Element {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const go = () => {
    if (text.trim().length < min) { setErr(`কারণটি একটু বিস্তারিত লিখুন (অন্তত ${toBn(min)} অক্ষর)।`); return; }
    setErr(''); onSubmit(text.trim());
  };
  return (
    <View style={[st.card, { borderWidth: 2, borderColor: C.bad }]}>
      <Text style={st.h}>{title}</Text>
      <Field label="কারণ লিখুন" hint={hint} value={text} onChangeText={setText} multiline maxLength={1000} error={err} />
      <Button title={button} kind="danger" onPress={go} loading={busy} />
      <Button title="না, থাক" kind="secondary" onPress={onClose} disabled={busy} style={{ marginTop: S.sm }} />
    </View>
  );
}

// 1–5 stars as big buttons with words, so it never depends on colour or on reading small icons.
const STAR_WORDS = ['', 'খুব খারাপ', 'খারাপ', 'চলনসই', 'ভালো', 'খুব ভালো'];
export function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }): JSX.Element {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.xs, marginBottom: S.sm }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio" accessibilityState={{ selected: value === n }} accessibilityLabel={`${toBn(n)} তারা, ${STAR_WORDS[n]}`}
          style={{ minWidth: 56, minHeight: TOUCH + 8, borderRadius: R.md, borderWidth: 2, borderColor: value === n ? C.primary : C.line, backgroundColor: value >= n ? C.goldSoft : C.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
          <Text style={{ fontSize: 22 }}>{value >= n ? '⭐' : '☆'}</Text>
          <Text style={{ fontSize: 12, color: C.text }}>{toBn(n)}</Text>
        </Pressable>
      ))}
      {value ? <Text style={[st.small, { alignSelf: 'center' }]}>{STAR_WORDS[value]}</Text> : null}
    </View>
  );
}
export const starText = (avg: unknown, count: unknown): string => (count ? `⭐ ${toBn(Number(avg).toFixed(1))} (${toBn(count)} জনের রেটিং)` : '⭐ এখনো রেটিং নেই');

// Report someone to the admin, and/or block them. Used on a leader's profile and in the leader's haji lists.
export function ReportBlock({ targetId, targetName }: { targetId: string; targetName: string }): JSX.Element | null {
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'report' | null>(null);     // null | 'report'
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { isBlocked(targetId).then(setBlocked).catch(() => setBlocked(null)); }, [targetId]);

  const toggleBlock = () => confirm(blocked ? `${targetName}-কে আনব্লক করবেন?` : `${targetName}-কে ব্লক করবেন?`,
    blocked ? '' : 'ব্লক করলে তিনি আপনাকে চুক্তির অনুরোধ বা দলের আমন্ত্রণ পাঠাতে পারবেন না, আর তালিকায় আপনি তাঁকে দেখবেন না।',
    blocked ? 'হ্যাঁ, আনব্লক' : 'হ্যাঁ, ব্লক করুন', async () => {
      setBusy(true); setMsg(null);
      try { if (blocked) await unblock(targetId); else await block(targetId); setBlocked(!blocked); setMsg({ kind: 'ok', text: blocked ? 'আনব্লক করা হয়েছে।' : 'ব্লক করা হয়েছে।' }); }
      catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
      finally { setBusy(false); }
    });
  const send = async () => {
    if (!reason) { setMsg({ kind: 'bad', text: 'একটি কারণ বাছুন।' }); return; }
    setBusy(true); setMsg(null);
    try { await report(targetId, reason, details); setMode(null); setReason(''); setDetails(''); setMsg({ kind: 'ok', text: 'রিপোর্ট পাঠানো হয়েছে। Travel Adda টিম দেখবে।' }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string } | null)?.code === '42501' ? 'আজ আর রিপোর্ট পাঠানো যাবে না। কাল আবার চেষ্টা করুন।' : errText(e) }); }
    finally { setBusy(false); }
  };
  if (blocked === null && !msg) return null;     // the database step is not there yet: show nothing
  return (
    <View style={[st.card, { marginTop: S.md }]}>
      <Text style={st.h}>🚩 সমস্যা হলে</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {mode === 'report' ? (
        <>
          {REPORT_REASONS.map((r) => (
            <Pressable key={r.id} onPress={() => setReason(r.id)} style={{ minHeight: TOUCH, justifyContent: 'center' }} accessibilityRole="radio" accessibilityState={{ selected: reason === r.id }}>
              <Text style={{ fontSize: F.body, color: C.text }}>{reason === r.id ? '🔘' : '⚪'} {r.label}</Text>
            </Pressable>
          ))}
          <Field label="বিস্তারিত (ইচ্ছা করলে)" value={details} onChangeText={setDetails} multiline maxLength={1000} />
          <Button title="রিপোর্ট পাঠান" icon="🚩" kind="danger" onPress={send} loading={busy} />
          <Button title="বাতিল" kind="secondary" onPress={() => setMode(null)} disabled={busy} style={{ marginTop: S.sm }} />
        </>
      ) : (
        <>
          <Button title="অ্যাডমিনকে রিপোর্ট করুন" icon="🚩" kind="secondary" onPress={() => setMode('report')} disabled={busy} />
          {blocked !== null ? <Button title={blocked ? 'আনব্লক করুন' : 'ব্লক করুন'} icon={blocked ? '🔓' : '⛔'} kind="danger" onPress={toggleBlock} disabled={busy} style={{ marginTop: S.sm }} /> : null}
        </>
      )}
    </View>
  );
}
