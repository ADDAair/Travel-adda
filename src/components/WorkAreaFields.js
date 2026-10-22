import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, F, S, R } from '../theme';
import { Field } from './ui';
import DistrictPicker from './DistrictPicker';
import { upazilasOf } from '../lib/upazilas';

// A leader's WORK AREA (not the office address): district (list) > upazila (list of that district) > union (typed).
// value = { district, upazila, union }; onChange gets the whole new value. Changing the district clears the upazila.
export default function WorkAreaFields({ value, onChange, errors = {} }) {
  const v = value || {};
  const set = (k) => (x) => onChange({ ...v, [k]: x, ...(k === 'district' && x !== v.district ? { upazila: '' } : null) });
  return (
    <View style={w.box}>
      <Text style={w.h} accessibilityRole="header">📍 কাজের এলাকা</Text>
      <Text style={w.t}>অফিসের ঠিকানা নয়। আপনি যে এলাকার হাজীদের নিয়ে কাজ করেন, সেটি দিন। হাজীরা এলাকা দিয়ে আপনাকে খুঁজে পাবেন।</Text>
      <DistrictPicker label="১. জেলা" value={v.district} onChange={set('district')} error={errors.district} />
      <DistrictPicker
        label="২. উপজেলা"
        value={v.upazila}
        onChange={set('upazila')}
        error={errors.upazila}
        options={upazilasOf(v.district)}
        placeholder="উপজেলা বাছুন"
        searchHint="যেমন: কোম্পানীগঞ্জ"
        noun="উপজেলা"
        allowOther
        disabled={!v.district}
        disabledText="আগে জেলা বাছুন"
      />
      <Field
        label="৩. ইউনিয়ন"
        hint="যেমন: চরহাজারী। একাধিক হলে কমা দিয়ে লিখুন"
        value={v.union || ''}
        onChangeText={set('union')}
        maxLength={120}
        error={errors.union}
      />
    </View>
  );
}

// "চরহাজারী, কোম্পানীগঞ্জ, নোয়াখালী" (whatever is filled in), for lists and cards.
export const areaText = (x) => (x ? [x.union_name, x.upazila, x.district].map((s) => (s || '').trim()).filter(Boolean).join(', ') : '');

const w = StyleSheet.create({
  box: { backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: S.md, marginBottom: S.md },
  h: { fontSize: F.large, fontWeight: '700', color: C.primary, marginBottom: S.xs },
  t: { fontSize: F.body, color: C.text, lineHeight: F.body * 1.5, marginBottom: S.md },
});
