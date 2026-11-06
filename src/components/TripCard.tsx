import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { tr } from '../lib/lang';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Field } from './ui';
import { toBn } from '../lib/phone';
import { parseDate, daysUntil, ymdToInput } from '../lib/dates';
import { myContracts, cachedContractLeader } from '../lib/market';
import { supabase } from '../lib/supabase';
import { contractMoney, type ContractMoney } from '../lib/payments';
import type { Res } from '../lib/types';
import type { Nav } from '../screens/navTypes';

const TRIP_KEY = 'ta.trip.v1';
const MONEY_KEY = 'ta.tripMoney.v1';
const docsKey = (id: string) => `ta.docsCache.v1.${id}`;

// The haji's trip facts, from what the phone kept (works offline) and refreshed from the server on every visit.
export function useTrip(navigation: Nav) {
  const [c, setC] = useState<Res<typeof cachedContractLeader>>(null);            // active contract (cached)
  const [own, setOwn] = useState<{ date: string } | null>(null);        // date typed by the haji when there is no contract
  const [docs, setDocs] = useState<{ count: number; hasPassport: boolean; hasVisa: boolean; passLeft: number | null } | null>(null);      // { count, passport }
  const [money, setMoney] = useState<ContractMoney | null>(null);    // { paid_in, pending_in, still_to_pay } of the active contract
  const load = useCallback(async () => {
    setC(await cachedContractLeader());
    try { setOwn(JSON.parse((await AsyncStorage.getItem(TRIP_KEY)) || 'null')); } catch (e) { setOwn(null); }
    try {
      const { data } = await supabase.auth.getSession();
      const id = data?.session?.user?.id;
      const rows: { doc_type: string; expires_on?: string | null }[] = id ? JSON.parse((await AsyncStorage.getItem(docsKey(id))) || '[]') : [];
      const pass = rows.find((r) => r.doc_type === 'passport' && r.expires_on);
      setDocs({ count: rows.length, hasPassport: rows.some((r) => r.doc_type === 'passport'), hasVisa: rows.some((r) => r.doc_type === 'visa'), passLeft: pass && pass.expires_on ? daysUntil(pass.expires_on) : null });
    } catch (e) { setDocs(null); }
    try { setMoney(JSON.parse((await AsyncStorage.getItem(MONEY_KEY)) || 'null')); } catch (e) { setMoney(null); }
    myContracts().then(cachedContractLeader).then(async (x) => {
      setC(x);
      if (!x || !x.id) { setMoney(null); AsyncStorage.removeItem(MONEY_KEY).catch(() => {}); return; }
      const m = await contractMoney(x.id).catch(() => null);
      if (m) { setMoney(m); AsyncStorage.setItem(MONEY_KEY, JSON.stringify(m)).catch(() => {}); }
    }).catch(() => {});
  }, []);
  useEffect(() => { load(); return navigation?.addListener?.('focus', load); }, [load, navigation]);

  const date = (c && c.travel_from) || (own && own.date) || null;
  const left = date ? daysUntil(date) : null;
  return { c, own, setOwn, docs, money, left };
}

// Haji's trip in full: days to departure, active contract, money, documents, own date. Shown on the "আমার সফর" page.
export default function TripCard({ navigation }: { navigation: Nav }) {
  const { c, own, setOwn, docs, money, left } = useTrip(navigation);
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');

  const saveDate = async () => {
    const ymd = parseDate(val);
    if (!ymd) { setErr(tr('তারিখ এভাবে লিখুন: ২০-০১-২০২৭', 'Write the date like this: 20-01-2027')); return; }
    await AsyncStorage.setItem(TRIP_KEY, JSON.stringify({ date: ymd })).catch(() => {});
    setOwn({ date: ymd }); setEdit(false); setErr('');
  };

  return (
    <View style={t.card} accessible={!edit} accessibilityLabel={left != null ? tr(`আমার সফর। যাত্রার আর ${left} দিন বাকি`, `My trip. ${left} days left until the journey`) : tr('আমার সফর', 'My trip')}>
      <Text style={t.h}>{tr('🧳 আমার সফর', '🧳 My trip')}</Text>
      {left != null && left > 0 ? <Text style={t.big}>{tr('যাত্রার আর ', '')}<Text style={t.num}>{toBn(left)}</Text>{tr(' দিন বাকি', ' days left until the journey')}</Text> : null}
      {left === 0 ? <Text style={t.big}>{tr('আজ যাত্রার দিন। আল্লাহ সহজ করুন 🤲', 'Today is the travel day. May Allah make it easy 🤲')}</Text> : null}
      {left != null && left < 0 ? <Text style={t.big}>{tr('সফর চলছে বা শেষ হয়েছে', 'The trip is on or has ended')}</Text> : null}
      {c ? (
        <Pressable onPress={() => navigation.navigate('MyLeader')} style={t.row} accessibilityRole="button" accessibilityLabel={tr(`চুক্তি চালু: ${c.title}, লিডার ${c.name}। খুলুন`, `Contract active: ${c.title}, leader ${c.name}. Open`)}>
          <Text style={t.rowT}>✅ {tr('চুক্তি চালু', 'Contract active')}: {c.title} · {tr('লিডার', 'leader')} {c.name} ›</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => navigation.navigate('MyLeader')} style={t.row} accessibilityRole="button" accessibilityLabel={tr('এখনো কোনো চুক্তি নেই। লিডার খুঁজুন', 'No contract yet. Find a leader')}>
          <Text style={t.rowT}>{tr('🤝 এখনো কোনো চুক্তি নেই · লিডার খুঁজুন ›', '🤝 No contract yet · find a leader ›')}</Text>
        </Pressable>
      )}
      {c && money ? (
        <Pressable onPress={() => navigation.navigate('MyLeader')} style={t.row} accessibilityRole="button">
          <Text style={t.rowT}>💳 {tr('জমা হয়েছে', 'Paid')} ৳{toBn(Number(money.paid_in).toLocaleString('en-IN'))}{Number(money.pending_in) > 0 ? ` (${tr('যাচাই চলছে', 'being checked')} ৳${toBn(Number(money.pending_in).toLocaleString('en-IN'))})` : ''} · {tr('বাকি', 'still to pay')} ৳{toBn(Number(money.still_to_pay).toLocaleString('en-IN'))} ›</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => navigation.navigate('Docs')} style={t.row} accessibilityRole="button">
        <Text style={t.rowT}>{docs && docs.hasPassport ? '✅' : '⬜'} {tr('পাসপোর্ট', 'Passport')}  {docs && docs.hasVisa ? '✅' : '⬜'} {tr('ভিসা', 'Visa')}{docs && docs.passLeft != null && docs.passLeft < 183 ? `  ⚠️ ${docs.passLeft < 0 ? tr('পাসপোর্টের মেয়াদ শেষ', 'passport expired') : tr(`পাসপোর্টের মেয়াদ আর ${toBn(docs.passLeft)} দিন`, `passport valid ${docs.passLeft} more days`)}` : ''} ›</Text>
      </Pressable>
      {!c ? (edit ? (
        <View style={{ marginTop: S.sm }}>
          <Field label={tr('যাত্রার তারিখ', 'Travel date')} hint={tr('দিন-মাস-বছর, যেমন: ২০-০১-২০২৭', 'day-month-year, e.g. 20-01-2027')} value={val} onChangeText={setVal} maxLength={10} error={err} />
          <Button title={tr('সংরক্ষণ করুন', 'Save')} onPress={saveDate} />
          <Button title={tr('বাতিল', 'Cancel')} kind="secondary" onPress={() => { setEdit(false); setErr(''); }} style={{ marginTop: S.xs }} />
        </View>
      ) : (
        <Pressable onPress={() => { setVal(own && own.date ? ymdToInput(own.date) : ''); setEdit(true); }} style={t.row} accessibilityRole="button">
          <Text style={[t.rowT, { color: C.primary, textDecorationLine: 'underline' }]}>📅 {own && own.date ? tr('যাত্রার তারিখ বদলান', 'Change the travel date') : tr('যাত্রার তারিখ লিখুন', 'Write the travel date')}</Text>
        </Pressable>
      )) : null}
    </View>
  );
}

const t = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: S.md, marginBottom: S.md, borderWidth: 2, borderColor: C.primary, ...shadow },
  h: { fontSize: F.large, fontWeight: '700', color: C.primary },
  big: { fontSize: F.large, color: C.text, marginTop: S.xs, lineHeight: 30 },
  num: { fontSize: F.hero, fontWeight: '800', color: C.primary },
  row: { minHeight: TOUCH, justifyContent: 'center', borderTopWidth: 1, borderColor: C.line, marginTop: S.xs },
  rowT: { fontSize: F.body, color: C.text, lineHeight: 26 },
});
