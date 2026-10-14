import React from 'react';
import { Pressable, Text, View, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { C, F, S, R, TOUCH, BTN_H, shadow } from '../theme';

// Big, clearly labelled button. kind: primary | secondary | gold | danger
export function Button({ title, onPress, kind = 'primary', loading = false, disabled = false, icon, a11yHint, style }) {
  const k = BTN[kind] || BTN.primary;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={a11yHint}
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => [s.btn, { backgroundColor: k.bg, borderColor: k.border }, pressed && !off && { opacity: 0.85, transform: [{ scale: 0.99 }] }, off && { opacity: 0.6 }, style]}>
      {loading ? <ActivityIndicator color={k.fg} /> : null}
      {!loading && icon ? <Text style={[s.btnIcon]} importantForAccessibility="no">{icon}</Text> : null}
      <Text style={[s.btnT, { color: k.fg }]}>{title}</Text>
    </Pressable>
  );
}
const BTN = {
  primary: { bg: C.primary, fg: C.onPrimary, border: C.primary },
  secondary: { bg: C.card, fg: C.primary, border: C.primary },
  gold: { bg: C.gold, fg: C.text, border: C.gold },
  danger: { bg: C.card, fg: C.bad, border: C.bad },
};

// Text field with a visible label above (placeholders alone disappear while typing).
export function Field({ label, hint, error, right, inputRef, ...input }) {
  return (
    <View style={{ marginBottom: S.md }}>
      <Text style={s.label} nativeID={label}>{label}</Text>
      <View style={[s.inWrap, error ? { borderColor: C.bad, borderWidth: 2 } : null]}>
        <TextInput
          ref={inputRef}
          style={s.in}
          placeholder={hint}
          placeholderTextColor="#7A857F"
          accessibilityLabel={label}
          accessibilityHint={hint}
          {...input}
        />
        {right}
      </View>
      {error ? <Text style={s.err} accessibilityLiveRegion="polite">⚠️ {error}</Text> : null}
    </View>
  );
}

export function Card({ children, style }) { return <View style={[s.card, style]}>{children}</View>; }

// Message box: kind ok | warn | bad | info. Text is always shown, so meaning never depends on colour alone.
export function Notice({ kind = 'info', title, text, children }) {
  const m = { ok: [C.okSoft, C.ok, '✅'], warn: [C.warnSoft, C.warn, '⚠️'], bad: [C.badSoft, C.bad, '❌'], info: [C.goldSoft, C.primary, 'ℹ️'] }[kind];
  return (
    <View style={[s.notice, { backgroundColor: m[0], borderColor: m[1] }]} accessibilityRole="alert">
      <Text style={s.noticeT}>{m[2]} {title}</Text>
      {text ? <Text style={s.noticeB}>{text}</Text> : null}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: BTN_H, borderRadius: R.md, borderWidth: 2, paddingHorizontal: S.lg, paddingVertical: S.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm },
  btnT: { fontSize: F.large, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  btnIcon: { fontSize: 22 },
  label: { fontSize: F.body, fontWeight: '700', color: C.text, marginBottom: S.xs },
  inWrap: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderWidth: 1.5, borderColor: C.line, borderRadius: R.md, backgroundColor: C.card },
  in: { flex: 1, fontSize: F.large, color: C.text, paddingHorizontal: S.md, paddingVertical: S.sm, minHeight: TOUCH },
  err: { color: C.bad, fontSize: F.small, marginTop: S.xs, lineHeight: 22 },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, ...shadow },
  notice: { borderWidth: 1.5, borderRadius: R.md, padding: S.md, marginBottom: S.md },
  noticeT: { fontSize: F.body, fontWeight: '700', color: C.text, lineHeight: 26 },
  noticeB: { fontSize: F.body, color: C.text, marginTop: 4, lineHeight: 26 },
});
