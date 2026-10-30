// The help fund on the Offers page: one slim row (the packages stay the main thing). Opens the fund page.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { C, S, R, F } from '../theme';
import { fundSummary, type FundSummary } from '../lib/fund';
import { toBn } from '../lib/phone';

const taka = (n: number): string => `${toBn(Math.round(n).toLocaleString('en-IN'))} টাকা`;

export default function FundCard({ onOpen }: { onOpen: () => void }) {
  const [s, setS] = useState<FundSummary | null | undefined>(undefined);
  useEffect(() => { fundSummary().then(setS).catch(() => setS(null)); }, []);
  const sub = s ? `মোট জমা ${taka(s.collected)} · দান বা আবেদন` : s === null ? 'শীঘ্রই আসছে' : 'দান বা আবেদন করুন';
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`হজ-ওমরাহ সহায়তা তহবিল। ${sub}। খুলতে চাপুন`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: S.xs, paddingHorizontal: S.sm,
        marginBottom: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.gold, borderLeftWidth: 6, backgroundColor: C.goldSoft }, pressed && { opacity: 0.85 }]}>
      <Text style={{ fontSize: 26, marginRight: S.sm }} importantForAccessibility="no">🤲</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: F.body, fontWeight: '700', color: C.text }}>হজ-ওমরাহ সহায়তা তহবিল</Text>
        <Text style={{ fontSize: F.small, color: C.muted }} numberOfLines={2}>{sub}</Text>
      </View>
      <Text style={{ fontSize: F.large, color: C.primary, marginLeft: S.xs }} importantForAccessibility="no">›</Text>
    </Pressable>
  );
}
