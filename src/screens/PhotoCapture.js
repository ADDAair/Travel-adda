import React, { useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, R } from '../theme';
import { T } from '../strings';
import { Button, Notice } from '../components/ui';
import { uploadAvatar } from '../lib/avatar';

const P = T.photo;

// Takes the person's face photo with the FRONT camera, shows it for confirmation, then saves it privately.
// onDone()   : called only after the photo is really saved.
// onSkip()   : optional "later" button (used right after sign-up so nobody is locked out by a broken camera).
// onCancel() : optional close button (used when changing the photo later from the account page).
export default function PhotoCapture({ onDone, onSkip, onCancel }) {
  const ins = useSafeAreaInsets();
  const [perm, requestPerm] = useCameraPermissions();
  const camRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uri, setUri] = useState(null);
  const [err, setErr] = useState('');

  async function snap() {
    if (!ready || taking || !camRef.current) return;
    setTaking(true); setErr('');
    try {
      const p = await camRef.current.takePictureAsync({ quality: 0.5 });
      if (!p || !p.uri) throw new Error('no photo');
      setUri(p.uri);
    } catch (e) {
      setErr(P.errSnap);
    } finally {
      setTaking(false);
    }
  }

  async function save() {
    if (busy || !uri) return;             // blocks double submit
    setBusy(true); setErr('');
    try {
      await uploadAvatar(uri);
      onDone();
    } catch (e) {
      const m = String((e && e.message) || '').toLowerCase();
      if (e && e.code === 'too-big') setErr(P.errBig);
      else if (m.includes('network') || m.includes('fetch') || m.includes('failed')) setErr(P.errNet);
      else setErr(P.errSave);
    } finally {
      setBusy(false);
    }
  }

  function retake() { if (busy) return; setUri(null); setErr(''); }

  const Header = (
    <>
      <Text style={st.title} accessibilityRole="header">{P.title}</Text>
      <Text style={st.body}>{P.why}</Text>
    </>
  );

  let content;
  if (!perm) {
    content = <View style={st.pad}>{Header}<Text style={st.body}>…</Text></View>;
  } else if (!perm.granted) {
    const blocked = perm.canAskAgain === false;
    content = (
      <View style={st.pad}>
        {Header}
        {blocked ? (
          <>
            <Notice kind="warn" title={P.deniedTitle} text={P.deniedText} />
            <Button title={P.openSettings} icon="⚙️" onPress={() => Linking.openSettings().catch(() => {})} style={st.gap} />
          </>
        ) : (
          <>
            <Notice kind="info" title={P.privacy} text={P.allowHint} />
            <Button title={P.allow} icon="📷" onPress={requestPerm} style={st.gap} />
          </>
        )}
      </View>
    );
  } else if (!uri) {
    content = (
      <View style={st.pad}>
        {Header}
        <Text style={st.tip}>{P.tipLight}</Text>
        <View style={st.camBox} accessible accessibilityLabel="সামনের ক্যামেরার ছবি">
          <CameraView
            ref={camRef}
            style={StyleSheet.absoluteFill}
            facing="front"
            onCameraReady={() => setReady(true)}
            onMountError={() => setErr(P.errCamera)}
          />
          <View style={st.oval} pointerEvents="none" />
        </View>
        {err ? <Notice kind="bad" title={err} /> : null}
        <Button title={taking ? P.taking : (ready ? P.snap : P.snapWait)} icon="📸" onPress={snap} loading={taking} disabled={!ready} />
      </View>
    );
  } else {
    content = (
      <View style={st.pad}>
        <Text style={st.title} accessibilityRole="header">{P.previewTitle}</Text>
        <Text style={st.body}>{P.previewText}</Text>
        <View style={st.camBox}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="আপনার তোলা ছবি" />
        </View>
        {err ? <Notice kind="bad" title={err} /> : null}
        <Button title={busy ? P.saving : P.use} icon="✅" onPress={save} loading={busy} />
        <Button title={P.again} icon="🔄" kind="secondary" onPress={retake} disabled={busy} style={st.gap} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: ins.top + S.md, paddingBottom: ins.bottom + S.lg }} keyboardShouldPersistTaps="handled">
        {content}
        {!busy && !taking && onSkip && !uri ? (
          <View style={st.pad}>
            <Button title={P.later} kind="secondary" onPress={onSkip} a11yHint={P.laterHint} />
            <Text style={st.hint}>{P.laterHint}</Text>
          </View>
        ) : null}
        {!busy && !taking && onCancel ? (
          <View style={st.pad}>
            <Button title={P.close} icon="✖️" kind="secondary" onPress={onCancel} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  pad: { paddingHorizontal: S.lg, paddingVertical: S.sm },
  title: { fontSize: F.title, fontWeight: '700', color: C.primary, marginBottom: S.sm },
  body: { fontSize: F.body, color: C.text, lineHeight: 28, marginBottom: S.md },
  tip: { fontSize: F.body, color: C.primary, fontWeight: '700', lineHeight: 28, marginBottom: S.md },
  hint: { fontSize: F.small, color: C.muted, lineHeight: 24, marginTop: S.sm, textAlign: 'center' },
  gap: { marginTop: S.md },
  camBox: { width: '100%', aspectRatio: 3 / 4, maxHeight: 460, alignSelf: 'center', borderRadius: R.lg, overflow: 'hidden', backgroundColor: '#000', marginBottom: S.md, alignItems: 'center', justifyContent: 'center' },
  oval: { position: 'absolute', width: '62%', aspectRatio: 0.78, borderRadius: 999, borderWidth: 4, borderColor: C.accent },
});
