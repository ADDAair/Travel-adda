import React, { useState, type JSX } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import ScrollView from './KbScroll';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R, TOUCH } from '../theme';
import { Button, Field } from './ui';
import { DISTRICTS, districtName, districtMatch } from '../lib/market';
import { tr } from '../lib/lang';

// A big, searchable list. By default Bangladesh's 64 districts; allowAll adds "সব জেলা" (for filters).
// options: another list (e.g. the upazilas of one district). allowOther: if a name is missing, the person can type it.
// disabled + disabledText: shown greyed with a reason (e.g. "আগে জেলা বাছুন").
export default function DistrictPicker({
  label, value, onChange, allowAll = false, error,
  options = DISTRICTS, placeholder, searchHint, noun,
  allowOther = false, disabled = false, disabledText, nameOf,
}: {
  label?: string; value?: string | null; onChange: (v: string) => void; allowAll?: boolean; error?: string;
  options?: readonly string[]; placeholder?: string; searchHint?: string; noun?: string;
  allowOther?: boolean; disabled?: boolean; disabledText?: string;
  nameOf?: (v: string) => string;   // the name shown for a saved value (default: district names)
}): JSX.Element {
  const ins = useSafeAreaInsets();
  const nm = nameOf || ((v: string) => districtName(v));
  const lab = label || tr('জেলা', 'District');
  const what = noun || tr('জেলা', 'district');
  const ph = placeholder || tr('জেলা বাছুন', 'Choose a district');
  const hint = searchHint || tr('যেমন: সিলেট', 'e.g. Sylhet');
  const all = tr('সব জেলা', 'All districts');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const typed = q.trim();
  const list = options.filter((d) => !typed || districtMatch(d, typed) || nm(d).toLowerCase().includes(typed.toLowerCase()));
  const exact = options.includes(typed);
  const pick = (d: string) => { onChange(d); setOpen(false); setQ(''); };
  const shown = value ? nm(value) : (allowAll ? all : disabled && disabledText ? disabledText : ph);
  return (
    <View style={{ marginBottom: S.md }}>
      <Text style={p.label}>{lab}</Text>
      <Pressable
        onPress={() => { if (!disabled) setOpen(true); }}
        style={[p.box, disabled && p.boxOff, error ? { borderColor: C.bad, borderWidth: 2 } : null]}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={`${lab}: ${value ? nm(value) : (allowAll ? all : tr('বাছাই করা হয়নি', 'not chosen'))}. ${disabled ? (disabledText || '') : tr('বদলাতে চাপুন', 'Tap to change')}`}
      >
        <Text style={[p.val, (!value || disabled) && { color: C.muted }]}>{shown}</Text>
        {disabled ? null : <Text style={p.arrow}>▾</Text>}
      </Pressable>
      {error ? <Text style={p.err}>⚠️ {error}</Text> : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: ins.top + S.md, paddingHorizontal: S.md }}>
          <Text style={p.title}>{tr(`${lab} বাছুন`, `Choose: ${lab}`)}</Text>
          <Field label={tr('খুঁজুন', 'Search')} hint={hint} value={q} onChangeText={setQ} maxLength={60} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: ins.bottom + S.xl }}>
            {allowAll ? <Pressable onPress={() => pick('')} style={p.row} accessibilityRole="button"><Text style={p.rowT}>🇧🇩 {all}</Text></Pressable> : null}
            {list.map((d) => (
              <Pressable key={d} onPress={() => pick(d)} style={[p.row, d === value && p.rowOn]} accessibilityRole="button" accessibilityState={{ selected: d === value }}>
                <Text style={p.rowT}>{d === value ? '✅ ' : ''}{nm(d)}</Text>
              </Pressable>
            ))}
            {list.length === 0 && !allowOther ? <Text style={p.err}>{tr(`এই নামে কোনো ${what} নেই।`, `No ${what} with this name.`)}</Text> : null}
            {allowOther ? (
              <View style={p.other}>
                {typed && !exact ? (
                  <>
                    {list.length === 0 ? <Text style={p.otherT}>{tr(`তালিকায় "${typed}" নেই।`, `"${typed}" is not in the list.`)}</Text> : null}
                    <Button title={tr(`"${typed}" লিখে রাখুন`, `Save "${typed}"`)} icon="✍️" kind="secondary" onPress={() => pick(typed)} />
                  </>
                ) : (
                  <Text style={p.otherT}>{tr('তালিকায় নাম না পেলে ওপরের "খুঁজুন" ঘরে পুরো নাম লিখুন, তারপর "লিখে রাখুন" চাপুন।', 'If the name is not in the list, type the full name in "Search" above, then tap "Save".')}</Text>
                )}
              </View>
            ) : null}
            <Button title={tr('বন্ধ করুন', 'Close')} kind="secondary" onPress={() => setOpen(false)} style={{ marginTop: S.md }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const p = StyleSheet.create({
  label: { fontSize: F.body, fontWeight: '700', color: C.text, marginBottom: S.xs },
  box: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.line, borderRadius: R.md, backgroundColor: C.card, paddingHorizontal: S.md },
  boxOff: { backgroundColor: C.bg, borderStyle: 'dashed' },
  val: { flex: 1, fontSize: F.large, color: C.text },
  arrow: { fontSize: F.large, color: C.primary },
  err: { fontSize: F.small, color: C.bad, marginTop: 4 },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, marginBottom: S.sm },
  row: { minHeight: TOUCH + 8, justifyContent: 'center', borderBottomWidth: 1, borderColor: C.line, paddingHorizontal: S.sm },
  rowOn: { backgroundColor: C.primarySoft },
  rowT: { fontSize: F.large, color: C.text },
  other: { marginTop: S.md, gap: S.sm },
  otherT: { fontSize: F.body, color: C.muted, lineHeight: F.body * 1.5 },
});
