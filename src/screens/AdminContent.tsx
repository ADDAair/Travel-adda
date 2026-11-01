// Admin: correct guide and dua text without an app update (supabase/024_admin_part3.sql).
// Only existing text can be changed; phones get the change the next time the app opens with internet.
import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Field, Notice, Segmented } from '../components/ui';
import { GUIDES } from '../content/guides';
import { DUAS } from '../content/duas';
import type { Dua, Guide } from '../content/types';
import { textFields, applyOverrides, listOverrides, setContent, originalText, type TextField, type Override } from '../lib/contentEdit';
import { notReady } from '../lib/groups';
import { st, errText, confirm } from './GroupScreen';
import type { Msg } from './navTypes';

type Item = Guide | Dua;   // what the editor shows: id, title and (guides only) an icon
type Kind = 'guide' | 'dua';
const iconOf = (x: Item): string => ('icon' in x && x.icon ? `${x.icon} ` : '');

const LISTS: Record<Kind, readonly Item[]> = { guide: GUIDES, dua: DUAS };

export default function ContentTab(): JSX.Element {
  const [kind, setKind] = useState<Kind>('guide');
  const [item, setItem] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Override[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { const r = await listOverrides(); Object.entries(LISTS).forEach(([k, l]) => applyOverrides(l, r, k)); setRows(r); setErr(null); }
    catch (e) { setRows([]); setErr(notReady(e) ? 'এই অংশের ডেটাবেস ধাপ (০২৪) এখনো চালানো হয়নি।' : errText(e)); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const list = LISTS[kind].filter((x) => !q.trim() || String(x.title).includes(q.trim()));
  const changed = (id: string): number => (rows || []).filter((r) => r.kind === kind && r.item_id === id).length;
  const cur = item && LISTS[kind].find((x) => x.id === item);

  if (cur) return (
    <>
      <Button title="তালিকায় ফিরে যান" icon="‹" kind="secondary" onPress={() => setItem(null)} style={{ marginBottom: S.md }} />
      <Text style={st.gName}>{iconOf(cur)}{cur.title}</Text>
      <Notice kind="warn" title="ধর্মীয় লেখা বদলানোর আগে আলিমের সাথে মিলিয়ে নিন" text="সংরক্ষণ করলে সবার ফোনে পরের বার অ্যাপ খোলার সময় নতুন লেখা দেখাবে।" />
      {textFields(cur).map((f) => <FieldEditor key={`${kind}/${cur.id}/${f.path}`} kind={kind} item={cur.id} f={f}
        overridden={(rows || []).some((r) => r.kind === kind && r.item_id === cur.id && r.path === f.path)} onSaved={refresh} />)}
    </>
  );
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>ভুল বানান বা তথ্য ঠিক করতে গাইড বা দোয়া বেছে নিন। নতুন গাইড যোগ করতে অ্যাপ আপডেট লাগবে।</Text>
      <Segmented value={kind} onChange={(v: Kind) => { setKind(v); setItem(null); setQ(''); }} options={[{ id: 'guide', label: 'গাইড' }, { id: 'dua', label: 'দোয়া' }]} />
      {err ? <Notice kind="info" title={err} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      <Field label="নাম দিয়ে খুঁজুন" hint={kind === 'guide' ? 'যেমন: স্বাস্থ্য' : 'যেমন: ছানা'} value={q} onChangeText={setQ} />
      {list.map((x) => (
        <Pressable key={x.id} onPress={() => setItem(x.id)} style={st.card} accessibilityRole="button"
          accessibilityLabel={`${x.title}${changed(x.id) ? `, ${changed(x.id)}টি লেখা বদলানো` : ''}। খুলতে চাপুন`}>
          <Text style={st.val}>{iconOf(x)}{x.title}</Text>
          {changed(x.id) ? <Text style={[st.small, { color: C.warn, fontWeight: '700' }]}>✏️ বদলানো লেখা আছে</Text> : null}
        </Pressable>
      ))}
    </>
  );
}

function FieldEditor({ kind, item, f, overridden, onSaved }: { kind: Kind; item: string; f: TextField; overridden: boolean; onSaved: () => Promise<void> }): JSX.Element {
  const [draft, setDraft] = useState(f.value);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { setDraft(f.value); }, [f.value]);
  const orig = originalText(kind, item, f.path);
  const run = async (body: string | null, ok: string) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await setContent(kind, item, f.path, body); await onSaved(); setMsg({ kind: 'ok', text: ok }); }
    catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string }).code === 'empty' ? 'লেখা খালি রাখা যাবে না।' : errText(e) }); }   // the draft stays
    finally { setBusy(false); }
  };
  return (
    <View style={st.card}>
      <Field label={f.label} value={draft} onChangeText={setDraft} multiline={f.value.length > 40} maxLength={4000} editable={!busy} />
      {overridden && orig != null ? <Text style={st.small}>অ্যাপের আসল লেখা: {orig}</Text> : null}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Button title="এই লেখা সংরক্ষণ করুন" icon="💾" onPress={() => run(draft, 'সংরক্ষণ হয়েছে।')} loading={busy} disabled={draft.trim() === f.value.trim()} style={{ marginBottom: overridden ? S.sm : 0 }} />
      {overridden ? (
        <Button title="অ্যাপের আসল লেখায় ফেরত নিন" icon="↩️" kind="secondary" disabled={busy}
          onPress={() => confirm('আসল লেখায় ফেরত নেবেন?', 'আপনার বদলানো লেখা মুছে যাবে।', 'ফেরত নিন', () => run(null, 'আসল লেখায় ফেরত নেওয়া হয়েছে।'))} />
      ) : null}
    </View>
  );
}
