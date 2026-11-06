import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { T } from '../strings';
import { C, F, S, R, TOUCH } from '../theme';
import { Button, Notice } from './ui';
import { pushSupported, pushState, pushPref, enablePush, disablePush, notNow, openPhoneSettings, type PushState } from '../lib/push';
import type { Msg } from '../screens/navTypes';

// Turning on phone alerts (push). mode 'home': asks once, disappears after a choice.
// mode 'settings' (🔔 page): always shows the current state and the one action that fits it.
export default function PushCard({ mode = 'settings' }: { mode?: 'home' | 'settings' }) {
  const [st, setSt] = useState<PushState | 'decided' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    if (mode === 'home' && (await pushPref())) { setSt('decided'); return; }   // already chosen on this phone: no server call
    setSt(await pushState());
  }, [mode]);
  useEffect(() => { if (pushSupported) load(); }, [load]);

  if (!pushSupported || st === null || st === 'soon') return null;
  if (mode === 'home' && st !== 'unset') return null;

  const on = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const r = await enablePush();
    setBusy(false);
    if (r === 'on') { setSt('on'); setMsg({ kind: 'ok', text: T.push.on }); }
    else if (r === 'denied') { setSt('denied'); }
    else if (r === 'unavailable') { setSt('off'); setMsg({ kind: 'warn', text: T.push.unavailable }); }
    else if (r === 'soon') { setSt('soon'); }
    else setMsg({ kind: 'bad', text: T.push.onFail });
  };
  const off = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const r = await disablePush();
    setBusy(false);
    if (r === 'off') { setSt('off'); setMsg({ kind: 'ok', text: T.push.off }); }
    else setMsg({ kind: 'bad', text: T.push.offFail });
  };
  const later = async () => { await notNow(); setSt('off'); };

  if (mode === 'home') {
    return (
      <View style={p.card}>
        <Text style={p.h}>{T.push.askT}</Text>
        <Text style={p.t}>{T.push.ask}</Text>
        {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
        <Button title={T.push.turnOn} icon="🔔" onPress={on} loading={busy} />
        <Pressable onPress={later} style={p.skip} accessibilityRole="button" accessibilityLabel={T.push.laterA11y}>
          <Text style={p.skipT}>{T.push.later}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[p.card, p.flat]}>
      <View style={p.row}>
        <Text style={p.ic} importantForAccessibility="no">{st === 'on' ? '📲' : '🔕'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={p.lbl}>{T.push.label}</Text>
          <Text style={p.state}>{st === 'on' ? T.push.stOn : st === 'denied' ? T.push.stDenied : st === 'unavailable' ? T.push.stNo : T.push.stOff}</Text>
        </View>
        {busy ? <ActivityIndicator color={C.primary} /> : null}
      </View>
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {st === 'on' ? <Button title={T.push.turnOffBtn} kind="secondary" onPress={off} disabled={busy} /> : null}
      {st === 'off' || st === 'unset' ? <Button title={T.push.turnOnBtn} icon="🔔" onPress={on} loading={busy} /> : null}
      {st === 'denied' ? (
        <>
          <Text style={p.t}>{T.push.denied}</Text>
          <Button title={T.push.settings} icon="⚙️" kind="secondary" onPress={openPhoneSettings} />
          <Button title={T.push.again} icon="🔄" kind="secondary" onPress={on} loading={busy} style={{ marginTop: S.sm }} />
        </>
      ) : null}
    </View>
  );
}

const p = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: R.lg, borderWidth: 2, borderColor: C.gold, padding: S.md, marginBottom: S.md },
  flat: { borderColor: C.line, borderWidth: 1 },
  h: { fontSize: F.large, fontWeight: '700', color: C.primary, marginBottom: S.xs },
  t: { fontSize: F.body, color: C.text, lineHeight: F.body * 1.5, marginBottom: S.sm },
  skip: { minHeight: TOUCH, alignItems: 'center', justifyContent: 'center', marginTop: S.xs },
  skipT: { fontSize: F.body, color: C.primary, fontWeight: '700', textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.sm },
  ic: { fontSize: 28 },
  lbl: { fontSize: F.small, color: C.muted, fontWeight: '700' },
  state: { fontSize: F.body, color: C.text, fontWeight: '700' },
});
