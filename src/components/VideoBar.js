import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { C, F, S, R, TOUCH } from '../theme';
import { videoFor } from '../content/videos';
import { useVideoTopics } from '../lib/videoLinks';

// A slim bar at the top of every page: "▶️ ভিডিও দেখুন". Until the video exists it says "শীঘ্রই আসছে" and,
// when pressed, tells which video is coming — it never pretends to play.
export default function VideoBar({ route }) {
  const topics = useVideoTopics();
  const v = videoFor(route, topics);
  const [info, setInfo] = useState(false);
  useEffect(() => { setInfo(false); }, [route]);
  const press = () => {
    if (v.ready) Linking.openURL(v.url).catch(() => setInfo(true));
    else setInfo((x) => !x);
  };
  return (
    <View style={{ backgroundColor: C.bg, paddingHorizontal: S.md, paddingTop: S.xs }}>
      <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={`${v.label}: ${v.title}`}
        style={({ pressed }) => ({ minHeight: TOUCH, alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md,
          borderRadius: R.lg, borderWidth: 2, borderColor: v.ready ? C.primary : C.line, backgroundColor: pressed ? C.primarySoft : C.card })}>
        <Text style={{ fontSize: F.body, color: v.ready ? C.primary : C.muted, fontWeight: '700' }}>{v.label}</Text>
      </Pressable>
      {info ? (
        <View style={{ marginTop: S.xs, padding: S.sm, borderRadius: R.md, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primary }} accessibilityRole="alert">
          <Text style={{ fontSize: F.body, color: C.text }}>🎬 "{v.title}" নিয়ে কার্টুন ভিডিও তৈরি হচ্ছে, শীঘ্রই আসছে। ততক্ষণ পাতার লেখা ও ধাপগুলো দেখুন।</Text>
        </View>
      ) : null}
    </View>
  );
}
