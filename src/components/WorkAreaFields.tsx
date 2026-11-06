import React, { type JSX } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tr } from '../lib/lang';
import { C, F, S, R } from '../theme';
import { Field } from './ui';
import DistrictPicker from './DistrictPicker';
import { upazilasOf } from '../lib/upazilas';
import { districtName } from '../lib/market';

// A leader's WORK AREA (not the office address): district (list) > upazila (list of that district) > union (typed).
// value = { district, upazila, union }; onChange gets the whole new value. Changing the district clears the upazila.
export type Area = { district?: string; upazila?: string; union?: string };
export default function WorkAreaFields({ value, onChange, errors = {} }: { value: Area | null | undefined; onChange: (a: Area) => void; errors?: Record<string, string | undefined> }): JSX.Element {
  const v: Area = value || {};
  const set = (k: keyof Area) => (x: string) => onChange({ ...v, [k]: x, ...(k === 'district' && x !== v.district ? { upazila: '' } : null) });
  return (
    <View style={w.box}>
      <Text style={w.h} accessibilityRole="header">{tr('📍 কাজের এলাকা', '📍 Work area')}</Text>
      <Text style={w.t}>{tr('অফিসের ঠিকানা নয়। আপনি যে এলাকার হাজীদের নিয়ে কাজ করেন, সেটি দিন। হাজীরা এলাকা দিয়ে আপনাকে খুঁজে পাবেন।', 'Not the office address. Give the area whose hajis you work with. Hajis will find you by the area.')}</Text>
      <DistrictPicker label={tr('১. জেলা', '1. District')} value={v.district} onChange={set('district')} error={errors.district} />
      <DistrictPicker
        label={tr('২. উপজেলা', '2. Upazila')}
        value={v.upazila}
        onChange={set('upazila')}
        error={errors.upazila}
        options={upazilasOf(v.district || '')}
        placeholder={tr('উপজেলা বাছুন', 'Choose an upazila')}
        searchHint={tr('যেমন: কোম্পানীগঞ্জ', 'e.g. Companiganj')}
        noun={tr('উপজেলা', 'upazila')}
        allowOther
        disabled={!v.district}
        disabledText={tr('আগে জেলা বাছুন', 'Choose the district first')}
      />
      <Field
        label={tr('৩. ইউনিয়ন', '3. Union')}
        hint={tr('যেমন: চরহাজারী। একাধিক হলে কমা দিয়ে লিখুন', 'e.g. Char Hazari. If more than one, separate with commas')}
        value={v.union || ''}
        onChangeText={set('union')}
        maxLength={120}
        error={errors.union}
      />
    </View>
  );
}

// "চরহাজারী, কোম্পানীগঞ্জ, নোয়াখালী" (whatever is filled in), for lists and cards.
export const areaText = (x: { union_name?: string | null; upazila?: string | null; district?: string | null } | null | undefined): string => (x ? [x.union_name, x.upazila, districtName(x.district)].map((s) => (s || '').trim()).filter(Boolean).join(', ') : '');

const w = StyleSheet.create({
  box: { backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: S.md, marginBottom: S.md },
  h: { fontSize: F.large, fontWeight: '700', color: C.primary, marginBottom: S.xs },
  t: { fontSize: F.body, color: C.text, lineHeight: F.body * 1.5, marginBottom: S.md },
});
