// Building blocks shared by the Ihram, Umrah and Hajj guides.
import React, { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Alert, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice } from './ui';
import { toBn } from '../lib/phone';
import { tr, refText } from '../lib/lang';
import { findDua } from '../content/duas';

export type Img = { src: number | { uri: string }; ratio: number; caption: string };
export type Step = { title: string; text?: string; tip?: string; source?: string; images?: string[]; duas?: string[]; [k: string]: unknown };

// A drawing with a caption that says in words what is right (✅) or wrong (❌), so meaning never depends on colour.
export function Illustration({ img }: { img?: Img | null }) {
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
export function DuaInline({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const d = findDua(id);
  if (!d) return null;
  return (
    <View style={g.duaWrap}>
      <Pressable onPress={() => setOpen(!open)} style={g.duaBtn} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? tr('দোয়া লুকান', 'Hide dua') : tr('দোয়া দেখুন', 'Show dua')}: ${d.title}`}>
        <Text style={g.duaBtnIc} importantForAccessibility="no">🤲</Text>
        <Text style={g.duaBtnT}>{d.title}</Text>
        <Text style={g.duaBtnGo}>{open ? tr('লুকান ▲', 'Hide ▲') : tr('দেখুন ▼', 'Show ▼')}</Text>
      </Pressable>
      {open ? (
        <View style={g.duaBody}>
          {(d.parts as { label?: string; ar: string; pron: string; bn: string }[]).map((p, i) => (
            <View key={i} style={i > 0 ? { marginTop: S.md } : null}>
              {p.label ? <Text style={g.partL}>{p.label}</Text> : null}
              <Text style={g.ar} accessibilityLanguage="ar">{p.ar}</Text>
              <Text style={g.h}>{tr('উচ্চারণ', 'Pronunciation')}</Text>
              <Text style={g.p}>{p.pron}</Text>
              <Text style={g.h}>{tr('অর্থ', 'Meaning')}</Text>
              <Text style={g.p}>{p.bn}</Text>
            </View>
          ))}
          {d.note ? <Text style={g.note}>ℹ️ {d.note}</Text> : null}
          <Text style={g.src}>📚 {tr('সূত্র', 'Source')}: {refText(d.source)}</Text>
        </View>
      ) : null}
    </View>
  );
}

// One step of a guide: heading, plain text, tip, drawings, related duas and the source.
export function StepCard({ step, images, children }: { step: Step; images?: Record<string, Img>; children?: ReactNode }) {
  return (
    <View style={g.card}>
      <Text style={g.stepH} accessibilityRole="header">{step.title}</Text>
      <Text style={g.p}>{step.text}</Text>
      {step.tip ? <View style={g.tip}><Text style={g.p}>💡 {step.tip}</Text></View> : null}
      {(step.images || []).map((k) => <Illustration key={k} img={images && images[k]} />)}
      {(step.duas || []).map((id) => <DuaInline key={id} id={id} />)}
      {children}
      {step.source ? <Text style={g.src}>📚 {tr('সূত্র', 'Source')}: {refText(step.source)}</Text> : null}
    </View>
  );
}

// Big counter for tawaf / sa'i rounds. Saved on the phone, so it survives closing the app.
export function RoundCounter({ storageKey, total = 7, title, labelFor }: { storageKey: string; total?: number; title: string; labelFor?: (i: number) => string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((v) => { const x = Number(v); if (x >= 0 && x <= total) setN(x); }).catch(() => {});
  }, [storageKey, total]);
  const save = (x: number) => { setN(x); AsyncStorage.setItem(storageKey, String(x)).catch(() => {}); };
  const add = () => { if (n >= total) return; Vibration.vibrate(40); save(n + 1); };
  const sub = () => { if (n > 0) save(n - 1); };
  const reset = () => Alert.alert(tr('গণনা আবার শূন্য থেকে শুরু করবেন?', 'Start counting again from zero?'), tr('এটা নতুন তাওয়াফ বা সাঈ শুরুর সময় করুন।', "Do this when you start a new tawaf or sa'i."), [
    { text: tr('না', 'No'), style: 'cancel' },
    { text: tr('হ্যাঁ, শূন্য করুন', 'Yes, reset'), style: 'destructive', onPress: () => save(0) },
  ]);
  const done = n >= total;
  const next = !done && labelFor ? labelFor(n + 1) : null;
  return (
    <View style={g.counter}>
      <Text style={g.cTitle}>{title}</Text>
      <Text style={g.cNum} accessibilityLiveRegion="polite" accessibilityLabel={tr(`${total} চক্করের মধ্যে ${n} চক্কর শেষ`, `${n} of ${total} rounds done`)}>
        {toBn(n)} <Text style={g.cOf}>/ {toBn(total)}</Text>
      </Text>
      <View style={g.cDots} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: total }).map((_, i) => <View key={i} style={[g.cDot, i < n && g.cDotOn]} />)}
      </View>
      {next ? <Text style={g.cNext}>{tr(`এখন ${toBn(n + 1)} নম্বর চক্কর`, `Now round ${n + 1}`)}: {next}</Text> : null}
      {done ? <Notice kind="ok" title={tr(`${toBn(total)} চক্কর পূর্ণ হয়েছে`, `${total} rounds completed`)} text={tr('আলহামদুলিল্লাহ। এবার পরের ধাপে যান।', 'Alhamdulillah. Now go to the next step.')} /> : (
        <Button title={tr('এক চক্কর শেষ হলো', 'One round done')} icon="✔️" kind="gold" onPress={add} a11yHint={tr('চক্কর শেষ হলে চাপুন, গণনা এক বাড়বে', 'Tap when a round is done; the count goes up by one')} />
      )}
      <View style={g.cRow}>
        <Pressable onPress={sub} disabled={n === 0} style={[g.cSmall, n === 0 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={tr('ভুল চাপ, এক কমান', 'Wrong tap, take one off')}>
          <Text style={g.cSmallT}>{tr('− ভুল চাপ, এক কমান', '− Wrong tap, take one off')}</Text>
        </Pressable>
        <Pressable onPress={reset} disabled={n === 0} style={[g.cSmall, n === 0 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={tr('গণনা শূন্য করুন', 'Reset the count')}>
          <Text style={g.cSmallT}>{tr('↺ শূন্য করুন', '↺ Reset')}</Text>
        </Pressable>
      </View>
      <Text style={g.cHelp}>{tr('গোনায় সন্দেহ হলে কম সংখ্যাটি ধরুন এবং বাকি চক্কর পূর্ণ করুন।', 'If you are unsure of the count, take the lower number and complete the remaining rounds.')}</Text>
    </View>
  );
}

// Question-and-answer block used for "what if" lists.
export function QA({ q, a, source, icon = '❓' }: { q: string; a: string; source?: string; icon?: string }) {
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
