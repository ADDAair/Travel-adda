import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import { Button, Notice, Segmented } from '../components/ui';
import { getTerms, agreeTerms, myTermsStatus } from '../lib/market';
import { useMe, isLeaderAccount } from '../lib/me';
import { st, fmtDay, errText } from './GroupScreen';

// Terms & conditions written by the admin (can change any time without a new app version).
// Two texts: for hajis and for leaders. Opens on the one for this account; the other can be read too.
export default function TermsScreen({ navigation }) {
  const { me } = useMe();
  const mine = isLeaderAccount(me) ? 'leader' : 'haji';
  const [kind, setKind] = useState(mine);
  const [t, setT] = useState(undefined);            // undefined = loading, null = none written
  const [status, setStatus] = useState(null);       // { haji: { at, current }, leader: {...} }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { setKind(mine); }, [mine]);

  const load = useCallback(async () => {
    setT(undefined); setMsg(null);
    getTerms(kind).then(setT).catch(() => setT(null));
    myTermsStatus().then(setStatus).catch(() => setStatus(null));
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const agree = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await agreeTerms(kind);
      if (r === 'ok') { setMsg({ kind: 'ok', text: 'ধন্যবাদ। আপনার সম্মতি সংরক্ষণ হয়েছে।' }); setStatus(await myTermsStatus().catch(() => status)); }
      else setMsg({ kind: 'info', text: 'এখন সম্মতি দেওয়ার কিছু নেই।' });
    } catch (e) { setMsg({ kind: 'bad', text: errText(e) }); }
    finally { setBusy(false); }
  };

  const s = status ? status[kind] : null;
  const name = kind === 'leader' ? 'লিডারদের শর্তাবলি' : 'হাজীদের শর্তাবলি';
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <Pressable onPress={() => navigation.navigate('Account')} style={st.back} accessibilityRole="button" accessibilityLabel="আমার তথ্য পাতায় ফিরে যান"><Text style={st.backT}>‹ আমার তথ্য</Text></Pressable>
      <Text style={st.title} accessibilityRole="header">📜 শর্তাবলি</Text>
      <Segmented value={kind} onChange={setKind} options={[{ id: 'haji', label: 'হাজীদের জন্য' }, { id: 'leader', label: 'লিডারদের জন্য' }]} />
      <View style={{ height: S.md }} />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {t === undefined ? <ActivityIndicator color={C.primary} /> : null}
      {t === null ? <Notice kind="info" title="শর্তাবলি শীঘ্রই যুক্ত হবে" /> : null}
      {t && kind === mine && s && s.current ? <Notice kind="ok" title={`আপনি ${fmtDay(s.at)} তারিখে এই শর্তাবলি মেনে নিয়েছেন।`} /> : null}
      {t && kind === mine && s && !s.current ? (
        <Notice kind="warn" title="শর্তাবলি বদলেছে" text="আপনি আগের শর্তাবলি মেনে নিয়েছিলেন। নিচে নতুনটি পড়ে মেনে নিন।" />
      ) : null}
      {t ? (
        <View style={st.card}>
          <Text style={st.small}>{name} · সর্বশেষ হালনাগাদ: {fmtDay(t.updated_at)}</Text>
          <Text style={[st.p, { marginTop: S.sm, lineHeight: 30 }]} selectable>{t.body}</Text>
        </View>
      ) : null}
      {t && kind === mine && status && (!s || !s.current) ? (
        <Button title="পড়েছি, মেনে নিচ্ছি" icon="✅" onPress={agree} loading={busy} style={{ marginBottom: S.xl }} />
      ) : null}
    </ScrollView>
  );
}
