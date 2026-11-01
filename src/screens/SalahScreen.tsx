import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, BackHandler } from 'react-native';
import { C, F, S, R, TOUCH, shadow } from '../theme';
import { Button, Notice } from '../components/ui';
import { DuaInline } from '../components/guide';
import { toBn } from '../lib/phone';
import { Block } from './GuidesScreen';
import { SALAH, SALAH_GROUPS, KIND, DAILY_FARD } from '../content/salah';
import { CONTENT_REVIEWED } from '../content/ihram';

// "নামাজের রাকাত ও নিয়ম". Can be opened at one section from other screens: navigate('Salah', { section: 'jumuah', t: Date.now() }).
export default function SalahScreen({ navigation, route }) {
  const [open, setOpen] = useState(null);
  const [from, setFrom] = useState(null);         // screen to return to when opened from elsewhere
  const scrollRef = useRef(null);
  const go = (id) => { setOpen(id); requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false })); };

  useEffect(() => {
    const p = route && route.params;
    if (p && p.section && SALAH.some((x) => x.id === p.section)) { go(p.section); setFrom(p.from || null); }
  }, [route && route.params && route.params.t]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  });
  useEffect(() => navigation?.addListener?.('blur', () => { setOpen(null); setFrom(null); }), [navigation]);

  const close = () => {
    if (from) { const f = from; setFrom(null); setOpen(null); navigation.navigate(f); return; }
    setOpen(null);
  };
  const sec = SALAH.find((x) => x.id === open);

  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      {sec ? (
        <>
          <Pressable onPress={close} style={st.back} accessibilityRole="button" accessibilityLabel={from ? 'আগের পাতায় ফিরে যান' : 'সব অংশের তালিকায় ফিরে যান'}>
            <Text style={st.backT}>‹ {from ? 'ফিরে যান' : 'সব অংশ'}</Text>
          </Pressable>
          <Text style={st.title} accessibilityRole="header">{sec.icon} {sec.title}</Text>
          {sec.blocks.map((b, i) => {
            if (b.type === 'rakat') return <Rakat key={i} rows={b.rows} />;
            if (b.type === 'duas') return <View key={i} style={{ marginBottom: S.sm }}>{b.ids.map((id) => <DuaInline key={id} id={id} />)}</View>;
            if (b.type === 'kahf') return <Button key={i} title="সূরা কাহফ পড়ুন" icon="📖" kind="gold" onPress={() => navigation.navigate('Dua', { openSurah: 18, t: Date.now() })} style={{ marginTop: S.md }} />;
            return <Block key={i} b={b} />;
          })}
          <Button title={from ? 'ফিরে যান' : 'সব অংশের তালিকায় ফিরুন'} icon="‹" kind="secondary" onPress={close} style={{ marginTop: S.md }} />
        </>
      ) : (
        <>
          <Pressable onPress={() => navigation.navigate('Home')} style={st.back} accessibilityRole="button" accessibilityLabel="হোমে ফিরে যান">
            <Text style={st.backT}>‹ হোম</Text>
          </Pressable>
          <Text style={st.title} accessibilityRole="header">🕌 নামাজের রাকাত ও নিয়ম</Text>
          <Notice kind="info" title="এক নজরে" text={DAILY_FARD} />
          {SALAH_GROUPS.map((g) => (
            <View key={g.title}>
              <Text style={st.group}>{g.title}</Text>
              {g.ids.map((id) => {
                const x = SALAH.find((s) => s.id === id);
                return (
                  <Pressable key={id} onPress={() => go(id)} style={({ pressed }) => [st.row, pressed && { opacity: 0.85 }]}
                    accessibilityRole="button" accessibilityLabel={`${x.title}। ${x.what}`} accessibilityHint="বিস্তারিত খুলবে">
                    <Text style={st.rowIc} importantForAccessibility="no">{x.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={st.rowT}>{x.title}</Text>
                      <Text style={st.rowW}>{x.what}</Text>
                    </View>
                    <Text style={st.openT}>খুলুন ›</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </>
      )}
      {!CONTENT_REVIEWED ? <Text style={st.review}>ℹ️ হানাফি মত অনুযায়ী, কুরআন ও হাদিসের সূত্রসহ। চূড়ান্ত প্রকাশের আগে একজন আলেম দিয়ে যাচাই করা হবে।</Text> : null}
    </ScrollView>
  );
}

// Table of rak'ahs: every row shows the number, the kind in words (never colour alone) and when.
function Rakat({ rows }) {
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <View style={st.table} accessible accessibilityLabel={rows.map((r) => `${r.n} রাকাত ${KIND[r.kind].label}${r.when ? `, ${r.when}` : ''}`).join('। ')}>
      {rows.map((r, i) => {
        const k = KIND[r.kind];
        return (
          <View key={i} style={[st.tRow, i > 0 && st.tLine]}>
            <View style={[st.badge, { borderColor: C[k.color] }]}><Text style={[st.badgeN, { color: C[k.color] }]}>{toBn(r.n)}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.kind}>{k.label}</Text>
              {r.when ? <Text style={st.when}>{r.when}</Text> : null}
              <Text style={st.hint}>{k.hint}</Text>
            </View>
          </View>
        );
      })}
      <Text style={st.total}>মোট {toBn(total)} রাকাত</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: S.md, paddingBottom: S.xl },
  back: { minHeight: TOUCH, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: S.md, marginBottom: S.xs },
  backT: { fontSize: F.large, color: C.primary, fontWeight: '700' },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, lineHeight: 36, marginBottom: S.md },
  group: { fontSize: F.large, fontWeight: '700', color: C.primary, marginTop: S.md, marginBottom: S.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.line, minHeight: 76, ...shadow },
  rowIc: { fontSize: 30 },
  rowT: { fontSize: F.large, fontWeight: '700', color: C.text, lineHeight: 30 },
  rowW: { fontSize: F.small, color: C.muted, lineHeight: 22, marginTop: 2 },
  openT: { fontSize: F.small, color: C.primary, fontWeight: '700' },
  review: { fontSize: 14, color: C.muted, marginTop: S.lg, lineHeight: 22, textAlign: 'center' },
  table: { backgroundColor: C.card, borderRadius: R.lg, padding: S.md, marginBottom: S.md, borderWidth: 2, borderColor: C.primary },
  tRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm },
  tLine: { borderTopWidth: 1, borderColor: C.line },
  badge: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  badgeN: { fontSize: F.title, fontWeight: '700' },
  kind: { fontSize: F.large, fontWeight: '700', color: C.text },
  when: { fontSize: F.body, color: C.text, lineHeight: 26 },
  hint: { fontSize: 14, color: C.muted, lineHeight: 20 },
  total: { fontSize: F.body, fontWeight: '700', color: C.primary, textAlign: 'right', marginTop: S.xs },
});
