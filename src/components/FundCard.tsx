// The help fund's card at the top of the Offers page: total collected and how many have travelled; opens the fund page.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { C, S, R, F, TOUCH } from '../theme';
import { fundSummary, type FundSummary } from '../lib/fund';
import { toBn } from '../lib/phone';

const taka = (n: number): string => `${toBn(Math.round(n).toLocaleString('en-IN'))} টাকা`;

export default function FundCard({ onOpen }: { onOpen: () => void }) {
  const [s, setS] = useState<FundSummary | null | undefined>(undefined);
  useEffect(() => { fundSummary().then(setS).catch(() => setS(null)); }, []);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button"
      accessibilityLabel={`হজ-ওমরাহ সহায়তা তহবিল।${s ? ` মোট জমা ${taka(s.collected)}।` : ''} খুলতে চাপুন`}
      style={({ pressed }) => [{ backgroundColor: C.goldSoft, borderColor: C.gold, borderWidth: 2, borderRadius: R.lg, padding: S.md, marginBottom: S.md,
        minHeight: TOUCH }, pressed && { opacity: 0.9 }]}>
      <Text style={{ fontSize: F.large, fontWeight: '700', color: C.text }}>🤲 হজ-ওমরাহ সহায়তা তহবিল</Text>
      <Text style={{ fontSize: F.body, color: C.text, marginTop: S.xs }}>সামর্থ্য নেই এমন মানুষকে আল্লাহর ঘরে পৌঁছাতে সাহায্য করুন, অথবা নিজে সাহায্যের আবেদন করুন।</Text>
      {s ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: S.sm, gap: S.sm }}>
          <Text style={{ fontSize: F.body, fontWeight: '700', color: C.primary }}>💰 মোট জমা: {taka(s.collected)}</Text>
          <Text style={{ fontSize: F.body, color: C.text }}>🕋 সফর সম্পন্ন: {toBn(s.travelled)} জন</Text>
        </View>
      ) : s === null ? <Text style={{ fontSize: F.body, color: C.muted, marginTop: S.sm }}>শীঘ্রই আসছে</Text> : null}
      <Text style={{ fontSize: F.body, fontWeight: '700', color: C.primary, marginTop: S.sm }}>দান করুন বা আবেদন করুন ›</Text>
    </Pressable>
  );
}
