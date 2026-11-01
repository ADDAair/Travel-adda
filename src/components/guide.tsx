// Building blocks shared by the Ihram, Umrah and Hajj guides.
import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Alert, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice } from './ui';
import { toBn } from '../lib/phone';
import { findDua } from '../content/duas';

// A drawing with a caption that says in words what is right (✅) or wrong (❌), so meaning never depends on colour.
export function Illustration({ img }) {
  const [w, setW] = useState(0);
  if (!img) return null;
  // Height is computed from the measured width, so the picture never leaves an empty gap on any phone.
  return (
    <View style={g.ill} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width) - 2 * S.sm)}>
      {w > 0 ? <Image source={img.src} style={{ width: w, height: Math.round(w / img.ratio) }} resizeMode="contain" accessibilityLabel={img.caption} /> : null}
      <Text style={g.illCap}>{img.caption}</Text>
    </View>
  );
}

// A dua that opens in place when tapped, so the reader never loses their step.
export function DuaInline({ id }) {
  const [open, setOpen] = useState(false);
  const d = findDua(id);
  if (!d) return null;
  return (
    <View style={g.duaWrap}>
      <Pressable onPress={() => setOpen(!open)} style={g.duaBtn} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? 'দোয়া লুকান' : 'দোয়া দেখুন'}: ${d.title}`}>
        <Text style={g.duaBtnIc} importantForAccessibility="no">🤲</Text>
        <Text style={g.duaBtnT}>{d.title}</Text>
        <Text style={g.duaBtnGo}>{open ? 'লুকান ▲' : 'দেখুন ▼'}</Text>
      </Pressable>
      {open ? (
        <View style={g.duaBody}>
          {d.parts.map((p, i) => (
            <View key={i} style={i > 0 ? { marginTop: S.md } : null}>
              {p.label ? <Text style={g.partL}>{p.label}</Text> : null}
              <Text style={g.ar} accessibilityLanguage="ar">{p.ar}</Text>
              <Text style={g.h}>উচ্চারণ</Text>
              <Text style={g.p}>{p.pron}</Text>
              <Text style={g.h}>অর্থ</Text>
              <Text style={g.p}>{p.bn}</Text>
            </View>
          ))}
          {d.note ? <Text style={g.note}>ℹ️ {d.note}</Text> : null}
          <Text style={g.src}>📚 সূত্র: {d.source}</Text>
        </View>
      ) : null}
    </View>
  );
}

// One step of a guide: heading, plain text, tip, drawings, related duas and the source.
export function StepCard({ step, images, children }) {
  return (
    <View style={g.card}>
      <Text style={g.stepH} accessibilityRole="header">{step.title}</Text>
      <Text style={g.p}>{step.text}</Text>
      {step.tip ? <View style={g.tip}><Text style={g.p}>💡 {step.tip}</Text></View> : null}
      {(step.images || []).map((k) => <Illustration key={k} img={images && images[k]} />)}
      {(step.duas || []).map((id) => <DuaInline key={id} id={id} />)}
      {children}
      {step.source ? <Text style={g.src}>📚 সূত্র: {step.source}</Text> : null}
    </View>
  );
}

// Big counter for tawaf / sa'i rounds. Saved on the phone, so it survives closing the app.
export function RoundCounter({ storageKey, total = 7, title, labelFor }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((v) => { const x = Number(v); if (x >= 0 && x <= total) setN(x); }).catch(() => {});
  }, [storageKey, total]);
  const save = (x) => { setN(x); AsyncStorage.setItem(storageKey, String(x)).catch(() => {}); };
  const add = () => { if (n >= total) return; Vibration.vibrate(40); save(n + 1); };
  const sub = () => { if (n > 0) save(n - 1); };
  const reset = () => Alert.alert('গণনা আবার শূন্য থেকে শুরু করবেন?', 'এটা নতুন তাওয়াফ বা সাঈ শুরুর সময় করুন।', [
    { text: 'না', style: 'cancel' },
    { text: 'হ্যাঁ, শূন্য করুন', style: 'destructive', onPress: () => save(0) },
  ]);
  const done = n >= total;
  const next = !done && labelFor ? labelFor(n + 1) : null;
  return (
    <View style={g.counter}>
      <Text style={g.cTitle}>{title}</Text>
      <Text style={g.cNum} accessibilityLiveRegion="polite" accessibilityLabel={`${total} চক্করের মধ্যে ${n} চক্কর শেষ`}>
        {toBn(n)} <Text style={g.cOf}>/ {toBn(total)}</Text>
      </Text>
      <View style={g.cDots} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: total }).map((_, i) => <View key={i} style={[g.cDot, i < n && g.cDotOn]} />)}
      </View>
      {next ? <Text style={g.cNext}>এখন {toBn(n + 1)} নম্বর চক্কর: {next}</Text> : null}
      {done ? <Notice kind="ok" title={`${toBn(total)} চক্কর পূর্ণ হয়েছে`} text="আলহামদুলিল্লাহ। এবার পরের ধাপে যান।" /> : (
        <Button title="এক চক্কর শেষ হলো" icon="✔️" kind="gold" onPress={add} a11yHint="চক্কর শেষ হলে চাপুন, গণনা এক বাড়বে" />
      )}
      <View style={g.cRow}>
        <Pressable onPress={sub} disabled={n === 0} style={[g.cSmall, n === 0 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="ভুল চাপ, এক কমান">
          <Text style={g.cSmallT}>− ভুল চাপ, এক কমান</Text>
        </Pressable>
        <Pressable onPress={reset} disabled={n === 0} style={[g.cSmall, n === 0 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="গণনা শূন্য করুন">
          <Text style={g.cSmallT}>↺ শূন্য করুন</Text>
        </Pressable>
      </View>
      <Text style={g.cHelp}>গোনায় সন্দেহ হলে কম সংখ্যাটি ধরুন এবং বাকি চক্কর পূর্ণ করুন।</Text>
    </View>
  );
}

// Question-and-answer block used for "what if" lists.
export function QA({ q, a, source, icon = '❓' }) {
  return (
    <View style={g.qa}>
      <Text style={g.qaQ}>{icon} {q}</Text>
      <Text style={[g.p, { marginTop: 4 }]}>{a}</Text>
      {source ? <Text style={g.src}>📚 {source}</Text> : null}
    </View>
  );
}

export const g = StyleSheet.create({
  p: { fontSize: F.body, color: C.text, lineHeight: 28 },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, ...shadow },
  stepH: { fontSize: F.title, fontWeight: '700', color: C.primary, marginBottom: S.sm, lineHeight: 34 },
  tip: { backgroundColor: C.goldSoft, borderRadius: R.md, borderWidth: 1.5, borderColor: C.gold, padding: S.md, marginTop: S.md },
  src: { fontSize: F.small, color: C.muted, lineHeight: 24, marginTop: S.sm },
  note: { fontSize: F.small, color: C.text, lineHeight: 24, marginTop: S.md },
  ill: { marginTop: S.md, backgroundColor: C.bg, borderRadius: R.md, padding: S.sm },
  illCap: { fontSize: F.small, color: C.text, lineHeight: 24, marginTop: S.xs, fontWeight: '600' },
  duaWrap: { marginTop: S.md, borderRadius: R.md, borderWidth: 1.5, borderColor: C.gold, backgroundColor: C.goldSoft, overflow: 'hidden' },
  duaBtn: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 56, paddingHorizontal: S.md, paddingVertical: S.sm },
  duaBtnIc: { fontSize: 22 },
  duaBtnT: { flex: 1, fontSize: F.body, fontWeight: '700', color: C.text, lineHeight: 26 },
  duaBtnGo: { fontSize: F.small, fontWeight: '700', color: C.primary },
  duaBody: { backgroundColor: C.card, padding: S.md },
  partL: { alignSelf: 'flex-start', fontSize: F.small, fontWeight: '700', color: C.onPrimary, backgroundColor: C.primary, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 4, marginBottom: S.sm, overflow: 'hidden' },
  ar: { fontSize: 26, lineHeight: 50, color: C.text, textAlign: 'right', writingDirection: 'rtl', marginBottom: S.xs },
  h: { fontSize: F.small, fontWeight: '700', color: C.primary, marginTop: S.xs },
  counter: { backgroundColor: C.primarySoft, borderRadius: R.lg, borderWidth: 2, borderColor: C.primary, padding: S.md, marginTop: S.md },
  cTitle: { fontSize: F.large, fontWeight: '700', color: C.primary, textAlign: 'center' },
  cNum: { fontSize: 56, fontWeight: '700', color: C.text, textAlign: 'center', lineHeight: 72 },
  cOf: { fontSize: 28, color: C.muted },
  cDots: { flexDirection: 'row', gap: 6, marginBottom: S.sm },
  cDot: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.line },
  cDotOn: { backgroundColor: C.accent },
  cNext: { fontSize: F.body, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: S.sm, lineHeight: 28 },
  cRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: S.sm, gap: S.xs },
  cSmall: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.sm },
  cSmallT: { fontSize: F.small, color: C.primary, fontWeight: '700', textDecorationLine: 'underline' },
  cHelp: { fontSize: F.small, color: C.muted, lineHeight: 22, marginTop: S.xs, textAlign: 'center' },
  qa: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.md, marginBottom: S.sm },
  qaQ: { fontSize: F.body, fontWeight: '700', color: C.text, lineHeight: 28 },
});
