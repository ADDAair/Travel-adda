import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Field } from './ui';
import { toBn } from '../lib/phone';
import { parseDate, daysUntil, ymdToInput } from '../lib/dates';
import { myContracts, cachedContractLeader } from '../lib/market';
import { supabase } from '../lib/supabase';
import { contractMoney } from '../lib/payments';

const TRIP_KEY = 'ta.trip.v1';
const MONEY_KEY = 'ta.tripMoney.v1';
const docsKey = (id) => `ta.docsCache.v1.${id}`;

// Haji's trip at a glance: days to departure, active contract, documents. Works offline from what the phone kept.
export default function TripCard({ navigation }) {
  const [c, setC] = useState(null);            // active contract (cached)
  const [own, setOwn] = useState(null);        // date typed by the haji when there is no contract
  const [docs, setDocs] = useState(null);      // { count, passport }
  const [money, setMoney] = useState(null);    // { paid_in, pending_in, still_to_pay } of the active contract
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setC(await cachedContractLeader());
    try { setOwn(JSON.parse((await AsyncStorage.getItem(TRIP_KEY)) || 'null')); } catch (e) { setOwn(null); }
    try {
      const { data } = await supabase.auth.getSession();
      const id = data?.session?.user?.id;
      const rows = id ? JSON.parse((await AsyncStorage.getItem(docsKey(id))) || '[]') : [];
      const pass = rows.find((r) => r.doc_type === 'passport' && r.expires_on);
      setDocs({ count: rows.length, hasPassport: rows.some((r) => r.doc_type === 'passport'), hasVisa: rows.some((r) => r.doc_type === 'visa'), passLeft: pass ? daysUntil(pass.expires_on) : null });
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
  const saveDate = async () => {
    const ymd = parseDate(val);
    if (!ymd) { setErr('তারিখ এভাবে লিখুন: ২০-০১-২০২৭'); return; }
    await AsyncStorage.setItem(TRIP_KEY, JSON.stringify({ date: ymd })).catch(() => {});
    setOwn({ date: ymd }); setEdit(false); setErr('');
  };

  return (
    <View style={t.card} accessible={!edit} accessibilityLabel={left != null ? `আমার সফর। যাত্রার আর ${left} দিন বাকি` : 'আমার সফর'}>
      <Text style={t.h}>🧳 আমার সফর</Text>
      {left != null && left > 0 ? <Text style={t.big}>যাত্রার আর <Text style={t.num}>{toBn(left)}</Text> দিন বাকি</Text> : null}
      {left === 0 ? <Text style={t.big}>আজ যাত্রার দিন। আল্লাহ সহজ করুন 🤲</Text> : null}
      {left != null && left < 0 ? <Text style={t.big}>সফর চলছে বা শেষ হয়েছে</Text> : null}
      {c ? (
        <Pressable onPress={() => navigation.navigate('MyLeader')} style={t.row} accessibilityRole="button" accessibilityLabel={`চুক্তি চালু: ${c.title}, লিডার ${c.name}। খুলুন`}>
          <Text style={t.rowT}>✅ চুক্তি চালু: {c.title} · লিডার {c.name} ›</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => navigation.navigate('MyLeader')} style={t.row} accessibilityRole="button" accessibilityLabel="এখনো কোনো চুক্তি নেই। লিডার খুঁজুন">
          <Text style={t.rowT}>🤝 এখনো কোনো চুক্তি নেই · লিডার খুঁজুন ›</Text>
        </Pressable>
      )}
      {c && money ? (
        <Pressable onPress={() => navigation.navigate('MyLeader')} style={t.row} accessibilityRole="button">
          <Text style={t.rowT}>💳 জমা হয়েছে ৳{toBn(Number(money.paid_in).toLocaleString('en-IN'))}{Number(money.pending_in) > 0 ? ` (যাচাই চলছে ৳${toBn(Number(money.pending_in).toLocaleString('en-IN'))})` : ''} · বাকি ৳{toBn(Number(money.still_to_pay).toLocaleString('en-IN'))} ›</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => navigation.navigate('Docs')} style={t.row} accessibilityRole="button">
        <Text style={t.rowT}>{docs && docs.hasPassport ? '✅' : '⬜'} পাসপোর্ট  {docs && docs.hasVisa ? '✅' : '⬜'} ভিসা{docs && docs.passLeft != null && docs.passLeft < 183 ? `  ⚠️ পাসপোর্টের মেয়াদ ${docs.passLeft < 0 ? 'শেষ' : `আর ${toBn(docs.passLeft)} দিন`}` : ''} ›</Text>
      </Pressable>
      {!c ? (edit ? (
        <View style={{ marginTop: S.sm }}>
          <Field label="যাত্রার তারিখ" hint="দিন-মাস-বছর, যেমন: ২০-০১-২০২৭" value={val} onChangeText={setVal} maxLength={10} error={err} />
          <Button title="সংরক্ষণ করুন" onPress={saveDate} />
          <Button title="বাতিল" kind="secondary" onPress={() => { setEdit(false); setErr(''); }} style={{ marginTop: S.xs }} />
        </View>
      ) : (
        <Pressable onPress={() => { setVal(own && own.date ? ymdToInput(own.date) : ''); setEdit(true); }} style={t.row} accessibilityRole="button">
          <Text style={[t.rowT, { color: C.primary, textDecorationLine: 'underline' }]}>📅 {own && own.date ? 'যাত্রার তারিখ বদলান' : 'যাত্রার তারিখ লিখুন'}</Text>
        </Pressable>
      )) : null}
    </View>
  );
}

const t = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: S.md, marginBottom: S.md, borderWidth: 2, borderColor: C.primary, ...shadow },
  h: { fontSize: F.large, fontWeight: '700', color: C.primary },
  big: { fontSize: F.large, color: C.text, marginTop: S.xs, lineHeight: 30 },
  num: { fontSize: F.hero, fontWeight: '800', color: C.accent },
  row: { minHeight: TOUCH, justifyContent: 'center', borderTopWidth: 1, borderColor: C.line, marginTop: S.xs },
  rowT: { fontSize: F.body, color: C.text, lineHeight: 26 },
});
