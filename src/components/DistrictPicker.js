import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R, TOUCH } from '../theme';
import { Button, Field } from './ui';
import { DISTRICTS } from '../lib/market';

// A big, searchable list. By default Bangladesh's 64 districts; allowAll adds "সব জেলা" (for filters).
// options: another list (e.g. the upazilas of one district). allowOther: if a name is missing, the person can type it.
// disabled + disabledText: shown greyed with a reason (e.g. "আগে জেলা বাছুন").
export default function DistrictPicker({
  label = 'জেলা', value, onChange, allowAll = false, error,
  options = DISTRICTS, placeholder = 'জেলা বাছুন', searchHint = 'যেমন: সিলেট', noun = 'জেলা',
  allowOther = false, disabled = false, disabledText,
}) {
  const ins = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const typed = q.trim();
  const list = options.filter((d) => !typed || d.includes(typed));
  const exact = options.includes(typed);
  const pick = (d) => { onChange(d); setOpen(false); setQ(''); };
  const shown = value || (allowAll ? 'সব জেলা' : disabled && disabledText ? disabledText : placeholder);
  return (
    <View style={{ marginBottom: S.md }}>
      <Text style={p.label}>{label}</Text>
      <Pressable
        onPress={() => { if (!disabled) setOpen(true); }}
        style={[p.box, disabled && p.boxOff, error ? { borderColor: C.bad, borderWidth: 2 } : null]}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={`${label}: ${value || (allowAll ? 'সব জেলা' : 'বাছাই করা হয়নি')}। ${disabled ? (disabledText || '') : 'বদলাতে চাপুন'}`}
      >
        <Text style={[p.val, (!value || disabled) && { color: C.muted }]}>{shown}</Text>
        {disabled ? null : <Text style={p.arrow}>▾</Text>}
      </Pressable>
      {error ? <Text style={p.err}>⚠️ {error}</Text> : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: ins.top + S.md, paddingHorizontal: S.md }}>
          <Text style={p.title}>{label} বাছুন</Text>
          <Field label="খুঁজুন" hint={searchHint} value={q} onChangeText={setQ} maxLength={60} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: ins.bottom + S.xl }}>
            {allowAll ? <Pressable onPress={() => pick('')} style={p.row} accessibilityRole="button"><Text style={p.rowT}>🇧🇩 সব জেলা</Text></Pressable> : null}
            {list.map((d) => (
              <Pressable key={d} onPress={() => pick(d)} style={[p.row, d === value && p.rowOn]} accessibilityRole="button" accessibilityState={{ selected: d === value }}>
                <Text style={p.rowT}>{d === value ? '✅ ' : ''}{d}</Text>
              </Pressable>
            ))}
            {list.length === 0 && !allowOther ? <Text style={p.err}>এই নামে কোনো {noun} নেই।</Text> : null}
            {allowOther ? (
              <View style={p.other}>
                {typed && !exact ? (
                  <>
                    {list.length === 0 ? <Text style={p.otherT}>তালিকায় "{typed}" নেই।</Text> : null}
                    <Button title={`"${typed}" লিখে রাখুন`} icon="✍️" kind="secondary" onPress={() => pick(typed)} />
                  </>
                ) : (
                  <Text style={p.otherT}>তালিকায় নাম না পেলে ওপরের "খুঁজুন" ঘরে পুরো নাম লিখুন, তারপর "লিখে রাখুন" চাপুন।</Text>
                )}
              </View>
            ) : null}
            <Button title="বন্ধ করুন" kind="secondary" onPress={() => setOpen(false)} style={{ marginTop: S.md }} />
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
