// Admin: correct guide and dua text without an app update (supabase/024_admin_part3.sql).
// Only existing text can be changed; phones get the change the next time the app opens with internet.
import React, { useCallback, useEffect, useState, type JSX } from 'react';
import { tr } from '../lib/lang';
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
    catch (e) { setRows([]); setErr(notReady(e) ? tr('এই অংশের ডেটাবেস ধাপ (০২৪) এখনো চালানো হয়নি।', 'The database step (024) for this part has not been run yet.') : errText(e)); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const list = LISTS[kind].filter((x) => !q.trim() || String(x.title).includes(q.trim()));
  const changed = (id: string): number => (rows || []).filter((r) => r.kind === kind && r.item_id === id).length;
  const cur = item && LISTS[kind].find((x) => x.id === item);

  if (cur) return (
    <>
      <Button title={tr("তালিকায় ফিরে যান", 'Back to the list')} icon="‹" kind="secondary" onPress={() => setItem(null)} style={{ marginBottom: S.md }} />
      <Text style={st.gName}>{iconOf(cur)}{cur.title}</Text>
      <Notice kind="warn" title={tr("ধর্মীয় লেখা বদলানোর আগে আলিমের সাথে মিলিয়ে নিন", 'Check with an alim before changing religious text')} text={tr("সংরক্ষণ করলে সবার ফোনে পরের বার অ্যাপ খোলার সময় নতুন লেখা দেখাবে।", 'After saving, everyone\'s phone shows the new text the next time the app is opened.')} />
      {textFields(cur).map((f) => <FieldEditor key={`${kind}/${cur.id}/${f.path}`} kind={kind} item={cur.id} f={f}
        overridden={(rows || []).some((r) => r.kind === kind && r.item_id === cur.id && r.path === f.path)} onSaved={refresh} />)}
    </>
  );
  return (
    <>
      <Text style={[st.p, { marginBottom: S.sm }]}>{tr('ভুল বানান বা তথ্য ঠিক করতে গাইড বা দোয়া বেছে নিন। নতুন গাইড যোগ করতে অ্যাপ আপডেট লাগবে।', 'Choose a guide or dua to fix a spelling mistake or wrong information. Adding a new guide needs an app update.')}</Text>
      <Segmented value={kind} onChange={(v: Kind) => { setKind(v); setItem(null); setQ(''); }} options={[{ id: 'guide', label: tr('গাইড', 'Guides') }, { id: 'dua', label: tr('দোয়া', 'Duas') }]} />
      {err ? <Notice kind="info" title={err} /> : null}
      {rows === null ? <ActivityIndicator color={C.primary} /> : null}
      <Field label={tr("নাম দিয়ে খুঁজুন", 'Search by name')} hint={kind === 'guide' ? tr('যেমন: স্বাস্থ্য', 'e.g. health') : tr('যেমন: ছানা', 'e.g. Thana')} value={q} onChangeText={setQ} />
      {list.map((x) => (
        <Pressable key={x.id} onPress={() => setItem(x.id)} style={st.card} accessibilityRole="button"
          accessibilityLabel={tr(`${x.title}${changed(x.id) ? `, ${changed(x.id)}টি লেখা বদলানো` : ''}। খুলতে চাপুন`, `${x.title}${changed(x.id) ? `, ${changed(x.id)} texts changed` : ''}. Tap to open`)}>
          <Text style={st.val}>{iconOf(x)}{x.title}</Text>
          {changed(x.id) ? <Text style={[st.small, { color: C.warn, fontWeight: '700' }]}>{tr('✏️ বদলানো লেখা আছে', '✏️ Has changed text')}</Text> : null}
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
    catch (e) { setMsg({ kind: 'bad', text: (e as { code?: string }).code === 'empty' ? tr('লেখা খালি রাখা যাবে না।', 'The text cannot be left empty.') : errText(e) }); }   // the draft stays
    finally { setBusy(false); }
  };
  return (
    <View style={st.card}>
      <Field label={f.label} value={draft} onChangeText={setDraft} multiline={f.value.length > 40} maxLength={4000} editable={!busy} />
      {overridden && orig != null ? <Text style={st.small}>{tr('অ্যাপের আসল লেখা:', 'The app\'s original text:')} {orig}</Text> : null}
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      <Button title={tr("এই লেখা সংরক্ষণ করুন", 'Save this text')} icon="💾" onPress={() => run(draft, tr('সংরক্ষণ হয়েছে।', 'Saved.'))} loading={busy} disabled={draft.trim() === f.value.trim()} style={{ marginBottom: overridden ? S.sm : 0 }} />
      {overridden ? (
        <Button title={tr("অ্যাপের আসল লেখায় ফেরত নিন", 'Go back to the app\'s original text')} icon="↩️" kind="secondary" disabled={busy}
          onPress={() => confirm(tr('আসল লেখায় ফেরত নেবেন?', 'Go back to the original text?'), tr('আপনার বদলানো লেখা মুছে যাবে।', 'Your changed text will be deleted.'), tr('ফেরত নিন', 'Go back'), () => run(null, tr('আসল লেখায় ফেরত নেওয়া হয়েছে।', 'Went back to the original text.')))} />
      ) : null}
    </View>
  );
}
