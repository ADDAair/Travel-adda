import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Vibration, Platform } from 'react-native';
import { tr, lbl } from '../lib/lang';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, S, R, TOUCH } from '../theme';
import { Notice } from '../components/ui';
import { toBn } from '../lib/phone';
import type { Nav } from './navTypes';

const KEY = 'ta.tasbih.v1';
// "after" = after-prayer tasbih: 33 + 33 + 34, moves to the next phrase by itself.
// A preset is either one phrase (with a target count) or a sequence of phrases (steps).
// Each Bengali text has its English next to it (en, pronEn, meanEn, sourceEn).
type Preset = { id: string; label: string; en?: string; ar?: string; pron?: string; pronEn?: string; bn?: string; meanEn?: string; target?: number; steps?: string[]; source?: string; sourceEn?: string };
type Count = { n: number; step: number };
const PRESETS: Preset[] = [
  { id: 'after', label: 'নামাজের পরের তাসবিহ', steps: ['subhan', 'hamd', 'akbar'], source: 'মুসলিম ৫৯৬', en: 'Tasbih after prayer', sourceEn: 'Muslim 596' },
  { id: 'subhan', label: 'সুবহানাল্লাহ', ar: 'سُبْحَانَ اللَّهِ', pron: 'সুবহানাল্লাহ', bn: 'আল্লাহ পবিত্র', target: 33, en: 'SubhanAllah', pronEn: 'SubhanAllah', meanEn: 'Glory be to Allah' },
  { id: 'hamd', label: 'আলহামদুলিল্লাহ', ar: 'الْحَمْدُ لِلَّهِ', pron: 'আলহামদুলিল্লাহ', bn: 'সব প্রশংসা আল্লাহর', target: 33, en: 'Alhamdulillah', pronEn: 'Alhamdulillah', meanEn: 'All praise is for Allah' },
  { id: 'akbar', label: 'আল্লাহু আকবার', ar: 'اللَّهُ أَكْبَرُ', pron: 'আল্লাহু আকবার', bn: 'আল্লাহ সবচেয়ে বড়', target: 34, en: 'Allahu Akbar', pronEn: 'Allahu Akbar', meanEn: 'Allah is the Greatest' },
  { id: 'tahlil', label: 'লা ইলাহা ইল্লাল্লাহ', ar: 'لَا إِلَٰهَ إِلَّا اللَّهُ', pron: 'লা ইলাহা ইল্লাল্লাহ', bn: 'আল্লাহ ছাড়া কোনো উপাস্য নেই', target: 100, en: 'La ilaha illallah', pronEn: 'La ilaha illallah', meanEn: 'There is no god but Allah' },
  { id: 'istighfar', label: 'আস্তাগফিরুল্লাহ', ar: 'أَسْتَغْفِرُ اللَّهَ', pron: 'আস্তাগফিরুল্লাহ', bn: 'আমি আল্লাহর কাছে ক্ষমা চাই', target: 100, source: 'মুসলিম ২৭০২', en: 'Astaghfirullah', pronEn: 'Astaghfirullah', meanEn: 'I ask Allah for forgiveness', sourceEn: 'Muslim 2702' },
  { id: 'bihamdihi', label: 'সুবহানাল্লাহি ওয়া বিহামদিহী', ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', pron: 'সুবহানাল্লাহি ওয়া বিহামদিহী', bn: 'আল্লাহ পবিত্র, সব প্রশংসা তাঁর', target: 100, source: 'বুখারি ৬৪০৫', en: 'SubhanAllahi wa bihamdihi', pronEn: 'SubhanAllahi wa bihamdihi', meanEn: 'Glory be to Allah, and all praise is His' },
  { id: 'durood', label: 'দরুদ', ar: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ', pron: 'আল্লাহুম্মা সাল্লি আলা মুহাম্মাদ', bn: 'হে আল্লাহ, মুহাম্মাদ (সা.)-এর ওপর রহমত বর্ষণ করুন', target: 100, en: 'Durud', pronEn: 'Allahumma salli \'ala Muhammad', meanEn: 'O Allah, send blessings upon Muhammad (peace be upon him)' },
  { id: 'free', label: 'নিজের মতো গোনা', ar: '', pron: 'যেকোনো জিকির', bn: 'যত খুশি গুনুন', target: 0, en: 'Count freely', pronEn: 'Any dhikr', meanEn: 'Count as many as you like' },
];
const P = (id: string): Preset => PRESETS.find((p) => p.id === id) || PRESETS[0];   // a preset or a single phrase

export default function TasbihScreen({ navigation }: { navigation: Nav }) {
  const [sel, setSel] = useState('after');
  const [state, setState] = useState<Record<string, Count>>({});          // { presetId: { n, step } }
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { try { const o = JSON.parse(v || '{}'); if (o && typeof o === 'object') { setState(o.counts || {}); if (o.sel && P(o.sel)) setSel(o.sel); } } catch (e) { /* start fresh */ } }).catch(() => {});
  }, []);
  const save = (counts: Record<string, Count>, s: string = sel) => { setState(counts); AsyncStorage.setItem(KEY, JSON.stringify({ counts, sel: s })).catch(() => {}); };

  const preset = P(sel);
  const cur = state[sel] || { n: 0, step: 0 };
  const phrase = preset.steps ? P(preset.steps[cur.step] || preset.steps[preset.steps.length - 1]) : preset;
  const target = phrase.target || 0;
  const allDone = preset.steps ? cur.step >= preset.steps.length : target > 0 && cur.n >= target;

  const tap = () => {
    if (allDone) return;
    let n = cur.n + 1; let step = cur.step || 0;
    if (target && n >= target) {
      Vibration.vibrate(Platform.OS === 'android' ? [0, 120, 80, 120] : 300);
      if (preset.steps) { step += 1; n = 0; }
    } else if (Platform.OS === 'android') Vibration.vibrate(15);
    save({ ...state, [sel]: { n, step } });
  };
  const undo = () => {
    if (cur.n > 0) save({ ...state, [sel]: { ...cur, n: cur.n - 1 } });
  };
  const reset = () => {
    const doIt = () => save({ ...state, [sel]: { n: 0, step: 0 } });
    if (Platform.OS === 'web') { doIt(); return; }
    Alert.alert(tr('গণনা শূন্য করবেন?', 'Reset the count to zero?'), '', [{ text: tr('না', 'No'), style: 'cancel' }, { text: tr('হ্যাঁ, শূন্য করুন', 'Yes, reset'), style: 'destructive', onPress: doIt }]);
  };
  const choose = (id: string) => { setSel(id); save(state, id); };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.goBack?.()} style={st.back} accessibilityRole="button" accessibilityLabel={tr('ফিরে যান', 'Go back')}>
        <Text style={st.backT}>{tr('‹ ফিরে যান', '‹ Back')}</Text>
      </Pressable>
      <Text style={st.title} accessibilityRole="header">{tr('📿 তাসবিহ গণনা', '📿 Tasbih counter')}</Text>
      <View style={st.chips}>
        {PRESETS.map((p) => {
          const on = p.id === sel;
          return (
            <Pressable key={p.id} onPress={() => choose(p.id)} style={[st.chip, on && st.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={lbl(p)}>
              <Text style={[st.chipT, on && { color: C.primary }]}>{on ? '✓ ' : ''}{lbl(p)}</Text>
            </Pressable>
          );
        })}
      </View>

      {preset.steps ? (
        <Text style={st.seq}>{preset.steps.map((id: string, i: number) => `${i < cur.step ? '✅' : i === cur.step ? '▶' : '•'} ${lbl(P(id))} ${toBn(P(id).target)}`).join('   ')}</Text>
      ) : null}
      {!allDone && phrase.ar ? <Text style={st.ar} accessibilityLanguage="ar">{phrase.ar}</Text> : null}
      {!allDone ? <Text style={st.pron}>{tr(phrase.pron || '', phrase.pronEn || phrase.pron || '')}</Text> : null}
      {!allDone ? <Text style={st.bn}>{tr(phrase.bn || '', phrase.meanEn || phrase.bn || '')}</Text> : null}

      {allDone ? <Notice kind="ok" title={tr('মাশাআল্লাহ, পূর্ণ হয়েছে', 'MashaAllah, completed')} text={tr('আবার শুরু করতে নিচের "শূন্য করুন" চাপুন।', 'To start again, tap "Reset" below.')} /> : (
        <Pressable onPress={tap} style={({ pressed }) => [st.big, pressed && st.bigPressed]} accessibilityRole="button"
          accessibilityLabel={tr(`গুনুন। এখন ${cur.n}${target ? `, লক্ষ্য ${target}` : ''}`, `Count. Now ${cur.n}${target ? `, target ${target}` : ''}`)} accessibilityHint={tr('প্রতিবার জিকির বলে একবার চাপুন', 'Tap once each time you say the dhikr')}>
          <Text style={st.bigN}>{toBn(cur.n)}</Text>
          {target ? <Text style={st.bigOf}>/ {toBn(target)}</Text> : null}
          <Text style={st.bigHint}>{tr('এখানে চাপুন', 'Tap here')}</Text>
        </Pressable>
      )}

      <View style={st.row}>
        <Pressable onPress={undo} disabled={cur.n === 0} style={[st.small, cur.n === 0 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={tr('ভুল চাপ, এক কমান', 'Wrong tap, take one off')}>
          <Text style={st.smallT}>{tr('− ভুল চাপ, এক কমান', '− Wrong tap, take one off')}</Text>
        </Pressable>
        <Pressable onPress={reset} style={st.small} accessibilityRole="button" accessibilityLabel={tr('গণনা শূন্য করুন', 'Reset the count')}>
          <Text style={st.smallT}>{tr('↺ শূন্য করুন', '↺ Reset')}</Text>
        </Pressable>
      </View>
      <Text style={st.note}>{tr('লক্ষ্য পূর্ণ হলে ফোন একটু বেশি কাঁপবে। অ্যাপ বন্ধ করলেও গণনা মনে থাকবে।', 'The phone vibrates a little more when the target is reached. The count is kept even if you close the app.')}</Text>
      {(preset.source || phrase.source) ? <Text style={st.note}>📚 {tr('সূত্র', 'Source')}: {tr(preset.source || phrase.source || '', preset.sourceEn || phrase.sourceEn || preset.source || phrase.source || '')}</Text> : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 36, marginBottom: S.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: S.xs, marginBottom: S.md },
  chip: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  chipOn: { borderColor: C.primary, backgroundColor: C.primarySoft, borderWidth: 2 },
  chipT: { fontSize: F.small, fontWeight: '700', color: C.text },
  seq: { fontSize: F.small, color: C.text, textAlign: 'center', marginBottom: S.sm, lineHeight: 24 },
  ar: { fontSize: 36, lineHeight: 64, color: C.text, textAlign: 'center' },
  pron: { fontSize: F.large, fontWeight: '700', color: C.primary, textAlign: 'center' },
  bn: { fontSize: F.body, color: C.muted, textAlign: 'center', marginBottom: S.md },
  big: { alignSelf: 'center', width: 240, height: 240, borderRadius: 120, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 8, borderColor: C.gold, marginVertical: S.md },
  bigPressed: { transform: [{ scale: 0.96 }], backgroundColor: C.primaryDark },
  bigN: { fontSize: 72, fontWeight: '700', color: C.onPrimary, lineHeight: 84 },
  bigOf: { fontSize: F.large, color: C.onPrimarySoft },
  bigHint: { fontSize: F.small, color: C.onPrimarySoft, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: S.sm },
  small: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.sm },
  smallT: { fontSize: F.body, fontWeight: '700', color: C.primary, textDecorationLine: 'underline' },
  note: { fontSize: F.small, color: C.muted, textAlign: 'center', marginTop: S.sm, lineHeight: 22 },
});
