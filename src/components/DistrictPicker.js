import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R, TOUCH } from '../theme';
import { Button, Field } from './ui';
import { DISTRICTS } from '../lib/market';

// A big, searchable list of Bangladesh's 64 districts. allowAll adds "সব জেলা" (for filters).
export default function DistrictPicker({ label = 'জেলা', value, onChange, allowAll = false, error }) {
  const ins = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = DISTRICTS.filter((d) => !q.trim() || d.includes(q.trim()));
  const pick = (d) => { onChange(d); setOpen(false); setQ(''); };
  return (
    <View style={{ marginBottom: S.md }}>
      <Text style={p.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={[p.box, error ? { borderColor: C.bad, borderWidth: 2 } : null]} accessibilityRole="button" accessibilityLabel={`${label}: ${value || (allowAll ? 'সব জেলা' : 'বাছাই করা হয়নি')}। বদলাতে চাপুন`}>
        <Text style={[p.val, !value && { color: C.muted }]}>{value || (allowAll ? 'সব জেলা' : 'জেলা বাছুন')}</Text>
        <Text style={p.arrow}>▾</Text>
      </Pressable>
      {error ? <Text style={p.err}>⚠️ {error}</Text> : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: ins.top + S.md, paddingHorizontal: S.md }}>
          <Text style={p.title}>{label} বাছুন</Text>
          <Field label="খুঁজুন" hint="যেমন: সিলেট" value={q} onChangeText={setQ} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: ins.bottom + S.xl }}>
            {allowAll ? <Pressable onPress={() => pick('')} style={p.row} accessibilityRole="button"><Text style={p.rowT}>🇧🇩 সব জেলা</Text></Pressable> : null}
            {list.map((d) => (
              <Pressable key={d} onPress={() => pick(d)} style={[p.row, d === value && p.rowOn]} accessibilityRole="button" accessibilityState={{ selected: d === value }}>
                <Text style={p.rowT}>{d === value ? '✅ ' : ''}{d}</Text>
              </Pressable>
            ))}
            {list.length === 0 ? <Text style={p.err}>এই নামে কোনো জেলা নেই।</Text> : null}
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
  val: { flex: 1, fontSize: F.large, color: C.text },
  arrow: { fontSize: F.large, color: C.primary },
  err: { fontSize: F.small, color: C.bad, marginTop: 4 },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, marginBottom: S.sm },
  row: { minHeight: TOUCH + 8, justifyContent: 'center', borderBottomWidth: 1, borderColor: C.line, paddingHorizontal: S.sm },
  rowOn: { backgroundColor: C.primarySoft },
  rowT: { fontSize: F.large, color: C.text },
});
