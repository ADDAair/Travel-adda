import React, { useEffect, useState, type JSX } from 'react';
import { View, Text, Pressable } from 'react-native';
import { tr } from '../lib/lang';
import { C, F, S, R, TOUCH } from '../theme';
import { Button, Field, Notice } from './ui';
import { toBn } from '../lib/phone';
import { CONTRACT_STATUS, REPORT_REASONS, isBlocked, block, unblock, report } from '../lib/market';
import { st, fmtDay, fmtTaka, confirm, errText } from '../screens/GroupScreen';
import type { Msg } from '../screens/navTypes';
import type { AnyContract } from '../lib/types';

// Full contract text, the same for haji and leader.
export function ContractDetails({ c, who = 'haji' }: { c: AnyContract; who?: 'haji' | 'leader' }): JSX.Element {
  const s = CONTRACT_STATUS[c.status || ''] || { icon: '', label: c.status };
  const Line = ({ l, v }: { l: string; v?: string | null }) => (v ? <View style={st.cRow}><Text style={st.lbl}>{l}</Text><Text style={st.p} selectable>{v}</Text></View> : null);
  return (
    <View>
      <Text style={st.small}>{tr('চুক্তি নম্বর', 'Contract no.')} {c.contract_no} · {c.kind === 'hajj' ? tr('🕋 হজ', '🕋 Hajj') : tr('🔄 ওমরাহ', '🔄 Umrah')}</Text>
      <Text style={st.gName}>{c.title}</Text>
      <Text style={[st.val, { marginTop: S.xs }]}>{s.icon} {s.label}</Text>
      {who === 'haji' ? <Line l={tr('লিডার', 'Leader')} v={`${c.leader_name || ''} (${c.leader_code || ''})${c.agency_name ? ` · ${c.agency_name}` : ''}`} />
        : <Line l={tr('হাজী', 'Haji')} v={`${c.haji_name || ''} (${c.haji_code || ''})`} />}
      <Line l={tr('জনপ্রতি মোট দাম', 'Total price per person')} v={fmtTaka(c.price_bdt)} />
      <Line l={tr('যাত্রা', 'Travel')} v={c.travel_from ? `${fmtDay(c.travel_from)}${c.travel_to ? tr(` থেকে ${fmtDay(c.travel_to)}`, ` to ${fmtDay(c.travel_to)}`) : ''}` : ''} />
      <Line l={tr('যা অন্তর্ভুক্ত', 'Included')} v={c.includes} />
      <Line l={tr('যা অন্তর্ভুক্ত নয়', 'Not included')} v={c.excludes} />
      <Line l={tr('বাতিল ও টাকা ফেরতের নিয়ম', 'Cancellation and refund rules')} v={c.refund_policy} />
      <Line l={tr('অন্যান্য শর্ত', 'Other terms')} v={c.extra_terms} />
      <Line l={tr('পাঠানো হয়েছে', 'Sent')} v={fmtDay(c.created_at)} />
      {c.status === 'accepted' || c.status === 'completed' || c.status === 'cancelled' ? <Line l={tr('হাজী সম্মতি দিয়েছেন', 'Haji agreed')} v={fmtDay(c.responded_at)} /> : null}
      {c.status === 'cancelled' ? <Line l={tr(`বাতিল করেছেন ${c.cancelled_by_me ? 'আপনি' : (who === 'haji' ? 'লিডার' : 'হাজী')} (${fmtDay(c.cancelled_at)})`, `Cancelled by ${c.cancelled_by_me ? 'you' : (who === 'haji' ? 'the leader' : 'the haji')} (${fmtDay(c.cancelled_at)})`)} v={tr(`কারণ: ${c.cancel_reason || ''}`, `Reason: ${c.cancel_reason || ''}`)} /> : null}
      {c.status === 'completed' ? <Line l={tr('সম্পন্ন', 'Completed')} v={fmtDay(c.completed_at)} /> : null}
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
    if (text.trim().length < min) { setErr(tr(`কারণটি একটু বিস্তারিত লিখুন (অন্তত ${toBn(min)} অক্ষর)।`, `Please write the reason in a little more detail (at least ${min} letters).`)); return; }
    setErr(''); onSubmit(text.trim());
  };
  return (
    <View style={[st.card, { borderWidth: 2, borderColor: C.bad }]}>
      <Text style={st.h}>{title}</Text>
      <Field label={tr('কারণ লিখুন', 'Write the reason')} hint={hint} value={text} onChangeText={setText} multiline maxLength={1000} error={err} />
      <Button title={button} kind="danger" onPress={go} loading={busy} />
      <Button title={tr('না, থাক', 'No, leave it')} kind="secondary" onPress={onClose} disabled={busy} style={{ marginTop: S.sm }} />
    </View>
  );
}

// 1–5 stars as big buttons with words, so it never depends on colour or on reading small icons.
const STAR_WORDS = ['', 'খুব খারাপ', 'খারাপ', 'চলনসই', 'ভালো', 'খুব ভালো'];   // i18n-ok: English in STAR_EN
const STAR_EN = ['', 'Very bad', 'Bad', 'OK', 'Good', 'Very good'];
const starWord = (n: number): string => tr(STAR_WORDS[n] || '', STAR_EN[n] || '');
export function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }): JSX.Element {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.xs, marginBottom: S.sm }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio" accessibilityState={{ selected: value === n }} accessibilityLabel={tr(`${toBn(n)} তারা, ${starWord(n)}`, `${n} star${n === 1 ? '' : 's'}, ${starWord(n)}`)}
          style={{ minWidth: 56, minHeight: TOUCH + 8, borderRadius: R.md, borderWidth: 2, borderColor: value === n ? C.primary : C.line, backgroundColor: value >= n ? C.goldSoft : C.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
          <Text style={{ fontSize: 22 }}>{value >= n ? '⭐' : '☆'}</Text>
          <Text style={{ fontSize: 12, color: C.text }}>{toBn(n)}</Text>
        </Pressable>
      ))}
      {value ? <Text style={[st.small, { alignSelf: 'center' }]}>{STAR_WORDS[value]}</Text> : null}
    </View>
  );
}
export const starText = (avg: unknown, count: unknown): string => (count ? tr(`⭐ ${toBn(Number(avg).toFixed(1))} (${toBn(count)} জনের রেটিং)`, `⭐ ${Number(avg).toFixed(1)} (${count} rating${Number(count) === 1 ? '' : 's'})`) : tr('⭐ এখনো রেটিং নেই', '⭐ No ratings yet'));

// Report someone to the admin, and/or block them. Used on a leader's profile and in the leader's haji lists.
export function ReportBlock({ targetId, targetName }: { targetId: string; targetName: string }): JSX.Element | null {
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'report' | null>(null);     // null | 'report'
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { isBlocked(targetId).then(setBlocked).catch(() => setBlocked(null)); }, [targetId]);

  const toggleBlock = () => confirm(blocked ? tr(`${targetName}-কে আনব্লক করবেন?`, `Unblock ${targetName}?`) : tr(`${targetName}-কে ব্লক করবেন?`, `Block ${targetName}?`),
    blocked ? '' : tr('ব্লক করলে তিনি আপনাকে চুক্তির অনুরোধ বা দলের আমন্ত্রণ পাঠাতে পারবেন না, আর তালিকায় আপনি তাঁকে দেখবেন না।', 'Once blocked, they cannot send you a contract request or a group invitation, and you will not see them in the list.'),
    blocked ? tr('হ্যাঁ, আনব্লক', 'Yes, unblock') : tr('হ্যাঁ, ব্লক করুন', 'Yes, block'), async () => {
      setBusy(true); setMsg(null);
      try { if (blocked) await unblock(targetId); else await block(targetId); setBlocked(!blocked); setMsg({ kind: 'ok', text: blocked ? tr('আনব্লক করা হয়েছে।', 'Unblocked.') : tr('ব্লক করা হয়েছে।', 'Blocked.') }); }
      catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
      finally { setBusy(false); }
    });
  const send = async () => {
    if (!reason) { setMsg({ kind: 'bad', text: tr('একটি কারণ বাছুন।', 'Choose a reason.') }); return; }
    setBusy(true); setMsg(null);
    try { await report(targetId, reason, details); setMode(null); setReason(''); setDetails(''); setMsg({ kind: 'ok', text: tr('রিপোর্ট পাঠানো হয়েছে। Travel Adda টিম দেখবে।', 'Report sent. The Travel Adda team will look at it.') }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string } | null)?.code === '42501' ? tr('আজ আর রিপোর্ট পাঠানো যাবে না। কাল আবার চেষ্টা করুন।', 'No more reports can be sent today. Try again tomorrow.') : errText(e) }); }
    finally { setBusy(false); }
  };
  if (blocked === null && !msg) return null;     // the database step is not there yet: show nothing
  return (
    <View style={[st.card, { marginTop: S.md }]}>
      <Text style={st.h}>{tr('🚩 সমস্যা হলে', '🚩 If there is a problem')}</Text>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {mode === 'report' ? (
        <>
          {REPORT_REASONS.map((r) => (
            <Pressable key={r.id} onPress={() => setReason(r.id)} style={{ minHeight: TOUCH, justifyContent: 'center' }} accessibilityRole="radio" accessibilityState={{ selected: reason === r.id }}>
              <Text style={{ fontSize: F.body, color: C.text }}>{reason === r.id ? '🔘' : '⚪'} {r.label}</Text>
            </Pressable>
          ))}
          <Field label={tr('বিস্তারিত (ইচ্ছা করলে)', 'Details (optional)')} value={details} onChangeText={setDetails} multiline maxLength={1000} />
          <Button title={tr('রিপোর্ট পাঠান', 'Send report')} icon="🚩" kind="danger" onPress={send} loading={busy} />
          <Button title={tr('বাতিল', 'Cancel')} kind="secondary" onPress={() => setMode(null)} disabled={busy} style={{ marginTop: S.sm }} />
        </>
      ) : (
        <>
          <Button title={tr('অ্যাডমিনকে রিপোর্ট করুন', 'Report to the admin')} icon="🚩" kind="secondary" onPress={() => setMode('report')} disabled={busy} />
          {blocked !== null ? <Button title={blocked ? tr('আনব্লক করুন', 'Unblock') : tr('ব্লক করুন', 'Block')} icon={blocked ? '🔓' : '⛔'} kind="danger" onPress={toggleBlock} disabled={busy} style={{ marginTop: S.sm }} /> : null}
        </>
      )}
    </View>
  );
}
